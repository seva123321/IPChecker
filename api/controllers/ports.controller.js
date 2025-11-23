// Рабочий код но долгий
/*********************************************** */

// controllers/ports.controller.js

import { Sequelize } from "sequelize";
const { Op } = Sequelize;
import {
  Host,
  Port,
  Whois,
  WhoisKey,
  WellKnownPort,
  sequelize,
  Priority,
  PriorityComment,
  Grouping
} from "../models/index.js";

// Вспомогательная функция для форматирования данных хоста (без WHOIS и комментариев)
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

  // Проверяем наличие WHOIS данных для поля has_whois
  const hasWhois = host.Whois && Array.isArray(host.Whois) && host.Whois.length > 0;

  // Получаем информацию о приоритете и группировке (без комментариев)
  const priorityInfo = {
    priority: null,
    grouping: null
  };

  // Добавляем информацию о приоритете - гарантируем наличие name
  if (host.priority_id || host.Priority) {
    priorityInfo.priority = {
      id: host.priority_id,
      name: host.Priority?.name || "Unknown" // Значение по умолчанию
    };
  }

  // Добавляем информацию о группировке
  if (host.grouping_id || host.Grouping) {
    priorityInfo.grouping = {
      id: host.grouping_id,
      name: host.Grouping?.name || null
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
    // ИСКЛЮЧАЕМ whois данные и comment
  };
};

// Универсальная функция сортировки по приоритету
const sortItemsByPriority = (items) => {
  return items.sort((a, b) => {
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
};

/**
 * Получение информации о конкретном порте с пагинацией
 * Поддерживает поиск по числовому значению порта, по имени сервиса или по значениям вида "21 (ftp)"
 */
export const getPortInfo = async (req, res) => {
  try {
    const { port: portQuery, page = 1, limit = 10 } = req.query;

    // Проверка параметров пагинации
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    if (portQuery === undefined) {
      return res.status(400).json({ error: "Параметр 'port' обязателен" });
    }

    // Обработка значений вида "21 (ftp)" - извлекаем число из скобок
    let processedQuery = portQuery.trim();
    
    // Проверяем формат "число (название)"
    const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);
    
    if (portWithNameMatch) {
      // Если формат "21 (ftp)", используем только числовую часть
      processedQuery = portWithNameMatch[1];
    }

    // Определяем, передано число или строка
    const isNumeric = /^\d+$/.test(processedQuery);
    let whereCondition;
    let targetPortNumber = null;

    if (isNumeric) {
      const portNum = Number(processedQuery);
      if (portNum < 1 || portNum > 65535) {
        return res
          .status(400)
          .json({ error: "Порт должен быть числом от 1 до 65535" });
      }
      // Поиск по числовому значению порта
      whereCondition = { port: portNum };
      targetPortNumber = portNum;
    } else {
      // Поиск по имени сервиса (например, 'https', 'ftp')
      const knownPort = await WellKnownPort.findOne({
        where: {
          name: { [Op.iLike]: processedQuery },
        },
      });

      if (!knownPort) {
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

      // Если порт найден в well_known_ports, ищем порты с таким значением
      whereCondition = {
        port: knownPort.port,
      };
      targetPortNumber = knownPort.port;
    }

    // Сначала получаем все IP-адреса, которые имеют указанный порт
    const hostsWithPort = await Port.findAll({
      where: whereCondition,
      include: [
        {
          model: Host,
          attributes: ["id", "ip", "reachable", "updated_at", "priority_id", "grouping_id"],
        },
      ],
      attributes: [], // Не выбираем поля Port, только связи
      distinct: true,
      raw: false,
    });

    // Получаем уникальные ID хостов
    const hostIds = [...new Set(hostsWithPort.map((p) => p.Host.id))];

    if (hostIds.length === 0) {
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

    // Получаем общее количество записей для пагинации
    const totalCount = hostIds.length;

    // Теперь получаем полные данные для этих хостов (все порты, приоритеты, группировки)
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
        // ИСКЛЮЧАЕМ PriorityComment
      ],
      where: {
        id: { [Op.in]: hostIds },
      },
      order: [["priority_id", "DESC"]],
      limit: limitNum,
      offset: offset,
    });

    // Формируем результат в нужном формате
    const items = hosts.map(formatHostData);

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

    // Получаем имя порта для ответа
    let portName = null;
    if (targetPortNumber) {
      const knownPort = await WellKnownPort.findOne({
        where: { port: targetPortNumber },
        attributes: ["name"]
      });
      portName = knownPort?.name || null;
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
      field: "port",
      port_info: {
        port: targetPortNumber,
        name: portName
      }
    };

    return res.json(response);
  } catch (error) {
    console.error("Ошибка в getPortInfo:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// Вспомогательная функция для получения уникальных портов и хостов для конкретного порта
async function getUniquePortsAndHosts(portQuery) {
  // Обработка значений вида "21 (ftp)" - извлекаем число из скобок
  let processedQuery = portQuery.trim();
  
  // Проверяем формат "число (название)"
  const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);
  
  if (portWithNameMatch) {
    // Если формат "21 (ftp)", используем только числовую часть
    processedQuery = portWithNameMatch[1];
  }

  const isNumeric = /^\d+$/.test(processedQuery);
  const portNumber = isNumeric ? Number(processedQuery) : null;

  if (!isNumeric) {
    throw new Error("Для группировки портов необходим числовой порт");
  }

  // Используем raw SQL для получения уникальных портов с подсчетом хостов
  const rawUniquePortsResult = await sequelize.query(
    `
    SELECT DISTINCT p."port", COUNT(DISTINCT h."id") as "count", w."name" as "port_name"
    FROM "ports" AS p
    INNER JOIN "hosts" AS h ON p."host_id" = h."id"
    LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
    WHERE p."port" = :port
    GROUP BY p."port", w."name"
    ORDER BY p."port" ASC
  `,
    {
      replacements: { port: portNumber },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const uniquePorts = rawUniquePortsResult.map((row) => ({
    dataValues: {
      port: row.port,
      count: row.count,
      "WellKnownPort.name": row.port_name,
    },
  }));

  // Получаем ID хостов с указанным портом
  const hostIdsResult = await sequelize.query(
    `
    SELECT DISTINCT h."id"
    FROM "hosts" AS h
    INNER JOIN "ports" AS p ON h."id" = p."host_id"
    WHERE p."port" = :port
  `,
    {
      replacements: { port: portNumber },
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const hostIds = hostIdsResult.map(row => row.id);

  // Получаем полные данные для хостов через Sequelize
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

  return { uniquePorts, hosts };
}

// Вспомогательная функция для получения всех уникальных портов и хостов
async function getAllUniquePortsAndHosts() {
  // Используем raw SQL для получения уникальных портов
  const rawUniquePortsResult = await sequelize.query(
    `
    SELECT DISTINCT p."port", COUNT(DISTINCT h."id") as "count", w."name" as "port_name"
    FROM "ports" AS p
    INNER JOIN "hosts" AS h ON p."host_id" = h."id"
    LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
    GROUP BY p."port", w."name"
    ORDER BY p."port" ASC
  `,
    {
      type: sequelize.QueryTypes.SELECT,
    }
  );

  const uniquePorts = rawUniquePortsResult.map((row) => ({
    dataValues: {
      port: row.port,
      count: row.count,
      "WellKnownPort.name": row.port_name,
    },
  }));

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

  return { uniquePorts, hosts };
}

// Вспомогательная функция для формирования ответа
function buildResponse(items, pageNum, totalPages, totalCount, type, field) {
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

// Основная функция контроллера
export const groupPort = async (req, res) => {
  try {
    // Get pagination parameters from request query
    const { page = 1, limit = 10, port: portQuery } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));

    let uniquePorts;
    let hosts;

    // Проверяем, есть ли фильтр по порту
    if (portQuery !== undefined && portQuery !== '') {
      // Обработка значений вида "21 (ftp)" - извлекаем число из скобок
      let processedQuery = portQuery.trim();
      
      // Проверяем формат "число (название)"
      const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);
      
      if (portWithNameMatch) {
        // Если формат "21 (ftp)", используем только числовую часть
        processedQuery = portWithNameMatch[1];
      }

      const isNumeric = /^\d+$/.test(processedQuery);
      
      if (!isNumeric) {
        return res.status(400).json({ 
          error: "Для группировки портов необходим числовой порт" 
        });
      }

      const portNum = Number(processedQuery);
      if (portNum < 1 || portNum > 65535) {
        return res
          .status(400)
          .json({ error: "Порт должен быть числом от 1 до 65535" });
      }

      const result = await getUniquePortsAndHosts(processedQuery);
      uniquePorts = result.uniquePorts;
      hosts = result.hosts;
    } else {
      // Если фильтра нет, работаем как обычно
      const result = await getAllUniquePortsAndHosts();
      uniquePorts = result.uniquePorts;
      hosts = result.hosts;
    }

    const totalCount = uniquePorts.length;

    // Формируем карту отформатированных хостов для избежания дублирования
    const formattedHostsMap = new Map();
    
    hosts.forEach((host) => {
      if (!formattedHostsMap.has(host.id)) {
        formattedHostsMap.set(host.id, formatHostData(host));
      }
    });

    // Группируем хосты по портам
    const portGroups = {};

    for (const portRecord of uniquePorts) {
      const portNumber = portRecord.dataValues.port;
      const portCount = portRecord.dataValues.count;

      portGroups[portNumber] = {
        port: parseInt(portNumber),
        count: portCount,
        name: portRecord.dataValues["WellKnownPort.name"] || null,
        items: [],
      };
    }

    // Группируем хосты по портам
    for (const host of hosts) {
      const formattedHost = formattedHostsMap.get(host.id);
      
      if (formattedHost && host.Ports && Array.isArray(host.Ports)) {
        for (const port of host.Ports) {
          const portNumber = port.port;
          if (portGroups[portNumber]) {
            // Проверяем, что хост еще не добавлен в эту группу
            const hostExists = portGroups[portNumber].items.some(
              item => item.id === formattedHost.id
            );
            if (!hostExists) {
              portGroups[portNumber].items.push(formattedHost);
            }
          }
        }
      }
    }

    // Сортируем хосты внутри каждой группы по приоритету
    Object.values(portGroups).forEach(group => {
      sortItemsByPriority(group.items);
    });

    // Преобразуем в нужный формат и сортируем по возрастанию портов
    let items = Object.values(portGroups)
      .filter((group) => group.items.length > 0)
      .map((group) => {
        const totalItemsInGroup = group.items.length;
        const totalPagesInGroup = Math.ceil(totalItemsInGroup / pageSize);
        const offset = (pageNum - 1) * pageSize;

        return {
          port: group.port,
          count: group.count,
          name: group.name,
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
      .sort((a, b) => a.port - b.port);

    // Если был задан конкретный порт, отфильтровываем результаты
    if (portQuery !== undefined && portQuery !== '') {
      let processedQuery = portQuery.trim();
      const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);
      if (portWithNameMatch) {
        processedQuery = portWithNameMatch[1];
      }
      
      const portNum = Number(processedQuery);
      const filteredItems = items.filter(
        (item) => item.port === portNum
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

    const response = buildResponse(
      items,
      pageNum,
      totalPages,
      totalCount,
      "group",
      "port"
    );

    return res.json(response);
  } catch (error) {
    console.error("Ошибка в groupPort:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

/*********************************************** */
// // controllers/ports.controller.js
// import { Sequelize } from "sequelize";
// const { Op } = Sequelize;
// import {
//   Host,
//   Port,
//   Whois,
//   WhoisKey,
//   WellKnownPort,
//   sequelize,
//   Priority,
//   PriorityComment,
//   Grouping
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
//     grouping: null
//   };

//   // Добавляем информацию о приоритете
//   if (host.priority_id) {
//     priorityInfo.priority = {
//       id: host.priority_id,
//       name: host.Priority?.name || null
//     };
//   }

//   // Добавляем информацию о комментарии к приоритету
//   if (host.PriorityComment) {
//     priorityInfo.comment = {
//       text: host.PriorityComment.comment,
//       createdAt: host.PriorityComment.created_at
//     };
//   }

//   // Добавляем информацию о группировке
//   if (host.grouping_id) {
//     priorityInfo.grouping = {
//       id: host.grouping_id,
//       name: host.Grouping?.name || null
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

// // Универсальная функция сортировки по приоритету
// const sortItemsByPriority = (items) => {
//   return items.sort((a, b) => {
//     // Сначала сортируем по приоритету (DESC)
//     if (a.priority_info?.priority?.id && b.priority_info?.priority?.id) {
//       return b.priority_info.priority.id - a.priority_info.priority.id;
//     }
//     // Если приоритеты не определены, сортируем по дате обновления
//     if (a.updated_at && b.updated_at) {
//       return new Date(b.updated_at) - new Date(a.updated_at);
//     }
//     return 0;
//   });
// };

// /**
//  * Получение информации о конкретном порте с пагинацией
//  * Поддерживает поиск по числовому значению порта или по имени сервиса
//  */
// export const getPortInfo = async (req, res) => {
//   try {
//     const { port: portQuery, page = 1, limit = 10 } = req.query;

//     // Проверка параметров пагинации
//     const pageNum = Math.max(1, parseInt(page) || 1);
//     const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10)); // Ограничение на 100 элементов
//     const offset = (pageNum - 1) * limitNum;

//     const [portNumber, portNameWithWrapper] = portQuery.split(" ");

//     // console.log("portNumber  > ", portNumber);
//     if (portQuery === undefined) {
//       return res.status(400).json({ error: "Параметр 'port' обязателен" });
//     }

//     // Определяем, передано число или строка
//     const isNumeric = /^\d+$/.test(portNumber ?? portQuery);
//     let whereCondition;

//     if (isNumeric) {
//       const portNum = Number(portNumber ?? portQuery);
//       if (portNum < 1 || portNum > 65535) {
//         return res
//           .status(400)
//           .json({ error: "Порт должен быть числом от 1 до 65535" });
//       }
//       // Поиск по числовому значению порта
//       whereCondition = { port: portNum };
//     } else {
//       // Поиск по имени сервиса (например, 'https')
//       const knownPort = await WellKnownPort.findOne({
//         where: {
//           name: { [Op.iLike]: portQuery },
//         },
//       });

//       if (!knownPort) {
//         return res.status(404).json({
//           message: "Нет данных соответствующих поиску",
//           items: [],
//         });
//       }

//       // Если порт найден в well_known_ports, ищем порты с таким значением
//       whereCondition = {
//         port: knownPort.port,
//       };
//     }

//     // Сначала получаем все IP-адреса, которые имеют указанный порт
//     const hostsWithPort = await Port.findAll({
//       where: whereCondition,
//       include: [
//         {
//           model: Host,
//           attributes: ["ip", "reachable", "updated_at"],
//         },
//         // Включаем WellKnownPort, чтобы получить имя сервиса
//         {
//           model: WellKnownPort,
//           attributes: ["name"],
//           required: false, // Не обязательно, чтобы не исключать порты без имени
//         },
//       ],
//       attributes: [], // Не выбираем поля Port, только связи
//       distinct: true, // Убираем дубликаты
//       raw: false,
//     });

//     // Получаем уникальные IP-адреса
//     const ipAddresses = hostsWithPort.map((p) => p.Host.ip);

//     if (ipAddresses.length === 0) {
//       return res.status(404).json({
//         message: "Нет данных соответствующих поиску",
//         items: [],
//       });
//     }

//     // Получаем общее количество записей для пагинации
//     const totalCount = ipAddresses.length;

//     // Теперь получаем все порты для этих IP-адресов (все данные по IP)
//     const allPortsForHosts = await Host.findAll({
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
//           include: [{
//             model: Priority,
//             attributes: ["name"]
//           }],
//           required: false
//         },
//         // Включаем группировки
//         {
//           model: Grouping,
//           attributes: ["id", "name"],
//           required: false,
//         },
//       ],
//       where: {
//         ip: { [Op.in]: ipAddresses },
//       },
//       order: [["priority_id", "DESC"]],
//       limit: limitNum,
//       offset: offset,
//     });

//     // Формируем результат в нужном формате
//     const items = allPortsForHosts.map(formatHostData);

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
//       field: "port",
//     };

//     return res.json(response);
//   } catch (error) {
//     console.error("Ошибка в getPortInfo:", error);
//     return res
//       .status(500)
//       .json({ error: "Нет результатов удовлетворяющих поиску" });
//   }
// };

// // Вспомогательная функция для получения уникальных портов и хостов
// async function getUniquePortsAndHosts(
//   portQuery,
//   isNumeric,
//   whereCondition,
//   req,
//   res
// ) {
//   let uniquePorts;
//   let hosts;

//   // Используем raw SQL для избежания неоднозначности
//   // Сначала получаем уникальные порты с подсчетом хостов и именем порта
//   const rawUniquePortsResult = await sequelize.query(
//     `
//     SELECT DISTINCT p."port", COUNT(DISTINCT h."id") as "count", w."name" as "port_name"
//     FROM "ports" AS p
//     INNER JOIN "hosts" AS h ON p."host_id" = h."id"
//     LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
//     WHERE p."port" = :port
//     GROUP BY p."port", w."name"
//     ORDER BY p."port" ASC
//   `,
//     {
//       replacements: { port: isNumeric ? Number(portQuery) : null },
//       type: sequelize.QueryTypes.SELECT,
//     }
//   );

//   // Для числового порта используем результат первого запроса
//   uniquePorts = rawUniquePortsResult.map((row) => ({
//     dataValues: {
//       port: row.port,
//       count: row.count,
//       "WellKnownPort.name": row.port_name, // Используем имя порта из запроса
//     },
//   }));

//   // Теперь получаем хосты с портами для конкретного порта
//   // Используем raw SQL для точного контроля
//   const rawHostsResult = await sequelize.query(
//     `
//     SELECT h."id", h."ip", h."reachable", h."updated_at",
//            p."port", p."type",
//            w."name" as "WellKnownPort.name"
//     FROM "hosts" AS h
//     INNER JOIN "ports" AS p ON h."id" = p."host_id"
//     LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
//     WHERE p."port" = :port
//     ORDER BY h."updated_at" DESC
//   `,
//     {
//       replacements: { port: Number(portQuery) },
//       type: sequelize.QueryTypes.SELECT,
//     }
//   );

//   // Преобразуем результат в структуру, аналогичную той, что ожидается
//   hosts = rawHostsResult.map((row) => ({
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
//     Whois: [], // Инициализируем пустым массивом
//   }));

//   return { uniquePorts, hosts };
// }

// // Вспомогательная функция для получения уникальных портов и хостов без фильтрации по порту
// async function getAllUniquePortsAndHosts() {
//   // Используем raw SQL для получения уникальных портов
//   const rawUniquePortsResult = await sequelize.query(
//     `
//     SELECT DISTINCT p."port", COUNT(DISTINCT h."id") as "count", w."name" as "port_name"
//     FROM "ports" AS p
//     INNER JOIN "hosts" AS h ON p."host_id" = h."id"
//     LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
//     GROUP BY p."port", w."name"
//     ORDER BY p."port" ASC
//   `,
//     {
//       type: sequelize.QueryTypes.SELECT,
//     }
//   );

//   const uniquePorts = rawUniquePortsResult.map((row) => ({
//     dataValues: {
//       port: row.port,
//       count: row.count,
//       "WellKnownPort.name": row.port_name, // Используем имя порта из запроса
//     },
//   }));

//   // Получаем хосты с портами и именами сервисов
//   const rawHostsResult = await sequelize.query(
//     `
//     SELECT h."id", h."ip", h."reachable", h."updated_at",
//            p."port", p."type",
//            w."name" as "WellKnownPort.name"
//     FROM "hosts" AS h
//     INNER JOIN "ports" AS p ON h."id" = p."host_id"
//     LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
//     ORDER BY h."updated_at" DESC
//   `,
//     {
//       type: sequelize.QueryTypes.SELECT,
//     }
//   );

//   // Преобразуем результат в структуру, аналогичную той, что ожидается
//   const hosts = rawHostsResult.map((row) => ({
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
//     Whois: [], // Инициализируем пустым массивом
//   }));

//   return { uniquePorts, hosts };
// }

// // Вспомогательная функция для формирования ответа
// function buildResponse(items, pageNum, totalPages, totalCount, type, field) {
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

// // Основная функция контроллера
// export const groupPort = async (req, res) => {
//   try {
//     // Get pagination parameters from request query
//     const { page = 1, limit = 3, port: portQuery } = req.query;
//     const pageNum = Math.max(1, parseInt(page, 10));
//     const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10))); // Ограничение на 100 элементов

//     let uniquePorts;
//     let hosts;

//     // Проверяем, есть ли фильтр по порту
//     if (portQuery !== undefined) {
//       // Если указан конкретный порт, фильтруем данные
//       const isNumeric = /^\d+$/.test(portQuery);
//       let whereCondition;

//       if (isNumeric) {
//         const portNum = Number(portQuery);
//         if (portNum < 1 || portNum > 65535) {
//           return res
//             .status(400)
//             .json({ error: "Порт должен быть числом от 1 до 65535" });
//         }
//         whereCondition = { port: portNum };
//       } else {
//         // Поиск по имени сервиса (например, 'https')
//         whereCondition = {
//           "$WellKnownPort.name$": { [Sequelize.Op.iLike]: `%${portQuery}%` },
//         };
//       }

//       // Получаем уникальные порты и хосты для конкретного порта
//       const result = await getUniquePortsAndHosts(
//         portQuery,
//         isNumeric,
//         whereCondition,
//         req,
//         res
//       );
//       uniquePorts = result.uniquePorts;
//       hosts = result.hosts;
//     } else {
//       // Если фильтра нет, работаем как обычно
//       const result = await getAllUniquePortsAndHosts();
//       uniquePorts = result.uniquePorts;
//       hosts = result.hosts;
//     }

//     const totalCount = uniquePorts.length;

//     // Формируем карту хостов для быстрого доступа
//     const hostMap = {};
//     hosts.forEach((host) => {
//       // Инициализируем пустые массивы для Ports и Whois если они отсутствуют
//       if (!host.Ports) host.Ports = [];
//       if (!host.Whois) host.Whois = [];
      
//       // Создаем объект хоста в формате, как в formatHostData
//       if (!hostMap[host.ip]) {
//         hostMap[host.ip] = formatHostData(host); // Форматируем данные хоста
//       }
//     });

//     // Группируем хосты по портам и добавляем имена портов
//     const portGroups = {};

//     for (const portRecord of uniquePorts) {
//       const portNumber = portRecord.dataValues.port;
//       const portCount = portRecord.dataValues.count;

//       // Инициализируем группу для порта с полем name из WellKnownPort
//       portGroups[portNumber] = {
//         port: parseInt(portNumber),
//         count: portCount,
//         items: [],
//       };

//       // Теперь используем имя порта, которое мы получили из БД
//       portGroups[portNumber].name =
//         portRecord.dataValues["WellKnownPort.name"] || null;
//     }

//     // Теперь проходим по всем хостам и группируем их по портам
//     // Используем данные из hosts, которые уже содержат всю информацию
//     for (const host of hosts) {
//       // Проверяем, что host.Ports существует и является массивом
//       if (host.Ports && Array.isArray(host.Ports)) {
//         const formattedHostData = formatHostData(host);
//         for (const port of host.Ports) {
//           const portNumber = port.port;
//           if (portGroups[portNumber]) {
//             // Добавляем хост в группу по номеру порта
//             portGroups[portNumber].items.push(formattedHostData);
//           }
//         }
//       }
//     }

//     // Сортируем хосты внутри каждой группы по приоритету
//     Object.values(portGroups).forEach(group => {
//       sortItemsByPriority(group.items);
//     });

//     // Преобразуем в нужный формат и сортируем по возрастанию портов
//     let items = Object.values(portGroups)
//       .filter((group) => group.items.length > 0) // Убираем пустые группы
//       .map((group) => {
//         const totalItemsInGroup = group.items.length;
//         const totalPagesInGroup = Math.ceil(totalItemsInGroup / pageSize);
//         const offset = (pageNum - 1) * pageSize;

//         return {
//           port: group.port,
//           count: group.count,
//           name: group.name,
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
//       .sort((a, b) => a.port - b.port);

//     // Если был задан конкретный порт, отфильтровываем результаты
//     if (portQuery !== undefined) {
//       // Фильтруем по указанному порту
//       const filteredItems = items.filter(
//         (item) => item.port === parseInt(portQuery)
//       );
//       // Для одного порта, если он есть, то возвращаем его
//       if (filteredItems.length > 0) {
//         items = filteredItems;
//       } else {
//         // Если ничего не найдено для этого порта
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

//     const response = buildResponse(
//       items,
//       pageNum,
//       totalPages,
//       totalCount,
//       "group",
//       "port"
//     );

//     return res.json(response);
//   } catch (error) {
//     console.error("Ошибка в groupPort:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };
