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
} from "../models/index.js";

// Вспомогательная функция для форматирования данных хоста
const formatHostData = (host) => {
  const openPorts = [];
  const filteredPorts = [];
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
  const whois = {};
  let hasWhois = false;

  // console.log(host.Whois)

  host.Whois.forEach((w) => {
    if (w.WhoisKey && w.value !== null) {
      whois[w.WhoisKey.key_name] = w.value;
      hasWhois = true;
    }
  });

  if (!hasWhois) {
    whois.error = "Whois query failed";
  }
  return {
    ip: host.ip,
    country: whois.Country || null,
    has_whois: hasWhois,
    whois,
    updated_at: host.updated_at
      ? host.updated_at.toISOString().replace("T", " ").substring(0, 19)
      : null,
    reachable: host.reachable,
    port_data: {
      open: openPorts,
      filtered: filteredPorts,
    },
  };
};

// Вспомогательная функция для пагинации
const paginate = (req) => {
  const { page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1); // Ensure at least page 1
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10)); // Limit to max 100 items per page
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

    // Приводим ключевое слово к нижнему регистру
    const lowerCaseKeyword = keywordQuery.toLowerCase();

    // Получаем параметры пагинации
    const { pageNum, limitNum, offset } = paginate(req);

    // Получаем все IP-адреса, которые имеют указанный ключевой термин в WHOIS (независимо от регистра)
    const hosts = await Host.findAll({
      include: [
        {
          model: Port,
          attributes: ["port", "type"],
          include: [
            {
              model: WellKnownPort,
              attributes: ["name"],
            },
          ],
        },
        {
          model: Whois,
          where: sequelize.literal(`lower(value) LIKE lower('%${lowerCaseKeyword}%')`),
          required: true, // Только хосты с соответствующим WHOIS
          include: [
            {
              model: WhoisKey,
              attributes: ["key_name"],
            },
          ],
        },
      ],
      order: [["updated_at", "DESC"]],
      limit: limitNum,
      offset: offset,
    });

    // Формируем результат в нужном формате
    const items = hosts.map(formatHostData);

    // Получаем общее количество записей для пагинации
    const totalCount = await Host.count({
      include: [
        {
          model: Whois,
          where: sequelize.literal(`lower(value) LIKE lower('%${lowerCaseKeyword}%')`),
          required: true, // Только хосты с соответствующим WHOIS
        },
      ],
    });

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
// Ищем по значению в whois.value и по имени ключа в whois_keys.key_name
async function getUniqueKeywordsAndHostsForKeyword(keywordQuery) {
  // Используем raw SQL для избежания сложностей с ORM
  // Получаем уникальные ключевые слова с подсчетом хостов
  // Ищем по значению в whois.value или по имени ключа в whois_keys.key_name
  // Используем DISTINCT для уникальных комбинаций
  const uniqueKeywordsSql = `
    SELECT DISTINCT w.key_name, COUNT(DISTINCT wh.host_id) as "count"
    FROM "whois_keys" w
    INNER JOIN "whois" wh ON w.id = wh.key_id
    WHERE LOWER(wh.value) LIKE LOWER(:keyword) OR LOWER(w.key_name) LIKE LOWER(:keyword)
    GROUP BY w.key_name
    ORDER BY w.key_name ASC
  `;
  const uniqueKeywordsResult = await sequelize.query(uniqueKeywordsSql, {
    replacements: { keyword: `%${keywordQuery}%` },
    type: sequelize.QueryTypes.SELECT,
  });

  // Получаем хосты с WHOIS данными для конкретного ключевого слова
  // Используем DISTINCT для уникальных IP
  const hostsSql = `
    SELECT DISTINCT ON (h."id") 
           h."id", h."ip", h."reachable", h."updated_at",
           p."port", p."type",
           w."name" as "WellKnownPort.name",
           wk."key_name"
    FROM "hosts" h
    INNER JOIN "ports" p ON h."id" = p."host_id"
    LEFT JOIN "well_known_ports" w ON p."port" = w."port"
    INNER JOIN "whois" wh ON h."id" = wh."host_id"
    INNER JOIN "whois_keys" wk ON wh."key_id" = wk."id"
    WHERE LOWER(wh."value") LIKE LOWER(:keyword) OR LOWER(wk."key_name") LIKE LOWER(:keyword)
    ORDER BY h."id", h."updated_at" DESC
  `;
  const hostsResult = await sequelize.query(hostsSql, {
    replacements: { keyword: `%${keywordQuery}%` },
    type: sequelize.QueryTypes.SELECT,
  });

  // Преобразуем результат в структуру, аналогичную той, что ожидается
  const uniqueKeywords = uniqueKeywordsResult.map((row) => ({
    dataValues: {
      key_name: row.key_name,
      count: row.count,
    },
  }));

  // Преобразуем хосты
  const hosts = hostsResult.map((row) => ({
    id: row.id,
    ip: row.ip,
    reachable: row.reachable,
    updated_at: row.updated_at,
    Ports: [
      {
        port: row.port,
        type: row.type,
        WellKnownPort: row["WellKnownPort.name"]
          ? { name: row["WellKnownPort.name"] }
          : null,
      },
    ],
    Whois: [
      {
        WhoisKey: { key_name: row.key_name },
      },
    ],
  }));

  return { uniqueKeywords, hosts };
}

// Вспомогательная функция для получения всех уникальных ключевых слов и хостов
async function getAllUniqueKeywordsAndHosts() {
  // Используем raw SQL для избежания сложностей с ORM
  // Получаем уникальные ключевые слова с подсчетом хостов
  const uniqueKeywordsSql = `
    SELECT DISTINCT w.key_name, COUNT(DISTINCT wh.host_id) as "count"
    FROM "whois_keys" w
    INNER JOIN "whois" wh ON w.id = wh.key_id
    GROUP BY w.key_name
    ORDER BY w.key_name ASC
  `;
  const uniqueKeywordsResult = await sequelize.query(uniqueKeywordsSql, {
    type: sequelize.QueryTypes.SELECT,
  });

  // Получаем хосты с портами и WHOIS данными
  // Используем DISTINCT для уникальных IP
  const hostsSql = `
    SELECT DISTINCT ON (h."id") 
           h."id", h."ip", h."reachable", h."updated_at",
           p."port", p."type",
           w."name" as "WellKnownPort.name",
           wk."key_name"
    FROM "hosts" h
    INNER JOIN "ports" p ON h."id" = p."host_id"
    LEFT JOIN "well_known_ports" w ON p."port" = w."port"
    INNER JOIN "whois" wh ON h."id" = wh."host_id"
    INNER JOIN "whois_keys" wk ON wh."key_id" = wk."id"
    ORDER BY h."id", h."updated_at" DESC
  `;
  const hostsResult = await sequelize.query(hostsSql, {
    type: sequelize.QueryTypes.SELECT,
  });

  // Преобразуем результат в структуру, аналогичную той, что ожидается
  const uniqueKeywords = uniqueKeywordsResult.map((row) => ({
    dataValues: {
      key_name: row.key_name,
      count: row.count,
    },
  }));

  // Преобразуем хосты
  const hosts = hostsResult.map((row) => ({
    id: row.id,
    ip: row.ip,
    reachable: row.reachable,
    updated_at: row.updated_at,
    Ports: [
      {
        port: row.port,
        type: row.type,
        WellKnownPort: row["WellKnownPort.name"]
          ? { name: row["WellKnownPort.name"] }
          : null,
      },
    ],
    Whois: [
      {
        WhoisKey: { key_name: row.key_name },
      },
    ],
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
    const { page = 1, limit = 3, keyword: keywordQuery } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10))); // Ограничение на 100 элементов

    let uniqueKeywords;
    let hosts;

    // Проверяем, есть ли фильтр по ключевому слову
    if (keywordQuery !== undefined) {
      // Если указан конкретное ключевое слово, фильтруем данные
      // Получаем уникальные ключевые слова и хосты для конкретного ключевого слова
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
    // Но если есть данные, даже если ключевое слово не в whois_keys.key_name,
    // просто возвращаем их без 404
    // Или лучше проверить, есть ли вообще данные для группировки
    if (
      keywordQuery !== undefined &&
      uniqueKeywords.length === 0 &&
      hosts.length === 0
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

    // Формируем карту хостов для быстрого доступа
    const hostMap = {};
    hosts.forEach((host) => {
      if (!hostMap[host.ip]) {
        hostMap[host.ip] = formatHostData(host); // Форматируем данные хоста
      }
    });

    // Группируем хосты по ключевым словам
    const keywordGroups = {};

    // Инициализируем группы для всех уникальных ключевых слов
    uniqueKeywords.forEach((keyRecord) => {
      const keyword = keyRecord.dataValues.key_name;
      keywordGroups[keyword] = {
        keyword: keyword,
        count: keyRecord.dataValues.count,
        items: [],
      };
    });

    // Теперь проходим по всем хостам и группируем их по ключевым словам
    for (const host of hosts) {
      for (const whois of host.Whois) {
        const keyName = whois.WhoisKey?.key_name;
        if (keyName && keywordGroups[keyName]) {
          // Добавляем хост в группу по ключевому слову
          keywordGroups[keyName].items.push(hostMap[host.ip]);
        }
      }
    }

    // Преобразуем в нужный формат и сортируем по возрастанию ключевых слов
    let items = Object.values(keywordGroups)
      .filter((group) => group.items.length > 0) // Убираем пустые группы
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
      .sort((a, b) => a.keyword.localeCompare(b.keyword)); // Сортировка по возрастанию ключевых слов

    // Если был задан конкретное ключевое слово, отфильтровываем результаты
    if (keywordQuery !== undefined) {
      // Фильтруем по указанному ключевому слову
      const filteredItems = items.filter(
        (item) => item.keyword === keywordQuery
      );
      // Для одного ключевого слова, если оно есть, то возвращаем его
      if (filteredItems.length > 0) {
        items = filteredItems;
      } else {
        // Если ничего не найдено для этого ключевого слова
        // Возвращаем 404 только если нет ни одной группы
        // Но если есть данные, но группа не найдена, то это может быть проблема с логикой
        // Но поскольку мы уже получили данные в hosts, и если группа не найдена,
        // значит ключевое слово не в whois_keys.key_name
        // Это может быть нормально, если данные находятся в других группах
        // Если filteredItems пустой, но данные есть, то это ошибка
        // Возвращаем 404
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

// // controllers/keywords.controller.js
// import { Sequelize } from "sequelize";
// const { Op } = Sequelize;
// import { Host, Port, WellKnownPort, Whois, WhoisKey } from "../models/index.js";

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
// const whois = {};
// let hasWhois = false;
// host.Whois.forEach((w) => {
//   if (w.WhoisKey && w.value !== null) {
//     whois[w.WhoisKey.key_name] = w.value;
//     hasWhois = true;
//   }
// });
// if (!hasWhois) {
//   whois.error = "Whois query failed";
// }
//   return {
//     ip: host.ip,
//     country: whois.Country || null,
//     has_whois: hasWhois,
//     whois,
//     updated_at: host.updated_at
//       ? host.updated_at.toISOString().replace("T", " ").substring(0, 19)
//       : null,
//     reachable: host.reachable,
//     port_data: {
//       open: openPorts,
//       filtered: filteredPorts,
//     },
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

//     // Get pagination parameters
//     const { pageNum, limitNum, offset } = paginate(req);

//     // Сначала получаем все IP-адреса, которые имеют указанный ключевой термин в WHOIS
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
//           where: {
//             value: {
//               [Op.like]: `%${keywordQuery}%`,
//             },
//           },
//           required: true, // Только хосты с соответствующим WHOIS
//           include: [
//             {
//               model: WhoisKey,
//               attributes: ["key_name"],
//             },
//           ],
//         },
//       ],
//       order: [["updated_at", "DESC"]],
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
//           where: {
//             value: {
//               [Op.like]: `%${keywordQuery}%`,
//             },
//           },
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

// export const groupKeywords = async (req, res) => {
//   try {
//     // Get pagination parameters from request query
//     const { page = 1, limit = 3 } = req.query;
//     const pageNum = parseInt(page, 10);
//     const pageSize = parseInt(limit, 10);

//     // Get all unique keywords from WhoisKey table
//     const uniqueKeys = await WhoisKey.findAll({
//       attributes: [
//         "key_name",
//         [Sequelize.fn("COUNT", Sequelize.col("key_name")), "count"],
//       ],
//       group: ["key_name"],
//       order: [["key_name", "ASC"]], // Sort by ascending key names
//     });

//     const totalCount = uniqueKeys.length;

//     // Get all hosts with ports and WHOIS data for forming the dataset
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
//           include: [
//             {
//               model: WhoisKey,
//               attributes: ["key_name"],
//             },
//           ],
//         },
//       ],
//       order: [["updated_at", "DESC"]],
//     });

//     // Form host map for quick access
//     const hostMap = {};
//     hosts.forEach((host) => {
//       hostMap[host.ip] = formatHostData(host);
//     });

//     // Group hosts by keywords
//     const keywordGroups = {};

//     uniqueKeys.forEach((key) => {
//       keywordGroups[key.dataValues.key_name] = [];
//     });

//     for (const host of hosts) {
//       for (const whois of host.Whois) {
//         const keyName = whois.WhoisKey?.key_name;
//         if (keyName && keywordGroups[keyName]) {
//           // Add host to the group based on the key name
//           keywordGroups[keyName].push(hostMap[host.ip]);
//         }
//       }
//     }

//     // Transform into required format
//     const items = Object.entries(keywordGroups)
//       .filter(([_, hosts]) => hosts.length > 0) // Remove empty groups
//       .map(([keyword, hosts]) => {
//         const totalItemsInGroup = hosts.length;
//         const totalPagesInGroup = Math.ceil(totalItemsInGroup / pageSize);
//         const startIndex = (pageNum - 1) * pageSize;
//         const endIndex = startIndex + pageSize;
//         return {
//           keyword: keyword,
//           items: hosts.slice(startIndex, endIndex),
//           pagination: {
//             currentPage: pageNum,
//             totalPages: totalPagesInGroup,
//             totalItems: totalItemsInGroup,
//             hasNext: pageNum < totalPagesInGroup,
//             hasPrev: pageNum > 1,
//           },
//         };
//       })
//       .sort((a, b) => a.keyword.localeCompare(b.keyword)); // Sort by ascending key names

//     if (!items.length) {
//       return res.status(404).json({
//         message: "Нет данных соответствующих поиску",
//         items: [],
//       });
//     }

//     const response = {
//       items: items,
//       pagination: {
//         totalItems: totalCount,
//       },
//       type: "group",
//       field: "keyword",
//     };

//     return res.json(response);
//   } catch (error) {
//     console.error("Ошибка в groupKeywords:", error);
//     return res.status(500).json({ error: "Нет результатов удовлетворяющих поиску" });
//   }
// };

/******************************************************************** */
// РАБОЧИЙ КОД
// Новый обработчик для GET /keywords/group?page=1&limit=10
// export const groupKeywords = async (req, res) => {
//   try {
//     // Получаем все уникальные ключевые слова из таблицы WhoisKey
//     const uniqueKeys = await WhoisKey.findAll({
//       attributes: [
//         "key_name",
//         [Sequelize.fn("COUNT", Sequelize.col("key_name")), "count"],
//       ],
//       group: ["key_name"],
//       order: [["key_name", "ASC"]], // Сортировка по возрастанию ключей
//     });

//     const totalCount = uniqueKeys.length

//     // Получаем все хосты с портами и WHOIS для формирования данных
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
//       ],
//       order: [["updated_at", "DESC"]],
//     });

//     // Формируем маппинг хостов по IP для быстрого доступа
//     const hostMap = {};
//     hosts.forEach((host) => {
//       hostMap[host.ip] = formatHostData(host);
//     });

//     // Группируем хосты по ключевым словам
//     const keywordGroups = {};

//     // Инициализируем группы
//     uniqueKeys.forEach((key) => {
//       keywordGroups[key.dataValues.key_name] = [];
//       // console.log(key.dataValues)
//     });

//     // Теперь проходим по всем WHOIS записям и группируем хосты
//     for (const host of hosts) {
//       for (const whois of host.Whois) {
//         const keyName = whois.WhoisKey?.key_name;
//         if (keyName && keywordGroups[keyName]) {
//           // Добавляем хост в группу ключа
//           keywordGroups[keyName].push(hostMap[host.ip]);
//         }
//       }
//     }

//     // Преобразуем в нужный формат
//     const items = Object.entries(keywordGroups)
//       .filter(([_, hosts]) => hosts.length > 0) // Убираем пустые группы
//       .map(([keyword, hosts]) => ({
//         keyword: keyword,
//         items: hosts,
//         count: hosts.length
//       }))
//       .sort((a, b) => a.keyword.localeCompare(b.keyword)); // Сортируем по возрастанию ключей

//     if (!items.length) {
//       return res.status(404).json({
//         message: "Нет данных соответствующих поиску",
//         items: [],
//       });
//     }

//     const response = {
//       items: items,
//       pagination: {
//         // currentPage: pageNum,
//         // totalPages: totalPages,
//         totalItems: totalCount,
//         // hasNext: pageNum < totalPages,
//         // hasPrev: pageNum > 1,
//       },
//       type: "group",
//       field: "keyword",
//     };

//     return res.json(response);
//     // return res.json({ items, type: "group", field: "keyword" });
//   } catch (error) {
//     console.error("Ошибка в groupKeywords:", error);
//     return res
//       .status(500)
//       .json({ error: "Нет результатов удовлетворяющих поиску" });
//     // return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// // controllers/words.controller.js
// import { Sequelize } from "sequelize";
// import { Host, Port, Whois, WhoisKey, WellKnownPort } from "../models/index.js";

// const { Op } = Sequelize;

// export const getWordInfo = async (req, res) => {
//   try {
//     const { keyword } = req.query;

//     if (!keyword || typeof keyword !== "string") {
//       return res
//         .status(400)
//         .json({ error: "Параметр 'keyword' обязателен и должен быть строкой" });
//     }

//     if (keyword.length > 100) {
//       return res
//         .status(400)
//         .json({ error: "Ключевое слово слишком длинное (макс. 100 символов)" });
//     }

//     // Шаг 1: Найти все host_id, у которых есть совпадение в WHOIS (ключ или значение)
//     const matchingWhoisRecords = await Whois.findAll({
//       where: {
//         [Op.or]: [
//           { "$WhoisKey.key_name$": { [Op.iLike]: `%${keyword}%` } },
//           { value: { [Op.iLike]: `%${keyword}%` } },
//         ],
//       },
//       include: [{ model: WhoisKey, attributes: ["key_name"] }],
//       attributes: ["host_id"],
//     });

//     const hostIds = [...new Set(matchingWhoisRecords.map((r) => r.host_id))];
//     if (!hostIds.length) {
//       return res.status(404).json({
//         message: "Нет данных соответствующих поиску",
//         items: [],
//       });
//     }

//     // Шаг 2: Загрузить полные данные хостов с портами и ВСЕМ WHOIS
//     const hosts = await Host.findAll({
//       where: { id: hostIds },
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
//       ],
//       order: [["updated_at", "DESC"]],
//     });

//     // Шаг 3: Формирование результата
//     const items = hosts.map((host) => {
//       // Порты
//       const openPorts = [];
//       const filteredPorts = [];
//       host.Ports.forEach((port) => {
//         const portInfo = {
//           port: port.port,
//           name: port.WellKnownPort?.name || null,
//         };
//         if (port.type === "open") {
//           openPorts.push(portInfo);
//         } else if (port.type === "filtered") {
//           filteredPorts.push(portInfo);
//         }
//       });

//       // Весь WHOIS как объект
//       const whois = {};
//       let hasWhois = false;
//       host.Whois.forEach((w) => {
//         if (w.WhoisKey && w.value !== null) {
//           whois[w.WhoisKey.key_name] = w.value;
//           hasWhois = true;
//         }
//       });

//       if (!hasWhois) {
//         whois.error = "Whois query failed";
//       }

//       return {
//         ip: host.ip,
//         country: null,
//         reachable: host.reachable,
//         updated_at: host.updated_at
//           ? host.updated_at.toISOString().replace("T", " ").substring(0, 19)
//           : null,
//         port: {
//           open: openPorts,
//           filtered: filteredPorts,
//         },
//         has_whois: hasWhois,
//         whois,
//       };
//     });

//     if (!items.length) {
//       return res.status(404).json({
//         message: "Нет данных соответствующих поиску",
//         items: [],
//       });
//     }

//     return res.json({ items });
//   } catch (error) {
//     console.error("Ошибка в getWordInfo:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// export const groupWord = getWordInfo;
