// controllers/ip.controller.js
import { isIP } from "net";
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

// Улучшенная функция для получения данных хоста с приоритетами (без WHOIS и комментариев)
const getHostWithPriorityInfo = async (host) => {
  const openPorts = [];
  const filteredPorts = [];

  // Используем Set для отслеживания уникальных портов
  const openPortsSet = new Set();
  const filteredPortsSet = new Set();

  // Обрабатываем все порты хоста
  host.Ports.forEach((port) => {
    const portInfo = {
      port: port.port,
      name: port.WellKnownPort?.name || null,
    };

    // Добавляем порт только если его еще нет в соответствующем списке
    if (port.type === "open" && !openPortsSet.has(port.port)) {
      openPorts.push(portInfo);
      openPortsSet.add(port.port);
    } else if (port.type === "filtered" && !filteredPortsSet.has(port.port)) {
      filteredPorts.push(portInfo);
      filteredPortsSet.add(port.port);
    }
  });

  // Проверяем наличие WHOIS данных только для поля has_whois
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

export const getIpInfo = async (req, res) => {
  try {
    const { ip: ipQuery, page = 1, limit = 10 } = req.query;

    // Проверка параметров пагинации
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    if (ipQuery && !isIP(ipQuery) && !ipQuery.includes(".")) {
      return res.status(400).json({ error: "Некорректный IP-адрес" });
    }

    let whereCondition = {};
    if (ipQuery) {
      whereCondition = sequelize.where(
        sequelize.cast(sequelize.col("ip"), "TEXT"),
        "LIKE",
        `${ipQuery}%`
      );
    }

    // Получаем общее количество записей для пагинации
    const totalCount = await Host.count({
      where: whereCondition,
    });

    // Получаем хосты с полными данными (включая все порты, приоритеты, группировки)
    const hosts = await Host.findAll({
      where: whereCondition,
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
          model: Whois,
          attributes: ["value"],
          include: [
            {
              model: WhoisKey,
              attributes: ["key_name"],
              required: false,
            },
          ],
          required: false, // LEFT JOIN для определения has_whois
        },
        {
          model: Grouping,
          attributes: ["id", "name"],
          required: false,
        },
        {
          model: Priority,
          attributes: ["id", "name"],
          required: false,
        },
        // ИСКЛЮЧАЕМ PriorityComment
      ],
      order: [["priority_id", "DESC"]],
      limit: limitNum,
      offset: offset,
    });

    const items = await Promise.all(
      hosts.map((host) => getHostWithPriorityInfo(host))
    );

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

    // Добавляем информацию о пагинации
    const response = {
      items: items,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
    };

    if (ipQuery) {
      return res.json({ ...response, type: "search", field: "ip" });
    }

    return res.json({ ...response, type: "group", field: "ip" });
  } catch (error) {
    console.error("Ошибка в getIpInfo:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// Оптимизированная версия для быстрого поиска по IP
export const getIpInfoOptimized = async (req, res) => {
  try {
    const { ip: ipQuery, page = 1, limit = 10 } = req.query;

    // Проверка параметров пагинации
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    if (ipQuery && !isIP(ipQuery) && !ipQuery.includes(".")) {
      return res.status(400).json({ error: "Некорректный IP-адрес" });
    }

    // Используем raw SQL для максимальной производительности
    let whereClause = "";
    let replacements = { limit: limitNum, offset: offset };

    if (ipQuery) {
      whereClause = "WHERE CAST(h.ip AS TEXT) LIKE :ipPattern";
      replacements.ipPattern = `${ipQuery}%`;
    }

    const sqlQuery = `
      SELECT 
        h.id, h.ip, h.reachable, h.updated_at, h.priority_id, h.grouping_id,
        p.port, p.type,
        wkp.name as port_name,
        pr.name as priority_name,
        gr.name as grouping_name,
        EXISTS(SELECT 1 FROM whois wh WHERE wh.host_id = h.id) as has_whois
      FROM hosts h
      INNER JOIN ports p ON h.id = p.host_id
      LEFT JOIN well_known_ports wkp ON p.port = wkp.port
      LEFT JOIN host_priorities pr ON h.priority_id = pr.id
      LEFT JOIN host_groupings gr ON h.grouping_id = gr.id
      ${whereClause}
      ORDER BY 
        CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
        h.priority_id DESC,
        h.updated_at DESC
      LIMIT :limit OFFSET :offset
    `;

    const hostsResult = await sequelize.query(sqlQuery, {
      replacements,
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

    // Группируем результаты по хостам, устраняя дубликаты портов
    const hostsMap = new Map();
    const hostPortsMap = new Map();

    hostsResult.forEach((row) => {
      if (!hostsMap.has(row.id)) {
        hostsMap.set(row.id, {
          id: row.id,
          ip: row.ip,
          reachable: row.reachable,
          updated_at: row.updated_at,
          priority_id: row.priority_id,
          grouping_id: row.grouping_id,
          Priority: row.priority_name ? { name: row.priority_name } : null,
          Grouping: row.grouping_name ? { name: row.grouping_name } : null,
          Ports: [],
          Whois: row.has_whois ? [{ value: "" }] : [],
        });
        hostPortsMap.set(row.id, new Set());
      }

      const host = hostsMap.get(row.id);
      const portSet = hostPortsMap.get(row.id);

      // Добавляем порт только если его еще нет у этого хоста
      if (!portSet.has(row.port)) {
        host.Ports.push({
          port: row.port,
          type: row.type,
          WellKnownPort: row.port_name ? { name: row.port_name } : null,
        });
        portSet.add(row.port);
      }
    });

    const hosts = Array.from(hostsMap.values());
    const items = hosts.map((host) => {
      // Используем упрощенную версию форматирования для производительности
      const openPorts = [];
      const filteredPorts = [];
      const openPortsSet = new Set();
      const filteredPortsSet = new Set();

      host.Ports.forEach((port) => {
        const portInfo = {
          port: port.port,
          name: port.WellKnownPort?.name || null,
        };

        if (port.type === "open" && !openPortsSet.has(port.port)) {
          openPorts.push(portInfo);
          openPortsSet.add(port.port);
        } else if (
          port.type === "filtered" &&
          !filteredPortsSet.has(port.port)
        ) {
          filteredPorts.push(portInfo);
          filteredPortsSet.add(port.port);
        }
      });

      const priorityInfo = {
        priority: null,
        grouping: null,
      };

      if (host.priority_id || host.Priority) {
        priorityInfo.priority = {
          id: host.priority_id,
          name: host.Priority?.name || "Unknown",
        };
      }

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
        updated_at: host.updated_at,
        port_data: {
          open: openPorts,
          filtered: filteredPorts,
        },
        priority_info: priorityInfo,
        has_whois: host.Whois.length > 0,
      };
    });

    // Получаем общее количество
    const countQuery = ipQuery
      ? `SELECT COUNT(*) as total FROM hosts WHERE CAST(ip AS TEXT) LIKE '${ipQuery}%'`
      : `SELECT COUNT(*) as total FROM hosts`;

    const countResult = await sequelize.query(countQuery, {
      type: sequelize.QueryTypes.SELECT,
    });

    const totalCount = parseInt(countResult[0].total);
    const totalPages = Math.ceil(totalCount / limitNum);

    const response = {
      items: items,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      type: ipQuery ? "search" : "group",
      field: "ip",
    };

    return res.json(response);
  } catch (error) {
    console.error("Ошибка в getIpInfoOptimized:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// // controllers/ip.controller.js
// import { isIP } from "net";
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

// // Улучшенная функция для получения данных хоста с приоритетами
// const getHostWithPriorityInfo = async (host) => {
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
//     priority_info: priorityInfo,
//   };
// };

// export const getIpInfo = async (req, res) => {
//   try {
//     const { ip: ipQuery, page = 1, limit = 10 } = req.query;

//     // Проверка параметров пагинации
//     const pageNum = Math.max(1, parseInt(page) || 1);
//     const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10)); // Ограничение на 100 элементов
//     const offset = (pageNum - 1) * limitNum;

//     console.log(req.query);

//     if (ipQuery && !isIP(ipQuery) && !ipQuery.includes(".")) {
//       return res.status(400).json({ error: "Некорректный IP-адрес" });
//     }

//     let whereCondition = {};
//     if (ipQuery) {
//       whereCondition = sequelize.where(
//         sequelize.cast(sequelize.col("ip"), "TEXT"),
//         "LIKE",
//         `${ipQuery}%`
//       );
//     }

//     // Получаем общее количество записей для пагинации
//     const totalCount = await Host.count({
//       where: whereCondition,
//     });

//     const hosts = await Host.findAll({
//       where: whereCondition,
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
//         // Включаем группировки
//         {
//           model: Grouping,
//           attributes: ["id", "name"],
//           required: false, // Это делает LEFT JOIN
//           // required: true,  // Это делает INNER JOIN
//         },
//         // Включаем приоритеты
//         {
//           model: Priority,
//           attributes: ["id", "name"],
//           required: false,
//         },
//       ],
//       order: [["priority_id", "DESC"]],
//       // order: [["updated_at", "DESC"]],
//       limit: limitNum,
//       offset: offset,
//     });

//     const items = await Promise.all(
//       hosts.map((host) => getHostWithPriorityInfo(host))
//     );

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

//     // Добавляем информацию о пагинации
//     const response = {
//       items: items,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalItems: totalCount,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },
//     };

//     if (ipQuery) {
//       return res.json({ ...response, type: "search", field: "ip" });
//     }

//     return res.json({ ...response, type: "group", field: "ip" });
//   } catch (error) {
//     console.error("Ошибка в getIpInfo:", error);
//     return res
//       .status(500)
//       .json({ error: "Нет результатов удовлетворяющих поиску" });
//   }
// };
