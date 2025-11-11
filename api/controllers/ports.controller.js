// controllers/ports.controller.js
import { Sequelize } from "sequelize";
const { Op } = Sequelize;
import { Host, Port, WellKnownPort,sequelize } from "../models/index.js";

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

  return {
    ip: host.ip,
    country: null, // у вас нет поля country в hosts
    reachable: host.reachable,
    updated_at: host.updated_at
      ? host.updated_at.toISOString().replace("T", " ").substring(0, 19)
      : null,
    port_data: {
      open: openPorts,
      filtered: filteredPorts,
    },
    has_whois: false, // можно добавить, если нужно
    whois: { error: "Whois query failed" },
  };
};

/**
 * Получение информации о конкретном порте с пагинацией
 * Поддерживает поиск по числовому значению порта или по имени сервиса
 */
export const getPortInfo = async (req, res) => {
  try {
    const { port: portQuery, page = 1, limit = 10 } = req.query;

    // Проверка параметров пагинации
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10)); // Ограничение на 100 элементов
    const offset = (pageNum - 1) * limitNum;

    if (portQuery === undefined) {
      return res.status(400).json({ error: "Параметр 'port' обязателен" });
    }

    // Определяем, передано число или строка
    const isNumeric = /^\d+$/.test(portQuery);
    let whereCondition;

    if (isNumeric) {
      const portNum = Number(portQuery);
      if (portNum < 1 || portNum > 65535) {
        return res
          .status(400)
          .json({ error: "Порт должен быть числом от 1 до 65535" });
      }
      // Поиск по числовому значению порта
      whereCondition = { port: portNum };
    } else {
      // Поиск по имени сервиса (например, 'https')
      // Для поиска по имени сервиса нужно использовать join с WellKnownPort
      // и фильтровать по полю name
      // В данном случае мы будем искать порты, которые связаны с WellKnownPort.name
      // Для этого используем include и фильтр по имени
      // Используем вложенный запрос или специальный фильтр
      // Проверим, есть ли такой порт в таблице well_known_ports
      const knownPort = await WellKnownPort.findOne({
        where: {
          name: { [Op.iLike]: portQuery }
        }
      });

      if (!knownPort) {
        return res.status(404).json({
          message: "Нет данных соответствующих поиску",
          items: [],
        });
      }

      // Если порт найден в well_known_ports, ищем порты с таким значением
      whereCondition = {
        port: knownPort.port
      };
    }

    // Сначала получаем все IP-адреса, которые имеют указанный порт
    // Используем include для связи с WellKnownPort, если нужно
    const hostsWithPort = await Port.findAll({
      where: whereCondition,
      include: [
        {
          model: Host,
          attributes: ["ip", "reachable", "updated_at"],
        },
        // Включаем WellKnownPort, чтобы получить имя сервиса
        {
          model: WellKnownPort,
          attributes: ["name"],
          required: false // Не обязательно, чтобы не исключать порты без имени
        }
      ],
      attributes: [], // Не выбираем поля Port, только связи
      distinct: true, // Убираем дубликаты
      raw: false,
    });

    // Получаем уникальные IP-адреса
    const ipAddresses = hostsWithPort.map((p) => p.Host.ip);

    if (ipAddresses.length === 0) {
      return res.status(404).json({
        message: "Нет данных соответствующих поиску",
        items: [],
      });
    }

    // Получаем общее количество записей для пагинации
    const totalCount = ipAddresses.length;

    // Теперь получаем все порты для этих IP-адресов (все данные по IP)
    const allPortsForHosts = await Host.findAll({
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
      ],
      where: {
        ip: { [Op.in]: ipAddresses },
      },
      order: [["updated_at", "DESC"]],
      limit: limitNum,
      offset: offset,
    });

    // Формируем результат в нужном формате
    const items = allPortsForHosts.map(formatHostData);

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
      field: "port",
    };

    return res.json(response);
  } catch (error) {
    console.error("Ошибка в getPortInfo:", error);
    return res
      .status(500)
      .json({ error: "Нет результатов удовлетворяющих поиску" });
  }
};

// Вспомогательная функция для получения уникальных портов и хостов
async function getUniquePortsAndHosts(portQuery, isNumeric, whereCondition, req, res) {
  let uniquePorts;
  let hosts;

  // Используем raw SQL для избежания неоднозначности
  // Сначала получаем уникальные порты с подсчетом хостов и именем порта
  const rawUniquePortsResult = await sequelize.query(`
    SELECT DISTINCT p."port", COUNT(DISTINCT h."id") as "count", w."name" as "port_name"
    FROM "ports" AS p
    INNER JOIN "hosts" AS h ON p."host_id" = h."id"
    LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
    WHERE p."port" = :port
    GROUP BY p."port", w."name"
    ORDER BY p."port" ASC
  `, {
    replacements: { port: isNumeric ? Number(portQuery) : null },
    type: sequelize.QueryTypes.SELECT
  });

  // Для числового порта используем результат первого запроса
  uniquePorts = rawUniquePortsResult.map(row => ({
    dataValues: {
      port: row.port,
      count: row.count,
      'WellKnownPort.name': row.port_name // Используем имя порта из запроса
    }
  }));

  // Теперь получаем хосты с портами для конкретного порта
  // Используем raw SQL для точного контроля
  const rawHostsResult = await sequelize.query(`
    SELECT h."id", h."ip", h."reachable", h."updated_at",
           p."port", p."type",
           w."name" as "WellKnownPort.name"
    FROM "hosts" AS h
    INNER JOIN "ports" AS p ON h."id" = p."host_id"
    LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
    WHERE p."port" = :port
    ORDER BY h."updated_at" DESC
  `, {
    replacements: { port: Number(portQuery) },
    type: sequelize.QueryTypes.SELECT
  });

  // Преобразуем результат в структуру, аналогичную той, что ожидается
  hosts = rawHostsResult.map(row => ({
    id: row.id,
    ip: row.ip,
    reachable: row.reachable,
    updated_at: row.updated_at,
    Ports: [{
      port: row.port,
      type: row.type,
      WellKnownPort: row['WellKnownPort.name'] ? { name: row['WellKnownPort.name'] } : null
    }]
  }));

  return { uniquePorts, hosts };
}

// Вспомогательная функция для получения уникальных портов и хостов без фильтрации по порту
async function getAllUniquePortsAndHosts() {
  // Используем raw SQL для получения уникальных портов
  const rawUniquePortsResult = await sequelize.query(`
    SELECT DISTINCT p."port", COUNT(DISTINCT h."id") as "count", w."name" as "port_name"
    FROM "ports" AS p
    INNER JOIN "hosts" AS h ON p."host_id" = h."id"
    LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
    GROUP BY p."port", w."name"
    ORDER BY p."port" ASC
  `, {
    type: sequelize.QueryTypes.SELECT
  });

  const uniquePorts = rawUniquePortsResult.map(row => ({
    dataValues: {
      port: row.port,
      count: row.count,
      'WellKnownPort.name': row.port_name // Используем имя порта из запроса
    }
  }));

  // Получаем хосты с портами и именами сервисов
  const rawHostsResult = await sequelize.query(`
    SELECT h."id", h."ip", h."reachable", h."updated_at",
           p."port", p."type",
           w."name" as "WellKnownPort.name"
    FROM "hosts" AS h
    INNER JOIN "ports" AS p ON h."id" = p."host_id"
    LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
    ORDER BY h."updated_at" DESC
  `, {
    type: sequelize.QueryTypes.SELECT
  });

  // Преобразуем результат в структуру, аналогичную той, что ожидается
  const hosts = rawHostsResult.map(row => ({
    id: row.id,
    ip: row.ip,
    reachable: row.reachable,
    updated_at: row.updated_at,
    Ports: [{
      port: row.port,
      type: row.type,
      WellKnownPort: row['WellKnownPort.name'] ? { name: row['WellKnownPort.name'] } : null
    }]
  }));

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
    const { page = 1, limit = 3, port: portQuery } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10))); // Ограничение на 100 элементов

    let uniquePorts;
    let hosts;

    // Проверяем, есть ли фильтр по порту
    if (portQuery !== undefined) {
      // Если указан конкретный порт, фильтруем данные
      const isNumeric = /^\d+$/.test(portQuery);
      let whereCondition;

      if (isNumeric) {
        const portNum = Number(portQuery);
        if (portNum < 1 || portNum > 65535) {
          return res
            .status(400)
            .json({ error: "Порт должен быть числом от 1 до 65535" });
        }
        whereCondition = { port: portNum };
      } else {
        // Поиск по имени сервиса (например, 'https')
        whereCondition = {
          "$WellKnownPort.name$": { [Sequelize.Op.iLike]: `%${portQuery}%` },
        };
      }

      // Получаем уникальные порты и хосты для конкретного порта
      const result = await getUniquePortsAndHosts(portQuery, isNumeric, whereCondition, req, res);
      uniquePorts = result.uniquePorts;
      hosts = result.hosts;

    } else {
      // Если фильтра нет, работаем как обычно
      const result = await getAllUniquePortsAndHosts();
      uniquePorts = result.uniquePorts;
      hosts = result.hosts;
    }

    const totalCount = uniquePorts.length;

    // Формируем карту хостов для быстрого доступа
    const hostMap = {};
    hosts.forEach((host) => {
      // Создаем объект хоста в формате, как в formatHostData
      // (Нужно быть аккуратным, т.к. у нас нет всех данных, но мы можем создать нужный формат)
      // Так как у нас уже есть форматированные данные в rawHostsResult, используем их
      // Но для формирования hostMap используем только IP
      if (!hostMap[host.ip]) {
        hostMap[host.ip] = formatHostData(host); // Форматируем данные хоста
      }
    });

    // Группируем хосты по портам и добавляем имена портов
    const portGroups = {};

    for (const portRecord of uniquePorts) {
      const portNumber = portRecord.dataValues.port;
      const portCount = portRecord.dataValues.count;

      // Инициализируем группу для порта с полем name из WellKnownPort
      portGroups[portNumber] = {
        port: parseInt(portNumber),
        count: portCount,
        items: [],
      };

      // Теперь используем имя порта, которое мы получили из БД
      portGroups[portNumber].name = portRecord.dataValues['WellKnownPort.name'] || null;
    }

    // Теперь проходим по всем хостам и группируем их по портам
    // Используем данные из hosts, которые уже содержат всю информацию
    for (const host of hosts) {
      const formattedHostData = formatHostData(host);
      for (const port of host.Ports) {
        const portNumber = port.port;
        if (portGroups[portNumber]) {
          // Добавляем хост в группу по номеру порта
          portGroups[portNumber].items.push(formattedHostData);
        }
      }
    }

    // Преобразуем в нужный формат и сортируем по возрастанию портов
    let items = Object.values(portGroups)
      .filter((group) => group.items.length > 0) // Убираем пустые группы
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
    if (portQuery !== undefined) {
      // Фильтруем по указанному порту
      const filteredItems = items.filter(item => item.port === parseInt(portQuery));
      // Для одного порта, если он есть, то возвращаем его
      if (filteredItems.length > 0) {
        items = filteredItems;
      } else {
        // Если ничего не найдено для этого порта
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

    const response = buildResponse(items, pageNum, totalPages, totalCount, "group", "port");

    return res.json(response);
  } catch (error) {
    console.error("Ошибка в groupPort:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

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

//       // Используем raw SQL для избежания неоднозначности
//       // Сначала получаем уникальные порты с подсчетом хостов и именем порта
//       const rawUniquePortsResult = await sequelize.query(`
//         SELECT DISTINCT p."port", COUNT(DISTINCT h."id") as "count", w."name" as "port_name"
//         FROM "ports" AS p
//         INNER JOIN "hosts" AS h ON p."host_id" = h."id"
//         LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
//         WHERE p."port" = :port
//         GROUP BY p."port", w."name"
//         ORDER BY p."port" ASC
//       `, {
//         replacements: { port: isNumeric ? Number(portQuery) : null },
//         type: sequelize.QueryTypes.SELECT
//       });

//       // Если фильтр по имени, то нужно другой подход
//       if (!isNumeric) {
//         // Получаем уникальные порты по имени сервиса
//         const rawUniquePortsByNameResult = await sequelize.query(`
//           SELECT DISTINCT p."port", COUNT(DISTINCT h."id") as "count", w."name" as "port_name"
//           FROM "ports" AS p
//           INNER JOIN "hosts" AS h ON p."host_id" = h."id"
//           INNER JOIN "well_known_ports" AS w ON p."port" = w."port"
//           WHERE LOWER(w."name") LIKE LOWER(:name)
//           GROUP BY p."port", w."name"
//           ORDER BY p."port" ASC
//         `, {
//           replacements: { name: `%${portQuery}%` },
//           type: sequelize.QueryTypes.SELECT
//         });

//         uniquePorts = rawUniquePortsByNameResult.map(row => ({
//           dataValues: {
//             port: row.port,
//             count: row.count,
//             'WellKnownPort.name': row.port_name // Используем имя порта из запроса
//           }
//         }));
//       } else {
//         // Для числового порта используем результат первого запроса
//         uniquePorts = rawUniquePortsResult.map(row => ({
//           dataValues: {
//             port: row.port,
//             count: row.count,
//             'WellKnownPort.name': row.port_name // Используем имя порта из запроса
//           }
//         }));
//       }

//       // Теперь получаем хосты с портами для конкретного порта
//       // Используем raw SQL для точного контроля
//       const rawHostsResult = await sequelize.query(`
//         SELECT h."id", h."ip", h."reachable", h."updated_at",
//                p."port", p."type",
//                w."name" as "WellKnownPort.name"
//         FROM "hosts" AS h
//         INNER JOIN "ports" AS p ON h."id" = p."host_id"
//         LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
//         WHERE p."port" = :port
//         ORDER BY h."updated_at" DESC
//       `, {
//         replacements: { port: Number(portQuery) },
//         type: sequelize.QueryTypes.SELECT
//       });

//       // Преобразуем результат в структуру, аналогичную той, что ожидается
//       hosts = rawHostsResult.map(row => ({
//         id: row.id,
//         ip: row.ip,
//         reachable: row.reachable,
//         updated_at: row.updated_at,
//         Ports: [{
//           port: row.port,
//           type: row.type,
//           WellKnownPort: row['WellKnownPort.name'] ? { name: row['WellKnownPort.name'] } : null
//         }]
//       }));

//     } else {
//       // Если фильтра нет, работаем как обычно

//       // Используем raw SQL для получения уникальных портов
//       const rawUniquePortsResult = await sequelize.query(`
//         SELECT DISTINCT p."port", COUNT(DISTINCT h."id") as "count", w."name" as "port_name"
//         FROM "ports" AS p
//         INNER JOIN "hosts" AS h ON p."host_id" = h."id"
//         LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
//         GROUP BY p."port", w."name"
//         ORDER BY p."port" ASC
//       `, {
//         type: sequelize.QueryTypes.SELECT
//       });

//       uniquePorts = rawUniquePortsResult.map(row => ({
//         dataValues: {
//           port: row.port,
//           count: row.count,
//           'WellKnownPort.name': row.port_name // Используем имя порта из запроса
//         }
//       }));

//       // Получаем хосты с портами и именами сервисов
//       const rawHostsResult = await sequelize.query(`
//         SELECT h."id", h."ip", h."reachable", h."updated_at",
//                p."port", p."type",
//                w."name" as "WellKnownPort.name"
//         FROM "hosts" AS h
//         INNER JOIN "ports" AS p ON h."id" = p."host_id"
//         LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
//         ORDER BY h."updated_at" DESC
//       `, {
//         type: sequelize.QueryTypes.SELECT
//       });

//       // Преобразуем результат в структуру, аналогичную той, что ожидается
//       hosts = rawHostsResult.map(row => ({
//         id: row.id,
//         ip: row.ip,
//         reachable: row.reachable,
//         updated_at: row.updated_at,
//         Ports: [{
//           port: row.port,
//           type: row.type,
//           WellKnownPort: row['WellKnownPort.name'] ? { name: row['WellKnownPort.name'] } : null
//         }]
//       }));
//     }

//     const totalCount = uniquePorts.length;

//     // Формируем карту хостов для быстрого доступа
//     const hostMap = {};
//     hosts.forEach((host) => {
//       // Создаем объект хоста в формате, как в formatHostData
//       // (Нужно быть аккуратным, т.к. у нас нет всех данных, но мы можем создать нужный формат)
//       // Так как у нас уже есть форматированные данные в rawHostsResult, используем их
//       // Но для формирования hostMap используем только IP
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
//       portGroups[portNumber].name = portRecord.dataValues['WellKnownPort.name'] || null;
//     }

//     // Теперь проходим по всем хостам и группируем их по портам
//     // Используем данные из hosts, которые уже содержат всю информацию
//     for (const host of hosts) {
//       const formattedHostData = formatHostData(host);
//       for (const port of host.Ports) {
//         const portNumber = port.port;
//         if (portGroups[portNumber]) {
//           // Добавляем хост в группу по номеру порта
//           portGroups[portNumber].items.push(formattedHostData);
//         }
//       }
//     }

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
//       const filteredItems = items.filter(item => item.port === parseInt(portQuery));
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

//     const response = {
//       items: items,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalItems: totalCount,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },
//       type: "group",
//       field: "port",
//     };

//     return res.json(response);
//   } catch (error) {
//     console.error("Ошибка в groupPort:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// РАБОЧИЙ КОД
// Новый обработчик для GET /ports/group с пагинацией
// export const groupPort = async (req, res) => {
//   try {
//     const { page = 1, limit = 10 } = req.query;
//     // Проверка параметров пагинации
//     const pageNum = Math.max(1, parseInt(page) || 1);
//     const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10)); // Ограничение на 100 элементов
//     const offset = (pageNum - 1) * limitNum;

//     // Получаем все уникальные порты из таблицы Port с количеством хостов для каждого порта
//     const uniquePorts = await Port.findAll({
//       attributes: [
//         [Sequelize.fn("DISTINCT", Sequelize.col("port")), "port"],
//         [Sequelize.fn("COUNT", Sequelize.col("Host.ip")), "count"], // Подсчет уникальных IP-адресов для каждого порта
//       ],
//       include: [
//         {
//           model: Host,
//           attributes: [],
//           required: true, // Убеждаемся, что у нас есть связанные хосты
//         },
//       ],
//       group: ["port"],
//       order: [["port", "ASC"]], // Сортировка по возрастанию портов
//     });

//     // Получаем общее количество уникальных портов
//     const totalCount = uniquePorts.length;

//     // Ограничиваем порты для пагинации
//     const paginatedUniquePorts = uniquePorts.slice(offset, offset + limitNum);

//     // Получаем все хосты с портами и названиями из WellKnownPort для формирования данных
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
//       ],
//       order: [["updated_at", "DESC"]],
//     });

//     // Формируем маппинг хостов по IP для быстрого доступа
//     const hostMap = {};
//     hosts.forEach((host) => {
//       hostMap[host.ip] = formatHostData(host);
//     });

//     // Группируем хосты по портам и названиям
//     const portGroups = {};

//     for (const portRecord of paginatedUniquePorts) {
//       const portNumber = portRecord.dataValues.port;
//       const portCount = portRecord.dataValues.count;

//       // Инициализируем группу для порта с полем name из WellKnownPort
//       portGroups[portNumber] = {
//         port: parseInt(portNumber),
//         count: portCount,
//         items: [],
//       };

//       // Добавляем имя порта из WellKnownPort, если оно существует
//       const wellKnownPortNames = hosts
//         .filter(host => host.Ports.some(p => p.port === portNumber))
//         .map(host => host.Ports.find(port => port.port === portNumber)?.WellKnownPort?.name || null)
//         .filter(name => name !== null);

//       if (wellKnownPortNames.length > 0) {
//         portGroups[portNumber].name = wellKnownPortNames[0]; // Берем первое уникальное имя
//       }
//     }

//     // Теперь проходим по всем хостам и группируем их по портам
//     for (const host of hosts) {
//       const formattedHostData = formatHostData(host);
//       for (const port of host.Ports) {
//         const portNumber = port.port;
//         if (portGroups[portNumber]) {
//           // Добавляем хост в группу порта
//           portGroups[portNumber].items.push(formattedHostData);
//         }
//       }
//     }

//     // Преобразуем в нужный формат и сортируем по возрастанию портов
//     const items = Object.values(portGroups)
//       .filter(group => group.items.length > 0) // Убираем пустые группы
//       .sort((a, b) => a.port - b.port);

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
//       type: "group",
//       field: "port",
//     };
//     return res.json(response);
//   } catch (error) {
//     console.error("Ошибка в groupPort:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// Рабочий код без пагинации (но не работает поиск по названию порта)
// // controllers/ports.controller.js
// import { Sequelize } from "sequelize";
// const { Op } = Sequelize;
// import { Host, Port, WellKnownPort } from "../models/index.js";

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

//   return {
//     ip: host.ip,
//     country: null, // у вас нет поля country в hosts
//     reachable: host.reachable,
//     updated_at: host.updated_at
//       ? host.updated_at.toISOString().replace("T", " ").substring(0, 19)
//       : null,
//     port_data: {
//       open: openPorts,
//       filtered: filteredPorts,
//     },
//     has_whois: false, // можно добавить, если нужно
//     whois: { error: "Whois query failed" },
//   };
// };

// export const getPortInfo = async (req, res) => {
//   try {
//     const { port: portQuery } = req.query;
//     console.log(req.query);

//     if (portQuery === undefined) {
//       return res.status(400).json({ error: "Параметр 'port' обязателен" });
//     }

//     // Определяем, передано число или строка
//     const isNumeric = /^\d+$/.test(portQuery);
//     let whereCondition;

//     if (isNumeric) {
//       const portNum = Number(portQuery);
//       if (portNum < 1 || portNum > 65535) {
//         return res
//           .status(400)
//           .json({ error: "Порт должен быть числом от 1 до 65535" });
//       }
//       whereCondition = { port: portNum };
//     } else {
//       // Поиск по имени сервиса (например, 'https')
//       whereCondition = {
//         "$WellKnownPort.name$": { [Sequelize.Op.iLike]: `%${portQuery}%` },
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
//       ],
//       where: {
//         ip: { [Op.in]: ipAddresses },
//       },
//       order: [["updated_at", "DESC"]],
//     });

//     // Формируем результат в нужном формате
//     const items = allPortsForHosts.map(formatHostData);

//     if (!items.length) {
//       return res.status(404).json({
//         message: "Нет данных соответствующих поиску",
//         items: [],
//       });
//     }
//     return res.json({ items, type: "search" });
//   } catch (error) {
//     console.error("Ошибка в getPortInfo:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// // Новый обработчик для GET /ports/group
// export const groupPort = async (req, res) => {
//   try {
//     // Получаем все уникальные порты из таблицы Port
//     const uniquePorts = await Port.findAll({
//       attributes: [
//         [Sequelize.fn("DISTINCT", Sequelize.col("port")), "port"],
//         [Sequelize.fn("COUNT", Sequelize.col("port")), "count"],
//       ],
//       group: ["port"],
//       order: [["port", "ASC"]], // Сортировка по возрастанию портов
//     });

//     // Получаем все хосты с портами для формирования данных
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
//       ],
//       order: [["updated_at", "DESC"]],
//     });

//     // Формируем маппинг хостов по IP для быстрого доступа
//     const hostMap = {};
//     hosts.forEach((host) => {
//       hostMap[host.ip] = formatHostData(host);
//     });

//     // Группируем хосты по портам
//     const portGroups = {};

//     // Проходим по всем портам и собираем хосты для каждого порта
//     for (const portRecord of uniquePorts) {
//       const portNumber = portRecord.dataValues.port;
//       portGroups[portNumber] = [];
//     }

//     // Теперь проходим по всем портам хостов и группируем их
//     for (const host of hosts) {
//       for (const port of host.Ports) {
//         const portNumber = port.port;
//         if (portGroups[portNumber]) {
//           // Добавляем хост в группу порта
//           portGroups[portNumber].push(hostMap[host.ip]);
//         }
//       }
//     }

//     // Преобразуем в нужный формат
//     const items = Object.entries(portGroups)
//       .filter(([_, hosts]) => hosts.length > 0) // Убираем пустые группы
//       .map(([port, hosts]) => ({
//         port: parseInt(port),
//         items: hosts,
//       }))
//       .sort((a, b) => a.port - b.port); // Сортируем по возрастанию портов

//     if (!items.length) {
//       return res.status(404).json({
//         message: "Нет данных соответствующих поиску",
//         items: [],
//       });
//     }

//     return res.json({ items, type: "group", group_field: "port" });
//   } catch (error) {
//     console.error("Ошибка в groupPort:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// код с пагинацией
/*
// controllers/ports.controller.js
import { Sequelize } from "sequelize";
const { Op } = Sequelize;
import { Host, Port, WellKnownPort } from "../models/index.js";

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

  return {
    ip: host.ip,
    country: null, // у вас нет поля country в hosts
    reachable: host.reachable,
    updated_at: host.updated_at
      ? host.updated_at.toISOString().replace("T", " ").substring(0, 19)
      : null,
    port_ {
      open: openPorts,
      filtered: filteredPorts,
    },
    has_whois: false, // можно добавить, если нужно
    whois: { error: "Whois query failed" },
  };
};

export const getPortInfo = async (req, res) => {
  try {
    const { port: portQuery } = req.query;

    if (portQuery === undefined) {
      return res.status(400).json({ error: "Параметр 'port' обязателен" });
    }

    // Определяем, передано число или строка
    const isNumeric = /^\d+$/.test(portQuery);
    let whereCondition;

    if (isNumeric) {
      const portNum = Number(portQuery);
      if (portNum < 1 || portNum > 65535) {
        return res
          .status(400)
          .json({ error: "Порт должен быть числом от 1 до 65535" });
      }
      whereCondition = { port: portNum };
    } else {
      // Поиск по имени сервиса (например, 'https')
      whereCondition = {
        "$WellKnownPort.name$": { [Sequelize.Op.iLike]: `%${portQuery}%` },
      };
    }

    // Сначала получаем все IP-адреса, которые имеют указанный порт
    const hostsWithPort = await Port.findAll({
      where: whereCondition,
      include: [{
        model: Host,
        attributes: ["ip", "reachable", "updated_at"],
      }],
      attributes: [], // Не выбираем поля Port, только связи
      distinct: true, // Убираем дубликаты
      raw: false,
    });

    // Получаем уникальные IP-адреса
    const ipAddresses = hostsWithPort.map(p => p.Host.ip);

    if (ipAddresses.length === 0) {
      return res.status(404).json({
        message: "Нет данных соответствующих поиску",
        items: [],
      });
    }

    // Теперь получаем все порты для этих IP-адресов (все данные по IP)
    const allPortsForHosts = await Host.findAll({
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
      ],
      where: {
        ip: { [Op.in]: ipAddresses }
      },
      order: [["updated_at", "DESC"]],
    });

    // Формируем результат в нужном формате
    const items = allPortsForHosts.map(formatHostData);

    if (!items.length) {
      return res.status(404).json({
        message: "Нет данных соответствующих поиску",
        items: [],
      });
    }
    return res.json({ items });
  } catch (error) {
    console.error("Ошибка в getPortInfo:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// Новый обработчик для GET /ports/group с пагинацией
export const groupPort = async (req, res) => {
  try {
    // Пагинация
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 5;
    const offset = (page - 1) * limit;

    // Получаем все уникальные порты из таблицы Port
    const uniquePorts = await Port.findAll({
      attributes: [
        [Sequelize.fn('DISTINCT', Sequelize.col('port')), 'port'],
        [Sequelize.fn('COUNT', Sequelize.col('port')), 'count']
      ],
      group: ['port'],
      order: [['port', 'ASC']], // Сортировка по возрастанию портов
    });

    // Получаем все хосты с портами для формирования данных
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
      ],
      order: [["updated_at", "DESC"]],
    });

    // Формируем маппинг хостов по IP для быстрого доступа
    const hostMap = {};
    hosts.forEach(host => {
      hostMap[host.ip] = formatHostData(host);
    });

    // Группируем хосты по портам
    const portGroups = {};

    // Проходим по всем портам и собираем хосты для каждого порта
    for (const portRecord of uniquePorts) {
      const portNumber = portRecord.dataValues.port;
      portGroups[portNumber] = [];
    }

    // Теперь проходим по всем портам хостов и группируем их
    for (const host of hosts) {
      for (const port of host.Ports) {
        const portNumber = port.port;
        if (portGroups[portNumber]) {
          // Добавляем хост в группу порта
          portGroups[portNumber].push(hostMap[host.ip]);
        }
      }
    }

    // Преобразуем в нужный формат с пагинацией
    const items = Object.entries(portGroups)
      .filter(([_, hosts]) => hosts.length > 0) // Убираем пустые группы
      .map(([port, hosts]) => {
        // Пагинация для каждого порта
        const paginatedHosts = hosts.slice(offset, offset + limit);
        return {
          port: parseInt(port),
          items: paginatedHosts,
          pagination: {
            currentPage: page,
            totalPages: Math.ceil(hosts.length / limit),
            totalItems: hosts.length,
            hasNext: page < Math.ceil(hosts.length / limit),
            hasPrev: page > 1
          }
        };
      })
      .sort((a, b) => a.port - b.port); // Сортируем по возрастанию портов

    if (!items.length) {
      return res.status(404).json({
        message: "Нет данных соответствующих поиску",
        items: [],
      });
    }
    
    return res.json({ items });
  } catch (error) {
    console.error("Ошибка в groupPort:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};
*/

// РАбочий код simple
// // controllers/ports.controller.js
// import { Sequelize } from "sequelize";
// const { Op } = Sequelize;
// import { Host, Port, WellKnownPort } from "../models/index.js";

// export const getPortInfo = async (req, res) => {
//   try {
//     const { port: portQuery } = req.query;

//     if (portQuery === undefined) {
//       return res.status(400).json({ error: "Параметр 'port' обязателен" });
//     }

//     // Определяем, передано число или строка
//     const isNumeric = /^\d+$/.test(portQuery);
//     let whereCondition;

//     if (isNumeric) {
//       const portNum = Number(portQuery);
//       if (portNum < 1 || portNum > 65535) {
//         return res
//           .status(400)
//           .json({ error: "Порт должен быть числом от 1 до 65535" });
//       }
//       whereCondition = { port: portNum };
//     } else {
//       // Поиск по имени сервиса (например, 'https')
//       whereCondition = {
//         // '$WellKnownPort.name$': { [Sequelize.Op.iLike]: portQuery }, ?port=http
//         "$WellKnownPort.name$": { [Sequelize.Op.iLike]: `%${portQuery}%` }, //?port=ht
//       };
//     }

//     // Запрос с JOIN
//     const ports = await Port.findAll({
//       where: whereCondition,
//       include: [
//         {
//           model: Host,
//           attributes: ["ip", "reachable", "updated_at"],
//         },
//         {
//           model: WellKnownPort,
//           attributes: ["name"],
//         },
//       ],
//       order: [["Host", "updated_at", "DESC"]],
//     });

//     // Формируем результат в нужном формате
//     const items = ports.map((port) => ({
//       ip: port.Host.ip,
//       country: null, // у вас нет поля country в hosts
//       reachable: port.Host.reachable,
//       updated_at: port.Host.updated_at
//         ? port.Host.updated_at.toISOString().replace("T", " ").substring(0, 19)
//         : null,
//       port: {
//         open: port.type === "open" ? [port.port] : [],
//         filtered: port.type === "filtered" ? [port.port] : [],
//       },
//       has_whois: false, // можно добавить, если нужно
//       whois: { error: "Whois query failed" },
//     }));

//     if (!items.length) {
//       return res.status(404).json({
//         message: "Нет данных соответствующих поиску",
//         items: [],
//       });
//     }
//     return res.json({ items });
//   } catch (error) {
//     console.error("Ошибка в getPortInfo:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// // Для /ports/group — пока можно использовать тот же обработчик
// export const groupPort = getPortInfo;
