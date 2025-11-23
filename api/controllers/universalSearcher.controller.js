// controllers/search.controller.js
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
  Grouping,
} from "../models/index.js";

// Вспомогательная функция для форматирования данных хоста
const formatHostData = (host) => {
  const openPorts = [];
  const filteredPorts = [];
  const openPortsSet = new Set();
  const filteredPortsSet = new Set();

  if (host.Ports && Array.isArray(host.Ports)) {
    host.Ports.forEach((port) => {
      const portInfo = {
        port: port.port,
        name: port.WellKnownPort?.name || null,
      };

      if (port.type === "open" && !openPortsSet.has(port.port)) {
        openPorts.push(portInfo);
        openPortsSet.add(port.port);
      } else if (port.type === "filtered" && !filteredPortsSet.has(port.port)) {
        filteredPorts.push(portInfo);
        filteredPortsSet.add(port.port);
      }
    });
  }

  const hasWhois = host.Whois && Array.isArray(host.Whois) && host.Whois.length > 0;

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

// Вспомогательная функция для извлечения ID из строк вида "[1] Название"
const extractIdsFromBrackets = (str) => {
  if (!str) return [];
  const matches = str.match(/\[(\d+)\]/g);
  return matches ? matches.map(m => parseInt(m.replace(/[\[\]]/g, ''))) : [];
};

// Вспомогательная функция для парсинга портов из строки
const parsePortsFromString = (portString) => {
  if (!portString) return [];
  
  const ports = [];
  const portMatches = portString.match(/(\d+)\s*\([^)]*\)/g) || portString.match(/\d+/g);
  
  if (portMatches) {
    portMatches.forEach(match => {
      const portMatch = match.match(/(\d+)/);
      if (portMatch) {
        ports.push(parseInt(portMatch[1]));
      }
    });
  }
  
  return [...new Set(ports)]; // Убираем дубликаты
};

export const getInfo = async (req, res) => {
  const {
    ip,
    portOpened,
    portFiltered,
    keyword,
    priority,
    group,
    isWhois,
    dateRange: { startDate, endDate } = {},
  } = req.body;

  try {
    console.log("Получен запрос поиска:", req.body);

    // ОПТИМИЗИРОВАННАЯ ПОСЛЕДОВАТЕЛЬНОСТЬ ФИЛЬТРОВ
    let hostIds = new Set();

    // 1. Самый быстрый фильтр - по IP (прямое сравнение)
    if (ip) {
      console.log("Фильтр по IP:", ip);
      const ipHosts = await Host.findAll({
        attributes: ['id'],
        where: sequelize.where(
          sequelize.cast(sequelize.col("ip"), "TEXT"),
          "LIKE",
          `${ip}%`
        ),
        raw: true
      });
      
      if (ipHosts.length === 0) {
        return res.json({ items: [], total: 0 });
      }
      
      ipHosts.forEach(host => hostIds.add(host.id));
      console.log(`После фильтра по IP: ${hostIds.size} хостов`);
    }

    // 2. Фильтр по дате (быстрый, использует индекс)
    if (startDate || endDate) {
      console.log("Фильтр по дате:", { startDate, endDate });
      const dateWhere = {};
      if (startDate) dateWhere[Op.gte] = new Date(startDate);
      if (endDate) dateWhere[Op.lte] = new Date(endDate);
      
      const dateHosts = await Host.findAll({
        attributes: ['id'],
        where: hostIds.size > 0 ? { 
          id: Array.from(hostIds),
          updated_at: dateWhere 
        } : { updated_at: dateWhere },
        raw: true
      });
      
      if (dateHosts.length === 0) {
        return res.json({ items: [], total: 0 });
      }
      
      const dateHostIds = new Set(dateHosts.map(h => h.id));
      hostIds = hostIds.size > 0 
        ? new Set(Array.from(hostIds).filter(id => dateHostIds.has(id)))
        : dateHostIds;
      console.log(`После фильтра по дате: ${hostIds.size} хостов`);
    }

    // 3. Фильтр по приоритету (быстрый JOIN)
    if (priority) {
      console.log("Фильтр по приоритету:", priority);
      const priorityIds = extractIdsFromBrackets(priority);
      
      const priorityHosts = await Host.findAll({
        attributes: ['id'],
        where: hostIds.size > 0 ? { 
          id: Array.from(hostIds),
          priority_id: priorityIds.length > 0 ? priorityIds : { [Op.ne]: null }
        } : { 
          priority_id: priorityIds.length > 0 ? priorityIds : { [Op.ne]: null }
        },
        raw: true
      });
      
      if (priorityHosts.length === 0) {
        return res.json({ items: [], total: 0 });
      }
      
      const priorityHostIds = new Set(priorityHosts.map(h => h.id));
      hostIds = hostIds.size > 0 
        ? new Set(Array.from(hostIds).filter(id => priorityHostIds.has(id)))
        : priorityHostIds;
      console.log(`После фильтра по приоритету: ${hostIds.size} хостов`);
    }

    // 4. Фильтр по группировке (быстрый JOIN)
    if (group) {
      console.log("Фильтр по группировке:", group);
      const groupIds = extractIdsFromBrackets(group);
      
      const groupHosts = await Host.findAll({
        attributes: ['id'],
        where: hostIds.size > 0 ? { 
          id: Array.from(hostIds),
          grouping_id: groupIds.length > 0 ? groupIds : { [Op.ne]: null }
        } : { 
          grouping_id: groupIds.length > 0 ? groupIds : { [Op.ne]: null }
        },
        raw: true
      });
      
      if (groupHosts.length === 0) {
        return res.json({ items: [], total: 0 });
      }
      
      const groupHostIds = new Set(groupHosts.map(h => h.id));
      hostIds = hostIds.size > 0 
        ? new Set(Array.from(hostIds).filter(id => groupHostIds.has(id)))
        : groupHostIds;
      console.log(`После фильтра по группировке: ${hostIds.size} хостов`);
    }

    // 5. Фильтр по наличию WHOIS данных
    if (isWhois !== undefined) {
      console.log("Фильтр по наличию WHOIS:", isWhois);
      
      const whoisHosts = await Host.findAll({
        attributes: ['id'],
        include: [{
          model: Whois,
          attributes: [],
          required: isWhois // INNER JOIN если true, LEFT JOIN если false
        }],
        where: hostIds.size > 0 ? { id: Array.from(hostIds) } : {},
        raw: true
      });
      
      if (whoisHosts.length === 0) {
        return res.json({ items: [], total: 0 });
      }
      
      const whoisHostIds = new Set(whoisHosts.map(h => h.id));
      hostIds = hostIds.size > 0 
        ? new Set(Array.from(hostIds).filter(id => whoisHostIds.has(id)))
        : whoisHostIds;
      console.log(`После фильтра по WHOIS: ${hostIds.size} хостов`);
    }

    // 6. Фильтр по ключевым словам (медленный, но необходимый)
    if (keyword) {
      console.log("Фильтр по ключевым словам:", keyword);
      
      const keywordSql = `
        SELECT DISTINCT h.id
        FROM hosts h
        INNER JOIN whois w ON h.id = w.host_id
        INNER JOIN whois_keys wk ON w.key_id = wk.id
        WHERE LOWER(w.value) LIKE LOWER(:keyword) 
           OR LOWER(wk.key_name) LIKE LOWER(:keyword)
           ${hostIds.size > 0 ? 'AND h.id IN (:hostIds)' : ''}
      `;
      
      const keywordHosts = await sequelize.query(keywordSql, {
        replacements: { 
          keyword: `%${keyword}%`,
          hostIds: hostIds.size > 0 ? Array.from(hostIds) : []
        },
        type: sequelize.QueryTypes.SELECT,
      });
      
      if (keywordHosts.length === 0) {
        return res.json({ items: [], total: 0 });
      }
      
      const keywordHostIds = new Set(keywordHosts.map(h => h.id));
      hostIds = hostIds.size > 0 
        ? new Set(Array.from(hostIds).filter(id => keywordHostIds.has(id)))
        : keywordHostIds;
      console.log(`После фильтра по ключевым словам: ${hostIds.size} хостов`);
    }

    // 7. Фильтр по портам (самый медленный, оставляем напоследок)
    if (portOpened || portFiltered) {
      console.log("Фильтр по портам:", { portOpened, portFiltered });
      
      const openedPorts = parsePortsFromString(portOpened);
      const filteredPorts = parsePortsFromString(portFiltered);
      
      let portWhereConditions = [];
      
      if (openedPorts.length > 0) {
        portWhereConditions.push({
          port: openedPorts,
          type: 'open'
        });
      }
      
      if (filteredPorts.length > 0) {
        portWhereConditions.push({
          port: filteredPorts,
          type: 'filtered'
        });
      }
      
      if (portWhereConditions.length > 0) {
        const portHosts = await Port.findAll({
          attributes: ['host_id'],
          where: {
            [Op.or]: portWhereConditions,
            ...(hostIds.size > 0 && { host_id: Array.from(hostIds) })
          },
          raw: true
        });
        
        if (portHosts.length === 0) {
          return res.json({ items: [], total: 0 });
        }
        
        const portHostIds = new Set(portHosts.map(p => p.host_id));
        hostIds = hostIds.size > 0 
          ? new Set(Array.from(hostIds).filter(id => portHostIds.has(id)))
          : portHostIds;
        console.log(`После фильтра по портам: ${hostIds.size} хостов`);
      }
    }

    // ФИНАЛЬНЫЙ ЗАПРОС - получаем полные данные для найденных хостов
    const finalHostIds = Array.from(hostIds);
    
    if (finalHostIds.length === 0) {
      return res.json({ items: [], total: 0 });
    }

    console.log(`Финальный отбор: ${finalHostIds.length} хостов`);

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
      where: { id: finalHostIds },
      order: [["priority_id", "DESC"], ["updated_at", "DESC"]],
    });

    const items = hosts.map(formatHostData);

    return res.json({
      items: items,
      total: items.length,
      search_params: req.body
    });

  } catch (error) {
    console.error("Ошибка в getInfo:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

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

// export const getInfo = async (req, res) => {
//   const {
//     ip,
//     portOpened,
//     portFiltered,
//     keyword,
//     priority,
//     group,
//     isWhois,
//     dateRange: { startDate, endDate } = {},
//   } = req.body;

//   //   {
//   //     "ip": "8.8.8.8",
//   //     "portOpened": "5 (rje), 9 (discard), 13 (daytime), 11 (systat)",
//   //     "portFiltered": "7 (echo), 13 (daytime), 56 (xns-auth)",
//   //     "keyword": "[2] country, [1] org, [18] role",
//   //     "priority": "[2] Интересный",
//   //     "group": "[5] Финансовый сектор, [1] МИД, [2] Гражданская промышленность",
//   //     "isWhois": true,
//   //     "dateRange": {
//   //         "startDate": "2024-12-31T23:47:37.017Z",
//   //         "endDate": "2025-11-08T23:47:37.018Z"
//   //     }
//   // }

//   // SELECT *
//   // FROM your_table
//   // WHERE a IN (5, 8, 299);

//   // SELECT *
//   // FROM your_table
//   // WHERE a BETWEEN 5 AND 299; //BETWEEN включает границы диапазона.

//   try {
//     // отбор по startDate, endDate в hosts.updated_at
//     // отбор по Ip
//     // отбор по priority
//     // отбор по group
//     // отбор по isWhois
//     // отбор по keyword
//     // отбор по portOpened
//     // отбор по portFiltered

//     return res.json({ body: req.body });
//   } catch (error) {
//     console.error("Ошибка в getInfo:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

export const getGrouping = async (req, res) => {
  const {
    ip,
    portOpened,
    portFiltered,
    keyword,
    priority,
    group,
    isWhois,
    dateRange: { startDate, endDate } = {},
  } = req.body;

  try {
    return res.json({ body: req.body });
  } catch (error) {
    console.error("Ошибка в getGrouping:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};
