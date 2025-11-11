// controllers/ip.controller.js
import { isIP } from "net";
import {
  Host,
  Port,
  Whois,
  WhoisKey,
  WellKnownPort,
  sequelize,
} from "../models/index.js";

export const getIpInfo = async (req, res) => {
  try {
    const { ip: ipQuery, page = 1, limit = 10 } = req.query;

    // Проверка параметров пагинации
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10)); // Ограничение на 100 элементов
    const offset = (pageNum - 1) * limitNum;

    console.log(req.query);

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
            },
          ],
        },
      ],
      order: [["updated_at", "DESC"]],
      limit: limitNum,
      offset: offset,
    });

    const items = hosts.map((host) => {
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
    return res.status(500).json({ error: "Нет результатов удовлетворяющих поиску" });
    // return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

export const groupIp = async (req, res) => {
  try {
    const { page = 1, limit = 10 } = req.query;

    // Проверка параметров пагинации
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10)); // Ограничение на 100 элементов
    const offset = (pageNum - 1) * limitNum;

    // Получаем общее количество записей для пагинации
    const totalCount = await Host.count();

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
          attributes: ["value"],
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

    const items = hosts.map((host) => {
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
    });

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
    };

    return res.json(response);
  } catch (error) {
    console.error("Ошибка в groupIp:", error);
    return res.status(500).json({ error: "Нет результатов удовлетворяющих поиску" });
    // return res.status(500).json({ error: "Внутренняя ошибка сервера" });
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
// } from "../models/index.js";
// import IpService from "../services/ip.service.js";

// export const getIpInfo = async (req, res) => {
//   try {
//     const { ip: ipQuery } = req.query;

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
//       ],
//       order: [["updated_at", "DESC"]],
//     });

//     const items = hosts.map((host) => {
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
//         country: whois.Country || null,
//         has_whois: hasWhois,
//         whois,
//         updated_at: host.updated_at
//           ? host.updated_at.toISOString().replace("T", " ").substring(0, 19)
//           : null,
//         reachable: host.reachable,
//         port_data: {
//           open: openPorts,
//           filtered: filteredPorts,
//         },
//       };
//     });

//     if (!items.length) {
//       return res.status(404).json({
//         message: "Нет данных соответствующих поиску",
//         items: [],
//       });
//     }

//     if (ipQuery) return res.json({ items, type: "search" });

//     return res.json({ items, type: "group", group_field: "ip" });
//   } catch (error) {
//     console.error("Ошибка в getIpInfo:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// export const groupIp = async (req, res) => {
//   try {
//     const result = await IpService.getGroupIp();
//     return res.json(result);
//   } catch (error) {
//     console.error("Ошибка в getFileDb:", error);
//     return res.status(500).json({ error: error.message });
//   }
// };

/*
  // controllers/ip.controller.js
import { Sequelize } from "sequelize";
const { Op } = Sequelize;
import { Host, Port, WellKnownPort, Whois, WhoisKey } from "../models/index.js";
import { isIP } from "net";

// Вспомогательная функция для форматирования данных
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

// Основная логика для получения IP-информации
const getIpInfoBase = async (req, res, isGroup = false) => {
  try {
    const { ip: ipQuery } = req.query;

    // Проверка корректности IP при наличии параметра
    if (ipQuery && !isIP(ipQuery) && !ipQuery.includes(".")) {
      return res.status(400).json({ error: "Некорректный IP-адрес" });
    }

    let whereCondition = {};
    if (ipQuery && !isGroup) {
      // Поиск по конкретному IP (с префиксом для частичного совпадения)
      whereCondition = {
        ip: {
          [Op.like]: `${ipQuery}%`
        }
      };
    } else if (isGroup) {
      // Для группировки - получаем все записи
      // Можно добавить дополнительную логику для группировки
      // Например, если нужно группировать по определенным критериям
    }

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
            },
          ],
        },
      ],
      order: [["updated_at", "DESC"]],
    });

    const items = hosts.map(formatHostData);

    if (!items.length) {
      return res.status(404).json({
        message: "Нет данных соответствующих поиску",
        items: [],
      });
    }
    
    return res.json({ items });
  } catch (error) {
    console.error("Ошибка в getIpInfo:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// GET /ip?ip=192.168.1.1
export const getIpInfo = (req, res) => {
  return getIpInfoBase(req, res, false);
};

// GET /ip/group
export const groupIp = (req, res) => {
  return getIpInfoBase(req, res, true);
};
  */
