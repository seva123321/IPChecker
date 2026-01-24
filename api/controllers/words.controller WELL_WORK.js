// controllers/keywords.controller.js
import { Sequelize } from "sequelize";
const { Op } = Sequelize;
import {
  Host,
  Port,
  WellKnownPort,
  Whois,
  WhoisKey,
  sequelize,
  Priority,
  PriorityComment,
  Grouping,
} from "../models/index.js";

const formatHostData = (host) => {
  const openPorts = [];
  const filteredPorts = [];

  // Проверяем, что Ports существует и является массивом
  if (host.Ports && Array.isArray(host.Ports)) {
    host.Ports.forEach((port) => {
      const portInfo = {
        port: port.port,
        name: port.WellKnownPort?.name || null,
      };

      if (port.type === "open") {
        openPorts.push(portInfo);
      } else if (port.type === "filtered") {
        filteredPorts.push(portInfo);
      }
    });
  }

  // Проверяем наличие WHOIS данных
  const hasWhois = host.Whois && Array.isArray(host.Whois) && host.Whois.length > 0;

  // Получаем информацию о приоритете и группировке
  const priorityInfo = {
    priority: null,
    grouping: null,
  };

  // Добавляем информацию о приоритете - гарантируем наличие name
  if (host.priority_id || host.Priority) {
    priorityInfo.priority = {
      id: host.priority_id,
      name: host.Priority?.name || "Unknown",
    };
  }

  // Добавляем информацию о группировке
  if (host.grouping_id || host.Grouping) {
    priorityInfo.grouping = {
      id: host.grouping_id,
      name: host.Grouping?.name || null,
    };
  }

  return {
    id: host.id,
    ip: host.ip,
    reachable: host.reachable,
    updated_at: host.updated_at
      ? host.updated_at.toISOString().replace("T", " ").substring(0, 19)
      : null,
    port_data: {
      open: openPorts,
      filtered: filteredPorts,
    },
    priority_info: priorityInfo,
    has_whois: hasWhois,
  };
};

// GET /keywords?keyword=google&page=1&limit=10
export const getKeywordInfo = async (req, res) => {
  try {
    const { keyword: keywordQuery } = req.query;
    if (!keywordQuery) {
      return res.status(400).json({ error: "Параметр 'keyword' обязателен" });
    }

    // Приводим ключевое слово к нижнему регистру для регистронезависимого поиска
    const lowerCaseKeyword = keywordQuery.toLowerCase();

    // Получаем параметры пагинации
    const { pageNum, limitNum, offset } = paginate(req);

    // Сначала находим ID хостов, которые подходят под условие поиска
    const hostIdsSql = `
      SELECT DISTINCT h.id, h.priority_id
      FROM hosts h
      INNER JOIN whois w ON h.id = w.host_id
      INNER JOIN whois_keys wk ON w.key_id = wk.id
      WHERE LOWER(w.value) LIKE LOWER(:keyword) OR LOWER(wk.key_name) LIKE LOWER(:keyword)
      ORDER BY h.priority_id DESC
      LIMIT :limit OFFSET :offset
    `;

    const hostsResult = await sequelize.query(hostIdsSql, {
      replacements: {
        keyword: `%${lowerCaseKeyword}%`,
        limit: limitNum,
        offset: offset,
      },
      type: sequelize.QueryTypes.SELECT,
    });

    if (hostsResult.length === 0) {
      return res.status(404).json({
        message: "Нет данных соответствующих поиску",
        items: [],
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalItems: 0,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    // Получаем полные данные для найденных хостов
    const hostIds = hostsResult.map((h) => h.id);
    const hosts = await Host.findAll({
      include: [
        {
          model: Port,
          attributes: ["port", "type"],
          include: [
            {
              model: WellKnownPort,
              attributes: ["name"],
              required: false,
            },
          ],
        },
        {
          model: Priority,
          attributes: ["id", "name"],
          required: false,
        },
        {
          model: Grouping,
          attributes: ["id", "name"],
          required: false,
        },
        {
          model: Whois,
          attributes: ["value"],
          include: [
            {
              model: WhoisKey,
              attributes: ["key_name"],
              required: false,
            },
          ],
          required: false,
        },
      ],
      where: {
        id: { [Op.in]: hostIds },
      },
      order: [["priority_id", "DESC"]],
    });

    // Формируем результат в нужном формате
    const items = hosts.map(formatHostData);

    // Получаем общее количество записей для пагинации
    const countSql = `
      SELECT COUNT(DISTINCT h.id) as total
      FROM hosts h
      INNER JOIN whois w ON h.id = w.host_id
      INNER JOIN whois_keys wk ON w.key_id = wk.id
      WHERE LOWER(w.value) LIKE LOWER(:keyword) OR LOWER(wk.key_name) LIKE LOWER(:keyword)
    `;

    const countResult = await sequelize.query(countSql, {
      replacements: { keyword: `%${lowerCaseKeyword}%` },
      type: sequelize.QueryTypes.SELECT,
    });

    const totalCount = countResult[0].total;
    const totalPages = Math.ceil(totalCount / limitNum);

    if (!items.length) {
      return res.status(404).json({
        message: "Нет данных соответствующих поиску",
        items: [],
        pagination: {
          currentPage: pageNum,
          totalPages: totalPages,
          totalItems: totalCount,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    const response = {
      items: items,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      type: "search",
      field: "keyword",
    };

    return res.json(response);
  } catch (error) {
    console.error("Ошибка в getKeywordInfo:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};
// export const getKeywordInfo = async (req, res) => {
//   try {
//     const { keyword: keywordQuery } = req.query;
//     if (!keywordQuery) {
//       return res.status(400).json({ error: "Параметр 'keyword' обязателен" });
//     }

//     const lowerCaseKeyword = keywordQuery.toLowerCase();
//     const { pageNum, limitNum, offset } = paginate(req);

//     // Оптимизированный запрос с одним SQL
//     const searchQuery = `
//       WITH searched_hosts AS (
//         SELECT DISTINCT
//           h.id,
//           h.ip,
//           h.reachable,
//           TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
//           h.priority_id,
//           h.grouping_id,
//           hp.name as priority_name,
//           hg.name as grouping_name,
//           (
//             SELECT COALESCE(
//               json_agg(
//                 json_build_object(
//                   'port', p.port,
//                   'type', p.type,
//                   'port_name', wkp.name
//                 )
//               ),
//               '[]'::json
//             )
//             FROM ports p
//             LEFT JOIN well_known_ports wkp ON p.port = wkp.port
//             WHERE p.host_id = h.id
//           ) as ports_json,
//           (
//             SELECT COUNT(*) > 0
//             FROM whois w2
//             WHERE w2.host_id = h.id
//           ) as has_whois
//         FROM hosts h
//         INNER JOIN whois w ON h.id = w.host_id
//         INNER JOIN whois_keys wk ON w.key_id = wk.id
//         LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//         LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//         WHERE (LOWER(w.value) LIKE LOWER(:keyword) OR LOWER(wk.key_name) LIKE LOWER(:keyword))
//         AND w.value IS NOT NULL 
//         AND w.value != ''
//         ORDER BY 
//           CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//           h.priority_id DESC NULLS LAST,
//           h.updated_at DESC
//         LIMIT :limit OFFSET :offset
//       )
//       SELECT * FROM searched_hosts
//     `;

//     const countQuery = `
//       SELECT COUNT(DISTINCT h.id) as total
//       FROM hosts h
//       INNER JOIN whois w ON h.id = w.host_id
//       INNER JOIN whois_keys wk ON w.key_id = wk.id
//       WHERE (LOWER(w.value) LIKE LOWER(:keyword) OR LOWER(wk.key_name) LIKE LOWER(:keyword))
//       AND w.value IS NOT NULL 
//       AND w.value != ''
//     `;

//     const [hosts, countResult] = await Promise.all([
//       sequelize.query(searchQuery, {
//         replacements: {
//           keyword: `%${lowerCaseKeyword}%`,
//           limit: limitNum,
//           offset: offset,
//         },
//         type: sequelize.QueryTypes.SELECT,
//       }),
//       sequelize.query(countQuery, {
//         replacements: { keyword: `%${lowerCaseKeyword}%` },
//         type: sequelize.QueryTypes.SELECT,
//       }),
//     ]);

//     console.log('hosts >>  ', hosts)

//     const totalCount = parseInt(countResult[0]?.total || 0);
//     const totalPages = Math.ceil(totalCount / limitNum);

//     if (hosts.length === 0) {
//       return res.status(404).json({
//         message: "Нет данных соответствующих поиску",
//         items: [],
//         pagination: {
//           currentPage: pageNum,
//           totalPages: totalPages,
//           totalItems: totalCount,
//           hasNext: false,
//           hasPrev: false,
//         },
//       });
//     }

//     // Используем ту же функцию форматирования
//     const formatHostFromRaw = (host) => {
//       const openPorts = [];
//       const filteredPorts = [];

//       if (host.ports_json) {
//         try {
//           const ports = typeof host.ports_json === 'string' 
//             ? JSON.parse(host.ports_json) 
//             : host.ports_json;
          
//           if (Array.isArray(ports)) {
//             ports.forEach((port) => {
//               if (port && port.port && port.type) {
//                 const portInfo = {
//                   port: port.port,
//                   name: port.port_name || null,
//                 };

//                 if (port.type === "open") {
//                   openPorts.push(portInfo);
//                 } else if (port.type === "filtered") {
//                   filteredPorts.push(portInfo);
//                 }
//               }
//             });
//           }
//         } catch (e) {
//           console.error("Error processing ports_json:", e);
//         }
//       }

//       return {
//         id: host.id,
//         ip: host.ip,
//         reachable: host.reachable,
//         updated_at: host.updated_at,
//         port_data: {
//           open: openPorts,
//           filtered: filteredPorts,
//         },
//         priority_info: {
//           priority: host.priority_id ? {
//             id: host.priority_id,
//             name: host.priority_name || "Unknown",
//           } : null,
//           grouping: host.grouping_id ? {
//             id: host.grouping_id,
//             name: host.grouping_name || null,
//           } : null,
//         },
//         has_whois: !!host.has_whois,
//       };
//     };

//     const items = hosts.map(formatHostFromRaw);

//     const response = {
//       items: items,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalItems: totalCount,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },
//       type: "search",
//       field: "keyword",
//     };

//     return res.json(response);
//   } catch (error) {
//     console.error("Ошибка в getKeywordInfo:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// Вспомогательная функция для пагинации
const paginate = (req) => {
  const { page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;
  return { pageNum, limitNum, offset };
};


// Высокопроизводительная версия groupKeywords
export const groupKeywords = async (req, res) => {
  try {
    const { page = 1, limit = 10, keyword: keywordQuery } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));

    // Проверяем, есть ли фильтр по ключевому слову
    let keywordFilter = null;
    if (keywordQuery !== undefined && keywordQuery !== '') {
      keywordFilter = keywordQuery.trim().toLowerCase();
    }

    // ============ ШАГ 1: Получаем уникальные ключевые слова ============
    let uniqueKeywordsQuery = `
      SELECT 
        wk.key_name,
        COUNT(DISTINCT w.host_id) as host_count
      FROM whois_keys wk
      INNER JOIN whois w ON wk.id = w.key_id
      WHERE w.value IS NOT NULL AND w.value != ''
      ${keywordFilter ? 'AND (LOWER(wk.key_name) LIKE LOWER(:keywordFilter) OR LOWER(w.value) LIKE LOWER(:keywordFilter))' : ''}
      GROUP BY wk.key_name
      ORDER BY wk.key_name ASC
    `;

    const replacements = keywordFilter ? { keywordFilter: `%${keywordFilter}%` } : {};
    const uniqueKeywords = await sequelize.query(uniqueKeywordsQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    if (uniqueKeywords.length === 0) {
      return res.status(404).json({
        message: "Нет данных",
        items: [],
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalItems: 0,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    // ============ ШАГ 2: Для каждого ключевого слова получаем хосты с пагинацией ============
    const itemsPromises = uniqueKeywords.map(async (keywordInfo) => {
      const keywordName = keywordInfo.key_name;
      
      // Получаем хосты для этого ключевого слова с пагинацией
      const hostsQuery = `
        SELECT 
          h.id,
          h.ip,
          h.reachable,
          TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
          h.priority_id,
          h.grouping_id,
          hp.name as priority_name,
          hg.name as grouping_name,
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'port', p.port,
                  'type', p.type,
                  'port_name', wkp.name
                )
              ),
              '[]'::json
            )
            FROM ports p
            LEFT JOIN well_known_ports wkp ON p.port = wkp.port
            WHERE p.host_id = h.id
          ) as ports_json,
          (
            SELECT COUNT(*) > 0
            FROM whois w2
            WHERE w2.host_id = h.id
          ) as has_whois
        FROM hosts h
        INNER JOIN whois w ON h.id = w.host_id
        INNER JOIN whois_keys wk ON w.key_id = wk.id
        LEFT JOIN host_priorities hp ON h.priority_id = hp.id
        LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
        WHERE wk.key_name = :keywordName
        AND w.value IS NOT NULL 
        AND w.value != ''
        ORDER BY 
          CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
          h.priority_id DESC NULLS LAST,
          h.updated_at DESC
        LIMIT :limit OFFSET :offset
      `;

      const countQuery = `
        SELECT COUNT(DISTINCT h.id) as total_count
        FROM hosts h
        INNER JOIN whois w ON h.id = w.host_id
        INNER JOIN whois_keys wk ON w.key_id = wk.id
        WHERE wk.key_name = :keywordName
        AND w.value IS NOT NULL 
        AND w.value != ''
      `;

      const [hosts, countResult] = await Promise.all([
        sequelize.query(hostsQuery, {
          replacements: {
            keywordName,
            limit: pageSize,
            offset: (pageNum - 1) * pageSize,
          },
          type: sequelize.QueryTypes.SELECT,
        }),
        sequelize.query(countQuery, {
          replacements: { keywordName },
          type: sequelize.QueryTypes.SELECT,
        }),
      ]);

      const totalItems = parseInt(countResult[0]?.total_count || 0);
      const totalPages = Math.ceil(totalItems / pageSize);

      // Форматируем хосты
      const formatHost = (host) => {
        const openPorts = [];
        const filteredPorts = [];

        if (host.ports_json) {
          try {
            const ports = typeof host.ports_json === 'string' 
              ? JSON.parse(host.ports_json) 
              : host.ports_json;
            
            if (Array.isArray(ports)) {
              ports.forEach((port) => {
                if (port && port.port && port.type) {
                  const portInfo = {
                    port: port.port,
                    name: port.port_name || null,
                  };

                  if (port.type === "open") {
                    openPorts.push(portInfo);
                  } else if (port.type === "filtered") {
                    filteredPorts.push(portInfo);
                  }
                }
              });
            }
          } catch (e) {
            console.error("Error processing ports_json:", e);
          }
        }

        return {
          id: host.id,
          ip: host.ip,
          reachable: host.reachable,
          updated_at: host.updated_at,
          port_data: {
            open: openPorts,
            filtered: filteredPorts,
          },
          priority_info: {
            priority: host.priority_id ? {
              id: host.priority_id,
              name: host.priority_name || "Unknown",
            } : null,
            grouping: host.grouping_id ? {
              id: host.grouping_id,
              name: host.grouping_name || null,
            } : null,
          },
          has_whois: !!host.has_whois,
        };
      };

      return {
        name: keywordInfo.key_name,
        count: parseInt(keywordInfo.host_count),
        items: hosts.map(formatHost),
        pagination: {
          currentPage: pageNum,
          totalPages: totalPages,
          totalItems: totalItems,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      };
    });

    const items = await Promise.all(itemsPromises);

    // Фильтруем группы, у которых есть элементы на текущей странице
    const filteredItems = items.filter(group => group.items.length > 0);

    if (filteredItems.length === 0) {
      return res.status(404).json({
        message: "Нет данных на текущей странице",
        items: [],
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalItems: 0,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    // ============ ШАГ 3: Формируем ответ ============
    const response = {
      items: filteredItems.sort((a, b) => a.name.localeCompare(b.name)),
      pagination: {
        currentPage: pageNum,
        totalPages: filteredItems.length > 0 ? filteredItems[0].pagination.totalPages : 0,
        totalItems: filteredItems.length, //> 0 ? filteredItems[0].pagination.totalItems : 0,
        hasNext: pageNum < (filteredItems.length > 0 ? filteredItems[0].pagination.totalPages : 0),
        hasPrev: pageNum > 1,
      },
      type: "group",
      field: "keyword",
    };

    return res.json(response);

  } catch (error) {
    console.error("Ошибка в groupKeywordsFast:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};
/**
 * GET /search?id=3
 * Версия с использованием Sequelize ORM
 */
export const getOneKeywordInfo = async (req, res) => {
  try {
    const { id: hostId } = req.query;

    if (!hostId) {
      return res.status(400).json({ error: "Параметр 'id' обязателен" });
    }

    const hostIdNum = parseInt(hostId, 10);
    if (isNaN(hostIdNum) || hostIdNum <= 0) {
      return res.status(400).json({ error: "Некорректный ID хоста" });
    }

    // console.log(`Поиск WHOIS данных для host_id: ${hostIdNum}`);

    // Получаем WHOIS данные через Sequelize
    const whoisRecords = await Whois.findAll({
      attributes: ['value'],
      include: [{
        model: WhoisKey,
        attributes: ['key_name'],
        required: true
      }],
      where: {
        host_id: hostIdNum,
        value: {
          [Op.ne]: null, // value не равно null
          [Op.ne]: ''    // value не равно пустой строке
        }
      },
      raw: false
    });

    // console.log(`Найдено WHOIS записей: ${whoisRecords.length} для host_id: ${hostIdNum}`);

    // Формируем объект WHOIS данных
    const whoisData = {};
    
    whoisRecords.forEach((record) => {
      if (record.WhoisKey && record.WhoisKey.key_name && record.value) {
        whoisData[record.WhoisKey.key_name] = record.value;
      }
    });

    // Если данных нет, проверяем существование хоста
    if (Object.keys(whoisData).length === 0) {
      const hostExists = await Host.findByPk(hostIdNum);
      if (!hostExists) {
        return res.status(404).json({
          message: "Хост с указанным ID не найден",
          whois: {},
        });
      }
      console.log(`Хост ${hostIdNum} существует, но WHOIS данных нет`);
    }

    const response = {
      whois: whoisData,
    };

    return res.json(response);
  } catch (error) {
    console.error("Ошибка в getOneKeywordInfo:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};


// // controllers/keywords.controller.js
// import { Sequelize } from "sequelize";
// const { Op } = Sequelize;
// import {
//   Host,
//   Port,
//   WellKnownPort,
//   Whois,
//   WhoisKey,
//   sequelize,
//   Priority,
//   PriorityComment,
//   Grouping,
// } from "../models/index.js";

// // Вспомогательная функция для форматирования данных хоста
// const formatHostData = (host) => {
//   const openPorts = [];
//   const filteredPorts = [];

//   // Проверяем, что Ports существует и является массивом
//   if (host.Ports && Array.isArray(host.Ports)) {
//     host.Ports.forEach((port) => {
//       const portInfo = {
//         port: port.port,
//         name: port.WellKnownPort?.name || null,
//       };

//       if (port.type === "open") {
//         openPorts.push(portInfo);
//       } else if (port.type === "filtered") {
//         filteredPorts.push(portInfo);
//       }
//     });
//   }

//   // Проверяем наличие WHOIS данных
//   const hasWhois = host.Whois && Array.isArray(host.Whois) && host.Whois.length > 0;

//   // Получаем информацию о приоритете и группировке
//   const priorityInfo = {
//     priority: null,
//     grouping: null,
//   };

//   // Добавляем информацию о приоритете - гарантируем наличие name
//   if (host.priority_id || host.Priority) {
//     priorityInfo.priority = {
//       id: host.priority_id,
//       name: host.Priority?.name || "Unknown",
//     };
//   }

//   // Добавляем информацию о группировке
//   if (host.grouping_id || host.Grouping) {
//     priorityInfo.grouping = {
//       id: host.grouping_id,
//       name: host.Grouping?.name || null,
//     };
//   }

//   return {
//     id: host.id,
//     ip: host.ip,
//     reachable: host.reachable,
//     updated_at: host.updated_at
//       ? host.updated_at.toISOString().replace("T", " ").substring(0, 19)
//       : null,
//     port_data: {
//       open: openPorts,
//       filtered: filteredPorts,
//     },
//     priority_info: priorityInfo,
//     has_whois: hasWhois,
//   };
// };

// // Вспомогательная функция для пагинации
// const paginate = (req) => {
//   const { page = 1, limit = 10 } = req.query;
//   const pageNum = Math.max(1, parseInt(page, 10) || 1);
//   const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
//   const offset = (pageNum - 1) * limitNum;
//   return { pageNum, limitNum, offset };
// };

// // GET /keywords?keyword=google&page=1&limit=10
// export const getKeywordInfo = async (req, res) => {
//   try {
//     const { keyword: keywordQuery } = req.query;
//     if (!keywordQuery) {
//       return res.status(400).json({ error: "Параметр 'keyword' обязателен" });
//     }

//     // Приводим ключевое слово к нижнему регистру для регистронезависимого поиска
//     const lowerCaseKeyword = keywordQuery.toLowerCase();

//     // Получаем параметры пагинации
//     const { pageNum, limitNum, offset } = paginate(req);

//     // Сначала находим ID хостов, которые подходят под условие поиска
//     const hostIdsSql = `
//       SELECT DISTINCT h.id, h.priority_id
//       FROM hosts h
//       INNER JOIN whois w ON h.id = w.host_id
//       INNER JOIN whois_keys wk ON w.key_id = wk.id
//       WHERE LOWER(w.value) LIKE LOWER(:keyword) OR LOWER(wk.key_name) LIKE LOWER(:keyword)
//       ORDER BY h.priority_id DESC
//       LIMIT :limit OFFSET :offset
//     `;

//     const hostsResult = await sequelize.query(hostIdsSql, {
//       replacements: {
//         keyword: `%${lowerCaseKeyword}%`,
//         limit: limitNum,
//         offset: offset,
//       },
//       type: sequelize.QueryTypes.SELECT,
//     });

//     if (hostsResult.length === 0) {
//       return res.status(404).json({
//         message: "Нет данных соответствующих поиску",
//         items: [],
//         pagination: {
//           currentPage: pageNum,
//           totalPages: 0,
//           totalItems: 0,
//           hasNext: false,
//           hasPrev: false,
//         },
//       });
//     }

//     // Получаем полные данные для найденных хостов
//     const hostIds = hostsResult.map((h) => h.id);
//     const hosts = await Host.findAll({
//       include: [
//         {
//           model: Port,
//           attributes: ["port", "type"],
//           include: [
//             {
//               model: WellKnownPort,
//               attributes: ["name"],
//               required: false,
//             },
//           ],
//         },
//         {
//           model: Priority,
//           attributes: ["id", "name"],
//           required: false,
//         },
//         {
//           model: Grouping,
//           attributes: ["id", "name"],
//           required: false,
//         },
//         {
//           model: Whois,
//           attributes: ["value"],
//           include: [
//             {
//               model: WhoisKey,
//               attributes: ["key_name"],
//               required: false,
//             },
//           ],
//           required: false,
//         },
//       ],
//       where: {
//         id: { [Op.in]: hostIds },
//       },
//       order: [["priority_id", "DESC"]],
//     });

//     // Формируем результат в нужном формате
//     const items = hosts.map(formatHostData);

//     // Получаем общее количество записей для пагинации
//     const countSql = `
//       SELECT COUNT(DISTINCT h.id) as total
//       FROM hosts h
//       INNER JOIN whois w ON h.id = w.host_id
//       INNER JOIN whois_keys wk ON w.key_id = wk.id
//       WHERE LOWER(w.value) LIKE LOWER(:keyword) OR LOWER(wk.key_name) LIKE LOWER(:keyword)
//     `;

//     const countResult = await sequelize.query(countSql, {
//       replacements: { keyword: `%${lowerCaseKeyword}%` },
//       type: sequelize.QueryTypes.SELECT,
//     });

//     const totalCount = countResult[0].total;
//     const totalPages = Math.ceil(totalCount / limitNum);

//     if (!items.length) {
//       return res.status(404).json({
//         message: "Нет данных соответствующих поиску",
//         items: [],
//         pagination: {
//           currentPage: pageNum,
//           totalPages: totalPages,
//           totalItems: totalCount,
//           hasNext: false,
//           hasPrev: false,
//         },
//       });
//     }

//     const response = {
//       items: items,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalItems: totalCount,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },
//       type: "search",
//       field: "keyword",
//     };

//     return res.json(response);
//   } catch (error) {
//     console.error("Ошибка в getKeywordInfo:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// // Вспомогательная функция для получения уникальных ключевых слов и хостов для конкретного ключевого слова
// async function getUniqueKeywordsAndHostsForKeyword(keywordQuery) {
//   const lowerCaseKeyword = keywordQuery.toLowerCase();

//   // Используем raw SQL для получения уникальных ключевых слов с подсчетом
//   const uniqueKeywordsSql = `
//     SELECT wk.key_name, COUNT(DISTINCT w.host_id) as count
//     FROM whois_keys wk
//     INNER JOIN whois w ON wk.id = w.key_id
//     WHERE LOWER(w.value) LIKE LOWER(:keyword) OR LOWER(wk.key_name) LIKE LOWER(:keyword)
//     GROUP BY wk.key_name
//     ORDER BY wk.key_name ASC
//   `;

//   const uniqueKeywordsResult = await sequelize.query(uniqueKeywordsSql, {
//     replacements: { keyword: `%${lowerCaseKeyword}%` },
//     type: sequelize.QueryTypes.SELECT,
//   });

//   // Находим ID хостов, которые подходят под условие поиска
//   const hostIdsSql = `
//     SELECT DISTINCT h.id, h.priority_id
//     FROM hosts h
//     INNER JOIN whois w ON h.id = w.host_id
//     INNER JOIN whois_keys wk ON w.key_id = wk.id
//     WHERE LOWER(w.value) LIKE LOWER(:keyword) OR LOWER(wk.key_name) LIKE LOWER(:keyword)
//     ORDER BY h.priority_id DESC
//   `;

//   const hostIdsResult = await sequelize.query(hostIdsSql, {
//     replacements: { keyword: `%${lowerCaseKeyword}%` },
//     type: sequelize.QueryTypes.SELECT,
//   });

//   // Получаем полные данные для найденных хостов
//   const hostIds = hostIdsResult.map((h) => h.id);
//   const hosts = await Host.findAll({
//     include: [
//       {
//         model: Port,
//         attributes: ["port", "type"],
//         include: [
//           {
//             model: WellKnownPort,
//             attributes: ["name"],
//             required: false,
//           },
//         ],
//       },
//       {
//         model: Priority,
//         attributes: ["id", "name"],
//         required: false,
//       },
//       {
//         model: Grouping,
//         attributes: ["id", "name"],
//         required: false,
//       },
//       {
//         model: Whois,
//         attributes: ["value"],
//         include: [
//           {
//             model: WhoisKey,
//             attributes: ["key_name"],
//             required: false,
//           },
//         ],
//         required: false,
//       },
//     ],
//     where: {
//       id: { [Op.in]: hostIds },
//     },
//     order: [["priority_id", "DESC"], ["updated_at", "DESC"]],
//   });

//   // Преобразуем результат в структуру, аналогичную той, что ожидается
//   const uniqueKeywords = uniqueKeywordsResult.map((row) => ({
//     dataValues: {
//       key_name: row.key_name,
//       count: parseInt(row.count),
//     },
//   }));

//   return { uniqueKeywords, hosts };
// }

// // Вспомогательная функция для получения всех уникальных ключевых слов и хостов
// async function getAllUniqueKeywordsAndHosts() {
//   // Используем raw SQL для получения уникальных ключевых слов с подсчетом
//   const uniqueKeywordsSql = `
//     SELECT wk.key_name, COUNT(DISTINCT w.host_id) as count
//     FROM whois_keys wk
//     INNER JOIN whois w ON wk.id = w.key_id
//     GROUP BY wk.key_name
//     ORDER BY wk.key_name ASC
//   `;

//   const uniqueKeywordsResult = await sequelize.query(uniqueKeywordsSql, {
//     type: sequelize.QueryTypes.SELECT,
//   });

//   // Получаем все хосты с полными данными через Sequelize
//   const hosts = await Host.findAll({
//     include: [
//       {
//         model: Port,
//         attributes: ["port", "type"],
//         include: [
//           {
//             model: WellKnownPort,
//             attributes: ["name"],
//             required: false,
//           },
//         ],
//       },
//       {
//         model: Priority,
//         attributes: ["id", "name"],
//         required: false,
//       },
//       {
//         model: Grouping,
//         attributes: ["id", "name"],
//         required: false,
//       },
//       {
//         model: Whois,
//         attributes: ["value"],
//         include: [
//           {
//             model: WhoisKey,
//             attributes: ["key_name"],
//             required: false,
//           },
//         ],
//         required: false,
//       },
//     ],
//     order: [["priority_id", "DESC"], ["updated_at", "DESC"]],
//   });

//   // Преобразуем результат в структуру, аналогичную той, что ожидается
//   const uniqueKeywords = uniqueKeywordsResult.map((row) => ({
//     dataValues: {
//       key_name: row.key_name,
//       count: parseInt(row.count),
//     },
//   }));

//   return { uniqueKeywords, hosts };
// }

// // Вспомогательная функция для формирования ответа
// function buildKeywordsResponse(
//   items,
//   pageNum,
//   totalPages,
//   totalCount,
//   type,
//   field
// ) {
//   return {
//     items: items,
//     pagination: {
//       currentPage: pageNum,
//       totalPages: totalPages,
//       totalItems: totalCount,
//       hasNext: pageNum < totalPages,
//       hasPrev: pageNum > 1,
//     },
//     type: type,
//     field: field,
//   };
// }

// // GET /keywords/group
// // GET /keywords/group?keyword=google&page=1&limit=10
// export const groupKeywords = async (req, res) => {
//   try {
//     // Get pagination parameters from request query
//     const { page = 1, limit = 10, keyword: keywordQuery } = req.query;
//     const pageNum = Math.max(1, parseInt(page, 10));
//     const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));

//     let uniqueKeywords;
//     let hosts;

//     // Проверяем, есть ли фильтр по ключевому слову
//     if (keywordQuery !== undefined && keywordQuery !== '') {
//       // Если указан конкретное ключевое слово, фильтруем данные
//       const result = await getUniqueKeywordsAndHostsForKeyword(keywordQuery);
//       uniqueKeywords = result.uniqueKeywords;
//       hosts = result.hosts;
//     } else {
//       // Если фильтра нет, работаем как обычно
//       const result = await getAllUniqueKeywordsAndHosts();
//       uniqueKeywords = result.uniqueKeywords;
//       hosts = result.hosts;
//     }

//     const totalCount = uniqueKeywords.length;

//     // Если мы запрашиваем конкретное ключевое слово и оно не найдено, возвращаем 404
//     if (
//       keywordQuery !== undefined && 
//       keywordQuery !== '' &&
//       uniqueKeywords.length === 0
//     ) {
//       return res.status(404).json({
//         message: "Нет данных соответствующих поиску",
//         items: [],
//         pagination: {
//           currentPage: pageNum,
//           totalPages: 0,
//           totalItems: 0,
//           hasNext: false,
//           hasPrev: false,
//         },
//       });
//     }

//     // Формируем карту отформатированных хостов для избежания дублирования
//     const formattedHostsMap = new Map();
    
//     hosts.forEach((host) => {
//       if (!formattedHostsMap.has(host.id)) {
//         formattedHostsMap.set(host.id, formatHostData(host));
//       }
//     });

//     // Группируем хосты по ключевым словам
//     const keywordGroups = {};

//     // Инициализируем группы для всех уникальных ключевых слов
//     uniqueKeywords.forEach((keyRecord) => {
//       const keyword = keyRecord.dataValues.key_name;
//       const count = keyRecord.dataValues.count;
//       keywordGroups[keyword] = {
//         keyword: keyword,
//         count: count,
//         items: [],
//       };
//     });

//     // Для правильной группировки связываем хосты с ключевыми словами через WHOIS
//     if (keywordQuery !== undefined && keywordQuery !== '') {
//       // Для поиска по конкретному ключевому слову
//       const formattedHosts = Array.from(formattedHostsMap.values());
//       const targetKeyword = keywordQuery.toLowerCase();
      
//       // Добавляем все найденные хосты в группу с искомым ключевым словом
//       if (keywordGroups[targetKeyword]) {
//         keywordGroups[targetKeyword].items = formattedHosts;
//       }
//     } else {
//       // Для общего случая - группируем хосты по ключевым словам из их WHOIS данных
//       // Получаем все WHOIS данные для хостов
//       const hostsWithWhois = await Host.findAll({
//         include: [
//           {
//             model: Whois,
//             attributes: ["value"],
//             include: [
//               {
//                 model: WhoisKey,
//                 attributes: ["key_name"],
//                 required: false,
//               },
//             ],
//             required: false,
//           },
//         ],
//         where: {
//           id: {
//             [Op.in]: hosts.map(host => host.id)
//           }
//         },
//       });

//       // Создаем карту WHOIS данных для хостов
//       const hostWhoisMap = new Map();
//       hostsWithWhois.forEach(host => {
//         hostWhoisMap.set(host.id, host.Whois || []);
//       });

//       // Группируем хосты по ключевым словам
//       for (const host of hosts) {
//         const formattedHost = formattedHostsMap.get(host.id);
//         const hostWhois = hostWhoisMap.get(host.id) || [];

//         if (formattedHost && hostWhois.length > 0) {
//           for (const whois of hostWhois) {
//             const keyName = whois.WhoisKey?.key_name;
//             if (keyName && keywordGroups[keyName]) {
//               // Проверяем, что хост еще не добавлен в эту группу
//               const hostExists = keywordGroups[keyName].items.some(
//                 item => item.id === formattedHost.id
//               );
//               if (!hostExists) {
//                 keywordGroups[keyName].items.push(formattedHost);
//               }
//             }
//           }
//         }
//       }
//     }

//     // Сортируем хосты внутри каждой группы по приоритету
//     Object.values(keywordGroups).forEach((group) => {
//       group.items.sort((a, b) => {
//         // Сначала сортируем по приоритету (DESC)
//         const priorityA = a.priority_info?.priority?.id || 0;
//         const priorityB = b.priority_info?.priority?.id || 0;
        
//         if (priorityB !== priorityA) {
//           return priorityB - priorityA;
//         }
        
//         // Если приоритеты одинаковые, сортируем по дате обновления
//         if (a.updated_at && b.updated_at) {
//           return new Date(b.updated_at) - new Date(a.updated_at);
//         }
//         return 0;
//       });
//     });

//     // Преобразуем в нужный формат и сортируем по возрастанию ключевых слов
//     let items = Object.values(keywordGroups)
//       .filter((group) => group.items.length > 0)
//       .map((group) => {
//         const totalItemsInGroup = group.items.length;
//         const totalPagesInGroup = Math.ceil(totalItemsInGroup / pageSize);
//         const offset = (pageNum - 1) * pageSize;

//         return {
//           name: group.keyword,
//           count: group.count,
//           items: group.items.slice(offset, offset + pageSize),
//           pagination: {
//             currentPage: pageNum,
//             totalPages: totalPagesInGroup,
//             totalItems: totalItemsInGroup,
//             hasNext: pageNum < totalPagesInGroup,
//             hasPrev: pageNum > 1,
//           },
//         };
//       })
//       .sort((a, b) => a.name.localeCompare(b.name));

//     // Если был задан конкретное ключевое слово, отфильтровываем результаты
//     if (keywordQuery !== undefined && keywordQuery !== '') {
//       const lowerCaseKeyword = keywordQuery.toLowerCase();
//       const filteredItems = items.filter(
//         (item) => item.name.toLowerCase().includes(lowerCaseKeyword)
//       );
      
//       if (filteredItems.length > 0) {
//         items = filteredItems;
//       } else {
//         return res.status(404).json({
//           message: "Нет данных соответствующих поиску",
//           items: [],
//           pagination: {
//             currentPage: pageNum,
//             totalPages: 0,
//             totalItems: 0,
//             hasNext: false,
//             hasPrev: false,
//           },
//         });
//       }
//     }

//     const totalPages = Math.ceil(totalCount / pageSize);

//     if (!items.length) {
//       return res.status(404).json({
//         message: "Нет данных",
//         items: [],
//         pagination: {
//           currentPage: pageNum,
//           totalPages: totalPages,
//           totalItems: totalCount,
//           hasNext: false,
//           hasPrev: false,
//         },
//       });
//     }

//     const response = buildKeywordsResponse(
//       items,
//       pageNum,
//       totalPages,
//       totalCount,
//       "group",
//       "keyword"
//     );

//     return res.json(response);
//   } catch (error) {
//     console.error("Ошибка в groupKeywords:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };


// /**
//  * GET /search?id=3
//  * Версия с использованием Sequelize ORM
//  */
// export const getOneKeywordInfo = async (req, res) => {
//   try {
//     const { id: hostId } = req.query;

//     if (!hostId) {
//       return res.status(400).json({ error: "Параметр 'id' обязателен" });
//     }

//     const hostIdNum = parseInt(hostId, 10);
//     if (isNaN(hostIdNum) || hostIdNum <= 0) {
//       return res.status(400).json({ error: "Некорректный ID хоста" });
//     }

//     console.log(`Поиск WHOIS данных для host_id: ${hostIdNum}`);

//     // Получаем WHOIS данные через Sequelize
//     const whoisRecords = await Whois.findAll({
//       attributes: ['value'],
//       include: [{
//         model: WhoisKey,
//         attributes: ['key_name'],
//         required: true
//       }],
//       where: {
//         host_id: hostIdNum,
//         value: {
//           [Op.ne]: null, // value не равно null
//           [Op.ne]: ''    // value не равно пустой строке
//         }
//       },
//       raw: false
//     });

//     console.log(`Найдено WHOIS записей: ${whoisRecords.length} для host_id: ${hostIdNum}`);

//     // Формируем объект WHOIS данных
//     const whoisData = {};
    
//     whoisRecords.forEach((record) => {
//       if (record.WhoisKey && record.WhoisKey.key_name && record.value) {
//         whoisData[record.WhoisKey.key_name] = record.value;
//       }
//     });

//     // Если данных нет, проверяем существование хоста
//     if (Object.keys(whoisData).length === 0) {
//       const hostExists = await Host.findByPk(hostIdNum);
//       if (!hostExists) {
//         return res.status(404).json({
//           message: "Хост с указанным ID не найден",
//           whois: {},
//         });
//       }
//       console.log(`Хост ${hostIdNum} существует, но WHOIS данных нет`);
//     }

//     const response = {
//       whois: whoisData,
//     };

//     return res.json(response);
//   } catch (error) {
//     console.error("Ошибка в getOneKeywordInfo:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };
