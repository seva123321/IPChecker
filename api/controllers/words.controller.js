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
  Grouping,
} from "../models/index.js";

// Общая функция форматирования портов из JSON
const extractPortsFromJson = (portsJson) => {
  const result = { open: [], filtered: [] };
  
  if (!portsJson) return result;
  
  try {
    const ports = typeof portsJson === 'string' ? JSON.parse(portsJson) : portsJson;
    
    if (!Array.isArray(ports) || ports.length === 0) return result;
    
    for (let i = 0; i < ports.length; i++) {
      const port = ports[i];
      if (port && port.port && port.type) {
        const portInfo = {
          port: port.port,
          name: port.port_name || null,
        };
        
        if (port.type === "open") {
          result.open.push(portInfo);
        } else if (port.type === "filtered") {
          result.filtered.push(portInfo);
        }
      }
    }
  } catch (e) {
    console.error("Error extracting ports:", e);
  }
  
  return result;
};

// Универсальная функция форматирования данных хоста
const formatHostFromRaw = (host) => ({
  id: host.id,
  ip: host.ip,
  reachable: host.reachable,
  updated_at: host.updated_at,
  port_data: extractPortsFromJson(host.ports_json),
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
});

// Вспомогательная функция для пагинации
const paginate = (req) => {
  const { page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;
  return { pageNum, limitNum, offset };
};

// Оптимизированная функция для поиска по ключевому слову
export const getKeywordInfo = async (req, res) => {
  try {
    const { keyword: keywordQuery } = req.query;
    if (!keywordQuery) {
      return res.status(400).json({ error: "Параметр 'keyword' обязателен" });
    }

    const lowerCaseKeyword = keywordQuery.toLowerCase();
    const { pageNum, limitNum, offset } = paginate(req);

    // Оптимизированный запрос с одним SQL (без DISTINCT в основном запросе)
    const searchQuery = `
      WITH searched_hosts AS (
        SELECT 
          h.id,
          h.ip,
          h.reachable,
          TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
          h.priority_id,
          h.grouping_id,
          hp.name as priority_name,
          hg.name as grouping_name,
          h.updated_at as order_updated_at, -- Добавляем для сортировки
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'port', p.port,
                  'type', p.type,
                  'port_name', wkp.name
                )
                ORDER BY p.port
              ),
              '[]'::json
            )
            FROM ports p
            LEFT JOIN well_known_ports wkp ON p.port = wkp.port
            WHERE p.host_id = h.id
          ) as ports_json,
          TRUE as has_whois
        FROM hosts h
        INNER JOIN whois w ON h.id = w.host_id
        INNER JOIN whois_keys wk ON w.key_id = wk.id
        LEFT JOIN host_priorities hp ON h.priority_id = hp.id
        LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
        WHERE (LOWER(w.value) LIKE LOWER(:keyword) OR LOWER(wk.key_name) LIKE LOWER(:keyword))
        AND w.value IS NOT NULL 
        AND w.value != ''
        GROUP BY h.id, h.ip, h.reachable, h.updated_at, h.priority_id, h.grouping_id, hp.name, hg.name
      ),
      distinct_hosts AS (
        SELECT DISTINCT ON (id) *
        FROM searched_hosts
        ORDER BY id
      ),
      sorted_hosts AS (
        SELECT 
          *,
          ROW_NUMBER() OVER (
            ORDER BY 
              CASE WHEN priority_id IS NULL THEN 1 ELSE 0 END,
              priority_id DESC NULLS LAST,
              order_updated_at DESC
          ) as rn
        FROM distinct_hosts
      ),
      paginated_hosts AS (
        SELECT * FROM sorted_hosts
        WHERE rn > :offset AND rn <= :offsetPlusLimit
      ),
      total_count AS (
        SELECT COUNT(DISTINCT h.id) as total
        FROM hosts h
        INNER JOIN whois w ON h.id = w.host_id
        INNER JOIN whois_keys wk ON w.key_id = wk.id
        WHERE (LOWER(w.value) LIKE LOWER(:keyword) OR LOWER(wk.key_name) LIKE LOWER(:keyword))
        AND w.value IS NOT NULL 
        AND w.value != ''
      )
      SELECT 
        ph.*,
        tc.total
      FROM paginated_hosts ph
      CROSS JOIN total_count tc
      ORDER BY ph.rn
    `;

    const hosts = await sequelize.query(searchQuery, {
      replacements: {
        keyword: `%${lowerCaseKeyword}%`,
        offset: offset,
        offsetPlusLimit: offset + limitNum,
      },
      type: sequelize.QueryTypes.SELECT,
    });

    if (hosts.length === 0) {
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

    const totalCount = parseInt(hosts[0]?.total || 0);
    const totalPages = Math.ceil(totalCount / limitNum);
    
    // Убираем служебные поля из результата
    const cleanedHosts = hosts.map(host => {
      const { order_updated_at, rn, total, ...cleanHost } = host;
      return cleanHost;
    });
    
    const items = cleanedHosts.map(formatHostFromRaw);

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

// Высокопроизводительная версия groupKeywords
export const groupKeywords = async (req, res) => {
  try {
    const { page = 1, limit = 10, keyword: keywordQuery } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * pageSize;

    // Проверяем, есть ли фильтр по ключевому слову
    let keywordFilter = null;
    let filterCondition = '';
    let replacements = {};
    
    if (keywordQuery !== undefined && keywordQuery !== '') {
      keywordFilter = keywordQuery.trim().toLowerCase();
      filterCondition = 'AND (LOWER(wk.key_name) LIKE LOWER(:keywordFilter) OR LOWER(w.value) LIKE LOWER(:keywordFilter))';
      replacements.keywordFilter = `%${keywordFilter}%`;
    }

    // ============ ШАГ 1: Получаем уникальные ключевые слова ============
    const uniqueKeywordsQuery = `
      SELECT 
        wk.key_name as value,
        COUNT(DISTINCT w.host_id) as host_count
      FROM whois_keys wk
      INNER JOIN whois w ON wk.id = w.key_id
      WHERE w.value IS NOT NULL AND w.value != ''
      ${filterCondition}
      GROUP BY wk.key_name
      ORDER BY wk.key_name ASC
    `;

    const uniqueKeywords = await sequelize.query(uniqueKeywordsQuery, {
      replacements,
      type: sequelize.QueryTypes.SELECT,
    });

    if (uniqueKeywords.length === 0) {
      return res.json({
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

    // Берем только первый ключ для группировки (судя по логике кода)
    const firstKeyword = uniqueKeywords[0];
    const keywordName = firstKeyword.value;
    
    // Получаем хосты для этого ключевого слова с пагинацией
    const hostsQuery = `
      WITH sorted_hosts AS (
        SELECT 
          h.id,
          ROW_NUMBER() OVER (
            ORDER BY 
              CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
              h.priority_id DESC NULLS LAST,
              h.updated_at DESC
          ) as rn
        FROM hosts h
        INNER JOIN whois w ON h.id = w.host_id
        INNER JOIN whois_keys wk ON w.key_id = wk.id
        WHERE wk.key_name = :keywordName
        AND w.value IS NOT NULL 
        AND w.value != ''
      ),
      paginated_hosts AS (
        SELECT id FROM sorted_hosts
        WHERE rn > :offset AND rn <= :offsetPlusLimit
        ORDER BY rn
      ),
      host_details AS (
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
                ORDER BY p.port
              ),
              '[]'::json
            )
            FROM ports p
            LEFT JOIN well_known_ports wkp ON p.port = wkp.port
            WHERE p.host_id = h.id
          ) as ports_json,
          TRUE as has_whois
        FROM hosts h
        INNER JOIN paginated_hosts ph ON h.id = ph.id
        LEFT JOIN host_priorities hp ON h.priority_id = hp.id
        LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
      ),
      total_count AS (
        SELECT COUNT(DISTINCT h.id) as total_count
        FROM hosts h
        INNER JOIN whois w ON h.id = w.host_id
        INNER JOIN whois_keys wk ON w.key_id = wk.id
        WHERE wk.key_name = :keywordName
        AND w.value IS NOT NULL 
        AND w.value != ''
      )
      SELECT 
        hd.*,
        tc.total_count
      FROM host_details hd
      CROSS JOIN total_count tc
      ORDER BY (
        SELECT rn FROM sorted_hosts sh WHERE sh.id = hd.id
      )
    `;

    const hosts = await sequelize.query(hostsQuery, {
      replacements: {
        keywordName,
        offset: offset,
        offsetPlusLimit: offset + pageSize,
      },
      type: sequelize.QueryTypes.SELECT,
    });

    if (hosts.length === 0) {
      return res.json({
        items: [],
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalItems: 0,
          hasNext: false,
          hasPrev: false,
        },
        type: "group",
        field: "keyword",
        tabs: uniqueKeywords,
      });
    }

    const totalItems = parseInt(hosts[0]?.total_count || 0);
    const totalPages = Math.ceil(totalItems / pageSize);
    const items = hosts.map(formatHostFromRaw);

    // ============ Формируем ответ ============
    const response = {
      items: items,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: totalItems,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      type: "group",
      field: "keyword",
      tabs: uniqueKeywords,
    };

    return res.json(response);

  } catch (error) {
    console.error("Ошибка в groupKeywords:", error);
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

    // Оптимизированный SQL запрос для получения WHOIS данных
    const whoisQuery = `
      SELECT 
        wk.key_name,
        w.value
      FROM whois w
      INNER JOIN whois_keys wk ON w.key_id = wk.id
      WHERE w.host_id = :hostId
        AND w.value IS NOT NULL
        AND w.value != ''
      ORDER BY wk.key_name
    `;

    const whoisRecords = await sequelize.query(whoisQuery, {
      replacements: { hostId: hostIdNum },
      type: sequelize.QueryTypes.SELECT,
    });

    // Формируем объект WHOIS данных
    const whoisData = {};
    whoisRecords.forEach((record) => {
      if (record.key_name && record.value) {
        whoisData[record.key_name] = record.value;
      }
    });

    // Если данных нет, проверяем существование хоста
    if (Object.keys(whoisData).length === 0) {
      const hostExists = await Host.findByPk(hostIdNum, {
        attributes: ['id'],
        raw: true
      });
      
      if (!hostExists) {
        return res.status(404).json({
          message: "Хост с указанным ID не найден",
          whois: {},
        });
      }
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
// // export const getKeywordInfo = async (req, res) => {
// //   try {
// //     const { keyword: keywordQuery } = req.query;
// //     if (!keywordQuery) {
// //       return res.status(400).json({ error: "Параметр 'keyword' обязателен" });
// //     }

// //     const lowerCaseKeyword = keywordQuery.toLowerCase();
// //     const { pageNum, limitNum, offset } = paginate(req);

// //     // Оптимизированный запрос с одним SQL
// //     const searchQuery = `
// //       WITH searched_hosts AS (
// //         SELECT DISTINCT
// //           h.id,
// //           h.ip,
// //           h.reachable,
// //           TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
// //           h.priority_id,
// //           h.grouping_id,
// //           hp.name as priority_name,
// //           hg.name as grouping_name,
// //           (
// //             SELECT COALESCE(
// //               json_agg(
// //                 json_build_object(
// //                   'port', p.port,
// //                   'type', p.type,
// //                   'port_name', wkp.name
// //                 )
// //               ),
// //               '[]'::json
// //             )
// //             FROM ports p
// //             LEFT JOIN well_known_ports wkp ON p.port = wkp.port
// //             WHERE p.host_id = h.id
// //           ) as ports_json,
// //           (
// //             SELECT COUNT(*) > 0
// //             FROM whois w2
// //             WHERE w2.host_id = h.id
// //           ) as has_whois
// //         FROM hosts h
// //         INNER JOIN whois w ON h.id = w.host_id
// //         INNER JOIN whois_keys wk ON w.key_id = wk.id
// //         LEFT JOIN host_priorities hp ON h.priority_id = hp.id
// //         LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
// //         WHERE (LOWER(w.value) LIKE LOWER(:keyword) OR LOWER(wk.key_name) LIKE LOWER(:keyword))
// //         AND w.value IS NOT NULL 
// //         AND w.value != ''
// //         ORDER BY 
// //           CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
// //           h.priority_id DESC NULLS LAST,
// //           h.updated_at DESC
// //         LIMIT :limit OFFSET :offset
// //       )
// //       SELECT * FROM searched_hosts
// //     `;

// //     const countQuery = `
// //       SELECT COUNT(DISTINCT h.id) as total
// //       FROM hosts h
// //       INNER JOIN whois w ON h.id = w.host_id
// //       INNER JOIN whois_keys wk ON w.key_id = wk.id
// //       WHERE (LOWER(w.value) LIKE LOWER(:keyword) OR LOWER(wk.key_name) LIKE LOWER(:keyword))
// //       AND w.value IS NOT NULL 
// //       AND w.value != ''
// //     `;

// //     const [hosts, countResult] = await Promise.all([
// //       sequelize.query(searchQuery, {
// //         replacements: {
// //           keyword: `%${lowerCaseKeyword}%`,
// //           limit: limitNum,
// //           offset: offset,
// //         },
// //         type: sequelize.QueryTypes.SELECT,
// //       }),
// //       sequelize.query(countQuery, {
// //         replacements: { keyword: `%${lowerCaseKeyword}%` },
// //         type: sequelize.QueryTypes.SELECT,
// //       }),
// //     ]);

// //     console.log('hosts >>  ', hosts)

// //     const totalCount = parseInt(countResult[0]?.total || 0);
// //     const totalPages = Math.ceil(totalCount / limitNum);

// //     if (hosts.length === 0) {
// //       return res.status(404).json({
// //         message: "Нет данных соответствующих поиску",
// //         items: [],
// //         pagination: {
// //           currentPage: pageNum,
// //           totalPages: totalPages,
// //           totalItems: totalCount,
// //           hasNext: false,
// //           hasPrev: false,
// //         },
// //       });
// //     }

// //     // Используем ту же функцию форматирования
// //     const formatHostFromRaw = (host) => {
// //       const openPorts = [];
// //       const filteredPorts = [];

// //       if (host.ports_json) {
// //         try {
// //           const ports = typeof host.ports_json === 'string' 
// //             ? JSON.parse(host.ports_json) 
// //             : host.ports_json;
          
// //           if (Array.isArray(ports)) {
// //             ports.forEach((port) => {
// //               if (port && port.port && port.type) {
// //                 const portInfo = {
// //                   port: port.port,
// //                   name: port.port_name || null,
// //                 };

// //                 if (port.type === "open") {
// //                   openPorts.push(portInfo);
// //                 } else if (port.type === "filtered") {
// //                   filteredPorts.push(portInfo);
// //                 }
// //               }
// //             });
// //           }
// //         } catch (e) {
// //           console.error("Error processing ports_json:", e);
// //         }
// //       }

// //       return {
// //         id: host.id,
// //         ip: host.ip,
// //         reachable: host.reachable,
// //         updated_at: host.updated_at,
// //         port_data: {
// //           open: openPorts,
// //           filtered: filteredPorts,
// //         },
// //         priority_info: {
// //           priority: host.priority_id ? {
// //             id: host.priority_id,
// //             name: host.priority_name || "Unknown",
// //           } : null,
// //           grouping: host.grouping_id ? {
// //             id: host.grouping_id,
// //             name: host.grouping_name || null,
// //           } : null,
// //         },
// //         has_whois: !!host.has_whois,
// //       };
// //     };

// //     const items = hosts.map(formatHostFromRaw);

// //     const response = {
// //       items: items,
// //       pagination: {
// //         currentPage: pageNum,
// //         totalPages: totalPages,
// //         totalItems: totalCount,
// //         hasNext: pageNum < totalPages,
// //         hasPrev: pageNum > 1,
// //       },
// //       type: "search",
// //       field: "keyword",
// //     };

// //     return res.json(response);
// //   } catch (error) {
// //     console.error("Ошибка в getKeywordInfo:", error);
// //     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
// //   }
// // };

// // Вспомогательная функция для пагинации
// const paginate = (req) => {
//   const { page = 1, limit = 10 } = req.query;
//   const pageNum = Math.max(1, parseInt(page, 10) || 1);
//   const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
//   const offset = (pageNum - 1) * limitNum;
//   return { pageNum, limitNum, offset };
// };


// // Высокопроизводительная версия groupKeywords
// export const groupKeywords = async (req, res) => {
//   try {
//     const { page = 1, limit = 10, keyword: keywordQuery } = req.query;
//     const pageNum = Math.max(1, parseInt(page, 10));
//     const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));

//     // Проверяем, есть ли фильтр по ключевому слову
//     let keywordFilter = null;
//     if (keywordQuery !== undefined && keywordQuery !== '') {
//       keywordFilter = keywordQuery.trim().toLowerCase();
//     }

//     // ============ ШАГ 1: Получаем уникальные ключевые слова ============
//     let uniqueKeywordsQuery = `
//       SELECT 
//         wk.key_name as value,
//         COUNT(DISTINCT w.host_id) as host_count
//       FROM whois_keys wk
//       INNER JOIN whois w ON wk.id = w.key_id
//       WHERE w.value IS NOT NULL AND w.value != ''
//       ${keywordFilter ? 'AND (LOWER(wk.key_name) LIKE LOWER(:keywordFilter) OR LOWER(w.value) LIKE LOWER(:keywordFilter))' : ''}
//       GROUP BY wk.key_name
//       ORDER BY wk.key_name ASC
//     `;

//     const replacements = keywordFilter ? { keywordFilter: `%${keywordFilter}%` } : {};
//     const uniqueKeywords = await sequelize.query(uniqueKeywordsQuery, {
//       replacements,
//       type: sequelize.QueryTypes.SELECT,
//     });

//     if (uniqueKeywords.length === 0) {
//       return res.status(404).json({
//         message: "Нет данных",
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
//     // console.log('uniqueKeywords > ', uniqueKeywords)
//     // ============ ШАГ 2: Для каждого ключевого слова получаем хосты с пагинацией ============
//     const itemsPromises = uniqueKeywords.map(async (keywordInfo) => {
//       const keywordName = keywordInfo.value;
      
//       // Получаем хосты для этого ключевого слова с пагинацией
//       const hostsQuery = `
//         SELECT 
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
//         WHERE wk.key_name = :keywordName
//         AND w.value IS NOT NULL 
//         AND w.value != ''
//         ORDER BY 
//           CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//           h.priority_id DESC NULLS LAST,
//           h.updated_at DESC
//         LIMIT :limit OFFSET :offset
//       `;

//       const countQuery = `
//         SELECT COUNT(DISTINCT h.id) as total_count
//         FROM hosts h
//         INNER JOIN whois w ON h.id = w.host_id
//         INNER JOIN whois_keys wk ON w.key_id = wk.id
//         WHERE wk.key_name = :keywordName
//         AND w.value IS NOT NULL 
//         AND w.value != ''
//       `;

//       const [hosts, countResult] = await Promise.all([
//         sequelize.query(hostsQuery, {
//           replacements: {
//             keywordName,
//             limit: pageSize,
//             offset: (pageNum - 1) * pageSize,
//           },
//           type: sequelize.QueryTypes.SELECT,
//         }),
//         sequelize.query(countQuery, {
//           replacements: { keywordName },
//           type: sequelize.QueryTypes.SELECT,
//         }),
//       ]);

//       const totalItems = parseInt(countResult[0]?.total_count || 0);
//       const totalPages = Math.ceil(totalItems / pageSize);

//       // Форматируем хосты
//       const formatHost = (host) => {
//         const openPorts = [];
//         const filteredPorts = [];

//         if (host.ports_json) {
//           try {
//             const ports = typeof host.ports_json === 'string' 
//               ? JSON.parse(host.ports_json) 
//               : host.ports_json;
            
//             if (Array.isArray(ports)) {
//               ports.forEach((port) => {
//                 if (port && port.port && port.type) {
//                   const portInfo = {
//                     port: port.port,
//                     name: port.port_name || null,
//                   };

//                   if (port.type === "open") {
//                     openPorts.push(portInfo);
//                   } else if (port.type === "filtered") {
//                     filteredPorts.push(portInfo);
//                   }
//                 }
//               });
//             }
//           } catch (e) {
//             console.error("Error processing ports_json:", e);
//           }
//         }

//         return {
//           id: host.id,
//           ip: host.ip,
//           reachable: host.reachable,
//           updated_at: host.updated_at,
//           port_data: {
//             open: openPorts,
//             filtered: filteredPorts,
//           },
//           priority_info: {
//             priority: host.priority_id ? {
//               id: host.priority_id,
//               name: host.priority_name || "Unknown",
//             } : null,
//             grouping: host.grouping_id ? {
//               id: host.grouping_id,
//               name: host.grouping_name || null,
//             } : null,
//           },
//           has_whois: !!host.has_whois,
//         };
//       };

//       return {
//         name: keywordInfo.value,
//         count: parseInt(keywordInfo.host_count),
//         items: hosts.map(formatHost),
//         pagination: {
//           currentPage: pageNum,
//           totalPages: totalPages,
//           totalItems: totalItems,
//           hasNext: pageNum < totalPages,
//           hasPrev: pageNum > 1,
//         },
//       };
//     });

//     const items = await Promise.all(itemsPromises);

//     // Фильтруем группы, у которых есть элементы на текущей странице
//     const filteredItems = items.filter(group => group.items.length > 0);

//     if (filteredItems.length === 0) {
//       return res.status(404).json({
//         message: "Нет данных на текущей странице",
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
//     const firstSortedItems = filteredItems.sort((a, b) => a.name.localeCompare(b.name))[0]
//     // ============ ШАГ 3: Формируем ответ ============
//     const response = {
//       // items: filteredItems.sort((a, b) => a.name.localeCompare(b.name)),
//       items: firstSortedItems.items, //!
//       pagination: firstSortedItems.pagination,
//       // pagination: {
//       //   currentPage: pageNum,
//       //   totalPages: filteredItems.length > 0 ? filteredItems[0].pagination.totalPages : 0,
//       //   totalItems: filteredItems.length, //> 0 ? filteredItems[0].pagination.totalItems : 0,
//       //   hasNext: pageNum < (filteredItems.length > 0 ? filteredItems[0].pagination.totalPages : 0),
//       //   hasPrev: pageNum > 1,
//       // },
//       type: "group",
//       field: "keyword",
//       tabs: uniqueKeywords, //!
//     };

//     return res.json(response);

//   } catch (error) {
//     console.error("Ошибка в groupKeywordsFast:", error);
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

//     // console.log(`Поиск WHOIS данных для host_id: ${hostIdNum}`);

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

//     // console.log(`Найдено WHOIS записей: ${whoisRecords.length} для host_id: ${hostIdNum}`);

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
