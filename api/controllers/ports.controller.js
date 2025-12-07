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
  Grouping,
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
  const hasWhois =
    host.Whois && Array.isArray(host.Whois) && host.Whois.length > 0;

  // Получаем информацию о приоритете и группировке (без комментариев)
  const priorityInfo = {
    priority: null,
    grouping: null,
  };

  // Добавляем информацию о приоритете - гарантируем наличие name
  if (host.priority_id || host.Priority) {
    priorityInfo.priority = {
      id: host.priority_id,
      name: host.Priority?.name || "Unknown", // Значение по умолчанию
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
    const {
      port: portQuery,
      page = 1,
      limit = 10,
      o: portOpened,
      f: portFiltered,
    } = req.query;

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

    // Определяем условие для типа порта на основе параметров
    let portTypeCondition = {};
    
    // Конвертируем параметры в boolean
    const isOpened = portOpened === 'true';
    const isFiltered = portFiltered === 'true';
    
    if (isOpened && !isFiltered) {
      portTypeCondition.type = 'open';
    } else if (!isOpened && isFiltered) {
      portTypeCondition.type = 'filtered';
    } else if (isOpened && isFiltered) {
      // Если оба параметра true, ищем оба типа
      portTypeCondition.type = { [Op.in]: ['open', 'filtered'] };
    }
    // Если оба false или не указаны - ищем все типы

    // Создаем условие для поиска портов
    const portSearchCondition = {
      ...whereCondition,
      ...portTypeCondition
    };

    // Находим все порты, соответствующие условиям и получаем ИД хостов
    const ports = await Port.findAll({
      where: portSearchCondition,
      include: [
        {
          model: Host,
          attributes: ["id"],
          required: true,
        },
      ],
      attributes: ['id'],
      raw: true,
    });

    // Получаем уникальные ID хостов
    const hostIds = [...new Set(ports.map((p) => p['Host.id']))];

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

    // Получаем общее количество страниц
    const totalPages = Math.ceil(totalCount / limitNum);

    // Теперь получаем полные данные для этих хостов с пагинацией
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
      limit: limitNum,
      offset: offset,
    });

    // Формируем результат в нужном формате
    const formattedHosts = hosts.map(formatHostData);

    // Фильтруем результаты: оставляем только те хосты, у которых есть указанный порт с нужным типом
    const filteredItems = formattedHosts.filter(host => {
      const hasPort = host.port_data.open.some(p => p.port === targetPortNumber) ||
                      host.port_data.filtered.some(p => p.port === targetPortNumber);
      
      // Если указан тип порта, проверяем конкретный тип
      if (isOpened && !isFiltered) {
        return host.port_data.open.some(p => p.port === targetPortNumber);
      } else if (!isOpened && isFiltered) {
        return host.port_data.filtered.some(p => p.port === targetPortNumber);
      }
      
      return hasPort;
    });

    if (filteredItems.length === 0) {
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
        attributes: ["name"],
      });
      portName = knownPort?.name || null;
    }

    const response = {
      items: filteredItems,
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
        name: portName,
      },
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

  const hostIds = hostIdsResult.map((row) => row.id);

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
    order: [
      ["priority_id", "DESC"],
      ["updated_at", "DESC"],
    ],
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
    order: [
      ["priority_id", "DESC"],
      ["updated_at", "DESC"],
    ],
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
    if (portQuery !== undefined && portQuery !== "") {
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
          error: "Для группировки портов необходим числовой порт",
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
              (item) => item.id === formattedHost.id
            );
            if (!hostExists) {
              portGroups[portNumber].items.push(formattedHost);
            }
          }
        }
      }
    }

    // Сортируем хосты внутри каждой группы по приоритету
    Object.values(portGroups).forEach((group) => {
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
    if (portQuery !== undefined && portQuery !== "") {
      let processedQuery = portQuery.trim();
      const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);
      if (portWithNameMatch) {
        processedQuery = portWithNameMatch[1];
      }

      const portNum = Number(processedQuery);
      const filteredItems = items.filter((item) => item.port === portNum);

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
// // Рабочий код но долгий
// /*********************************************** */

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
//   Grouping,
// } from "../models/index.js";

// // Вспомогательная функция для форматирования данных хоста (без WHOIS и комментариев)
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

//   // Проверяем наличие WHOIS данных для поля has_whois
//   const hasWhois =
//     host.Whois && Array.isArray(host.Whois) && host.Whois.length > 0;

//   // Получаем информацию о приоритете и группировке (без комментариев)
//   const priorityInfo = {
//     priority: null,
//     grouping: null,
//   };

//   // Добавляем информацию о приоритете - гарантируем наличие name
//   if (host.priority_id || host.Priority) {
//     priorityInfo.priority = {
//       id: host.priority_id,
//       name: host.Priority?.name || "Unknown", // Значение по умолчанию
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
//     // ИСКЛЮЧАЕМ whois данные и comment
//   };
// };

// // Универсальная функция сортировки по приоритету
// const sortItemsByPriority = (items) => {
//   return items.sort((a, b) => {
//     // Сначала сортируем по приоритету (DESC)
//     const priorityA = a.priority_info?.priority?.id || 0;
//     const priorityB = b.priority_info?.priority?.id || 0;

//     if (priorityB !== priorityA) {
//       return priorityB - priorityA;
//     }

//     // Если приоритеты одинаковые, сортируем по дате обновления
//     if (a.updated_at && b.updated_at) {
//       return new Date(b.updated_at) - new Date(a.updated_at);
//     }
//     return 0;
//   });
// };

// /**
//  * Получение информации о конкретном порте с пагинацией
//  * Поддерживает поиск по числовому значению порта, по имени сервиса или по значениям вида "21 (ftp)"
//  */
// export const getPortInfo = async (req, res) => {
//   try {
//     const {
//       port: portQuery,
//       page = 1,
//       limit = 10,
//       o: portOpened,
//       f: portFiltered,
//     } = req.query;

  
//     // Проверка параметров пагинации
//     const pageNum = Math.max(1, parseInt(page) || 1);
//     const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
//     const offset = (pageNum - 1) * limitNum;

//     if (portQuery === undefined) {
//       return res.status(400).json({ error: "Параметр 'port' обязателен" });
//     }

//     // Обработка значений вида "21 (ftp)" - извлекаем число из скобок
//     let processedQuery = portQuery.trim();

//     // Проверяем формат "число (название)"
//     const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);

//     if (portWithNameMatch) {
//       // Если формат "21 (ftp)", используем только числовую часть
//       processedQuery = portWithNameMatch[1];
//     }

//     // Определяем, передано число или строка
//     const isNumeric = /^\d+$/.test(processedQuery);
//     let whereCondition;
//     let targetPortNumber = null;

//     if (isNumeric) {
//       const portNum = Number(processedQuery);
//       if (portNum < 1 || portNum > 65535) {
//         return res
//           .status(400)
//           .json({ error: "Порт должен быть числом от 1 до 65535" });
//       }
//       // Поиск по числовому значению порта
//       whereCondition = { port: portNum };
//       targetPortNumber = portNum;
//     } else {
//       // Поиск по имени сервиса (например, 'https', 'ftp')
//       const knownPort = await WellKnownPort.findOne({
//         where: {
//           name: { [Op.iLike]: processedQuery },
//         },
//       });

//       if (!knownPort) {
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

//       // Если порт найден в well_known_ports, ищем порты с таким значением
//       whereCondition = {
//         port: knownPort.port,
//       };
//       targetPortNumber = knownPort.port;
//     }

//     // Сначала получаем все IP-адреса, которые имеют указанный порт
//     const hostsWithPort = await Port.findAll({
//       where: whereCondition,
//       include: [
//         {
//           model: Host,
//           attributes: [
//             "id",
//             "ip",
//             "reachable",
//             "updated_at",
//             "priority_id",
//             "grouping_id",
//           ],
//         },
//       ],
//       attributes: [], // Не выбираем поля Port, только связи
//       distinct: true,
//       raw: false,
//     });

//     let whereClause = {};
    
//     if (portFiltered && portOpened) {
//       whereClause[Op.or] = [{ type: 'filtered' }, { type: 'open' }];
//     } else if (portFiltered) {
//       whereClause.type = 'filtered';
//     } else if (portOpened) {
//       whereClause.type = 'open';
//     }
//     console.log('portOpened', portOpened)
//     console.log('portFiltered', portFiltered)
//     console.log(whereClause)

//     // Получаем уникальные ID хостов
//     const hostIds = [...new Set(hostsWithPort.map((p) => p.Host.id))];

//     if (hostIds.length === 0) {
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

//     // Получаем общее количество записей для пагинации
//     const totalCount = hostIds.length;

//     // Теперь получаем полные данные для этих хостов (все порты, приоритеты, группировки)
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
//           where: whereClause,
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
//         // ИСКЛЮЧАЕМ PriorityComment
//       ],
//       where: {
//         id: { [Op.in]: hostIds },
//       },
//       order: [["priority_id", "DESC"]],
//       limit: limitNum,
//       offset: offset,
//     });
    

//     // Формируем результат в нужном формате
//     const items = hosts.map(formatHostData);

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

//     // Получаем имя порта для ответа
//     let portName = null;
//     if (targetPortNumber) {
//       const knownPort = await WellKnownPort.findOne({
//         where: { port: targetPortNumber },
//         attributes: ["name"],
//       });
//       portName = knownPort?.name || null;
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
//       port_info: {
//         port: targetPortNumber,
//         name: portName,
//       },
//     };

//     return res.json(response);
//   } catch (error) {
//     console.error("Ошибка в getPortInfo:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// // Вспомогательная функция для получения уникальных портов и хостов для конкретного порта
// async function getUniquePortsAndHosts(portQuery) {
//   // Обработка значений вида "21 (ftp)" - извлекаем число из скобок
//   let processedQuery = portQuery.trim();

//   // Проверяем формат "число (название)"
//   const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);

//   if (portWithNameMatch) {
//     // Если формат "21 (ftp)", используем только числовую часть
//     processedQuery = portWithNameMatch[1];
//   }

//   const isNumeric = /^\d+$/.test(processedQuery);
//   const portNumber = isNumeric ? Number(processedQuery) : null;

//   if (!isNumeric) {
//     throw new Error("Для группировки портов необходим числовой порт");
//   }

//   // Используем raw SQL для получения уникальных портов с подсчетом хостов
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
//       replacements: { port: portNumber },
//       type: sequelize.QueryTypes.SELECT,
//     }
//   );

//   const uniquePorts = rawUniquePortsResult.map((row) => ({
//     dataValues: {
//       port: row.port,
//       count: row.count,
//       "WellKnownPort.name": row.port_name,
//     },
//   }));

//   // Получаем ID хостов с указанным портом
//   const hostIdsResult = await sequelize.query(
//     `
//     SELECT DISTINCT h."id"
//     FROM "hosts" AS h
//     INNER JOIN "ports" AS p ON h."id" = p."host_id"
//     WHERE p."port" = :port
//   `,
//     {
//       replacements: { port: portNumber },
//       type: sequelize.QueryTypes.SELECT,
//     }
//   );

//   const hostIds = hostIdsResult.map((row) => row.id);

//   // Получаем полные данные для хостов через Sequelize
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
//     order: [
//       ["priority_id", "DESC"],
//       ["updated_at", "DESC"],
//     ],
//   });

//   return { uniquePorts, hosts };
// }

// // Вспомогательная функция для получения всех уникальных портов и хостов
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
//       "WellKnownPort.name": row.port_name,
//     },
//   }));

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
//     order: [
//       ["priority_id", "DESC"],
//       ["updated_at", "DESC"],
//     ],
//   });

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
//     const { page = 1, limit = 10, port: portQuery } = req.query;
//     const pageNum = Math.max(1, parseInt(page, 10));
//     const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));

//     let uniquePorts;
//     let hosts;

//     // Проверяем, есть ли фильтр по порту
//     if (portQuery !== undefined && portQuery !== "") {
//       // Обработка значений вида "21 (ftp)" - извлекаем число из скобок
//       let processedQuery = portQuery.trim();

//       // Проверяем формат "число (название)"
//       const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);

//       if (portWithNameMatch) {
//         // Если формат "21 (ftp)", используем только числовую часть
//         processedQuery = portWithNameMatch[1];
//       }

//       const isNumeric = /^\d+$/.test(processedQuery);

//       if (!isNumeric) {
//         return res.status(400).json({
//           error: "Для группировки портов необходим числовой порт",
//         });
//       }

//       const portNum = Number(processedQuery);
//       if (portNum < 1 || portNum > 65535) {
//         return res
//           .status(400)
//           .json({ error: "Порт должен быть числом от 1 до 65535" });
//       }

//       const result = await getUniquePortsAndHosts(processedQuery);
//       uniquePorts = result.uniquePorts;
//       hosts = result.hosts;
//     } else {
//       // Если фильтра нет, работаем как обычно
//       const result = await getAllUniquePortsAndHosts();
//       uniquePorts = result.uniquePorts;
//       hosts = result.hosts;
//     }

//     const totalCount = uniquePorts.length;

//     // Формируем карту отформатированных хостов для избежания дублирования
//     const formattedHostsMap = new Map();

//     hosts.forEach((host) => {
//       if (!formattedHostsMap.has(host.id)) {
//         formattedHostsMap.set(host.id, formatHostData(host));
//       }
//     });

//     // Группируем хосты по портам
//     const portGroups = {};

//     for (const portRecord of uniquePorts) {
//       const portNumber = portRecord.dataValues.port;
//       const portCount = portRecord.dataValues.count;

//       portGroups[portNumber] = {
//         port: parseInt(portNumber),
//         count: portCount,
//         name: portRecord.dataValues["WellKnownPort.name"] || null,
//         items: [],
//       };
//     }

//     // Группируем хосты по портам
//     for (const host of hosts) {
//       const formattedHost = formattedHostsMap.get(host.id);

//       if (formattedHost && host.Ports && Array.isArray(host.Ports)) {
//         for (const port of host.Ports) {
//           const portNumber = port.port;
//           if (portGroups[portNumber]) {
//             // Проверяем, что хост еще не добавлен в эту группу
//             const hostExists = portGroups[portNumber].items.some(
//               (item) => item.id === formattedHost.id
//             );
//             if (!hostExists) {
//               portGroups[portNumber].items.push(formattedHost);
//             }
//           }
//         }
//       }
//     }

//     // Сортируем хосты внутри каждой группы по приоритету
//     Object.values(portGroups).forEach((group) => {
//       sortItemsByPriority(group.items);
//     });

//     // Преобразуем в нужный формат и сортируем по возрастанию портов
//     let items = Object.values(portGroups)
//       .filter((group) => group.items.length > 0)
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
//     if (portQuery !== undefined && portQuery !== "") {
//       let processedQuery = portQuery.trim();
//       const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);
//       if (portWithNameMatch) {
//         processedQuery = portWithNameMatch[1];
//       }

//       const portNum = Number(processedQuery);
//       const filteredItems = items.filter((item) => item.port === portNum);

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
