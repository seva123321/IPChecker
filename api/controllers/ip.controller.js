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
  Grouping
} from "../models/index.js";

// Улучшенная функция для получения данных хоста с приоритетами
const getHostWithPriorityInfo = async (host) => {
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

  // Получаем информацию о приоритете и группировке
  const priorityInfo = {
    priority: null,
    comment: null,
    grouping: null
  };

  // Добавляем информацию о приоритете
  if (host.priority_id) {
    priorityInfo.priority = {
      id: host.priority_id,
      name: host.Priority?.name || null
    };
  }

  // // Добавляем информацию о комментарии к приоритету
  // if (host.PriorityComment) {
  //   priorityInfo.comment = {
  //     text: host.PriorityComment.comment,
  //     createdAt: host.PriorityComment.created_at
  //   };
  // }
  
  // Добавляем информацию о группировке
  if (host.grouping_id) {
    priorityInfo.grouping = {
      id: host.grouping_id,
      name: host.grouping?.name || null
    };
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
    priority_info: priorityInfo
  };
};

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
        // Включаем приоритеты
        {
          model: Priority,
          attributes: ["id", "name"],
          required: false
        },
        // Включаем комментарии к приоритетам
        // {
        //   model: PriorityComment,
        //   attributes: ["comment", "created_at"],
        //   include: [{
        //     model: Priority,
        //     attributes: ["name"]
        //   }],
        //   required: false
        // },
        // Включаем группировки
        {
          model: Grouping,
          attributes: ["id", "name"],
          required: false
        }
      ],
      order: [["priority_id", "DESC"]],
      // order: [["updated_at", "DESC"]],
      limit: limitNum,
      offset: offset,
    });

    const items = await Promise.all(hosts.map(host => getHostWithPriorityInfo(host)));

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
        // Включаем приоритеты
        {
          model: Priority,
          attributes: ["id", "name"],
          required: false
        },
        // Включаем комментарии к приоритетам
        {
          model: PriorityComment,
          attributes: ["comment", "created_at"],
          include: [{
            model: Priority,
            attributes: ["name"]
          }],
          required: false
        },
        // Включаем группировки
        {
          model: Grouping,
          attributes: ["id", "name"],
          required: false
        }
      ],
      order: [["priority_id", "DESC"]],
      // order: [["updated_at", "DESC"]],
      limit: limitNum,
      offset: offset,
    });

    const items = await Promise.all(hosts.map(host => getHostWithPriorityInfo(host)));

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
  }
};

// Новый метод для получения информации о конкретном хосте по IP с приоритетами
export const getHostByIpWithPriority = async (req, res) => {
  try {
    const { ip } = req.params;
    
    // Проверяем корректность IP
    if (!isIP(ip) && !ip.includes(".")) {
      return res.status(400).json({ error: "Некорректный IP-адрес" });
    }

    // Получаем хост с информацией о приоритетах
    const host = await Host.findOne({
      where: { ip: ip },
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
        // Включаем приоритеты
        {
          model: Priority,
          attributes: ["id", "name"],
          required: false
        },
        // Включаем комментарии к приоритетам
        {
          model: PriorityComment,
          attributes: ["comment", "created_at"],
          include: [{
            model: Priority,
            attributes: ["name"]
          }],
          required: false
        },
        // Включаем группировки
        {
          model: Grouping,
          attributes: ["id", "name"],
          required: false
        }
      ]
    });

    if (!host) {
      return res.status(404).json({ error: "Хост не найден" });
    }

    const item = await getHostWithPriorityInfo(host);
    
    return res.json({
      items: [item],
      pagination: {
        currentPage: 1,
        totalPages: 1,
        totalItems: 1,
        hasNext: false,
        hasPrev: false,
      },
      type: "search",
      field: "ip"
    });
  } catch (error) {
    console.error("Ошибка в getHostByIpWithPriority:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};