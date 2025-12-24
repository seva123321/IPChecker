
// Оптимизированный код
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

// Оптимизированная функция обработки хоста
const processHost = (host) => {
  const portData = {
    open: [],
    filtered: []
  };
  
  const openPortsSet = new Set();
  const filteredPortsSet = new Set();
  
  // Быстрая обработка портов без проверок излишних
  for (const port of host.Ports) {
    const portNum = port.port;
    const portType = port.type;
    
    if (portType === "open" && !openPortsSet.has(portNum)) {
      portData.open.push({
        port: portNum,
        name: port.WellKnownPort?.name || null
      });
      openPortsSet.add(portNum);
    } else if (portType === "filtered" && !filteredPortsSet.has(portNum)) {
      portData.filtered.push({
        port: portNum,
        name: port.WellKnownPort?.name || null
      });
      filteredPortsSet.add(portNum);
    }
  }
  
  const priorityInfo = {
    priority: host.priority_id ? {
      id: host.priority_id,
      name: host.Priority?.name || "Unknown"
    } : null,
    grouping: host.grouping_id ? {
      id: host.grouping_id,
      name: host.Grouping?.name || null
    } : null
  };
  
  return {
    id: host.id,
    ip: host.ip,
    reachable: host.reachable,
    updated_at: host.updated_at
      ? host.updated_at.toISOString().replace("T", " ").substring(0, 19)
      : null,
    port_data: portData,
    priority_info: priorityInfo,
    has_whois: !!(host.Whois && host.Whois.length > 0)
  };
};

// Основная оптимизированная функция
export const getIpInfo = async (req, res) => {
  try {
    const { ip: ipQuery, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    if (ipQuery && !isIP(ipQuery) && !ipQuery.includes(".")) {
      return res.status(400).json({ error: "Некорректный IP-адрес" });
    }

    // Оптимизация: получаем только необходимые данные за один запрос
    const [totalCount, hosts] = await Promise.all([
      // Счетчик с условием
      ipQuery 
        ? Host.count({
            where: sequelize.where(
              sequelize.cast(sequelize.col("ip"), "TEXT"),
              "LIKE",
              `${ipQuery}%`
            )
          })
        : Host.count(),
      
      // Основные данные с оптимизированными include
      Host.findAll({
        where: ipQuery ? sequelize.where(
          sequelize.cast(sequelize.col("ip"), "TEXT"),
          "LIKE",
          `${ipQuery}%`
        ) : undefined,
        include: [
          {
            model: Port,
            attributes: ["port", "type"],
            include: [{
              model: WellKnownPort,
              attributes: ["name"],
              required: false
            }],
            separate: true, // Отдельный запрос для портов (часто быстрее)
            order: [["port", "ASC"]]
          },
          {
            model: Whois,
            attributes: ["id"], // Только ID для проверки существования
            required: false,
            limit: 1 // Только один результат для проверки has_whois
          },
          {
            model: Priority,
            attributes: ["id", "name"],
            required: false
          },
          {
            model: Grouping,
            attributes: ["id", "name"],
            required: false
          }
        ],
        attributes: ["id", "ip", "reachable", "updated_at", "priority_id", "grouping_id"],
        order: [
          ["priority_id", "DESC"],
          ["updated_at", "DESC"]
        ],
        limit: limitNum,
        offset: offset,
        subQuery: false, // Улучшает производительность с limit/offset
      })
    ]);

    if (!hosts.length) {
      const totalPages = Math.ceil(totalCount / limitNum);
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

    // Параллельная обработка хостов
    const items = hosts.map(processHost);
    const totalPages = Math.ceil(totalCount / limitNum);

    const response = {
      items,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      type: ipQuery ? "search" : "group",
      field: "ip"
    };

    return res.json(response);
  } catch (error) {
    console.error("Ошибка в getIpInfo:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// Ультра-оптимизированная версия с сырыми запросами
export const getIpInfoOptimized = async (req, res) => {
  try {
    const { ip: ipQuery, page = 1, limit = 10 } = req.query;
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    if (ipQuery && !isIP(ipQuery) && !ipQuery.includes(".")) {
      return res.status(400).json({ error: "Некорректный IP-адрес" });
    }

    // Оптимизация: один запрос для всех данных с агрегацией на стороне БД
    const whereCondition = ipQuery 
      ? `WHERE ip::TEXT LIKE '${sequelize.escape(ipQuery)}%'`
      : '';

    // Используем оконные функции для получения уникальных портов и общей информации
    const sqlQuery = `
      WITH host_data AS (
        SELECT 
          h.id, h.ip, h.reachable, h.updated_at, 
          h.priority_id, h.grouping_id,
          pr.name as priority_name,
          gr.name as grouping_name,
          COUNT(DISTINCT CASE WHEN wh.id IS NOT NULL THEN 1 END) > 0 as has_whois
        FROM hosts h
        LEFT JOIN host_priorities pr ON h.priority_id = pr.id
        LEFT JOIN host_groupings gr ON h.grouping_id = gr.id
        LEFT JOIN whois wh ON h.id = wh.host_id
        ${whereCondition}
        GROUP BY h.id, h.ip, h.reachable, h.updated_at, 
                 h.priority_id, h.grouping_id, pr.name, gr.name
        ORDER BY 
          COALESCE(h.priority_id, 0) DESC,
          h.updated_at DESC
        LIMIT ${limitNum} OFFSET ${offset}
      ),
      port_data AS (
        SELECT 
          p.host_id,
          p.port,
          p.type,
          wkp.name as port_name,
          ROW_NUMBER() OVER (
            PARTITION BY p.host_id, p.port 
            ORDER BY p.type
          ) as rn
        FROM ports p
        JOIN host_data hd ON p.host_id = hd.id
        LEFT JOIN well_known_ports wkp ON p.port = wkp.port
        WHERE p.type IN ('open', 'filtered')
      )
      SELECT 
        hd.*,
        json_agg(
          DISTINCT jsonb_build_object(
            'port', pd.port,
            'type', pd.type,
            'WellKnownPort', CASE 
              WHEN pd.port_name IS NOT NULL 
              THEN jsonb_build_object('name', pd.port_name) 
              ELSE NULL 
            END
          )
        ) FILTER (WHERE pd.rn = 1) as ports
      FROM host_data hd
      LEFT JOIN port_data pd ON hd.id = pd.host_id AND pd.rn = 1
      GROUP BY hd.id, hd.ip, hd.reachable, hd.updated_at, 
               hd.priority_id, hd.grouping_id, 
               hd.priority_name, hd.grouping_name, hd.has_whois
      ORDER BY 
        COALESCE(hd.priority_id, 0) DESC,
        hd.updated_at DESC
    `;

    const hosts = await sequelize.query(sqlQuery, {
      type: sequelize.QueryTypes.SELECT,
    });

    if (!hosts.length) {
      const countQuery = `SELECT COUNT(*) as total FROM hosts ${whereCondition}`;
      const countResult = await sequelize.query(countQuery, {
        type: sequelize.QueryTypes.SELECT,
      });
      const totalCount = parseInt(countResult[0].total);
      
      return res.status(404).json({
        message: "Нет данных соответствующих поиску",
        items: [],
        pagination: {
          currentPage: pageNum,
          totalPages: Math.ceil(totalCount / limitNum),
          totalItems: totalCount,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    // Обработка результатов с готовой агрегацией
    const items = hosts.map(host => {
      const ports = host.ports || [];
      const portData = { open: [], filtered: [] };
      const portSets = { open: new Set(), filtered: new Set() };
      
      ports.forEach(port => {
        const portType = port.type;
        const portNum = port.port;
        const setName = portType === 'open' ? 'open' : 'filtered';
        
        if (!portSets[setName].has(portNum)) {
          portData[setName].push({
            port: portNum,
            name: port.WellKnownPort?.name || null
          });
          portSets[setName].add(portNum);
        }
      });
      
      return {
        id: host.id,
        ip: host.ip,
        reachable: host.reachable,
        updated_at: host.updated_at
          ? new Date(host.updated_at).toISOString().replace("T", " ").substring(0, 19)
          : null,
        port_data: portData,
        priority_info: {
          priority: host.priority_id ? {
            id: host.priority_id,
            name: host.priority_name || "Unknown"
          } : null,
          grouping: host.grouping_id ? {
            id: host.grouping_id,
            name: host.grouping_name || null
          } : null
        },
        has_whois: host.has_whois
      };
    });

    // Получаем общее количество (кешируем при необходимости)
    const countQuery = `SELECT COUNT(*) as total FROM hosts ${whereCondition}`;
    const countResult = await sequelize.query(countQuery, {
      type: sequelize.QueryTypes.SELECT,
    });
    
    const totalCount = parseInt(countResult[0].total);
    const totalPages = Math.ceil(totalCount / limitNum);

    const response = {
      items,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      type: ipQuery ? "search" : "group",
      field: "ip"
    };

    return res.json(response);
  } catch (error) {
    console.error("Ошибка в getIpInfoOptimized:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};
// Рабочий код
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

// // Улучшенная функция для получения данных хоста с приоритетами (без WHOIS и комментариев)
// const getHostWithPriorityInfo = async (host) => {
//   const openPorts = [];
//   const filteredPorts = [];

//   // Используем Set для отслеживания уникальных портов
//   const openPortsSet = new Set();
//   const filteredPortsSet = new Set();

//   // Обрабатываем все порты хоста
//   host.Ports.forEach((port) => {
//     const portInfo = {
//       port: port.port,
//       name: port.WellKnownPort?.name || null,
//     };

//     // Добавляем порт только если его еще нет в соответствующем списке
//     if (port.type === "open" && !openPortsSet.has(port.port)) {
//       openPorts.push(portInfo);
//       openPortsSet.add(port.port);
//     } else if (port.type === "filtered" && !filteredPortsSet.has(port.port)) {
//       filteredPorts.push(portInfo);
//       filteredPortsSet.add(port.port);
//     }
//   });

//   // Проверяем наличие WHOIS данных только для поля has_whois
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

// export const getIpInfo = async (req, res) => {
//   try {
//     const { ip: ipQuery, page = 1, limit = 10 } = req.query;

//     // Проверка параметров пагинации
//     const pageNum = Math.max(1, parseInt(page) || 1);
//     const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
//     const offset = (pageNum - 1) * limitNum;

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

//     // Получаем хосты с полными данными (включая все порты, приоритеты, группировки)
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
//               required: false,
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
//               required: false,
//             },
//           ],
//           required: false, // LEFT JOIN для определения has_whois
//         },
//         {
//           model: Grouping,
//           attributes: ["id", "name"],
//           required: false,
//         },
//         {
//           model: Priority,
//           attributes: ["id", "name"],
//           required: false,
//         },
//         // ИСКЛЮЧАЕМ PriorityComment
//       ],
//       order: [["priority_id", "DESC"]],
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
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// // Оптимизированная версия для быстрого поиска по IP
// export const getIpInfoOptimized = async (req, res) => {
//   try {
//     const { ip: ipQuery, page = 1, limit = 10 } = req.query;

//     // Проверка параметров пагинации
//     const pageNum = Math.max(1, parseInt(page) || 1);
//     const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
//     const offset = (pageNum - 1) * limitNum;

//     if (ipQuery && !isIP(ipQuery) && !ipQuery.includes(".")) {
//       return res.status(400).json({ error: "Некорректный IP-адрес" });
//     }

//     // Используем raw SQL для максимальной производительности
//     let whereClause = "";
//     let replacements = { limit: limitNum, offset: offset };

//     if (ipQuery) {
//       whereClause = "WHERE CAST(h.ip AS TEXT) LIKE :ipPattern";
//       replacements.ipPattern = `${ipQuery}%`;
//     }

//     const sqlQuery = `
//       SELECT 
//         h.id, h.ip, h.reachable, h.updated_at, h.priority_id, h.grouping_id,
//         p.port, p.type,
//         wkp.name as port_name,
//         pr.name as priority_name,
//         gr.name as grouping_name,
//         EXISTS(SELECT 1 FROM whois wh WHERE wh.host_id = h.id) as has_whois
//       FROM hosts h
//       INNER JOIN ports p ON h.id = p.host_id
//       LEFT JOIN well_known_ports wkp ON p.port = wkp.port
//       LEFT JOIN host_priorities pr ON h.priority_id = pr.id
//       LEFT JOIN host_groupings gr ON h.grouping_id = gr.id
//       ${whereClause}
//       ORDER BY 
//         CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//         h.priority_id DESC,
//         h.updated_at DESC
//       LIMIT :limit OFFSET :offset
//     `;

//     const hostsResult = await sequelize.query(sqlQuery, {
//       replacements,
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

//     // Группируем результаты по хостам, устраняя дубликаты портов
//     const hostsMap = new Map();
//     const hostPortsMap = new Map();

//     hostsResult.forEach((row) => {
//       if (!hostsMap.has(row.id)) {
//         hostsMap.set(row.id, {
//           id: row.id,
//           ip: row.ip,
//           reachable: row.reachable,
//           updated_at: row.updated_at,
//           priority_id: row.priority_id,
//           grouping_id: row.grouping_id,
//           Priority: row.priority_name ? { name: row.priority_name } : null,
//           Grouping: row.grouping_name ? { name: row.grouping_name } : null,
//           Ports: [],
//           Whois: row.has_whois ? [{ value: "" }] : [],
//         });
//         hostPortsMap.set(row.id, new Set());
//       }

//       const host = hostsMap.get(row.id);
//       const portSet = hostPortsMap.get(row.id);

//       // Добавляем порт только если его еще нет у этого хоста
//       if (!portSet.has(row.port)) {
//         host.Ports.push({
//           port: row.port,
//           type: row.type,
//           WellKnownPort: row.port_name ? { name: row.port_name } : null,
//         });
//         portSet.add(row.port);
//       }
//     });

//     const hosts = Array.from(hostsMap.values());
//     const items = hosts.map((host) => {
//       // Используем упрощенную версию форматирования для производительности
//       const openPorts = [];
//       const filteredPorts = [];
//       const openPortsSet = new Set();
//       const filteredPortsSet = new Set();

//       host.Ports.forEach((port) => {
//         const portInfo = {
//           port: port.port,
//           name: port.WellKnownPort?.name || null,
//         };

//         if (port.type === "open" && !openPortsSet.has(port.port)) {
//           openPorts.push(portInfo);
//           openPortsSet.add(port.port);
//         } else if (
//           port.type === "filtered" &&
//           !filteredPortsSet.has(port.port)
//         ) {
//           filteredPorts.push(portInfo);
//           filteredPortsSet.add(port.port);
//         }
//       });

//       const priorityInfo = {
//         priority: null,
//         grouping: null,
//       };

//       if (host.priority_id || host.Priority) {
//         priorityInfo.priority = {
//           id: host.priority_id,
//           name: host.Priority?.name || "Unknown",
//         };
//       }

//       if (host.grouping_id || host.Grouping) {
//         priorityInfo.grouping = {
//           id: host.grouping_id,
//           name: host.Grouping?.name || null,
//         };
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
//         priority_info: priorityInfo,
//         has_whois: host.Whois.length > 0,
//       };
//     });

//     // Получаем общее количество
//     const countQuery = ipQuery
//       ? `SELECT COUNT(*) as total FROM hosts WHERE CAST(ip AS TEXT) LIKE '${ipQuery}%'`
//       : `SELECT COUNT(*) as total FROM hosts`;

//     const countResult = await sequelize.query(countQuery, {
//       type: sequelize.QueryTypes.SELECT,
//     });

//     const totalCount = parseInt(countResult[0].total);
//     const totalPages = Math.ceil(totalCount / limitNum);

//     const response = {
//       items: items,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalItems: totalCount,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },
//       type: ipQuery ? "search" : "group",
//       field: "ip",
//     };

//     return res.json(response);
//   } catch (error) {
//     console.error("Ошибка в getIpInfoOptimized:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };
