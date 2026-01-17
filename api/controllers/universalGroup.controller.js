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
  Country,
} from "../models/index.js";

// Вспомогательная функция для форматирования данных хоста
const formatHostData = (host) => {
  const openPorts = [];
  const filteredPorts = [];
  const openPortsSet = new Set();
  const filteredPortsSet = new Set();

  // console.log('host.Ports >> ', host.Ports)
  if (host.Ports && Array.isArray(host.Ports)) {
    host.Ports.forEach((port) => {
      // console.log('port.WellKnownPort ', port.WellKnownPort)
      const portInfo = {
        port: port.port,
        name: port.name || port.WellKnownPort?.dataValues.name  || null,
        // name: port.name || null,
      };
      // console.log('portInfo >> ', portInfo)
      if (port.type === "open" && !openPortsSet.has(port.port)) {
        openPorts.push(portInfo);
        openPortsSet.add(port.port);
      } else if (port.type === "filtered" && !filteredPortsSet.has(port.port)) {
        filteredPorts.push(portInfo);
        filteredPortsSet.add(port.port);
      }
    });
  }
  // console.log('openPorts >> ', openPorts)

  const hasWhois =
    host.Whois && Array.isArray(host.Whois) && host.Whois.length > 0;

  const priorityInfo = {
    priority: null,
    grouping: null,
  };

  // @TODO изменил Priority => priority county и grouping
  if (host.priority_id || host.priority) {
    priorityInfo.priority = {
      id: host.priority_id || host.priority?.id,
      name: host.priority?.name || "Unknown",
    };
  }

  if (host.grouping_id || host.grouping) {
    priorityInfo.grouping = {
      id: host.grouping_id || host.grouping?.id,
      name: host.grouping?.name || null,
    };
  }

  // Добавляем информацию о стране
  const countryInfo = host.country
    ? {
        id: host.country.id,
        name: host.country.name,
      }
    : null;

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
    country_info: countryInfo,
    has_whois: hasWhois,
  };
};

const getDataDefaultEmpty = (pageNum, groupingType) => ({
  items: [],
  pagination: {
    currentPage: pageNum,
    totalPages: 0,
    totalItems: 0,
    hasNext: false,
    hasPrev: false,
  },
  type: "group",
  field: groupingType,
});

// Вспомогательная функция для парсинга портов из строки
const parsePortsFromString = (portString) => {
  if (!portString) return [];
  // Проверяем, является ли portString массивом
  const values = Array.isArray(portString) ? portString : [portString];
  const ports = [];
  values.forEach((value) => {
    if (typeof value === "string") {
      const portMatch = value.match(/(\d+)/);
      if (portMatch) {
        const portNumber = parseInt(portMatch[1]);
        if (portNumber >= 1 && portNumber <= 65535) {
          ports.push(portNumber);
        }
      }
    }
  });
  return [...new Set(ports)];
};

// Функция для получения ID приоритетов по названиям
const getPriorityIdsFromNames = async (priorityNames) => {
  if (!priorityNames) return [];
  const names = Array.isArray(priorityNames) ? priorityNames : [priorityNames];
  const priorities = await Priority.findAll({
    attributes: ["id"],
    where: {
      name: { [Op.in]: names },
    },
    raw: true,
  });
  return priorities.map((p) => p.id);
};

// Функция для получения ID групп по названиям
const getGroupIdsFromNames = async (groupNames) => {
  if (!groupNames) return [];
  const names = Array.isArray(groupNames) ? groupNames : [groupNames];
  const groups = await Grouping.findAll({
    attributes: ["id"],
    where: {
      name: { [Op.in]: names },
    },
    raw: true,
  });
  return groups.map((g) => g.id);
};

// Функция для получения ID стран по названиям
const getCountryIdsFromNames = async (countryNames) => {
  if (!countryNames) return [];
  const names = Array.isArray(countryNames) ? countryNames : [countryNames];
  const countries = await Country.findAll({
    attributes: ["id"],
    where: {
      name: { [Op.in]: names },
    },
    raw: true,
  });
  return countries.map((c) => c.id);
};

// Функция для парсинга строки портов с запятыми
const parsePortsString = (portString) => {
  if (!portString) return [];
  if (Array.isArray(portString)) {
    return parsePortsFromString(portString);
  }
  // Разделяем строку по запятым
  const portStrings = portString.split(",").map((s) => s.trim());
  const ports = [];
  portStrings.forEach((str) => {
    const portMatch = str.match(/(\d+)/);
    if (portMatch) {
      const portNumber = parseInt(portMatch[1]);
      if (portNumber >= 1 && portNumber <= 65535) {
        ports.push(portNumber);
      }
    }
  });
  return [...new Set(ports)];
};

// Функция для извлечения значений из MultiSelectDataList
const extractValues = (input) => {
  if (!input) return [];
  if (Array.isArray(input)) return input;
  if (typeof input === "string") {
    // Разделяем по запятым и убираем пробелы
    return input
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s);
  }
  return [];
};

// Основная функция группировки
export const getGrouping = async (req, res) => {
  const {
    ip,
    portOpened,
    portFiltered,
    keyword,
    priority,
    group,
    country,
    whois,
    groupingType = "port",
    dateRange: { startDate, endDate } = {},
    page = 1,
    limit = 10,
  } = req.body;

  try {
    console.log("Получен запрос группировки:", req.body);

    // Параметры пагинации
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    let hostIds = new Set();

    // 1. Фильтр по IP
    if (ip) {
      console.log("Фильтр по IP:", ip);
      const ipQuery = `
        SELECT id FROM hosts 
        WHERE CAST(ip AS TEXT) ILIKE :ipPattern
      `;
      const ipHosts = await sequelize.query(ipQuery, {
        replacements: {
          ipPattern: `${ip}%`,
        },
        type: sequelize.QueryTypes.SELECT,
        raw: true,
      });

      if (!ipHosts.length) {
        return res.json(getDataDefaultEmpty(pageNum, groupingType));
      }

      ipHosts.forEach((host) => hostIds.add(host.id));
      console.log(`После фильтра по IP: ${hostIds.size} хостов`);
    }

    // 2. Фильтр по дате
    if (startDate || endDate) {
      console.log("Фильтр по дате:", { startDate, endDate });
      const dateWhere = {};
      if (startDate) dateWhere[Op.gte] = new Date(startDate);
      if (endDate) dateWhere[Op.lte] = new Date(endDate);

      const dateHosts = await Host.findAll({
        attributes: ["id"],
        where:
          hostIds.size > 0
            ? {
                id: Array.from(hostIds),
                updated_at: dateWhere,
              }
            : { updated_at: dateWhere },
        raw: true,
      });

      if (!dateHosts.length) {
        return res.json(getDataDefaultEmpty(pageNum, groupingType));
      }

      const dateHostIds = new Set(dateHosts.map((h) => h.id));
      hostIds =
        hostIds.size > 0
          ? new Set(Array.from(hostIds).filter((id) => dateHostIds.has(id)))
          : dateHostIds;

      console.log(`После фильтра по дате: ${hostIds.size} хостов`);
    }

    // 3. Фильтр по приоритету
    if (priority) {
      console.log("Фильтр по приоритету:", priority);
      const priorityNames = extractValues(priority);
      const priorityIds = await getPriorityIdsFromNames(priorityNames);

      if (priorityIds.length > 0) {
        const priorityHosts = await Host.findAll({
          attributes: ["id"],
          where:
            hostIds.size > 0
              ? {
                  id: Array.from(hostIds),
                  priority_id: priorityIds,
                }
              : {
                  priority_id: priorityIds,
                },
          raw: true,
        });

        if (!priorityHosts.length) {
          return res.json({
            items: [],
            pagination: {
              currentPage: pageNum,
              totalPages: 0,
              totalItems: 0,
              hasNext: false,
              hasPrev: false,
            },
            type: "group",
            field: groupingType,
          });
        }

        const priorityHostIds = new Set(priorityHosts.map((h) => h.id));
        hostIds =
          hostIds.size > 0
            ? new Set(
                Array.from(hostIds).filter((id) => priorityHostIds.has(id))
              )
            : priorityHostIds;
      }

      console.log(`После фильтра по приоритету: ${hostIds.size} хостов`);
    }

    // 4. Фильтр по группировке
    if (group) {
      console.log("Фильтр по группировке:", group);
      const groupNames = extractValues(group);
      const groupIds = await getGroupIdsFromNames(groupNames);

      if (groupIds.length > 0) {
        const groupHosts = await Host.findAll({
          attributes: ["id"],
          where:
            hostIds.size > 0
              ? {
                  id: Array.from(hostIds),
                  grouping_id: groupIds,
                }
              : {
                  grouping_id: groupIds,
                },
          raw: true,
        });

        if (!groupHosts.length) {
          return res.json(getDataDefaultEmpty(pageNum, groupingType));
        }

        const groupHostIds = new Set(groupHosts.map((h) => h.id));
        hostIds =
          hostIds.size > 0
            ? new Set(Array.from(hostIds).filter((id) => groupHostIds.has(id)))
            : groupHostIds;
      }

      console.log(`После фильтра по группировке: ${hostIds.size} хостов`);
    }

    // 5. Фильтр по стране
    if (country) {
      console.log("Фильтр по стране:", country);
      const countryNames = extractValues(country);
      const countryIds = await getCountryIdsFromNames(countryNames);

      if (countryIds.length > 0) {
        const countryHosts = await Host.findAll({
          attributes: ["id"],
          where:
            hostIds.size > 0
              ? {
                  id: Array.from(hostIds),
                  country_id: countryIds,
                }
              : {
                  country_id: countryIds,
                },
          raw: true,
        });

        if (!countryHosts.length) {
          return res.json(getDataDefaultEmpty(pageNum, groupingType));
        }

        const countryHostIds = new Set(countryHosts.map((h) => h.id));
        hostIds =
          hostIds.size > 0
            ? new Set(
                Array.from(hostIds).filter((id) => countryHostIds.has(id))
              )
            : countryHostIds;
      }

      console.log(`После фильтра по стране: ${hostIds.size} хостов`);
    }

    // 6. Фильтр по наличию WHOIS данных
    if (whois !== "all") {
      console.log("Фильтр по наличию WHOIS:", whois);

      if (whois === "withWhois") {
        // Только с WHOIS
        const whoisHosts = await Host.findAll({
          attributes: ["id"],
          include: [
            {
              model: Whois,
              attributes: [],
              required: true,
            },
          ],
          where: hostIds.size > 0 ? { id: Array.from(hostIds) } : {},
          raw: true,
        });

        if (!whoisHosts.length) {
          return res.json(getDataDefaultEmpty(pageNum, groupingType));
        }

        const whoisHostIds = new Set(whoisHosts.map((h) => h.id));
        hostIds =
          hostIds.size > 0
            ? new Set(Array.from(hostIds).filter((id) => whoisHostIds.has(id)))
            : whoisHostIds;
      } else if (whois === "noWhois") {
        const noWhoisHosts = await Host.findAll({
          attributes: ["id"],
          include: [
            {
              model: Whois,
              attributes: [],
              required: false,
            },
          ],
          where:
            hostIds.size > 0
              ? {
                  id: Array.from(hostIds),
                  "$Whois.id$": null,
                }
              : {
                  "$Whois.id$": null,
                },
          raw: true,
        });

        if (!noWhoisHosts.length) {
          return res.json(getDataDefaultEmpty(pageNum, groupingType));
        }

        const noWhoisHostIds = new Set(noWhoisHosts.map((h) => h.id));
        hostIds =
          hostIds.size > 0
            ? new Set(
                Array.from(hostIds).filter((id) => noWhoisHostIds.has(id))
              )
            : noWhoisHostIds;
      }

      console.log(`После фильтра по WHOIS: ${hostIds.size} хостов`);
    }

    // 7. Фильтр по ключевым словам
    if (keyword) {
      console.log("Фильтр по ключевым словам:", keyword);
      const keywords = extractValues(keyword);

      if (keywords.length > 0) {
        const keywordPromises = keywords.map((kw) => {
          const keywordSql = `
            SELECT DISTINCT h.id
            FROM hosts h
            INNER JOIN whois w ON h.id = w.host_id
            INNER JOIN whois_keys wk ON w.key_id = wk.id
            WHERE (LOWER(w.value) LIKE LOWER(:keyword) 
               OR LOWER(wk.key_name) LIKE LOWER(:keyword))
               ${hostIds.size > 0 ? "AND h.id IN (:hostIds)" : ""}
          `;
          return sequelize.query(keywordSql, {
            replacements: {
              keyword: `%${kw}%`,
              hostIds: hostIds.size > 0 ? Array.from(hostIds) : [],
            },
            type: sequelize.QueryTypes.SELECT,
          });
        });

        const keywordResults = await Promise.all(keywordPromises);
        const keywordHostIds = new Set();

        keywordResults.forEach((result) => {
          result.forEach((row) => keywordHostIds.add(row.id));
        });

        if (!keywordHostIds.size) {
          return res.json(getDataDefaultEmpty(pageNum, groupingType));
        }

        hostIds =
          hostIds.size > 0
            ? new Set(
                Array.from(hostIds).filter((id) => keywordHostIds.has(id))
              )
            : keywordHostIds;
      }

      console.log(`После фильтра по ключевым словам: ${hostIds.size} хостов`);
    }

    // 8. Фильтр по портам
    if (portOpened || portFiltered) {
      console.log("Фильтр по портам:", { portOpened, portFiltered });
      const openedPorts = parsePortsString(portOpened);
      const filteredPorts = parsePortsString(portFiltered);

      let portWhereConditions = [];

      if (openedPorts.length > 0) {
        portWhereConditions.push({
          port: openedPorts,
          type: "open",
        });
      }

      if (filteredPorts.length > 0) {
        portWhereConditions.push({
          port: filteredPorts,
          type: "filtered",
        });
      }

      if (portWhereConditions.length > 0) {
        const portHosts = await Port.findAll({
          attributes: ["host_id"],
          where: {
            [Op.or]: portWhereConditions,
            ...(hostIds.size > 0 && { host_id: Array.from(hostIds) }),
          },
          raw: true,
        });

        if (!portHosts.length) {
          return res.json(getDataDefaultEmpty(pageNum, groupingType));
        }

        const portHostIds = new Set(portHosts.map((p) => p.host_id));
        hostIds =
          hostIds.size > 0
            ? new Set(Array.from(hostIds).filter((id) => portHostIds.has(id)))
            : portHostIds;

        console.log(`После фильтра по портам: ${hostIds.size} хостов`);
      }
    }

    // Получаем отфильтрованные ID хостов
    const finalHostIds = Array.from(hostIds);

    if (!finalHostIds.length) {
      return res.json(getDataDefaultEmpty(pageNum, groupingType));
    }

    console.log(
      `Финальный отбор для группировки: ${finalHostIds.length} хостов`
    );

    // Получаем полные данные для отфильтрованных хостов
    // const hosts = await Host.findAll({
    //   include: [
    //     {
    //       model: Port,
    //       attributes: ["port", "type"],
    //       include: [
    //         {
    //           model: WellKnownPort,
    //           attributes: ["name"],
    //           required: false,
    //         },
    //       ],
    //     },
    //     {
    //       model: Priority,
    //       attributes: ["id", "name"],
    //       required: false,
    //     },
    //     {
    //       model: Grouping,
    //       attributes: ["id", "name"],
    //       required: false,
    //     },
    //     {
    //       model: Country,
    //       attributes: ["id", "name"],
    //       required: false,
    //     },
    //     {
    //       model: Whois,
    //       attributes: ["value"],
    //       include: [
    //         {
    //           model: WhoisKey,
    //           attributes: ["key_name"],
    //           required: false,
    //         },
    //       ],
    //       required: false,
    //     },
    //   ],
    //   where: { id: finalHostIds },
    //   order: [
    //     ["priority_id", "DESC"],
    //     ["updated_at", "DESC"],
    //   ],
    // });

    /*********************************** */

    const hosts = await sequelize.query(`
      SELECT
        h.id,
        h.ip,
        h.reachable,
        h.updated_at,
        h.priority_id,
        h.grouping_id,
        h.country_id,

        -- Данные о приоритете
        p.id as "priority.id",
        p.name as "priority.name",

        -- Данные о группировке
        g.id as "grouping.id",
        g.name as "grouping.name",

        -- Данные о стране
        c.id as "country.id",
        c.name as "country.name"

      FROM hosts h

      -- LEFT JOIN для приоритета
      LEFT JOIN host_priorities p ON h.priority_id = p.id

      -- LEFT JOIN для группировки
      LEFT JOIN host_groupings g ON h.grouping_id = g.id

      -- LEFT JOIN для страны
      LEFT JOIN countries c ON h.country_id = c.id

      WHERE h.id IN (:finalHostIds)

      ORDER BY
        h.priority_id DESC NULLS LAST,
        h.updated_at DESC
    `, {
      replacements: { finalHostIds },
      type: sequelize.QueryTypes.SELECT,
      nest: true,
    });

    // Затем отдельно получаем связанные данные
    if (hosts.length > 0) {
      const hostIds = hosts.map(h => h.id);

      // Получаем порты с well_known_ports - ИСПРАВЛЕННЫЙ ЗАПРОС
      const ports = await sequelize.query(`
        SELECT
          p.host_id,
          p.port,
          p.type,
          wkp.name as well_known_port_name
        FROM ports p
        LEFT JOIN well_known_ports wkp ON p.port = wkp.port
        WHERE p.host_id IN (:hostIds)
      `, {
        replacements: { hostIds },
        type: sequelize.QueryTypes.SELECT,
        nest: false,  // Используем false для плоской структуры
      });

      // console.log('ports >>> ', ports)

      // Получаем WHOIS данные
      const whoisData = await sequelize.query(`
        SELECT
          w.host_id,
          w.value,
          wk.key_name as "WhoisKey.key_name"
        FROM whois w
        LEFT JOIN whois_keys wk ON w.key_id = wk.id
        WHERE w.host_id IN (:hostIds)
      `, {
        replacements: { hostIds },
        type: sequelize.QueryTypes.SELECT,
        nest: true,
      });

      // Группируем данные по host_id
      const portsByHost = {};
      ports.forEach(port => {
        if (!portsByHost[port.host_id]) {
          portsByHost[port.host_id] = [];
        }

        // Получаем имя порта из well_known_port_name
        const portName = port.well_known_port_name || null;

        portsByHost[port.host_id].push({
          port: port.port,
          type: port.type,
          name: portName  // Простое поле name с именем порта
        });
      });
      // console.log('portsByHost >>> ', portsByHost)

      const whoisByHost = {};
      whoisData.forEach(whois => {
        if (!whoisByHost[whois.host_id]) {
          whoisByHost[whois.host_id] = [];
        }
        whoisByHost[whois.host_id].push({
          value: whois.value,
          WhoisKey: whois['WhoisKey.key_name'] ? { key_name: whois['WhoisKey.key_name'] } : null
        });
      });

      // Объединяем все данные
      hosts.forEach(host => {
        // Получаем все порты для хоста
        const allPorts = portsByHost[host.id] || [];

        // Разделяем порты по типам
        const openPorts = allPorts.filter(p => p.type === 'open')
          .map(p => ({ port: p.port, name: p.name }));

        const filteredPorts = allPorts.filter(p => p.type === 'filtered')
          .map(p => ({ port: p.port, name: p.name }));

        // Сохраняем оригинальную структуру
        host.Ports = allPorts;
        host.Whois = whoisByHost[host.id] || [];

        // Добавляем структурированные данные для вывода
        host.port_data = {
          open: openPorts,
          filtered: filteredPorts
        };
      });
    }
    /*********************************** */

    // console.log("hosts >>> ", hosts[34]);

    // Форматируем данные хостов
    const formattedHosts = hosts.map(formatHostData);

    // Группируем данные по выбранному полю
    const groupedData = await groupByField(
      groupingType,
      formattedHosts,
      finalHostIds.length,
      pageNum,
      limitNum,
      offset
    );

    // Общее количество групп для пагинации
    const totalGroups = groupedData.length;
    const totalPages = Math.ceil(totalGroups / limitNum);

    // Применяем пагинацию к группам
    const paginatedGroups = groupedData.slice(offset, offset + limitNum);

    return res.json({
      items: groupedData,//paginatedGroups, @TODO IP fix
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: totalGroups,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      type: "group",
      field: groupingType,
    });
  } catch (error) {
    console.error("Ошибка в getGrouping:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// Функция группировки по разным полям
async function groupByField(field, hosts, totalHosts, page, limit, offset) {
  switch (field) {
    case "port":
      return await groupByPorts(hosts, totalHosts);
    case "priority":
      return await groupByPriority(hosts);
    case "group":
      return await groupByHostGroup(hosts);
    case "country":
      return await groupByCountry(hosts);
    case "ip":
      return hosts;
    case "keyword":
      return await groupByKeywords(hosts);
    case "whois":
      return await groupByWhois(hosts);
    default:
      return await groupByPorts(hosts, totalHosts);
  }
}

// Группировка по портам
async function groupByPorts(hosts, totalHosts) {
  const portMap = new Map();

  // Собираем все уникальные порты из всех хостов
  hosts.forEach((host) => {
    // Открытые порты
    if (host.port_data.open) {
      host.port_data.open.forEach((port) => {
        if (!portMap.has(port.port)) {
          portMap.set(port.port, {
            port: port.port,
            name: port.name,
            count: 0,
            items: [],
          });
        }
        const portGroup = portMap.get(port.port);
        if (!portGroup.items.some((item) => item.id === host.id)) {
          portGroup.items.push(host);
          portGroup.count++;
        }
      });
    }

    // Фильтрованные порты
    if (host.port_data.filtered) {
      host.port_data.filtered.forEach((port) => {
        if (!portMap.has(port.port)) {
          portMap.set(port.port, {
            port: port.port,
            name: port.name,
            count: 0,
            items: [],
          });
        }
        const portGroup = portMap.get(port.port);
        if (!portGroup.items.some((item) => item.id === host.id)) {
          portGroup.items.push(host);
          portGroup.count++;
        }
      });
    }
  });

  // Преобразуем в массив и сортируем
  const groups = Array.from(portMap.values())
    .sort((a, b) => a.port - b.port)
    .map((group) => ({
      ...group,
      // Внутренняя пагинация для хостов в группе (если нужно)
      pagination: {
        currentPage: 1,
        totalPages: Math.ceil(group.items.length / 10),
        totalItems: group.items.length,
        hasNext: group.items.length > 10,
        hasPrev: false,
      },
      // Оставляем только первые 10 хостов для отображения
      items: group.items.slice(0, 10),
    }));

  return groups;
}

// Группировка по приоритету
async function groupByPriority(hosts) {
  const priorityMap = new Map();

  hosts.forEach((host) => {
    const priorityId = host.priority_info.priority?.id || 0;
    const priorityName = host.priority_info.priority?.name || "Без приоритета";

    if (!priorityMap.has(priorityId)) {
      priorityMap.set(priorityId, {
        id: priorityId,
        name: priorityName,
        count: 0,
        items: [],
      });
    }

    const group = priorityMap.get(priorityId);
    group.items.push(host);
    group.count++;
  });

  return Array.from(priorityMap.values())
    .sort((a, b) => b.id - a.id) // Сортировка по убыванию приоритета
    .map((group) => ({
      ...group,
      pagination: {
        currentPage: 1,
        totalPages: Math.ceil(group.items.length / 10),
        totalItems: group.items.length,
        hasNext: group.items.length > 10,
        hasPrev: false,
      },
      items: group.items.slice(0, 10),
    }));
}

// Группировка по группе хостов
async function groupByHostGroup(hosts) {
  const groupMap = new Map();

  hosts.forEach((host) => {
    const groupId = host.priority_info.grouping?.id || 0;
    const groupName =
      host.priority_info.grouping?.name || "Неопределенная группа";

    if (!groupMap.has(groupId)) {
      groupMap.set(groupId, {
        id: groupId,
        name: groupName,
        count: 0,
        items: [],
      });
    }

    const group = groupMap.get(groupId);
    group.items.push(host);
    group.count++;
  });

  return Array.from(groupMap.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((group) => ({
      ...group,
      pagination: {
        currentPage: 1,
        totalPages: Math.ceil(group.items.length / 10),
        totalItems: group.items.length,
        hasNext: group.items.length > 10,
        hasPrev: false,
      },
      items: group.items.slice(0, 10),
    }));
}

// Группировка по стране
async function groupByCountry(hosts) {
  const countryMap = new Map();

  hosts.forEach((host) => {
    const countryId = host.country_info?.id || 0;
    const countryName = host.country_info?.name || "Неизвестная страна";

    if (!countryMap.has(countryId)) {
      countryMap.set(countryId, {
        id: countryId,
        name: countryName,
        count: 0,
        items: [],
      });
    }

    const group = countryMap.get(countryId);
    group.items.push(host);
    group.count++;
  });

  return Array.from(countryMap.values())
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((group) => ({
      ...group,
      pagination: {
        currentPage: 1,
        totalPages: Math.ceil(group.items.length / 10),
        totalItems: group.items.length,
        hasNext: group.items.length > 10,
        hasPrev: false,
      },
      items: group.items.slice(0, 10),
    }));
}

// Группировка по ключевым словам оптимизированный
async function groupByKeywords(hosts) {
  try {
    if (!hosts || hosts.length === 0) {
      return [];
    }

    // Создаем Map для быстрого поиска хостов по ID
    const hostsMap = new Map();
    hosts.forEach(host => {
      hostsMap.set(host.id, host);
    });

    // Получаем ID всех отфильтрованных хостов
    const hostIds = hosts.map(host => host.id);

    // Используем один SQL запрос для получения всех необходимых данных
    const keywordDataSql = `
      WITH host_keywords AS (
        SELECT 
          w.host_id,
          wk.key_name,
          COUNT(*) OVER (PARTITION BY wk.key_name) as total_count
        FROM whois w
        INNER JOIN whois_keys wk ON w.key_id = wk.id
        WHERE w.host_id IN (:hostIds)
        GROUP BY w.host_id, wk.key_name
        ORDER BY wk.key_name ASC
      )
      SELECT 
        key_name,
        total_count,
        ARRAY_AGG(host_id) as host_ids
      FROM host_keywords
      GROUP BY key_name, total_count
      ORDER BY key_name ASC
    `;

    const keywordGroupsResult = await sequelize.query(keywordDataSql, {
      replacements: { hostIds },
      type: sequelize.QueryTypes.SELECT,
    });

    // Если нет данных WHOIS, возвращаем пустой массив
    if (!keywordGroupsResult.length) {
      return [];
    }

    // Собираем группы
    const groups = keywordGroupsResult.map(row => {
      const keyword = row.key_name;
      const totalCount = parseInt(row.total_count);
      const hostIdArray = row.host_ids || [];
      
      // Получаем хосты для этой группы (первые 10)
      const groupHosts = [];
      const addedHostIds = new Set();
      
      for (const hostId of hostIdArray) {
        if (groupHosts.length >= 10) break;
        
        const host = hostsMap.get(hostId);
        if (host && !addedHostIds.has(hostId)) {
          groupHosts.push(host);
          addedHostIds.add(hostId);
        }
      }
      
      // Сортируем хосты внутри группы по приоритету и дате
      groupHosts.sort((a, b) => {
        const priorityA = a.priority_info?.priority?.id || 0;
        const priorityB = b.priority_info?.priority?.id || 0;
        
        if (priorityB !== priorityA) {
          return priorityB - priorityA;
        }
        
        if (a.updated_at && b.updated_at) {
          return new Date(b.updated_at) - new Date(a.updated_at);
        }
        
        return 0;
      });

      const totalItemsInGroup = Math.min(totalCount, hostIdArray.length);
      const totalPagesInGroup = Math.ceil(totalItemsInGroup / 10);

      return {
        keyword: keyword,
        name: keyword,
        count: totalCount,
        items: groupHosts,
        pagination: {
          currentPage: 1,
          totalPages: totalPagesInGroup,
          totalItems: totalItemsInGroup,
          hasNext: totalItemsInGroup > 10,
          hasPrev: false,
        },
      };
    });

    // Фильтруем пустые группы и возвращаем результат
    return groups.filter(group => group.items.length > 0);

  } catch (error) {
    console.error("Ошибка в groupByKeywords:", error);
    return [];
  }
}

// старый рабочий
//// Группировка по ключевым словам
// async function groupByKeywords(hosts) {
//   try {
//     // Получаем ID всех отфильтрованных хостов
//     const hostIds = hosts.map((host) => host.id);

//     if (!hostIds.length) {
//       return [];
//     }

//     // Используем raw SQL для получения уникальных ключевых слов с подсчетом хостов
//     const uniqueKeywordsSql = `
//       SELECT DISTINCT wk.key_name, COUNT(DISTINCT w.host_id) as count
//       FROM whois_keys wk
//       INNER JOIN whois w ON wk.id = w.key_id
//       WHERE w.host_id IN (:hostIds)
//       GROUP BY wk.key_name
//       ORDER BY wk.key_name ASC
//     `;

//     const uniqueKeywordsResult = await sequelize.query(uniqueKeywordsSql, {
//       replacements: { hostIds },
//       type: sequelize.QueryTypes.SELECT,
//     });

//     // Получаем полные WHOIS данные для хостов с группировкой по ключевым словам
//     const hostsWithWhois = await Host.findAll({
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
//           model: Country,
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
//       ],
//       where: {
//         id: { [Op.in]: hostIds },
//       },
//       order: [
//         ["priority_id", "DESC"],
//         ["updated_at", "DESC"],
//       ],
//     });

//     // Форматируем данные хостов (используем ту же функцию formatHostData)
//     const formattedHostsMap = new Map();
//     hostsWithWhois.forEach((host) => {
//       if (!formattedHostsMap.has(host.id)) {
//         formattedHostsMap.set(host.id, formatHostData(host));
//       }
//     });

//     // Инициализируем группы для всех уникальных ключевых слов
//     const keywordGroups = {};

//     uniqueKeywordsResult.forEach((row) => {
//       const keyword = row.key_name;
//       const count = parseInt(row.count);
//       keywordGroups[keyword] = {
//         keyword: keyword,
//         count: count,
//         items: [],
//       };
//     });

//     // Группируем хосты по ключевым словам через WHOIS данные
//     for (const host of hostsWithWhois) {
//       const formattedHost = formattedHostsMap.get(host.id);
//       const hostWhois = host.Whois || [];
      
//       if (formattedHost && hostWhois.length > 0) {
//         for (const whois of hostWhois) {
//           const keyName = whois.WhoisKey?.key_name;

//           if (keyName && keywordGroups[keyName]) {
//             // Проверяем, что хост еще не добавлен в эту группу
//             const hostExists = keywordGroups[keyName].items.some(
//               (item) => item.id === formattedHost.id
//             );

//             if (!hostExists) {
//               keywordGroups[keyName].items.push(formattedHost);
//             }
//           }
//         }
//       }
//     }

//     // Сортируем хосты внутри каждой группы по приоритету и дате
//     Object.values(keywordGroups).forEach((group) => {
//       group.items.sort((a, b) => {
//         // Сначала сортируем по приоритету (DESC)
//         const priorityA = a.priority_info?.priority?.id || 0;
//         const priorityB = b.priority_info?.priority?.id || 0;

//         if (priorityB !== priorityA) {
//           return priorityB - priorityA;
//         }

//         // Если приоритеты одинаковые, сортируем по дате обновления
//         if (a.updated_at && b.updated_at) {
//           return new Date(b.updated_at) - new Date(a.updated_at);
//         }

//         return 0;
//       });
//     });

//     // Преобразуем в нужный формат и сортируем по возрастанию ключевых слов
//     const groups = Object.values(keywordGroups)
//       .filter((group) => group.items.length > 0)
//       .map((group) => {
//         const totalItemsInGroup = group.items.length;
//         const totalPagesInGroup = Math.ceil(totalItemsInGroup / 10); // 10 хостов на страницу внутри группы

//         return {
//           keyword: group.keyword,
//           count: group.count,
//           name: group.keyword, // Добавляем name для совместимости
//           items: group.items.slice(0, 10), // Первые 10 хостов для отображения
//           pagination: {
//             currentPage: 1,
//             totalPages: totalPagesInGroup,
//             totalItems: totalItemsInGroup,
//             hasNext: totalItemsInGroup > 10,
//             hasPrev: false,
//           },
//         };
//       })
//       .sort((a, b) => a.keyword.localeCompare(b.keyword));

//     return groups;
//   } catch (error) {
//     console.error("Ошибка в groupByKeywords:", error);
//     return [];
//   }
// }



// Группировка по наличию WHOIS
async function groupByWhois(hosts) {
  const withWhois = hosts.filter((h) => h.has_whois);
  const withoutWhois = hosts.filter((h) => !h.has_whois);

  const groups = [];

  if (withWhois.length > 0) {
    groups.push({
      name: "С WHOIS данными",
      count: withWhois.length,
      items: withWhois.slice(0, 10),
      pagination: {
        currentPage: 1,
        totalPages: Math.ceil(withWhois.length / 10),
        totalItems: withWhois.length,
        hasNext: withWhois.length > 10,
        hasPrev: false,
      },
    });
  }

  if (withoutWhois.length > 0) {
    groups.push({
      name: "Без WHOIS данных",
      count: withoutWhois.length,
      items: withoutWhois.slice(0, 10),
      pagination: {
        currentPage: 1,
        totalPages: Math.ceil(withoutWhois.length / 10),
        totalItems: withoutWhois.length,
        hasNext: withoutWhois.length > 10,
        hasPrev: false,
      },
    });
  }

  return groups;
}

// Функция для получения данных по группе с пагинацией
export const getGroupDetails = async (req, res) => {
  const { group, page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const offset = (pageNum - 1) * limitNum;

  try {
    // Ищем группу по имени
    const groupData = await Grouping.findOne({
      where: { name: group },
      attributes: ["id", "name"],
      raw: true,
    });

    if (!groupData) {
      return res.status(404).json({ error: "Группа не найдена" });
    }

    // Получаем хосты для этой группы с пагинацией
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
          model: Country,
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
        grouping_id: groupData.id,
      },
      order: [
        ["priority_id", "DESC"],
        ["updated_at", "DESC"],
      ],
      limit: limitNum,
      offset: offset,
    });

    const formattedHosts = hosts.map(formatHostData);
    const totalItems = await Host.count({
      where: {
        grouping_id: groupData.id,
      },
    });

    const totalPages = Math.ceil(totalItems / limitNum);

    return res.json({
      items: {
        items: formattedHosts,
        name: groupData.name,
        pagination: {
          currentPage: pageNum,

          totalPages: totalPages,
          totalItems: totalItems,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      },

      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: totalItems,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },

      field: "groups",
      type: "group",
    });
  } catch (error) {
    console.error("Ошибка в getGroupDetails:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// Функция для получения данных по стране с пагинацией
export const getCountryDetails = async (req, res) => {
  const { country, page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const offset = (pageNum - 1) * limitNum;

  try {
    // Ищем страну по имени
    const countryData = await Country.findOne({
      where: { name: country },
      attributes: ["id", "name"],
      raw: true,
    });

    if (!countryData) {
      return res.status(404).json({ error: "Страна не найдена" });
    }

    // Получаем хосты для этой страны с пагинацией
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
        country_id: countryData.id,
      },
      order: [
        ["priority_id", "DESC"],
        ["updated_at", "DESC"],
      ],
      limit: limitNum,
      offset: offset,
    });

    const formattedHosts = hosts.map(formatHostData);
    const totalItems = await Host.count({
      where: {
        country_id: countryData.id,
      },
    });

    const totalPages = Math.ceil(totalItems / limitNum);

    return res.json({
      items: formattedHosts,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: totalItems,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      country: countryData.name,
    });
  } catch (error) {
    console.error("Ошибка в getCountryDetails:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// Функция для получения данных по приоритету с пагинацией
export const getPriorityDetails = async (req, res) => {
  const { priority, page = 1, limit = 10 } = req.query;
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
  const offset = (pageNum - 1) * limitNum;

  try {
    // Ищем приоритет по имени
    const priorityData = await Priority.findOne({
      where: { name: priority },
      attributes: ["id", "name"],
      raw: true,
    });

    if (!priorityData) {
      return res.status(404).json({ error: "Приоритет не найден" });
    }

    // Получаем хосты для этого приоритета с пагинацией
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
          model: Grouping,
          attributes: ["id", "name"],
          required: false,
        },
        {
          model: Country,
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
        priority_id: priorityData.id,
      },
      order: [
        ["priority_id", "DESC"],
        ["updated_at", "DESC"],
      ],
      limit: limitNum,
      offset: offset,
    });

    const formattedHosts = hosts.map(formatHostData);
    const totalItems = await Host.count({
      where: {
        priority_id: priorityData.id,
      },
    });

    const totalPages = Math.ceil(totalItems / limitNum);

    return res.json({
      items: formattedHosts,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: totalItems,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      priority: priorityData.name,
    });
  } catch (error) {
    console.error("Ошибка в getPriorityDetails:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};
/*************************************************************************** */
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
//   Grouping,
//   Country,
// } from "../models/index.js";

// // Вспомогательная функция для форматирования данных хоста
// const formatHostData = (host) => {
//   const openPorts = [];
//   const filteredPorts = [];
//   const openPortsSet = new Set();
//   const filteredPortsSet = new Set();

//   // console.log('host.Ports >> ', host.Ports)
//   if (host.Ports && Array.isArray(host.Ports)) {
//     host.Ports.forEach((port) => {
//       // console.log('port.WellKnownPort ', port.WellKnownPort)
//       const portInfo = {
//         port: port.port,
//         name: port.name || port.WellKnownPort?.dataValues.name  || null,
//         // name: port.name || null,
//       };
//       // console.log('portInfo >> ', portInfo)
//       if (port.type === "open" && !openPortsSet.has(port.port)) {
//         openPorts.push(portInfo);
//         openPortsSet.add(port.port);
//       } else if (port.type === "filtered" && !filteredPortsSet.has(port.port)) {
//         filteredPorts.push(portInfo);
//         filteredPortsSet.add(port.port);
//       }
//     });
//   }
//   // console.log('openPorts >> ', openPorts)

//   const hasWhois =
//     host.Whois && Array.isArray(host.Whois) && host.Whois.length > 0;

//   const priorityInfo = {
//     priority: null,
//     grouping: null,
//   };

//   // @TODO изменил Priority => priority county и grouping
//   if (host.priority_id || host.priority) {
//     priorityInfo.priority = {
//       id: host.priority_id || host.priority?.id,
//       name: host.priority?.name || "Unknown",
//     };
//   }

//   if (host.grouping_id || host.grouping) {
//     priorityInfo.grouping = {
//       id: host.grouping_id || host.grouping?.id,
//       name: host.grouping?.name || null,
//     };
//   }

//   // Добавляем информацию о стране
//   const countryInfo = host.country
//     ? {
//         id: host.country.id,
//         name: host.country.name,
//       }
//     : null;

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
//     country_info: countryInfo,
//     has_whois: hasWhois,
//   };
// };

// const getDataDefaultEmpty = (pageNum, groupingType) => ({
//   items: [],
//   pagination: {
//     currentPage: pageNum,
//     totalPages: 0,
//     totalItems: 0,
//     hasNext: false,
//     hasPrev: false,
//   },
//   type: "group",
//   field: groupingType,
// });

// // Вспомогательная функция для парсинга портов из строки
// const parsePortsFromString = (portString) => {
//   if (!portString) return [];
//   // Проверяем, является ли portString массивом
//   const values = Array.isArray(portString) ? portString : [portString];
//   const ports = [];
//   values.forEach((value) => {
//     if (typeof value === "string") {
//       const portMatch = value.match(/(\d+)/);
//       if (portMatch) {
//         const portNumber = parseInt(portMatch[1]);
//         if (portNumber >= 1 && portNumber <= 65535) {
//           ports.push(portNumber);
//         }
//       }
//     }
//   });
//   return [...new Set(ports)];
// };

// // Функция для получения ID приоритетов по названиям
// const getPriorityIdsFromNames = async (priorityNames) => {
//   if (!priorityNames) return [];
//   const names = Array.isArray(priorityNames) ? priorityNames : [priorityNames];
//   const priorities = await Priority.findAll({
//     attributes: ["id"],
//     where: {
//       name: { [Op.in]: names },
//     },
//     raw: true,
//   });
//   return priorities.map((p) => p.id);
// };

// // Функция для получения ID групп по названиям
// const getGroupIdsFromNames = async (groupNames) => {
//   if (!groupNames) return [];
//   const names = Array.isArray(groupNames) ? groupNames : [groupNames];
//   const groups = await Grouping.findAll({
//     attributes: ["id"],
//     where: {
//       name: { [Op.in]: names },
//     },
//     raw: true,
//   });
//   return groups.map((g) => g.id);
// };

// // Функция для получения ID стран по названиям
// const getCountryIdsFromNames = async (countryNames) => {
//   if (!countryNames) return [];
//   const names = Array.isArray(countryNames) ? countryNames : [countryNames];
//   const countries = await Country.findAll({
//     attributes: ["id"],
//     where: {
//       name: { [Op.in]: names },
//     },
//     raw: true,
//   });
//   return countries.map((c) => c.id);
// };

// // Функция для парсинга строки портов с запятыми
// const parsePortsString = (portString) => {
//   if (!portString) return [];
//   if (Array.isArray(portString)) {
//     return parsePortsFromString(portString);
//   }
//   // Разделяем строку по запятым
//   const portStrings = portString.split(",").map((s) => s.trim());
//   const ports = [];
//   portStrings.forEach((str) => {
//     const portMatch = str.match(/(\d+)/);
//     if (portMatch) {
//       const portNumber = parseInt(portMatch[1]);
//       if (portNumber >= 1 && portNumber <= 65535) {
//         ports.push(portNumber);
//       }
//     }
//   });
//   return [...new Set(ports)];
// };

// // Функция для извлечения значений из MultiSelectDataList
// const extractValues = (input) => {
//   if (!input) return [];
//   if (Array.isArray(input)) return input;
//   if (typeof input === "string") {
//     // Разделяем по запятым и убираем пробелы
//     return input
//       .split(",")
//       .map((s) => s.trim())
//       .filter((s) => s);
//   }
//   return [];
// };

// // Основная функция группировки
// export const getGrouping = async (req, res) => {
//   const {
//     ip,
//     portOpened,
//     portFiltered,
//     keyword,
//     priority,
//     group,
//     country,
//     whois,
//     groupingType = "port",
//     dateRange: { startDate, endDate } = {},
//     page = 1,
//     limit = 10,
//   } = req.body;

//   try {
//     console.log("Получен запрос группировки:", req.body);

//     // Параметры пагинации
//     const pageNum = Math.max(1, parseInt(page) || 1);
//     const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
//     const offset = (pageNum - 1) * limitNum;

//     let hostIds = new Set();

//     // 1. Фильтр по IP
//     if (ip) {
//       console.log("Фильтр по IP:", ip);
//       const ipQuery = `
//         SELECT id FROM hosts 
//         WHERE CAST(ip AS TEXT) ILIKE :ipPattern
//       `;
//       const ipHosts = await sequelize.query(ipQuery, {
//         replacements: {
//           ipPattern: `${ip}%`,
//         },
//         type: sequelize.QueryTypes.SELECT,
//         raw: true,
//       });

//       if (!ipHosts.length) {
//         return res.json(getDataDefaultEmpty(pageNum, groupingType));
//       }

//       ipHosts.forEach((host) => hostIds.add(host.id));
//       console.log(`После фильтра по IP: ${hostIds.size} хостов`);
//     }

//     // 2. Фильтр по дате
//     if (startDate || endDate) {
//       console.log("Фильтр по дате:", { startDate, endDate });
//       const dateWhere = {};
//       if (startDate) dateWhere[Op.gte] = new Date(startDate);
//       if (endDate) dateWhere[Op.lte] = new Date(endDate);

//       const dateHosts = await Host.findAll({
//         attributes: ["id"],
//         where:
//           hostIds.size > 0
//             ? {
//                 id: Array.from(hostIds),
//                 updated_at: dateWhere,
//               }
//             : { updated_at: dateWhere },
//         raw: true,
//       });

//       if (!dateHosts.length) {
//         return res.json(getDataDefaultEmpty(pageNum, groupingType));
//       }

//       const dateHostIds = new Set(dateHosts.map((h) => h.id));
//       hostIds =
//         hostIds.size > 0
//           ? new Set(Array.from(hostIds).filter((id) => dateHostIds.has(id)))
//           : dateHostIds;

//       console.log(`После фильтра по дате: ${hostIds.size} хостов`);
//     }

//     // 3. Фильтр по приоритету
//     if (priority) {
//       console.log("Фильтр по приоритету:", priority);
//       const priorityNames = extractValues(priority);
//       const priorityIds = await getPriorityIdsFromNames(priorityNames);

//       if (priorityIds.length > 0) {
//         const priorityHosts = await Host.findAll({
//           attributes: ["id"],
//           where:
//             hostIds.size > 0
//               ? {
//                   id: Array.from(hostIds),
//                   priority_id: priorityIds,
//                 }
//               : {
//                   priority_id: priorityIds,
//                 },
//           raw: true,
//         });

//         if (!priorityHosts.length) {
//           return res.json({
//             items: [],
//             pagination: {
//               currentPage: pageNum,
//               totalPages: 0,
//               totalItems: 0,
//               hasNext: false,
//               hasPrev: false,
//             },
//             type: "group",
//             field: groupingType,
//           });
//         }

//         const priorityHostIds = new Set(priorityHosts.map((h) => h.id));
//         hostIds =
//           hostIds.size > 0
//             ? new Set(
//                 Array.from(hostIds).filter((id) => priorityHostIds.has(id))
//               )
//             : priorityHostIds;
//       }

//       console.log(`После фильтра по приоритету: ${hostIds.size} хостов`);
//     }

//     // 4. Фильтр по группировке
//     if (group) {
//       console.log("Фильтр по группировке:", group);
//       const groupNames = extractValues(group);
//       const groupIds = await getGroupIdsFromNames(groupNames);

//       if (groupIds.length > 0) {
//         const groupHosts = await Host.findAll({
//           attributes: ["id"],
//           where:
//             hostIds.size > 0
//               ? {
//                   id: Array.from(hostIds),
//                   grouping_id: groupIds,
//                 }
//               : {
//                   grouping_id: groupIds,
//                 },
//           raw: true,
//         });

//         if (!groupHosts.length) {
//           return res.json(getDataDefaultEmpty(pageNum, groupingType));
//         }

//         const groupHostIds = new Set(groupHosts.map((h) => h.id));
//         hostIds =
//           hostIds.size > 0
//             ? new Set(Array.from(hostIds).filter((id) => groupHostIds.has(id)))
//             : groupHostIds;
//       }

//       console.log(`После фильтра по группировке: ${hostIds.size} хостов`);
//     }

//     // 5. Фильтр по стране
//     if (country) {
//       console.log("Фильтр по стране:", country);
//       const countryNames = extractValues(country);
//       const countryIds = await getCountryIdsFromNames(countryNames);

//       if (countryIds.length > 0) {
//         const countryHosts = await Host.findAll({
//           attributes: ["id"],
//           where:
//             hostIds.size > 0
//               ? {
//                   id: Array.from(hostIds),
//                   country_id: countryIds,
//                 }
//               : {
//                   country_id: countryIds,
//                 },
//           raw: true,
//         });

//         if (!countryHosts.length) {
//           return res.json(getDataDefaultEmpty(pageNum, groupingType));
//         }

//         const countryHostIds = new Set(countryHosts.map((h) => h.id));
//         hostIds =
//           hostIds.size > 0
//             ? new Set(
//                 Array.from(hostIds).filter((id) => countryHostIds.has(id))
//               )
//             : countryHostIds;
//       }

//       console.log(`После фильтра по стране: ${hostIds.size} хостов`);
//     }

//     // 6. Фильтр по наличию WHOIS данных
//     if (whois !== "all") {
//       console.log("Фильтр по наличию WHOIS:", whois);

//       if (whois === "withWhois") {
//         // Только с WHOIS
//         const whoisHosts = await Host.findAll({
//           attributes: ["id"],
//           include: [
//             {
//               model: Whois,
//               attributes: [],
//               required: true,
//             },
//           ],
//           where: hostIds.size > 0 ? { id: Array.from(hostIds) } : {},
//           raw: true,
//         });

//         if (!whoisHosts.length) {
//           return res.json(getDataDefaultEmpty(pageNum, groupingType));
//         }

//         const whoisHostIds = new Set(whoisHosts.map((h) => h.id));
//         hostIds =
//           hostIds.size > 0
//             ? new Set(Array.from(hostIds).filter((id) => whoisHostIds.has(id)))
//             : whoisHostIds;
//       } else if (whois === "noWhois") {
//         const noWhoisHosts = await Host.findAll({
//           attributes: ["id"],
//           include: [
//             {
//               model: Whois,
//               attributes: [],
//               required: false,
//             },
//           ],
//           where:
//             hostIds.size > 0
//               ? {
//                   id: Array.from(hostIds),
//                   "$Whois.id$": null,
//                 }
//               : {
//                   "$Whois.id$": null,
//                 },
//           raw: true,
//         });

//         if (!noWhoisHosts.length) {
//           return res.json(getDataDefaultEmpty(pageNum, groupingType));
//         }

//         const noWhoisHostIds = new Set(noWhoisHosts.map((h) => h.id));
//         hostIds =
//           hostIds.size > 0
//             ? new Set(
//                 Array.from(hostIds).filter((id) => noWhoisHostIds.has(id))
//               )
//             : noWhoisHostIds;
//       }

//       console.log(`После фильтра по WHOIS: ${hostIds.size} хостов`);
//     }

//     // 7. Фильтр по ключевым словам
//     if (keyword) {
//       console.log("Фильтр по ключевым словам:", keyword);
//       const keywords = extractValues(keyword);

//       if (keywords.length > 0) {
//         const keywordPromises = keywords.map((kw) => {
//           const keywordSql = `
//             SELECT DISTINCT h.id
//             FROM hosts h
//             INNER JOIN whois w ON h.id = w.host_id
//             INNER JOIN whois_keys wk ON w.key_id = wk.id
//             WHERE (LOWER(w.value) LIKE LOWER(:keyword) 
//                OR LOWER(wk.key_name) LIKE LOWER(:keyword))
//                ${hostIds.size > 0 ? "AND h.id IN (:hostIds)" : ""}
//           `;
//           return sequelize.query(keywordSql, {
//             replacements: {
//               keyword: `%${kw}%`,
//               hostIds: hostIds.size > 0 ? Array.from(hostIds) : [],
//             },
//             type: sequelize.QueryTypes.SELECT,
//           });
//         });

//         const keywordResults = await Promise.all(keywordPromises);
//         const keywordHostIds = new Set();

//         keywordResults.forEach((result) => {
//           result.forEach((row) => keywordHostIds.add(row.id));
//         });

//         if (!keywordHostIds.size) {
//           return res.json(getDataDefaultEmpty(pageNum, groupingType));
//         }

//         hostIds =
//           hostIds.size > 0
//             ? new Set(
//                 Array.from(hostIds).filter((id) => keywordHostIds.has(id))
//               )
//             : keywordHostIds;
//       }

//       console.log(`После фильтра по ключевым словам: ${hostIds.size} хостов`);
//     }

//     // 8. Фильтр по портам
//     if (portOpened || portFiltered) {
//       console.log("Фильтр по портам:", { portOpened, portFiltered });
//       const openedPorts = parsePortsString(portOpened);
//       const filteredPorts = parsePortsString(portFiltered);

//       let portWhereConditions = [];

//       if (openedPorts.length > 0) {
//         portWhereConditions.push({
//           port: openedPorts,
//           type: "open",
//         });
//       }

//       if (filteredPorts.length > 0) {
//         portWhereConditions.push({
//           port: filteredPorts,
//           type: "filtered",
//         });
//       }

//       if (portWhereConditions.length > 0) {
//         const portHosts = await Port.findAll({
//           attributes: ["host_id"],
//           where: {
//             [Op.or]: portWhereConditions,
//             ...(hostIds.size > 0 && { host_id: Array.from(hostIds) }),
//           },
//           raw: true,
//         });

//         if (!portHosts.length) {
//           return res.json(getDataDefaultEmpty(pageNum, groupingType));
//         }

//         const portHostIds = new Set(portHosts.map((p) => p.host_id));
//         hostIds =
//           hostIds.size > 0
//             ? new Set(Array.from(hostIds).filter((id) => portHostIds.has(id)))
//             : portHostIds;

//         console.log(`После фильтра по портам: ${hostIds.size} хостов`);
//       }
//     }

//     // Получаем отфильтрованные ID хостов
//     const finalHostIds = Array.from(hostIds);

//     if (!finalHostIds.length) {
//       return res.json(getDataDefaultEmpty(pageNum, groupingType));
//     }

//     console.log(
//       `Финальный отбор для группировки: ${finalHostIds.length} хостов`
//     );

//     // Получаем полные данные для отфильтрованных хостов
//     // const hosts = await Host.findAll({
//     //   include: [
//     //     {
//     //       model: Port,
//     //       attributes: ["port", "type"],
//     //       include: [
//     //         {
//     //           model: WellKnownPort,
//     //           attributes: ["name"],
//     //           required: false,
//     //         },
//     //       ],
//     //     },
//     //     {
//     //       model: Priority,
//     //       attributes: ["id", "name"],
//     //       required: false,
//     //     },
//     //     {
//     //       model: Grouping,
//     //       attributes: ["id", "name"],
//     //       required: false,
//     //     },
//     //     {
//     //       model: Country,
//     //       attributes: ["id", "name"],
//     //       required: false,
//     //     },
//     //     {
//     //       model: Whois,
//     //       attributes: ["value"],
//     //       include: [
//     //         {
//     //           model: WhoisKey,
//     //           attributes: ["key_name"],
//     //           required: false,
//     //         },
//     //       ],
//     //       required: false,
//     //     },
//     //   ],
//     //   where: { id: finalHostIds },
//     //   order: [
//     //     ["priority_id", "DESC"],
//     //     ["updated_at", "DESC"],
//     //   ],
//     // });

//     /*********************************** */

//     const hosts = await sequelize.query(`
//       SELECT
//         h.id,
//         h.ip,
//         h.reachable,
//         h.updated_at,
//         h.priority_id,
//         h.grouping_id,
//         h.country_id,

//         -- Данные о приоритете
//         p.id as "priority.id",
//         p.name as "priority.name",

//         -- Данные о группировке
//         g.id as "grouping.id",
//         g.name as "grouping.name",

//         -- Данные о стране
//         c.id as "country.id",
//         c.name as "country.name"

//       FROM hosts h

//       -- LEFT JOIN для приоритета
//       LEFT JOIN host_priorities p ON h.priority_id = p.id

//       -- LEFT JOIN для группировки
//       LEFT JOIN host_groupings g ON h.grouping_id = g.id

//       -- LEFT JOIN для страны
//       LEFT JOIN countries c ON h.country_id = c.id

//       WHERE h.id IN (:finalHostIds)

//       ORDER BY
//         h.priority_id DESC NULLS LAST,
//         h.updated_at DESC
//     `, {
//       replacements: { finalHostIds },
//       type: sequelize.QueryTypes.SELECT,
//       nest: true,
//     });

//     // Затем отдельно получаем связанные данные
//     if (hosts.length > 0) {
//       const hostIds = hosts.map(h => h.id);

//       // Получаем порты с well_known_ports - ИСПРАВЛЕННЫЙ ЗАПРОС
//       const ports = await sequelize.query(`
//         SELECT
//           p.host_id,
//           p.port,
//           p.type,
//           wkp.name as well_known_port_name
//         FROM ports p
//         LEFT JOIN well_known_ports wkp ON p.port = wkp.port
//         WHERE p.host_id IN (:hostIds)
//       `, {
//         replacements: { hostIds },
//         type: sequelize.QueryTypes.SELECT,
//         nest: false,  // Используем false для плоской структуры
//       });

//       // console.log('ports >>> ', ports)

//       // Получаем WHOIS данные
//       const whoisData = await sequelize.query(`
//         SELECT
//           w.host_id,
//           w.value,
//           wk.key_name as "WhoisKey.key_name"
//         FROM whois w
//         LEFT JOIN whois_keys wk ON w.key_id = wk.id
//         WHERE w.host_id IN (:hostIds)
//       `, {
//         replacements: { hostIds },
//         type: sequelize.QueryTypes.SELECT,
//         nest: true,
//       });

//       // Группируем данные по host_id
//       const portsByHost = {};
//       ports.forEach(port => {
//         if (!portsByHost[port.host_id]) {
//           portsByHost[port.host_id] = [];
//         }

//         // Получаем имя порта из well_known_port_name
//         const portName = port.well_known_port_name || null;

//         portsByHost[port.host_id].push({
//           port: port.port,
//           type: port.type,
//           name: portName  // Простое поле name с именем порта
//         });
//       });
//       // console.log('portsByHost >>> ', portsByHost)

//       const whoisByHost = {};
//       whoisData.forEach(whois => {
//         if (!whoisByHost[whois.host_id]) {
//           whoisByHost[whois.host_id] = [];
//         }
//         whoisByHost[whois.host_id].push({
//           value: whois.value,
//           WhoisKey: whois['WhoisKey.key_name'] ? { key_name: whois['WhoisKey.key_name'] } : null
//         });
//       });

//       // Объединяем все данные
//       hosts.forEach(host => {
//         // Получаем все порты для хоста
//         const allPorts = portsByHost[host.id] || [];

//         // Разделяем порты по типам
//         const openPorts = allPorts.filter(p => p.type === 'open')
//           .map(p => ({ port: p.port, name: p.name }));

//         const filteredPorts = allPorts.filter(p => p.type === 'filtered')
//           .map(p => ({ port: p.port, name: p.name }));

//         // Сохраняем оригинальную структуру
//         host.Ports = allPorts;
//         host.Whois = whoisByHost[host.id] || [];

//         // Добавляем структурированные данные для вывода
//         host.port_data = {
//           open: openPorts,
//           filtered: filteredPorts
//         };
//       });
//     }
//     /*********************************** */

//     // console.log("hosts >>> ", hosts[34]);

//     // Форматируем данные хостов
//     const formattedHosts = hosts.map(formatHostData);

//     // Группируем данные по выбранному полю
//     const groupedData = await groupByField(
//       groupingType,
//       formattedHosts,
//       finalHostIds.length,
//       pageNum,
//       limitNum,
//       offset
//     );

//     // Общее количество групп для пагинации
//     const totalGroups = groupedData.length;
//     const totalPages = Math.ceil(totalGroups / limitNum);

//     // Применяем пагинацию к группам
//     const paginatedGroups = groupedData.slice(offset, offset + limitNum);

//     return res.json({
//       items: paginatedGroups,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalItems: totalGroups,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },
//       type: "group",
//       field: groupingType,
//     });
//   } catch (error) {
//     console.error("Ошибка в getGrouping:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// // Функция группировки по разным полям
// async function groupByField(field, hosts, totalHosts, page, limit, offset) {
//   switch (field) {
//     case "port":
//       return await groupByPorts(hosts, totalHosts);
//     case "priority":
//       return await groupByPriority(hosts);
//     case "group":
//       return await groupByHostGroup(hosts);
//     case "country":
//       return await groupByCountry(hosts);
//     case "ip":
//       return hosts;
//     case "keyword":
//       return await groupByKeywords(hosts);
//     case "whois":
//       return await groupByWhois(hosts);
//     default:
//       return await groupByPorts(hosts, totalHosts);
//   }
// }

// // Группировка по портам
// async function groupByPorts(hosts, totalHosts) {
//   const portMap = new Map();

//   // Собираем все уникальные порты из всех хостов
//   hosts.forEach((host) => {
//     // Открытые порты
//     if (host.port_data.open) {
//       host.port_data.open.forEach((port) => {
//         if (!portMap.has(port.port)) {
//           portMap.set(port.port, {
//             port: port.port,
//             name: port.name,
//             count: 0,
//             items: [],
//           });
//         }
//         const portGroup = portMap.get(port.port);
//         if (!portGroup.items.some((item) => item.id === host.id)) {
//           portGroup.items.push(host);
//           portGroup.count++;
//         }
//       });
//     }

//     // Фильтрованные порты
//     if (host.port_data.filtered) {
//       host.port_data.filtered.forEach((port) => {
//         if (!portMap.has(port.port)) {
//           portMap.set(port.port, {
//             port: port.port,
//             name: port.name,
//             count: 0,
//             items: [],
//           });
//         }
//         const portGroup = portMap.get(port.port);
//         if (!portGroup.items.some((item) => item.id === host.id)) {
//           portGroup.items.push(host);
//           portGroup.count++;
//         }
//       });
//     }
//   });

//   // Преобразуем в массив и сортируем
//   const groups = Array.from(portMap.values())
//     .sort((a, b) => a.port - b.port)
//     .map((group) => ({
//       ...group,
//       // Внутренняя пагинация для хостов в группе (если нужно)
//       pagination: {
//         currentPage: 1,
//         totalPages: Math.ceil(group.items.length / 10),
//         totalItems: group.items.length,
//         hasNext: group.items.length > 10,
//         hasPrev: false,
//       },
//       // Оставляем только первые 10 хостов для отображения
//       items: group.items.slice(0, 10),
//     }));

//   return groups;
// }

// // Группировка по приоритету
// async function groupByPriority(hosts) {
//   const priorityMap = new Map();

//   hosts.forEach((host) => {
//     const priorityId = host.priority_info.priority?.id || 0;
//     const priorityName = host.priority_info.priority?.name || "Без приоритета";

//     if (!priorityMap.has(priorityId)) {
//       priorityMap.set(priorityId, {
//         id: priorityId,
//         name: priorityName,
//         count: 0,
//         items: [],
//       });
//     }

//     const group = priorityMap.get(priorityId);
//     group.items.push(host);
//     group.count++;
//   });

//   return Array.from(priorityMap.values())
//     .sort((a, b) => b.id - a.id) // Сортировка по убыванию приоритета
//     .map((group) => ({
//       ...group,
//       pagination: {
//         currentPage: 1,
//         totalPages: Math.ceil(group.items.length / 10),
//         totalItems: group.items.length,
//         hasNext: group.items.length > 10,
//         hasPrev: false,
//       },
//       items: group.items.slice(0, 10),
//     }));
// }

// // Группировка по группе хостов
// async function groupByHostGroup(hosts) {
//   const groupMap = new Map();

//   hosts.forEach((host) => {
//     const groupId = host.priority_info.grouping?.id || 0;
//     const groupName =
//       host.priority_info.grouping?.name || "Неопределенная группа";

//     if (!groupMap.has(groupId)) {
//       groupMap.set(groupId, {
//         id: groupId,
//         name: groupName,
//         count: 0,
//         items: [],
//       });
//     }

//     const group = groupMap.get(groupId);
//     group.items.push(host);
//     group.count++;
//   });

//   return Array.from(groupMap.values())
//     .sort((a, b) => a.name.localeCompare(b.name))
//     .map((group) => ({
//       ...group,
//       pagination: {
//         currentPage: 1,
//         totalPages: Math.ceil(group.items.length / 10),
//         totalItems: group.items.length,
//         hasNext: group.items.length > 10,
//         hasPrev: false,
//       },
//       items: group.items.slice(0, 10),
//     }));
// }

// // Группировка по стране
// async function groupByCountry(hosts) {
//   const countryMap = new Map();

//   hosts.forEach((host) => {
//     const countryId = host.country_info?.id || 0;
//     const countryName = host.country_info?.name || "Неизвестная страна";

//     if (!countryMap.has(countryId)) {
//       countryMap.set(countryId, {
//         id: countryId,
//         name: countryName,
//         count: 0,
//         items: [],
//       });
//     }

//     const group = countryMap.get(countryId);
//     group.items.push(host);
//     group.count++;
//   });

//   return Array.from(countryMap.values())
//     .sort((a, b) => a.name.localeCompare(b.name))
//     .map((group) => ({
//       ...group,
//       pagination: {
//         currentPage: 1,
//         totalPages: Math.ceil(group.items.length / 10),
//         totalItems: group.items.length,
//         hasNext: group.items.length > 10,
//         hasPrev: false,
//       },
//       items: group.items.slice(0, 10),
//     }));
// }

// // Группировка по ключевым словам оптимизированный
// async function groupByKeywords(hosts) {
//   try {
//     if (!hosts || hosts.length === 0) {
//       return [];
//     }

//     // Создаем Map для быстрого поиска хостов по ID
//     const hostsMap = new Map();
//     hosts.forEach(host => {
//       hostsMap.set(host.id, host);
//     });

//     // Получаем ID всех отфильтрованных хостов
//     const hostIds = hosts.map(host => host.id);

//     // Используем один SQL запрос для получения всех необходимых данных
//     const keywordDataSql = `
//       WITH host_keywords AS (
//         SELECT 
//           w.host_id,
//           wk.key_name,
//           COUNT(*) OVER (PARTITION BY wk.key_name) as total_count
//         FROM whois w
//         INNER JOIN whois_keys wk ON w.key_id = wk.id
//         WHERE w.host_id IN (:hostIds)
//         GROUP BY w.host_id, wk.key_name
//         ORDER BY wk.key_name ASC
//       )
//       SELECT 
//         key_name,
//         total_count,
//         ARRAY_AGG(host_id) as host_ids
//       FROM host_keywords
//       GROUP BY key_name, total_count
//       ORDER BY key_name ASC
//     `;

//     const keywordGroupsResult = await sequelize.query(keywordDataSql, {
//       replacements: { hostIds },
//       type: sequelize.QueryTypes.SELECT,
//     });

//     // Если нет данных WHOIS, возвращаем пустой массив
//     if (!keywordGroupsResult.length) {
//       return [];
//     }

//     // Собираем группы
//     const groups = keywordGroupsResult.map(row => {
//       const keyword = row.key_name;
//       const totalCount = parseInt(row.total_count);
//       const hostIdArray = row.host_ids || [];
      
//       // Получаем хосты для этой группы (первые 10)
//       const groupHosts = [];
//       const addedHostIds = new Set();
      
//       for (const hostId of hostIdArray) {
//         if (groupHosts.length >= 10) break;
        
//         const host = hostsMap.get(hostId);
//         if (host && !addedHostIds.has(hostId)) {
//           groupHosts.push(host);
//           addedHostIds.add(hostId);
//         }
//       }
      
//       // Сортируем хосты внутри группы по приоритету и дате
//       groupHosts.sort((a, b) => {
//         const priorityA = a.priority_info?.priority?.id || 0;
//         const priorityB = b.priority_info?.priority?.id || 0;
        
//         if (priorityB !== priorityA) {
//           return priorityB - priorityA;
//         }
        
//         if (a.updated_at && b.updated_at) {
//           return new Date(b.updated_at) - new Date(a.updated_at);
//         }
        
//         return 0;
//       });

//       const totalItemsInGroup = Math.min(totalCount, hostIdArray.length);
//       const totalPagesInGroup = Math.ceil(totalItemsInGroup / 10);

//       return {
//         keyword: keyword,
//         name: keyword,
//         count: totalCount,
//         items: groupHosts,
//         pagination: {
//           currentPage: 1,
//           totalPages: totalPagesInGroup,
//           totalItems: totalItemsInGroup,
//           hasNext: totalItemsInGroup > 10,
//           hasPrev: false,
//         },
//       };
//     });

//     // Фильтруем пустые группы и возвращаем результат
//     return groups.filter(group => group.items.length > 0);

//   } catch (error) {
//     console.error("Ошибка в groupByKeywords:", error);
//     return [];
//   }
// }

// // страый рабочий
// //// Группировка по ключевым словам
// // async function groupByKeywords(hosts) {
// //   try {
// //     // Получаем ID всех отфильтрованных хостов
// //     const hostIds = hosts.map((host) => host.id);

// //     if (!hostIds.length) {
// //       return [];
// //     }

// //     // Используем raw SQL для получения уникальных ключевых слов с подсчетом хостов
// //     const uniqueKeywordsSql = `
// //       SELECT DISTINCT wk.key_name, COUNT(DISTINCT w.host_id) as count
// //       FROM whois_keys wk
// //       INNER JOIN whois w ON wk.id = w.key_id
// //       WHERE w.host_id IN (:hostIds)
// //       GROUP BY wk.key_name
// //       ORDER BY wk.key_name ASC
// //     `;

// //     const uniqueKeywordsResult = await sequelize.query(uniqueKeywordsSql, {
// //       replacements: { hostIds },
// //       type: sequelize.QueryTypes.SELECT,
// //     });

// //     // Получаем полные WHOIS данные для хостов с группировкой по ключевым словам
// //     const hostsWithWhois = await Host.findAll({
// //       include: [
// //         {
// //           model: Port,
// //           attributes: ["port", "type"],
// //           include: [
// //             {
// //               model: WellKnownPort,
// //               attributes: ["name"],
// //               required: false,
// //             },
// //           ],
// //         },
// //         {
// //           model: Priority,
// //           attributes: ["id", "name"],
// //           required: false,
// //         },
// //         {
// //           model: Grouping,
// //           attributes: ["id", "name"],
// //           required: false,
// //         },
// //         {
// //           model: Country,
// //           attributes: ["id", "name"],
// //           required: false,
// //         },
// //         {
// //           model: Whois,
// //           attributes: ["value"],
// //           include: [
// //             {
// //               model: WhoisKey,
// //               attributes: ["key_name"],
// //               required: false,
// //             },
// //           ],
// //           required: false,
// //         },
// //       ],
// //       where: {
// //         id: { [Op.in]: hostIds },
// //       },
// //       order: [
// //         ["priority_id", "DESC"],
// //         ["updated_at", "DESC"],
// //       ],
// //     });

// //     // Форматируем данные хостов (используем ту же функцию formatHostData)
// //     const formattedHostsMap = new Map();
// //     hostsWithWhois.forEach((host) => {
// //       if (!formattedHostsMap.has(host.id)) {
// //         formattedHostsMap.set(host.id, formatHostData(host));
// //       }
// //     });

// //     // Инициализируем группы для всех уникальных ключевых слов
// //     const keywordGroups = {};

// //     uniqueKeywordsResult.forEach((row) => {
// //       const keyword = row.key_name;
// //       const count = parseInt(row.count);
// //       keywordGroups[keyword] = {
// //         keyword: keyword,
// //         count: count,
// //         items: [],
// //       };
// //     });

// //     // Группируем хосты по ключевым словам через WHOIS данные
// //     for (const host of hostsWithWhois) {
// //       const formattedHost = formattedHostsMap.get(host.id);
// //       const hostWhois = host.Whois || [];
      
// //       if (formattedHost && hostWhois.length > 0) {
// //         for (const whois of hostWhois) {
// //           const keyName = whois.WhoisKey?.key_name;

// //           if (keyName && keywordGroups[keyName]) {
// //             // Проверяем, что хост еще не добавлен в эту группу
// //             const hostExists = keywordGroups[keyName].items.some(
// //               (item) => item.id === formattedHost.id
// //             );

// //             if (!hostExists) {
// //               keywordGroups[keyName].items.push(formattedHost);
// //             }
// //           }
// //         }
// //       }
// //     }

// //     // Сортируем хосты внутри каждой группы по приоритету и дате
// //     Object.values(keywordGroups).forEach((group) => {
// //       group.items.sort((a, b) => {
// //         // Сначала сортируем по приоритету (DESC)
// //         const priorityA = a.priority_info?.priority?.id || 0;
// //         const priorityB = b.priority_info?.priority?.id || 0;

// //         if (priorityB !== priorityA) {
// //           return priorityB - priorityA;
// //         }

// //         // Если приоритеты одинаковые, сортируем по дате обновления
// //         if (a.updated_at && b.updated_at) {
// //           return new Date(b.updated_at) - new Date(a.updated_at);
// //         }

// //         return 0;
// //       });
// //     });

// //     // Преобразуем в нужный формат и сортируем по возрастанию ключевых слов
// //     const groups = Object.values(keywordGroups)
// //       .filter((group) => group.items.length > 0)
// //       .map((group) => {
// //         const totalItemsInGroup = group.items.length;
// //         const totalPagesInGroup = Math.ceil(totalItemsInGroup / 10); // 10 хостов на страницу внутри группы

// //         return {
// //           keyword: group.keyword,
// //           count: group.count,
// //           name: group.keyword, // Добавляем name для совместимости
// //           items: group.items.slice(0, 10), // Первые 10 хостов для отображения
// //           pagination: {
// //             currentPage: 1,
// //             totalPages: totalPagesInGroup,
// //             totalItems: totalItemsInGroup,
// //             hasNext: totalItemsInGroup > 10,
// //             hasPrev: false,
// //           },
// //         };
// //       })
// //       .sort((a, b) => a.keyword.localeCompare(b.keyword));

// //     return groups;
// //   } catch (error) {
// //     console.error("Ошибка в groupByKeywords:", error);
// //     return [];
// //   }
// // }



// // Группировка по наличию WHOIS
// async function groupByWhois(hosts) {
//   const withWhois = hosts.filter((h) => h.has_whois);
//   const withoutWhois = hosts.filter((h) => !h.has_whois);

//   const groups = [];

//   if (withWhois.length > 0) {
//     groups.push({
//       name: "С WHOIS данными",
//       count: withWhois.length,
//       items: withWhois.slice(0, 10),
//       pagination: {
//         currentPage: 1,
//         totalPages: Math.ceil(withWhois.length / 10),
//         totalItems: withWhois.length,
//         hasNext: withWhois.length > 10,
//         hasPrev: false,
//       },
//     });
//   }

//   if (withoutWhois.length > 0) {
//     groups.push({
//       name: "Без WHOIS данных",
//       count: withoutWhois.length,
//       items: withoutWhois.slice(0, 10),
//       pagination: {
//         currentPage: 1,
//         totalPages: Math.ceil(withoutWhois.length / 10),
//         totalItems: withoutWhois.length,
//         hasNext: withoutWhois.length > 10,
//         hasPrev: false,
//       },
//     });
//   }

//   return groups;
// }

// // Функция для получения данных по группе с пагинацией
// export const getGroupDetails = async (req, res) => {
//   const { group, page = 1, limit = 10 } = req.query;
//   const pageNum = Math.max(1, parseInt(page) || 1);
//   const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
//   const offset = (pageNum - 1) * limitNum;

//   try {
//     // Ищем группу по имени
//     const groupData = await Grouping.findOne({
//       where: { name: group },
//       attributes: ["id", "name"],
//       raw: true,
//     });

//     if (!groupData) {
//       return res.status(404).json({ error: "Группа не найдена" });
//     }

//     // Получаем хосты для этой группы с пагинацией
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
//         },
//         {
//           model: Priority,
//           attributes: ["id", "name"],
//           required: false,
//         },
//         {
//           model: Country,
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
//       ],
//       where: {
//         grouping_id: groupData.id,
//       },
//       order: [
//         ["priority_id", "DESC"],
//         ["updated_at", "DESC"],
//       ],
//       limit: limitNum,
//       offset: offset,
//     });

//     const formattedHosts = hosts.map(formatHostData);
//     const totalItems = await Host.count({
//       where: {
//         grouping_id: groupData.id,
//       },
//     });

//     const totalPages = Math.ceil(totalItems / limitNum);

//     return res.json({
//       items: {
//         items: formattedHosts,
//         name: groupData.name,
//         pagination: {
//           currentPage: pageNum,

//           totalPages: totalPages,
//           totalItems: totalItems,
//           hasNext: pageNum < totalPages,
//           hasPrev: pageNum > 1,
//         },
//       },

//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalItems: totalItems,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },

//       field: "groups",
//       type: "group",
//     });
//   } catch (error) {
//     console.error("Ошибка в getGroupDetails:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// // Функция для получения данных по стране с пагинацией
// export const getCountryDetails = async (req, res) => {
//   const { country, page = 1, limit = 10 } = req.query;
//   const pageNum = Math.max(1, parseInt(page) || 1);
//   const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
//   const offset = (pageNum - 1) * limitNum;

//   try {
//     // Ищем страну по имени
//     const countryData = await Country.findOne({
//       where: { name: country },
//       attributes: ["id", "name"],
//       raw: true,
//     });

//     if (!countryData) {
//       return res.status(404).json({ error: "Страна не найдена" });
//     }

//     // Получаем хосты для этой страны с пагинацией
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
//       ],
//       where: {
//         country_id: countryData.id,
//       },
//       order: [
//         ["priority_id", "DESC"],
//         ["updated_at", "DESC"],
//       ],
//       limit: limitNum,
//       offset: offset,
//     });

//     const formattedHosts = hosts.map(formatHostData);
//     const totalItems = await Host.count({
//       where: {
//         country_id: countryData.id,
//       },
//     });

//     const totalPages = Math.ceil(totalItems / limitNum);

//     return res.json({
//       items: formattedHosts,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalItems: totalItems,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },
//       country: countryData.name,
//     });
//   } catch (error) {
//     console.error("Ошибка в getCountryDetails:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// // Функция для получения данных по приоритету с пагинацией
// export const getPriorityDetails = async (req, res) => {
//   const { priority, page = 1, limit = 10 } = req.query;
//   const pageNum = Math.max(1, parseInt(page) || 1);
//   const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
//   const offset = (pageNum - 1) * limitNum;

//   try {
//     // Ищем приоритет по имени
//     const priorityData = await Priority.findOne({
//       where: { name: priority },
//       attributes: ["id", "name"],
//       raw: true,
//     });

//     if (!priorityData) {
//       return res.status(404).json({ error: "Приоритет не найден" });
//     }

//     // Получаем хосты для этого приоритета с пагинацией
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
//         },
//         {
//           model: Grouping,
//           attributes: ["id", "name"],
//           required: false,
//         },
//         {
//           model: Country,
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
//       ],
//       where: {
//         priority_id: priorityData.id,
//       },
//       order: [
//         ["priority_id", "DESC"],
//         ["updated_at", "DESC"],
//       ],
//       limit: limitNum,
//       offset: offset,
//     });

//     const formattedHosts = hosts.map(formatHostData);
//     const totalItems = await Host.count({
//       where: {
//         priority_id: priorityData.id,
//       },
//     });

//     const totalPages = Math.ceil(totalItems / limitNum);

//     return res.json({
//       items: formattedHosts,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalItems: totalItems,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },
//       priority: priorityData.name,
//     });
//   } catch (error) {
//     console.error("Ошибка в getPriorityDetails:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };
