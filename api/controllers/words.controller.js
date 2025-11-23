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

// Вспомогательная функция для форматирования данных хоста
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

// Вспомогательная функция для пагинации
const paginate = (req) => {
  const { page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;
  return { pageNum, limitNum, offset };
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

// Вспомогательная функция для получения уникальных ключевых слов и хостов для конкретного ключевого слова
async function getUniqueKeywordsAndHostsForKeyword(keywordQuery) {
  const lowerCaseKeyword = keywordQuery.toLowerCase();

  // Используем raw SQL для получения уникальных ключевых слов с подсчетом
  const uniqueKeywordsSql = `
    SELECT wk.key_name, COUNT(DISTINCT w.host_id) as count
    FROM whois_keys wk
    INNER JOIN whois w ON wk.id = w.key_id
    WHERE LOWER(w.value) LIKE LOWER(:keyword) OR LOWER(wk.key_name) LIKE LOWER(:keyword)
    GROUP BY wk.key_name
    ORDER BY wk.key_name ASC
  `;

  const uniqueKeywordsResult = await sequelize.query(uniqueKeywordsSql, {
    replacements: { keyword: `%${lowerCaseKeyword}%` },
    type: sequelize.QueryTypes.SELECT,
  });

  // Находим ID хостов, которые подходят под условие поиска
  const hostIdsSql = `
    SELECT DISTINCT h.id, h.priority_id
    FROM hosts h
    INNER JOIN whois w ON h.id = w.host_id
    INNER JOIN whois_keys wk ON w.key_id = wk.id
    WHERE LOWER(w.value) LIKE LOWER(:keyword) OR LOWER(wk.key_name) LIKE LOWER(:keyword)
    ORDER BY h.priority_id DESC
  `;

  const hostIdsResult = await sequelize.query(hostIdsSql, {
    replacements: { keyword: `%${lowerCaseKeyword}%` },
    type: sequelize.QueryTypes.SELECT,
  });

  // Получаем полные данные для найденных хостов
  const hostIds = hostIdsResult.map((h) => h.id);
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
    order: [["priority_id", "DESC"], ["updated_at", "DESC"]],
  });

  // Преобразуем результат в структуру, аналогичную той, что ожидается
  const uniqueKeywords = uniqueKeywordsResult.map((row) => ({
    dataValues: {
      key_name: row.key_name,
      count: parseInt(row.count),
    },
  }));

  return { uniqueKeywords, hosts };
}

// Вспомогательная функция для получения всех уникальных ключевых слов и хостов
async function getAllUniqueKeywordsAndHosts() {
  // Используем raw SQL для получения уникальных ключевых слов с подсчетом
  const uniqueKeywordsSql = `
    SELECT wk.key_name, COUNT(DISTINCT w.host_id) as count
    FROM whois_keys wk
    INNER JOIN whois w ON wk.id = w.key_id
    GROUP BY wk.key_name
    ORDER BY wk.key_name ASC
  `;

  const uniqueKeywordsResult = await sequelize.query(uniqueKeywordsSql, {
    type: sequelize.QueryTypes.SELECT,
  });

  // Получаем все хосты с полными данными через Sequelize
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
    order: [["priority_id", "DESC"], ["updated_at", "DESC"]],
  });

  // Преобразуем результат в структуру, аналогичную той, что ожидается
  const uniqueKeywords = uniqueKeywordsResult.map((row) => ({
    dataValues: {
      key_name: row.key_name,
      count: parseInt(row.count),
    },
  }));

  return { uniqueKeywords, hosts };
}

// Вспомогательная функция для формирования ответа
function buildKeywordsResponse(
  items,
  pageNum,
  totalPages,
  totalCount,
  type,
  field
) {
  return {
    items: items,
    pagination: {
      currentPage: pageNum,
      totalPages: totalPages,
      totalItems: totalCount,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
    type: type,
    field: field,
  };
}

// GET /keywords/group
// GET /keywords/group?keyword=google&page=1&limit=10
export const groupKeywords = async (req, res) => {
  try {
    // Get pagination parameters from request query
    const { page = 1, limit = 10, keyword: keywordQuery } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let uniqueKeywords;
    let hosts;

    // Проверяем, есть ли фильтр по ключевому слову
    if (keywordQuery !== undefined && keywordQuery !== '') {
      // Если указан конкретное ключевое слово, фильтруем данные
      const result = await getUniqueKeywordsAndHostsForKeyword(keywordQuery);
      uniqueKeywords = result.uniqueKeywords;
      hosts = result.hosts;
    } else {
      // Если фильтра нет, работаем как обычно
      const result = await getAllUniqueKeywordsAndHosts();
      uniqueKeywords = result.uniqueKeywords;
      hosts = result.hosts;
    }

    const totalCount = uniqueKeywords.length;

    // Если мы запрашиваем конкретное ключевое слово и оно не найдено, возвращаем 404
    if (
      keywordQuery !== undefined && 
      keywordQuery !== '' &&
      uniqueKeywords.length === 0
    ) {
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

    // Формируем карту отформатированных хостов для избежания дублирования
    const formattedHostsMap = new Map();
    
    hosts.forEach((host) => {
      if (!formattedHostsMap.has(host.id)) {
        formattedHostsMap.set(host.id, formatHostData(host));
      }
    });

    // Группируем хосты по ключевым словам
    const keywordGroups = {};

    // Инициализируем группы для всех уникальных ключевых слов
    uniqueKeywords.forEach((keyRecord) => {
      const keyword = keyRecord.dataValues.key_name;
      const count = keyRecord.dataValues.count;
      keywordGroups[keyword] = {
        keyword: keyword,
        count: count,
        items: [],
      };
    });

    // Для правильной группировки связываем хосты с ключевыми словами через WHOIS
    if (keywordQuery !== undefined && keywordQuery !== '') {
      // Для поиска по конкретному ключевому слову
      const formattedHosts = Array.from(formattedHostsMap.values());
      const targetKeyword = keywordQuery.toLowerCase();
      
      // Добавляем все найденные хосты в группу с искомым ключевым словом
      if (keywordGroups[targetKeyword]) {
        keywordGroups[targetKeyword].items = formattedHosts;
      }
    } else {
      // Для общего случая - группируем хосты по ключевым словам из их WHOIS данных
      // Получаем все WHOIS данные для хостов
      const hostsWithWhois = await Host.findAll({
        include: [
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
          id: {
            [Op.in]: hosts.map(host => host.id)
          }
        },
      });

      // Создаем карту WHOIS данных для хостов
      const hostWhoisMap = new Map();
      hostsWithWhois.forEach(host => {
        hostWhoisMap.set(host.id, host.Whois || []);
      });

      // Группируем хосты по ключевым словам
      for (const host of hosts) {
        const formattedHost = formattedHostsMap.get(host.id);
        const hostWhois = hostWhoisMap.get(host.id) || [];

        if (formattedHost && hostWhois.length > 0) {
          for (const whois of hostWhois) {
            const keyName = whois.WhoisKey?.key_name;
            if (keyName && keywordGroups[keyName]) {
              // Проверяем, что хост еще не добавлен в эту группу
              const hostExists = keywordGroups[keyName].items.some(
                item => item.id === formattedHost.id
              );
              if (!hostExists) {
                keywordGroups[keyName].items.push(formattedHost);
              }
            }
          }
        }
      }
    }

    // Сортируем хосты внутри каждой группы по приоритету
    Object.values(keywordGroups).forEach((group) => {
      group.items.sort((a, b) => {
        // Сначала сортируем по приоритету (DESC)
        const priorityA = a.priority_info?.priority?.id || 0;
        const priorityB = b.priority_info?.priority?.id || 0;
        
        if (priorityB !== priorityA) {
          return priorityB - priorityA;
        }
        
        // Если приоритеты одинаковые, сортируем по дате обновления
        if (a.updated_at && b.updated_at) {
          return new Date(b.updated_at) - new Date(a.updated_at);
        }
        return 0;
      });
    });

    // Преобразуем в нужный формат и сортируем по возрастанию ключевых слов
    let items = Object.values(keywordGroups)
      .filter((group) => group.items.length > 0)
      .map((group) => {
        const totalItemsInGroup = group.items.length;
        const totalPagesInGroup = Math.ceil(totalItemsInGroup / pageSize);
        const offset = (pageNum - 1) * pageSize;

        return {
          keyword: group.keyword,
          count: group.count,
          items: group.items.slice(offset, offset + pageSize),
          pagination: {
            currentPage: pageNum,
            totalPages: totalPagesInGroup,
            totalItems: totalItemsInGroup,
            hasNext: pageNum < totalPagesInGroup,
            hasPrev: pageNum > 1,
          },
        };
      })
      .sort((a, b) => a.keyword.localeCompare(b.keyword));

    // Если был задан конкретное ключевое слово, отфильтровываем результаты
    if (keywordQuery !== undefined && keywordQuery !== '') {
      const lowerCaseKeyword = keywordQuery.toLowerCase();
      const filteredItems = items.filter(
        (item) => item.keyword.toLowerCase().includes(lowerCaseKeyword)
      );
      
      if (filteredItems.length > 0) {
        items = filteredItems;
      } else {
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
    }

    const totalPages = Math.ceil(totalCount / pageSize);

    if (!items.length) {
      return res.status(404).json({
        message: "Нет данных",
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

    const response = buildKeywordsResponse(
      items,
      pageNum,
      totalPages,
      totalCount,
      "group",
      "keyword"
    );

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

    console.log(`Поиск WHOIS данных для host_id: ${hostIdNum}`);

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

    console.log(`Найдено WHOIS записей: ${whoisRecords.length} для host_id: ${hostIdNum}`);

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

//   const whois = {};
//   let hasWhois = false;

//   // Проверяем, что Whois существует и является массивом
//   if (host.Whois && Array.isArray(host.Whois)) {
//     host.Whois.forEach((w) => {
//       if (w.WhoisKey && w.value !== null) {
//         whois[w.WhoisKey.key_name] = w.value;
//         hasWhois = true;
//       }
//     });
//   }

//   if (!hasWhois) {
//     whois.error = "Whois query failed";
//   }

//   // Получаем информацию о приоритете и группировке
//   const priorityInfo = {
//     priority: null,
//     comment: null,
//     grouping: null,
//   };

//   // Добавляем информацию о приоритете
//   if (host.priority_id) {
//     priorityInfo.priority = {
//       id: host.priority_id,
//       name: host.Priority?.name || null,
//     };
//   }

//   // Добавляем информацию о комментарии к приоритету
//   if (host.PriorityComment) {
//     priorityInfo.comment = {
//       text: host.PriorityComment.comment,
//       createdAt: host.PriorityComment.created_at,
//     };
//   }

//   // Добавляем информацию о группировке
//   if (host.grouping_id) {
//     priorityInfo.grouping = {
//       id: host.grouping_id,
//       name: host.Grouping?.name || null,
//     };
//   }

//   return {
//     id: host.id,
//     ip: host.ip,
//     country: whois.Country || null,
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
//     whois: whois,
//   };
// };

// // Вспомогательная функция для пагинации
// const paginate = (req) => {
//   const { page = 1, limit = 10 } = req.query;
//   const pageNum = Math.max(1, parseInt(page, 10) || 1); // Ensure at least page 1
//   const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10)); // Limit to max 100 items per page
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

//     // Приводим ключевое слово к нижнему регистру
//     const lowerCaseKeyword = keywordQuery.toLowerCase();

//     // Получаем параметры пагинации
//     const { pageNum, limitNum, offset } = paginate(req);

//     // Используем raw SQL для корректного поиска по WHOIS данным
//     const sql = `
//       SELECT DISTINCT h."id", h."ip", h."reachable", h."updated_at", h."priority_id", h."grouping_id"
//       FROM "hosts" h
//       INNER JOIN "whois" w ON h."id" = w."host_id"
//       INNER JOIN "whois_keys" wk ON w."key_id" = wk."id"
//       WHERE LOWER(w."value") LIKE LOWER(:keyword) OR LOWER(wk."key_name") LIKE LOWER(:keyword)
//       ORDER BY h."priority_id" DESC
//       LIMIT :limit OFFSET :offset
//     `;

//     const hostsResult = await sequelize.query(sql, {
//       replacements: {
//         keyword: `%${lowerCaseKeyword}%`,
//         limit: limitNum,
//         offset: offset,
//       },
//       type: sequelize.QueryTypes.SELECT,
//     });

//     // Получаем полные данные для этих хостов
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

//     // Получаем все данные для найденных хостов
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
//             },
//           ],
//         },
//         {
//           model: Whois,
//           attributes: ["value"],
//           include: [
//             {
//               model: WhoisKey,
//               attributes: ["key_name"],
//             },
//           ],
//         },
//         // Включаем приоритеты
//         {
//           model: Priority,
//           attributes: ["id", "name"],
//           required: false,
//         },
//         // Включаем комментарии к приоритетам
//         {
//           model: PriorityComment,
//           attributes: ["comment", "created_at"],
//           include: [
//             {
//               model: Priority,
//               attributes: ["name"],
//             },
//           ],
//           required: false,
//         },
//         // Включаем группировки
//         {
//           model: Grouping,
//           attributes: ["id", "name"],
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
//       SELECT COUNT(DISTINCT h."id") as total
//       FROM "hosts" h
//       INNER JOIN "whois" w ON h."id" = w."host_id"
//       INNER JOIN "whois_keys" wk ON w."key_id" = wk."id"
//       WHERE LOWER(w."value") LIKE LOWER(:keyword) OR LOWER(wk."key_name") LIKE LOWER(:keyword)
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
// // Ищем по значению в whois.value и по имени ключа в whois_keys.key_name
// async function getUniqueKeywordsAndHostsForKeyword(keywordQuery) {
//   // Используем raw SQL для избежания сложностей с ORM
//   // Получаем уникальные ключевые слова с подсчетом хостов
//   // Ищем по значению в whois.value или по имени ключа в whois_keys.key_name
//   // Используем DISTINCT для уникальных комбинаций
//   const uniqueKeywordsSql = `
//     SELECT DISTINCT w.key_name, COUNT(DISTINCT wh.host_id) as "count"
//     FROM "whois_keys" w
//     INNER JOIN "whois" wh ON w.id = wh.key_id
//     WHERE LOWER(wh.value) LIKE LOWER(:keyword) OR LOWER(w.key_name) LIKE LOWER(:keyword)
//     GROUP BY w.key_name
//     ORDER BY w.key_name ASC
//   `;
//   const uniqueKeywordsResult = await sequelize.query(uniqueKeywordsSql, {
//     replacements: { keyword: `%${keywordQuery}%` },
//     type: sequelize.QueryTypes.SELECT,
//   });

//   // Получаем хосты с WHOIS данными для конкретного ключевого слова
//   // Используем DISTINCT для уникальных IP
//   const hostsSql = `
//     SELECT DISTINCT ON (h."id") 
//            h."id", h."ip", h."reachable", h."updated_at", h."priority_id", h."grouping_id",
//            p."port", p."type",
//            w."name" as "WellKnownPort.name",
//            wk."key_name",
//            wh."value"
//     FROM "hosts" h
//     INNER JOIN "ports" p ON h."id" = p."host_id"
//     LEFT JOIN "well_known_ports" w ON p."port" = w."port"
//     INNER JOIN "whois" wh ON h."id" = wh."host_id"
//     INNER JOIN "whois_keys" wk ON wh."key_id" = wk."id"
//     WHERE LOWER(wh."value") LIKE LOWER(:keyword) OR LOWER(wk."key_name") LIKE LOWER(:keyword)
//     ORDER BY h."id", h."priority_id" DESC, h."updated_at" DESC
//   `;
//   const hostsResult = await sequelize.query(hostsSql, {
//     replacements: { keyword: `%${keywordQuery}%` },
//     type: sequelize.QueryTypes.SELECT,
//   });

//   // Преобразуем результат в структуру, аналогичную той, что ожидается
//   const uniqueKeywords = uniqueKeywordsResult.map((row) => ({
//     dataValues: {
//       key_name: row.key_name,
//       count: row.count,
//     },
//   }));

//   // Преобразуем хосты - теперь собираем все WHOIS данные для каждого хоста
//   const hostsMap = {};
//   hostsResult.forEach((row) => {
//     if (!hostsMap[row.id]) {
//       hostsMap[row.id] = {
//         id: row.id,
//         ip: row.ip,
//         reachable: row.reachable,
//         updated_at: row.updated_at,
//         priority_id: row.priority_id,
//         grouping_id: row.grouping_id,
//         Ports: [],
//         Whois: [],
//       };
//     }

//     // Добавляем порт
//     if (row.port) {
//       hostsMap[row.id].Ports.push({
//         port: row.port,
//         type: row.type,
//         WellKnownPort: row["WellKnownPort.name"]
//           ? { name: row["WellKnownPort.name"] }
//           : null,
//       });
//     }

//     // Добавляем WHOIS данные
//     if (row.key_name && row.value) {
//       hostsMap[row.id].Whois.push({
//         WhoisKey: { key_name: row.key_name },
//         value: row.value,
//       });
//     }
//   });

//   // Преобразуем в массив
//   const hosts = Object.values(hostsMap);

//   return { uniqueKeywords, hosts };
// }

// // Вспомогательная функция для получения всех уникальных ключевых слов и хостов
// async function getAllUniqueKeywordsAndHosts() {
//   // Используем raw SQL для избежания сложностей с ORM
//   // Получаем уникальные ключевые слова с подсчетом хостов
//   const uniqueKeywordsSql = `
//     SELECT DISTINCT w.key_name, COUNT(DISTINCT wh.host_id) as "count"
//     FROM "whois_keys" w
//     INNER JOIN "whois" wh ON w.id = wh.key_id
//     GROUP BY w.key_name
//     ORDER BY w.key_name ASC
//   `;
//   const uniqueKeywordsResult = await sequelize.query(uniqueKeywordsSql, {
//     type: sequelize.QueryTypes.SELECT,
//   });

//   // БЕЗ whois //!
//   // SELECT DISTINCT ON (h."ip")
//   // h."id", h."ip", h."reachable", h."updated_at", h."priority_id", h."grouping_id",
//   // p."port", p."type",
//   // w."name" as "WellKnownPort.name"
//   // FROM
//   // "hosts" h
//   // INNER JOIN
//   // "ports" p ON h."id" = p."host_id"
//   // LEFT JOIN
//   // "well_known_ports" w ON p."port" = w."port"
//   // ORDER BY
//   // h."ip", h."priority_id" DESC, h."updated_at" DESC;


//   const hostsSql = `
//      SELECT DISTINCT ON (h."ip")
//       h."id", h."ip", h."reachable", h."updated_at", h."priority_id", h."grouping_id",
//       p."port", p."type",
//       w."name" as "WellKnownPort.name"
//       FROM
//       "hosts" h
//       INNER JOIN
//       "ports" p ON h."id" = p."host_id"
//       LEFT JOIN
//       "well_known_ports" w ON p."port" = w."port"
//       ORDER BY
//       h."ip", h."priority_id" DESC, h."updated_at" DESC;
//   `

//   // Получаем хосты с портами и WHOIS данными
//   // Используем DISTINCT для уникальных IP (берет только 1ый whois)
//   // const hostsSql = `
//   //   SELECT DISTINCT ON (h."ip")
//   //     h."id", h."ip", h."reachable", h."updated_at", h."priority_id", h."grouping_id",
//   //     p."port", p."type",
//   //     w."name" as "WellKnownPort.name",
//   //     json_agg(json_build_object(
//   //         'key_name', wk.key_name,
//   //         'value', wh.value
//   //     )) AS whois_info
//   //   FROM
//   //     "hosts" h
//   //   INNER JOIN
//   //     "ports" p ON h."id" = p."host_id"
//   //   LEFT JOIN
//   //     "well_known_ports" w ON p."port" = w."port"
//   //   LEFT JOIN
//   //     "whois" wh ON h."id" = wh."host_id"
//   //   LEFT JOIN
//   //     "whois_keys" wk ON wh."key_id" = wk."id"
//   //   GROUP BY
//   //     h."id", h."ip", h."reachable", h."updated_at", h."priority_id", h."grouping_id",
//   //     p."port", p."type",
//   //     w."name"
//   //   ORDER BY
//   //     h."ip", h."priority_id" DESC, h."updated_at" DESC;
//   //   `;

//   // const hostsSql = `
//   //   SELECT
//   //     h."id", h."ip", h."reachable", h."updated_at", h."priority_id", h."grouping_id",
//   //     p."port", p."type",
//   //     w."name" as "WellKnownPort.name",
//   //     wk."key_name",
//   //     wh."value"
//   //   FROM "hosts" h
//   //   INNER JOIN "ports" p ON h."id" = p."host_id"
//   //   LEFT JOIN "well_known_ports" w ON p."port" = w."port"
//   //   INNER JOIN "whois" wh ON h."id" = wh."host_id"
//   //   INNER JOIN "whois_keys" wk ON wh."key_id" = wk."id"
//   //   ORDER BY h."id", h."priority_id" DESC, h."updated_at" DESC
//   // `;
//   const hostsResult = await sequelize.query(hostsSql, {
//     type: sequelize.QueryTypes.SELECT,
//   });

//   // Преобразуем результат в структуру, аналогичную той, что ожидается
//   const uniqueKeywords = uniqueKeywordsResult.map((row) => ({
//     dataValues: {
//       key_name: row.key_name,
//       count: row.count,
//     },
//   }));

//   // Преобразуем хосты - теперь собираем все WHOIS данные для каждого хоста
//   const hostsMap = {};
//   // console.log(hostsResult);
//   hostsResult.forEach((row) => {
//     if (!hostsMap[row.id]) {
//       hostsMap[row.id] = {
//         id: row.id,
//         ip: row.ip,
//         reachable: row.reachable,
//         updated_at: row.updated_at,
//         priority_id: row.priority_id,
//         grouping_id: row.grouping_id,
//         Ports: [],
//         Whois: [],
//       };
//     }

//     // Добавляем порт только если он еще не добавлен
//     const portExists = hostsMap[row.id].Ports.some(
//       (port) => port.port === row.port
//     );
//     if (row.port && !portExists) {
//       hostsMap[row.id].Ports.push({
//         port: row.port,
//         type: row.type,
//         WellKnownPort: row["WellKnownPort.name"]
//           ? { name: row["WellKnownPort.name"] }
//           : null,
//       });
//     }

//     // Добавляем WHOIS данные
//     if (row.key_name && row.value) {
//       hostsMap[row.id].Whois.push({
//         WhoisKey: { key_name: row.key_name },
//         value: row.value,
//       });
//     }
//   });

//   // Преобразуем в массив
//   const hosts = Object.values(hostsMap);
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
//   // @TODO ошибка (дублирование Ip)
//   try {
//     // Get pagination parameters from request query
//     const { page = 1, limit = 3, keyword: keywordQuery } = req.query;
//     const pageNum = Math.max(1, parseInt(page, 10));
//     const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10))); // Ограничение на 100 элементов

//     let uniqueKeywords;
//     let hosts;

//     // Проверяем, есть ли фильтр по ключевому слову
//     if (keywordQuery !== undefined) {
//       // Если указан конкретное ключевое слово, фильтруем данные
//       // Получаем уникальные ключевые слова и хосты для конкретного ключевого слова
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
//       uniqueKeywords.length === 0 &&
//       hosts.length === 0
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

//     // Формируем карту хостов для быстрого доступа
//     const hostMap = {};
//     hosts.forEach((host) => {
//       // Инициализируем пустые массивы если они отсутствуют
//       if (!host.Ports) host.Ports = [];
//       if (!host.Whois) host.Whois = [];

//       if (!hostMap[host.ip]) {
//         hostMap[host.ip] = formatHostData(host); // Форматируем данные хоста
//       }
//     });

//     // Группируем хосты по ключевым словам
//     const keywordGroups = {};

//     // Инициализируем группы для всех уникальных ключевых слов
//     uniqueKeywords.forEach((keyRecord) => {
//       const keyword = keyRecord.dataValues.key_name;
//       keywordGroups[keyword] = {
//         keyword: keyword,
//         count: keyRecord.dataValues.count,
//         items: [],
//       };
//     });

//     // Теперь проходим по всем хостам и группируем их по ключевым словам
//     for (const host of hosts) {
//       // Проверяем, что host.Whois существует и является массивом
//       if (host.Whois && Array.isArray(host.Whois)) {
//         for (const whois of host.Whois) {
//           const keyName = whois.WhoisKey?.key_name;
//           if (keyName && keywordGroups[keyName]) {
//             // Добавляем хост в группу по ключевому слову
//             const formattedHost = formatHostData(host);
//             keywordGroups[keyName].items.push(formattedHost);
//           }
//         }
//       }
//     }

//     // Сортируем хосты внутри каждой группы по приоритету
//     Object.values(keywordGroups).forEach((group) => {
//       group.items.sort((a, b) => {
//         // Сначала сортируем по приоритету (DESC)
//         if (a.priority_info?.priority?.id && b.priority_info?.priority?.id) {
//           return b.priority_info.priority.id - a.priority_info.priority.id;
//         }
//         // Если приоритеты не определены, сортируем по дате обновления
//         if (a.updated_at && b.updated_at) {
//           return new Date(b.updated_at) - new Date(a.updated_at);
//         }
//         return 0;
//       });
//     });

//     // Преобразуем в нужный формат и сортируем по возрастанию ключевых слов
//     let items = Object.values(keywordGroups)
//       .filter((group) => group.items.length > 0) // Убираем пустые группы
//       .map((group) => {
//         const totalItemsInGroup = group.items.length;
//         const totalPagesInGroup = Math.ceil(totalItemsInGroup / pageSize);
//         const offset = (pageNum - 1) * pageSize;

//         return {
//           keyword: group.keyword,
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
//       .sort((a, b) => a.keyword.localeCompare(b.keyword)); // Сортировка по возрастанию ключевых слов

//     // Если был задан конкретное ключевое слово, отфильтровываем результаты
//     if (keywordQuery !== undefined) {
//       // Фильтруем по указанному ключевому слову
//       const filteredItems = items.filter(
//         (item) => item.keyword === keywordQuery
//       );
//       // Для одного ключевого слова, если оно есть, то возвращаем его
//       if (filteredItems.length > 0) {
//         items = filteredItems;
//       } else {
//         // Если ничего не найдено для этого ключевого слова
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
//   Grouping
// } from "../models/index.js";

// // Вспомогательная функция для форматирования данных хоста
// const formatHostData = (host) => {
//   const openPorts = [];
//   const filteredPorts = [];

//   host.Ports.forEach((port) => {
//     const portInfo = {
//       port: port.port,
//       name: port.WellKnownPort?.name || null,
//     };

//     if (port.type === "open") {
//       openPorts.push(portInfo);
//     } else if (port.type === "filtered") {
//       filteredPorts.push(portInfo);
//     }
//   });

//   const whois = {};
//   let hasWhois = false;
//   host.Whois.forEach((w) => {
//     if (w.WhoisKey && w.value !== null) {
//       whois[w.WhoisKey.key_name] = w.value;
//       hasWhois = true;
//     }
//   });

//   if (!hasWhois) {
//     whois.error = "Whois query failed";
//   }

//   // Получаем информацию о приоритете и группировке
//   const priorityInfo = {
//     priority: null,
//     comment: null,
//     grouping: null,
//   };

//   // Добавляем информацию о приоритете
//   if (host.priority_id) {
//     priorityInfo.priority = {
//       id: host.priority_id,
//       name: host.Priority?.name || null,
//     };
//   }

//   // // Добавляем информацию о комментарии к приоритету
//   // if (host.PriorityComment) {
//   //   priorityInfo.comment = {
//   //     text: host.PriorityComment.comment,
//   //     createdAt: host.PriorityComment.created_at
//   //   };
//   // }

//   // Добавляем информацию о группировке
//   if (host.grouping_id) {
//     priorityInfo.grouping = {
//       id: host.grouping_id,
//       name: host.grouping?.name || null,
//     };
//   }

//   return {
//     id: host.id,
//     ip: host.ip,
//     country: whois.Country || null, // у вас нет поля country в hosts
//     reachable: host.reachable,
//     updated_at: host.updated_at
//       ? host.updated_at.toISOString().replace("T", " ").substring(0, 19)
//       : null,
//     port_data: {
//       open: openPorts,
//       filtered: filteredPorts,
//     },
//     priority_info: priorityInfo,
//     has_whois: hasWhois, //false, // можно добавить, если нужно
//     whois, //: { error: "Whois query failed" },
//   };
// };

// // Вспомогательная функция для пагинации
// const paginate = (req) => {
//   const { page = 1, limit = 10 } = req.query;
//   const pageNum = Math.max(1, parseInt(page, 10) || 1); // Ensure at least page 1
//   const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10)); // Limit to max 100 items per page
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

//     // Приводим ключевое слово к нижнему регистру
//     const lowerCaseKeyword = keywordQuery.toLowerCase();

//     // Получаем параметры пагинации
//     const { pageNum, limitNum, offset } = paginate(req);

//     // Получаем все IP-адреса, которые имеют указанный ключевой термин в WHOIS (независимо от регистра)
//     const hosts = await Host.findAll({
//       include: [
//         {
//           model: Port,
//           attributes: ["port", "type"],
//           include: [
//             {
//               model: WellKnownPort,
//               attributes: ["name"],
//             },
//           ],
//         },
//         {
//           model: Whois,
//           where: sequelize.literal(
//             `lower(value) LIKE lower('%${lowerCaseKeyword}%')`
//           ),
//           required: true, // Только хосты с соответствующим WHOIS
//           include: [
//             {
//               model: WhoisKey,
//               attributes: ["key_name"],
//             },
//           ],
//         },
//         // Включаем приоритеты
//         {
//           model: Priority,
//           attributes: ["id", "name"],
//           required: false,
//         },
//         // Включаем комментарии к приоритетам
//         // {
//         //   model: PriorityComment,
//         //   attributes: ["comment", "created_at"],
//         //   include: [{
//         //     model: Priority,
//         //     attributes: ["name"]
//         //   }],
//         //   required: false
//         // },
//         // Включаем группировки
//         {
//           model: Grouping,
//           attributes: ["id", "name"],
//           required: false,
//         },
//       ],
//       order: [["priority_id", "DESC"]],
//       // order: [["updated_at", "DESC"]],
//       limit: limitNum,
//       offset: offset,
//     });

//     // Формируем результат в нужном формате
//     const items = hosts.map(formatHostData);

//     // Получаем общее количество записей для пагинации
//     const totalCount = await Host.count({
//       include: [
//         {
//           model: Whois,
//           where: sequelize.literal(
//             `lower(value) LIKE lower('%${lowerCaseKeyword}%')`
//           ),
//           required: true, // Только хосты с соответствующим WHOIS
//         },
//       ],
//     });

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
// // Ищем по значению в whois.value и по имени ключа в whois_keys.key_name
// async function getUniqueKeywordsAndHostsForKeyword(keywordQuery) {
//   // Используем raw SQL для избежания сложностей с ORM
//   // Получаем уникальные ключевые слова с подсчетом хостов
//   // Ищем по значению в whois.value или по имени ключа в whois_keys.key_name
//   // Используем DISTINCT для уникальных комбинаций
//   const uniqueKeywordsSql = `
//     SELECT DISTINCT w.key_name, COUNT(DISTINCT wh.host_id) as "count"
//     FROM "whois_keys" w
//     INNER JOIN "whois" wh ON w.id = wh.key_id
//     WHERE LOWER(wh.value) LIKE LOWER(:keyword) OR LOWER(w.key_name) LIKE LOWER(:keyword)
//     GROUP BY w.key_name
//     ORDER BY w.key_name ASC
//   `;
//   const uniqueKeywordsResult = await sequelize.query(uniqueKeywordsSql, {
//     replacements: { keyword: `%${keywordQuery}%` },
//     type: sequelize.QueryTypes.SELECT,
//   });

//   // Получаем хосты с WHOIS данными для конкретного ключевого слова
//   // Используем DISTINCT для уникальных IP
//   const hostsSql = `
//     SELECT DISTINCT ON (h."id")
//            h."id", h."ip", h."reachable", h."updated_at",
//            p."port", p."type",
//            w."name" as "WellKnownPort.name",
//            wk."key_name"
//     FROM "hosts" h
//     INNER JOIN "ports" p ON h."id" = p."host_id"
//     LEFT JOIN "well_known_ports" w ON p."port" = w."port"
//     INNER JOIN "whois" wh ON h."id" = wh."host_id"
//     INNER JOIN "whois_keys" wk ON wh."key_id" = wk."id"
//     WHERE LOWER(wh."value") LIKE LOWER(:keyword) OR LOWER(wk."key_name") LIKE LOWER(:keyword)
//     ORDER BY h."id", h."updated_at" DESC
//   `;
//   const hostsResult = await sequelize.query(hostsSql, {
//     replacements: { keyword: `%${keywordQuery}%` },
//     type: sequelize.QueryTypes.SELECT,
//   });

//   // Преобразуем результат в структуру, аналогичную той, что ожидается
//   const uniqueKeywords = uniqueKeywordsResult.map((row) => ({
//     dataValues: {
//       key_name: row.key_name,
//       count: row.count,
//     },
//   }));

//   // Преобразуем хосты
//   const hosts = hostsResult.map((row) => ({
//     id: row.id,
//     ip: row.ip,
//     reachable: row.reachable,
//     updated_at: row.updated_at,
//     Ports: [
//       {
//         port: row.port,
//         type: row.type,
//         WellKnownPort: row["WellKnownPort.name"]
//           ? { name: row["WellKnownPort.name"] }
//           : null,
//       },
//     ],
//     Whois: [
//       {
//         WhoisKey: { key_name: row.key_name },
//       },
//     ],
//   }));

//   return { uniqueKeywords, hosts };
// }

// // Вспомогательная функция для получения всех уникальных ключевых слов и хостов
// async function getAllUniqueKeywordsAndHosts() {
//   // Используем raw SQL для избежания сложностей с ORM
//   // Получаем уникальные ключевые слова с подсчетом хостов
//   const uniqueKeywordsSql = `
//     SELECT DISTINCT w.key_name, COUNT(DISTINCT wh.host_id) as "count"
//     FROM "whois_keys" w
//     INNER JOIN "whois" wh ON w.id = wh.key_id
//     GROUP BY w.key_name
//     ORDER BY w.key_name ASC
//   `;
//   const uniqueKeywordsResult = await sequelize.query(uniqueKeywordsSql, {
//     type: sequelize.QueryTypes.SELECT,
//   });

//   // Получаем хосты с портами и WHOIS данными
//   // Используем DISTINCT для уникальных IP
//   const hostsSql = `
//     SELECT DISTINCT ON (h."id")
//            h."id", h."ip", h."reachable", h."updated_at",
//            p."port", p."type",
//            w."name" as "WellKnownPort.name",
//            wk."key_name"
//     FROM "hosts" h
//     INNER JOIN "ports" p ON h."id" = p."host_id"
//     LEFT JOIN "well_known_ports" w ON p."port" = w."port"
//     INNER JOIN "whois" wh ON h."id" = wh."host_id"
//     INNER JOIN "whois_keys" wk ON wh."key_id" = wk."id"
//     ORDER BY h."id", h."updated_at" DESC
//   `;
//   const hostsResult = await sequelize.query(hostsSql, {
//     type: sequelize.QueryTypes.SELECT,
//   });

//   // Преобразуем результат в структуру, аналогичную той, что ожидается
//   const uniqueKeywords = uniqueKeywordsResult.map((row) => ({
//     dataValues: {
//       key_name: row.key_name,
//       count: row.count,
//     },
//   }));

//   // Преобразуем хосты
//   const hosts = hostsResult.map((row) => ({
//     id: row.id,
//     ip: row.ip,
//     reachable: row.reachable,
//     updated_at: row.updated_at,
//     Ports: [
//       {
//         port: row.port,
//         type: row.type,
//         WellKnownPort: row["WellKnownPort.name"]
//           ? { name: row["WellKnownPort.name"] }
//           : null,
//       },
//     ],
//     Whois: [
//       {
//         WhoisKey: { key_name: row.key_name },
//       },
//     ],
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
//     const { page = 1, limit = 3, keyword: keywordQuery } = req.query;
//     const pageNum = Math.max(1, parseInt(page, 10));
//     const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10))); // Ограничение на 100 элементов

//     let uniqueKeywords;
//     let hosts;

//     // Проверяем, есть ли фильтр по ключевому слову
//     if (keywordQuery !== undefined) {
//       // Если указан конкретное ключевое слово, фильтруем данные
//       // Получаем уникальные ключевые слова и хосты для конкретного ключевого слова
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
//     // Но если есть данные, даже если ключевое слово не в whois_keys.key_name,
//     // просто возвращаем их без 404
//     // Или лучше проверить, есть ли вообще данные для группировки
//     if (
//       keywordQuery !== undefined &&
//       uniqueKeywords.length === 0 &&
//       hosts.length === 0
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

//     // Формируем карту хостов для быстрого доступа
//     const hostMap = {};
//     hosts.forEach((host) => {
//       if (!hostMap[host.ip]) {
//         hostMap[host.ip] = formatHostData(host); // Форматируем данные хоста
//       }
//     });

//     // Группируем хосты по ключевым словам
//     const keywordGroups = {};

//     // Инициализируем группы для всех уникальных ключевых слов
//     uniqueKeywords.forEach((keyRecord) => {
//       const keyword = keyRecord.dataValues.key_name;
//       keywordGroups[keyword] = {
//         keyword: keyword,
//         count: keyRecord.dataValues.count,
//         items: [],
//       };
//     });

//     // Теперь проходим по всем хостам и группируем их по ключевым словам
//     for (const host of hosts) {
//       for (const whois of host.Whois) {
//         const keyName = whois.WhoisKey?.key_name;
//         if (keyName && keywordGroups[keyName]) {
//           // Добавляем хост в группу по ключевому слову
//           keywordGroups[keyName].items.push(hostMap[host.ip]);
//         }
//       }
//     }

//     // Преобразуем в нужный формат и сортируем по возрастанию ключевых слов
//     let items = Object.values(keywordGroups)
//       .filter((group) => group.items.length > 0) // Убираем пустые группы
//       .map((group) => {
//         const totalItemsInGroup = group.items.length;
//         const totalPagesInGroup = Math.ceil(totalItemsInGroup / pageSize);
//         const offset = (pageNum - 1) * pageSize;

//         return {
//           keyword: group.keyword,
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
//       .sort((a, b) => a.keyword.localeCompare(b.keyword)); // Сортировка по возрастанию ключевых слов

//     // Если был задан конкретное ключевое слово, отфильтровываем результаты
//     if (keywordQuery !== undefined) {
//       // Фильтруем по указанному ключевому слову
//       const filteredItems = items.filter(
//         (item) => item.keyword === keywordQuery
//       );
//       // Для одного ключевого слова, если оно есть, то возвращаем его
//       if (filteredItems.length > 0) {
//         items = filteredItems;
//       } else {
//         // Если ничего не найдено для этого ключевого слова
//         // Возвращаем 404 только если нет ни одной группы
//         // Но если есть данные, но группа не найдена, то это может быть проблема с логикой
//         // Но поскольку мы уже получили данные в hosts, и если группа не найдена,
//         // значит ключевое слово не в whois_keys.key_name
//         // Это может быть нормально, если данные находятся в других группах
//         // Если filteredItems пустой, но данные есть, то это ошибка
//         // Возвращаем 404
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
