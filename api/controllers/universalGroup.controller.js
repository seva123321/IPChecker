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

// Функция извлечения портов из JSON (унифицированная)
const extractPortsFromJson = (portsJson) => {
  const result = { open: [], filtered: [] };

  if (!portsJson) return result;

  try {
    const ports =
      typeof portsJson === "string" ? JSON.parse(portsJson) : portsJson;

    if (!Array.isArray(ports) || ports.length === 0) return result;

    for (let i = 0; i < ports.length; i++) {
      const port = ports[i];
      if (port && port.port && port.type) {
        const portInfo = {
          port: port.port,
          name: port.port_name || null,
        };

        if (port.type === "open") {
          result.open.push(portInfo);
        } else if (port.type === "filtered") {
          result.filtered.push(portInfo);
        }
      }
    }
  } catch (e) {
    console.error("Error extracting ports:", e);
  }

  return result;
};

// Универсальная функция форматирования данных хоста
const formatHostFromRaw = (host) => {
  const formatted = {
    id: host.id,
    ip: host.ip,
    reachable: host.reachable,
    updated_at: host.updated_at,
    port_data: extractPortsFromJson(host.ports_json),
    priority_info: {
      priority: host.priority_id
        ? {
            id: host.priority_id,
            name: host.priority_name || "Unknown",
          }
        : null,
      grouping: host.grouping_id
        ? {
            id: host.grouping_id,
            name: host.grouping_name || null,
          }
        : null,
    },
    country_info: host.country_id
      ? {
          id: host.country_id,
          name: host.country_name || null,
        }
      : null,
    has_whois: !!host.has_whois,
  };

  // Удаляем служебные поля, если они есть
  delete formatted.rn;
  delete formatted.total_count;

  return formatted;
};

// Вспомогательная функция для пагинации
const paginate = (req) => {
  const { page = 1, limit = 10 } = req.body || req.query;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
  const offset = (pageNum - 1) * limitNum;
  return { pageNum, limitNum, offset };
};

// Функция для извлечения номера порта из строки (например, "443 (https)")
const extractPortFromString = (portString) => {
  if (!portString) return null;
  const match = portString.match(/^(\d+)/);
  return match ? parseInt(match[1]) : null;
};

// Функция для извлечения имени порта из строки
const extractPortNameFromString = (portString) => {
  if (!portString) return null;
  const match = portString.match(/\((.*?)\)$/);
  return match ? match[1] : null;
};

// Основная функция группировки (оптимизированная)
export const getGrouping = async (req, res) => {
  try {
    const {
      groupingType = "port",
      page = 1,
      limit = 10,
      groupValue,
      ip,
      isPortOpened = true,
      isPortFiltered = true,
      portOpened,
      portFiltered,
      keyword,
      priority,
      group,
      country,
      whois,
      dateRange,
    } = req.body;

    console.log("Полученные параметры:", {
      groupingType,
      groupValue,
      isPortOpened,
      isPortFiltered,
      portOpened,
      portFiltered,
      keyword,
      priority,
      group,
      country,
      whois,
      dateRange,
    });

    const { pageNum, limitNum, offset } = paginate(req);

    // Базовый запрос для хостов с учетом фильтров
    let whereConditions = [];
    let replacements = {};

    // Фильтр по IP
    if (ip && ip.trim() !== "") {
      whereConditions.push(`h.ip::text ILIKE :ipPattern`);
      replacements.ipPattern = `${ip.trim()}%`;
      console.log("Фильтр IP:", ip.trim());
    }

    // Фильтр по дате
    if (dateRange?.startDate || dateRange?.endDate) {
      const dateConditions = [];
      if (dateRange.startDate) {
        dateConditions.push(`h.updated_at >= :startDate`);
        replacements.startDate = dateRange.startDate;
        console.log("Фильтр startDate:", dateRange.startDate);
      }
      if (dateRange.endDate) {
        dateConditions.push(`h.updated_at <= :endDate`);
        replacements.endDate = dateRange.endDate;
        console.log("Фильтр endDate:", dateRange.endDate);
      }
      if (dateConditions.length > 0) {
        whereConditions.push(`(${dateConditions.join(" AND ")})`);
      }
    }

    // Фильтр по приоритету
    if (priority && priority.trim() !== "") {
      const priorityNames = Array.isArray(priority) ? priority : [priority];
      const cleanedPriorityNames = priorityNames
        .map((p) => p.trim())
        .filter((p) => p !== "");
      if (cleanedPriorityNames.length > 0) {
        whereConditions.push(`hp.name IN (:priorityNames)`);
        replacements.priorityNames = cleanedPriorityNames;
        console.log("Фильтр приоритета:", cleanedPriorityNames);
      }
    }

    // Фильтр по группе
    if (group && group.trim() !== "") {
      const groupNames = Array.isArray(group) ? group : [group];
      const cleanedGroupNames = groupNames
        .map((g) => g.trim())
        .filter((g) => g !== "");
      if (cleanedGroupNames.length > 0) {
        whereConditions.push(`hg.name IN (:groupNames)`);
        replacements.groupNames = cleanedGroupNames;
        console.log("Фильтр группы:", cleanedGroupNames);
      }
    }

    // Фильтр по стране
    if (country && country.trim() !== "") {
      const countryNames = Array.isArray(country) ? country : [country];
      const cleanedCountryNames = countryNames
        .map((c) => c.trim())
        .filter((c) => c !== "");
      if (cleanedCountryNames.length > 0) {
        whereConditions.push(`c.name IN (:countryNames)`);
        replacements.countryNames = cleanedCountryNames;
        console.log("Фильтр страны:", cleanedCountryNames);
      }
    }

    // Фильтр по WHOIS - КОММЕНТАРИЙ: этот фильтр использует подзапросы EXISTS/NOT EXISTS
    // и не требует JOIN таблиц в основном запросе
    if (whois && whois !== "all") {
      if (whois === "withWhois") {
        whereConditions.push(
          `EXISTS (SELECT 1 FROM whois w WHERE w.host_id = h.id)`
        );
        console.log("Фильтр WHOIS: только с whois");
      } else if (whois === "noWhois") {
        whereConditions.push(
          `NOT EXISTS (SELECT 1 FROM whois w WHERE w.host_id = h.id)`
        );
        console.log("Фильтр WHOIS: только без whois");
      }
    }

    // Фильтр по ключевым словам
    if (keyword && keyword.trim() !== "") {
      const keywords = Array.isArray(keyword) ? keyword : [keyword];
      const cleanedKeywords = keywords
        .map((k) => k.trim())
        .filter((k) => k !== "");
      if (cleanedKeywords.length > 0) {
        const keywordConditions = cleanedKeywords.map(
          (kw, idx) =>
            `(LOWER(w.value) LIKE LOWER(:keyword${idx}) OR LOWER(wk.key_name) LIKE LOWER(:keyword${idx}))`
        );
        whereConditions.push(`(${keywordConditions.join(" OR ")})`);
        cleanedKeywords.forEach((kw, idx) => {
          replacements[`keyword${idx}`] = `%${kw}%`;
        });
        console.log("Фильтр ключевых слов:", cleanedKeywords);
      }
    }

    // Фильтр по портам - КОММЕНТАРИЙ: этот фильтр требует JOIN с таблицей ports
    // в основном запросе, но в зависимости от типа группировки JOIN может быть уже добавлен
    const portConditions = [];
    // portOpened: "5 (rje), 7 (echo), 9 (discard)"

    // Обработка порта Opened
    if (isPortOpened && portOpened && portOpened.trim() !== "") {
      const openedPorts = Array.isArray(portOpened)
        ? portOpened
        : portOpened
            .split(",")
            .map((str) => str.trim())
            .filter((str) => str !== "");

      console.log("openedPorts >> ", openedPorts);

      if (openedPorts.length > 0) {
        openedPorts.forEach((portStr, idx) => {
          const portNum = extractPortFromString(portStr);

          if (portNum !== null) {
            portConditions.push(
              `(p.port = :openedPort${idx} AND p.type = 'open')`
            );
            replacements[`openedPort${idx}`] = portNum;
            console.log("Фильтр открытого порта:", portNum);
          }
        });
      }
    }

    // Обработка порта Filtered
    if (isPortFiltered && portFiltered && portFiltered.trim() !== "") {
      const filteredPorts = Array.isArray(portFiltered)
        ? portFiltered
        : portFiltered
            .split(",")
            .map((str) => str.trim())
            .filter((str) => str !== "");

      console.log("portFiltered >> ", portFiltered);

      if (filteredPorts.length > 0) {
        filteredPorts.forEach((portStr, idx) => {
            const portNum = extractPortFromString(portStr);

            if (portNum !== null) {
              portConditions.push(
                `(p.port = :filteredPort${idx} AND p.type = 'filtered')`
              );
              replacements[`filteredPort${idx}`] = portNum;
              console.log("Фильтр фильтрованного порта:", portNum);
            }
          });
      }
    }

    // if (isPortOpened && portOpened && portOpened.trim() !== '') {
    //   const openedPorts = Array.isArray(portOpened) ? portOpened : [portOpened];
    //   openedPorts.forEach((portStr, idx) => {
    //     if (portStr.trim() !== '') {
    //       const portNum = extractPortFromString(portStr);
    //       if (portNum !== null) {
    //         portConditions.push(`(p.port = :openedPort${idx} AND p.type = 'open')`);
    //         replacements[`openedPort${idx}`] = portNum;
    //         console.log('Фильтр открытого порта:', portNum);
    //       }
    //     }
    //   });
    // }
    // // Обработка порта Filtered
    // if (isPortFiltered && portFiltered && portFiltered.trim() !== '') {
    //   const filteredPorts = Array.isArray(portFiltered) ? portFiltered : [portFiltered];
    //   filteredPorts.forEach((portStr, idx) => {
    //     if (portStr.trim() !== '') {
    //       const portNum = extractPortFromString(portStr);
    //       if (portNum !== null) {
    //         portConditions.push(`(p.port = :filteredPort${idx} AND p.type = 'filtered')`);
    //         replacements[`filteredPort${idx}`] = portNum;
    //         console.log('Фильтр фильтрованного порта:', portNum);
    //       }
    //     }
    //   });
    // }

    if (portConditions.length > 0) {
      whereConditions.push(`(${portConditions.join(" OR ")})`);
    }

    // Формируем WHERE условие
    const whereClause =
      whereConditions.length > 0
        ? `WHERE ${whereConditions.join(" AND ")}`
        : "";
    console.log("Итоговое WHERE условие:", whereClause);
    console.log("Replacements:", replacements);

    // В зависимости от типа группировки выполняем разные запросы
    let result;
    switch (groupingType) {
      case "port":
        result = await groupByPort(
          whereClause,
          replacements,
          pageNum,
          limitNum,
          offset,
          groupValue,
          keyword,
          whois
        );
        break;
      case "keyword":
        result = await groupByKeyword(
          whereClause,
          replacements,
          pageNum,
          limitNum,
          offset,
          groupValue,
          portOpened,
          portFiltered
        );
        break;
      case "priority":
        result = await groupByPriority(
          whereClause,
          replacements,
          pageNum,
          limitNum,
          offset,
          groupValue,
          portOpened,
          portFiltered,
          keyword
        );
        break;
      case "group":
        result = await groupByHostGroup(
          whereClause,
          replacements,
          pageNum,
          limitNum,
          offset,
          groupValue,
          portOpened,
          portFiltered,
          keyword
        );
        break;
      case "country":
        result = await groupByCountry(
          whereClause,
          replacements,
          pageNum,
          limitNum,
          offset,
          groupValue,
          portOpened,
          portFiltered,
          keyword
        );
        break;
      case "whois":
        result = await groupByWhois(
          whereClause,
          replacements,
          pageNum,
          limitNum,
          offset,
          groupValue,
          portOpened,
          portFiltered,
          keyword
        );
        break;
      case "ip":
        result = await getAllHosts(
          whereClause,
          replacements,
          pageNum,
          limitNum,
          offset,
          groupValue
        );
        break;
      default:
        result = await groupByPort(
          whereClause,
          replacements,
          pageNum,
          limitNum,
          offset,
          groupValue
        );
    }

    return res.json({
      items: result.items,
      pagination: result.pagination,
      type: "group",
      field: groupingType,
      tabs: result.tabs || [],
    });
  } catch (error) {
    console.error("Ошибка в getGrouping:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// Группировка по портам
async function groupByPort(
  whereClause,
  replacements,
  pageNum,
  limitNum,
  offset,
  groupValue,
  keyword,
  whois
) {
  console.log("groupByPort groupValue:", groupValue);

  // Создаем базовый запрос для табов
  let tabsQuery = `
    SELECT 
      p.port as value,
      wkp.name as name,
      COUNT(DISTINCT h.id) as host_count
    FROM hosts h
    INNER JOIN ports p ON h.id = p.host_id
    LEFT JOIN well_known_ports wkp ON p.port = wkp.port
  `;

  // Вместо сложной логики замены строк, будем собирать JOIN отдельно
  let joins = [];

  // Добавляем JOIN для приоритета если нужно
  if (
    whereClause.includes("hp.name") ||
    whereClause.includes("priorityNames")
  ) {
    joins.push("LEFT JOIN host_priorities hp ON h.priority_id = hp.id");
  }

  // Добавляем JOIN для группы если нужно
  if (whereClause.includes("hg.name") || whereClause.includes("groupNames")) {
    joins.push("LEFT JOIN host_groupings hg ON h.grouping_id = hg.id");
  }

  // Добавляем JOIN для страны если нужно
  if (whereClause.includes("c.name") || whereClause.includes("countryNames")) {
    joins.push("LEFT JOIN countries c ON h.country_id = c.id");
  }

  // Добавляем JOIN для ключевых слов если нужно
  if (
    whereClause.includes("keyword") ||
    whereClause.includes("wk.key_name") ||
    whereClause.includes("w.value")
  ) {
    joins.push("LEFT JOIN whois w ON w.host_id = h.id");
    joins.push("LEFT JOIN whois_keys wk ON w.key_id = wk.id");
  }

  // Собираем полный запрос
  let fullQuery = tabsQuery;
  if (joins.length > 0) {
    // Вставляем JOIN после FROM hosts h
    const fromIndex = fullQuery.indexOf("FROM hosts h") + "FROM hosts h".length;
    const beforePart = fullQuery.substring(0, fromIndex);
    const afterPart = fullQuery.substring(fromIndex);
    fullQuery = beforePart + "\n" + joins.join("\n") + afterPart;
  }

  fullQuery += ` ${whereClause}\nGROUP BY p.port, wkp.name\nORDER BY p.port ASC`;

  console.log("Запрос для табов портов:", fullQuery);

  const tabs = await sequelize.query(fullQuery, {
    replacements,
    type: sequelize.QueryTypes.SELECT,
  });

  console.log("Табы портов:", tabs);

  if (tabs.length === 0) {
    return {
      items: [],
      pagination: {
        currentPage: pageNum,
        totalPages: 0,
        totalItems: 0,
        hasNext: false,
        hasPrev: false,
      },
      tabs: [],
    };
  }

  // Если есть groupValue, используем его, иначе первый порт
  const portNumber = groupValue
    ? extractPortFromString(groupValue) || groupValue
    : tabs[0].value;

  if (groupValue) {
    const existsInTabs = tabs.some((tab) => tab.value == portNumber);
    if (!existsInTabs) {
      tabs.unshift({
        value: portNumber,
        name: extractPortNameFromString(groupValue) || null,
        host_count: 0,
      });
    }
  }

  // Основной запрос для хостов с указанным портом
  // Сначала создаем базовый запрос для hosts_with_port
  let hostsWithPortBase = `
    SELECT DISTINCT h.id
    FROM hosts h
    INNER JOIN ports p ON h.id = p.host_id
  `;

  // Добавляем JOIN для hosts_with_port
  let hostsJoins = [];

  if (
    whereClause.includes("hp.name") ||
    whereClause.includes("priorityNames")
  ) {
    hostsJoins.push("LEFT JOIN host_priorities hp ON h.priority_id = hp.id");
  }

  if (whereClause.includes("hg.name") || whereClause.includes("groupNames")) {
    hostsJoins.push("LEFT JOIN host_groupings hg ON h.grouping_id = hg.id");
  }

  if (whereClause.includes("c.name") || whereClause.includes("countryNames")) {
    hostsJoins.push("LEFT JOIN countries c ON h.country_id = c.id");
  }

  if (
    whereClause.includes("keyword") ||
    whereClause.includes("wk.key_name") ||
    whereClause.includes("w.value")
  ) {
    hostsJoins.push("LEFT JOIN whois w ON w.host_id = h.id");
    hostsJoins.push("LEFT JOIN whois_keys wk ON w.key_id = wk.id");
  }

  // Собираем полный запрос hosts_with_port
  let hostsWithPortQuery = hostsWithPortBase;
  if (hostsJoins.length > 0) {
    const fromIndex =
      hostsWithPortQuery.indexOf("FROM hosts h") + "FROM hosts h".length;
    const beforePart = hostsWithPortQuery.substring(0, fromIndex);
    const afterPart = hostsWithPortQuery.substring(fromIndex);
    hostsWithPortQuery = beforePart + "\n" + hostsJoins.join("\n") + afterPart;
  }

  // Создаем WHERE условие для hosts_with_port
  let hostsWhereClause = whereClause;
  if (whereClause) {
    hostsWhereClause = `${whereClause} AND p.port = :portNumber`;
  } else {
    hostsWhereClause = `WHERE p.port = :portNumber`;
  }

  hostsWithPortQuery += ` ${hostsWhereClause}`;

  const hostsQuery = `
    WITH hosts_with_port AS (
      ${hostsWithPortQuery}
    ),
    sorted_hosts AS (
      SELECT 
        h.id,
        ROW_NUMBER() OVER (
          ORDER BY 
            CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
            h.priority_id DESC NULLS LAST,
            h.updated_at DESC
        ) as rn
      FROM hosts h
      WHERE h.id IN (SELECT id FROM hosts_with_port)
    ),
    paginated_hosts AS (
      SELECT id FROM sorted_hosts
      WHERE rn > :offset AND rn <= :offsetPlusLimit
      ORDER BY rn
    ),
    host_details AS (
      SELECT 
        h.id,
        h.ip,
        h.reachable,
        TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
        h.priority_id,
        h.grouping_id,
        h.country_id,
        hp.name as priority_name,
        hg.name as grouping_name,
        c.name as country_name,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'port', p2.port,
                'type', p2.type,
                'port_name', wkp.name
              )
              ORDER BY p2.port
            ),
            '[]'::json
          )
          FROM ports p2
          LEFT JOIN well_known_ports wkp ON p2.port = wkp.port
          WHERE p2.host_id = h.id
        ) as ports_json,
        EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois,
        sh.rn
      FROM hosts h
      INNER JOIN paginated_hosts ph ON h.id = ph.id
      INNER JOIN sorted_hosts sh ON h.id = sh.id
      LEFT JOIN host_priorities hp ON h.priority_id = hp.id
      LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
      LEFT JOIN countries c ON h.country_id = c.id
    ),
    total_count AS (
      SELECT COUNT(*) as total_count
      FROM hosts_with_port
    )
    SELECT 
      hd.*,
      tc.total_count
    FROM host_details hd
    CROSS JOIN total_count tc
    ORDER BY hd.rn
  `;

  console.log("Запрос для хостов портов:", hostsQuery);

  const hostsReplacements = {
    ...replacements,
    portNumber,
    offset: offset,
    offsetPlusLimit: offset + limitNum,
  };

  console.log("Replacements для хостов:", hostsReplacements);

  const hosts = await sequelize.query(hostsQuery, {
    replacements: hostsReplacements,
    type: sequelize.QueryTypes.SELECT,
  });

  console.log("Найдено хостов:", hosts.length);

  const totalItems =
    hosts.length > 0 ? parseInt(hosts[0]?.total_count || 0) : 0;
  const totalPages = Math.ceil(totalItems / limitNum);

  const items =
    hosts.length > 0
      ? hosts.map((host) => {
          const formatted = formatHostFromRaw(host);
          delete formatted.rn;
          return formatted;
        })
      : [];

  return {
    items,
    pagination: {
      currentPage: pageNum,
      totalPages: totalPages,
      totalItems: totalItems,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
    tabs,
  };
}

// Группировка по ключевым словам
async function groupByKeyword(
  whereClause,
  replacements,
  pageNum,
  limitNum,
  offset,
  groupValue,
  portOpened,
  portFiltered
) {
  console.log("groupByKeyword groupValue:", groupValue);

  // Создаем базовый запрос для табов
  let tabsQuery = `
    SELECT 
      wk.key_name as value,
      COUNT(DISTINCT h.id) as host_count
    FROM hosts h
    INNER JOIN whois w ON h.id = w.host_id
    INNER JOIN whois_keys wk ON w.key_id = wk.id
  `;
  console.log('whereClause > ', whereClause)

  // Добавляем JOIN для портов, если они есть в фильтрах
  if (
    whereClause.includes("p.port") ||
    whereClause.includes("openedPort") ||
    whereClause.includes("filteredPort")
  ) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nINNER JOIN ports p ON h.id = p.host_id"
    );
  }

  // Добавляем JOIN для приоритета, группы и страны, если они есть
  if (whereClause.includes("hp.name") || whereClause.includes("priority")) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nLEFT JOIN host_priorities hp ON h.priority_id = hp.id"
    );
  }

  if (whereClause.includes("hg.name") || whereClause.includes("groupNames")) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nLEFT JOIN host_groupings hg ON h.grouping_id = hg.id"
    );
  }

  if (whereClause.includes("c.name") || whereClause.includes("countryNames")) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nLEFT JOIN countries c ON h.country_id = c.id"
    );
  }

  tabsQuery += ` ${whereClause}\nGROUP BY wk.key_name\nORDER BY wk.key_name ASC`;

  console.log('Запрос для табов ключевых слов:', tabsQuery);

  const tabs = await sequelize.query(tabsQuery, {
    replacements,
    type: sequelize.QueryTypes.SELECT,
  });

  // console.log('Табы ключевых слов:', tabs);

  if (tabs.length === 0) {
    return {
      items: [],
      pagination: {
        currentPage: pageNum,
        totalPages: 0,
        totalItems: 0,
        hasNext: false,
        hasPrev: false,
      },
      tabs: [],
    };
  }

  // Если есть groupValue, используем его, иначе первое ключевое слово
  const keywordName = groupValue ? groupValue : tabs[0].value;

  if (groupValue) {
    const existsInTabs = tabs.some((tab) => tab.value == keywordName);
    if (!existsInTabs) {
      tabs.unshift({
        value: keywordName,
        name: null,
        host_count: 0,
      });
    }
  }

  // Основной запрос для хостов
  let hostsWhereClause = whereClause;
  if (whereClause) {
    hostsWhereClause = `${whereClause} AND wk.key_name = :keywordName`;
  } else {
    hostsWhereClause = `WHERE wk.key_name = :keywordName`;
  }

  const hostsQuery = `
    WITH hosts_with_keyword AS (
      SELECT DISTINCT h.id
      FROM hosts h
      INNER JOIN whois w ON h.id = w.host_id
      INNER JOIN whois_keys wk ON w.key_id = wk.id
      ${hostsWhereClause}
    ),
    sorted_hosts AS (
      SELECT  
        h.id,
        ROW_NUMBER() OVER (
          ORDER BY 
            CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
            h.priority_id DESC NULLS LAST,
            h.updated_at DESC
        ) as rn
      FROM hosts h
      WHERE h.id IN (SELECT id FROM hosts_with_keyword)
    ),
    paginated_hosts AS (
      SELECT id FROM sorted_hosts
      WHERE rn > :offset AND rn <= :offsetPlusLimit
      ORDER BY rn
    ),
    host_details AS (
      SELECT 
        h.id,
        h.ip,
        h.reachable,
        TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
        h.priority_id,
        h.grouping_id,
        h.country_id,
        hp.name as priority_name,
        hg.name as grouping_name,
        c.name as country_name,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'port', p.port,
                'type', p.type,
                'port_name', wkp.name
              )
              ORDER BY p.port
            ),
            '[]'::json
          )
          FROM ports p
          LEFT JOIN well_known_ports wkp ON p.port = wkp.port
          WHERE p.host_id = h.id
        ) as ports_json,
        TRUE as has_whois,
        sh.rn
      FROM hosts h
      INNER JOIN paginated_hosts ph ON h.id = ph.id
      INNER JOIN sorted_hosts sh ON h.id = sh.id
      LEFT JOIN host_priorities hp ON h.priority_id = hp.id
      LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
      LEFT JOIN countries c ON h.country_id = c.id
    ),
    total_count AS (
      SELECT COUNT(*) as total_count
      FROM hosts_with_keyword
    )
    SELECT 
      hd.*,
      tc.total_count
    FROM host_details hd
    CROSS JOIN total_count tc
    ORDER BY hd.rn
  `;

  console.log('Условие whereClause для хостов ключевых слов:', whereClause);
  // console.log('Запрос для хостов ключевых слов:', hostsQuery);
  // console.log('Replacements для хостов:', hostsReplacements);

  const hostsReplacements = {
    ...replacements,
    keywordName,
    offset,
    offsetPlusLimit: offset + limitNum,
  };

  const hosts = await sequelize.query(hostsQuery, {
    replacements: hostsReplacements,
    type: sequelize.QueryTypes.SELECT,
  });

  console.log("Найдено хостов:", hosts.length);

  const totalItems =
    hosts.length > 0 ? parseInt(hosts[0]?.total_count || 0) : 0;
  const totalPages = Math.ceil(totalItems / limitNum);

  const items =
    hosts.length > 0
      ? hosts.map((host) => {
          const formatted = formatHostFromRaw(host);
          delete formatted.rn;
          return formatted;
        })
      : [];

  return {
    items,
    pagination: {
      currentPage: pageNum,
      totalPages: totalPages,
      totalItems: totalItems,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
    tabs,
  };
}

// Группировка по приоритету
async function groupByPriority(
  whereClause,
  replacements,
  pageNum,
  limitNum,
  offset,
  groupValue,
  portOpened,
  portFiltered,
  keyword
) {
  console.log("groupByPriority groupValue:", groupValue);

  // Создаем базовый запрос для табов
  let tabsQuery = `
    SELECT 
      hp.name as value,
      COUNT(DISTINCT h.id) as host_count
    FROM hosts h
    LEFT JOIN host_priorities hp ON h.priority_id = hp.id
  `;

  // Динамически добавляем JOIN для фильтров
  if (
    whereClause.includes("p.port") ||
    whereClause.includes("openedPort") ||
    whereClause.includes("filteredPort")
  ) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nINNER JOIN ports p ON h.id = p.host_id"
    );
  }

  if (whereClause.includes("wk.key_name") || whereClause.includes("keyword")) {
    tabsQuery = tabsQuery.includes("INNER JOIN ports p")
      ? tabsQuery.replace(
          "INNER JOIN ports p",
          "INNER JOIN ports p\nLEFT JOIN whois w ON w.host_id = h.id\nLEFT JOIN whois_keys wk ON w.key_id = wk.id"
        )
      : tabsQuery.replace(
          "FROM hosts h",
          "FROM hosts h\nLEFT JOIN whois w ON w.host_id = h.id\nLEFT JOIN whois_keys wk ON w.key_id = wk.id"
        );
  }

  if (whereClause.includes("hg.name") || whereClause.includes("groupNames")) {
    const hasPortsJoin = tabsQuery.includes("INNER JOIN ports p");
    const hasWhoisJoin = tabsQuery.includes("LEFT JOIN whois w");

    if (hasWhoisJoin) {
      tabsQuery = tabsQuery.replace(
        "LEFT JOIN whois_keys wk",
        "LEFT JOIN whois_keys wk\nLEFT JOIN host_groupings hg ON h.grouping_id = hg.id"
      );
    } else if (hasPortsJoin) {
      tabsQuery = tabsQuery.replace(
        "INNER JOIN ports p",
        "INNER JOIN ports p\nLEFT JOIN host_groupings hg ON h.grouping_id = hg.id"
      );
    } else {
      tabsQuery = tabsQuery.replace(
        "FROM hosts h",
        "FROM hosts h\nLEFT JOIN host_groupings hg ON h.grouping_id = hg.id"
      );
    }
  }

  if (whereClause.includes("c.name") || whereClause.includes("countryNames")) {
    const hasGroupJoin = tabsQuery.includes("LEFT JOIN host_groupings hg");

    if (hasGroupJoin) {
      tabsQuery = tabsQuery.replace(
        "LEFT JOIN host_groupings hg",
        "LEFT JOIN host_groupings hg\nLEFT JOIN countries c ON h.country_id = c.id"
      );
    } else {
      tabsQuery = tabsQuery.replace(
        "FROM hosts h",
        "FROM hosts h\nLEFT JOIN countries c ON h.country_id = c.id"
      );
    }
  }

  // Добавляем JOIN для whois, если фильтр whois есть
  if (
    whereClause.includes("EXISTS (SELECT") ||
    whereClause.includes("NOT EXISTS")
  ) {
    // Для фильтров EXISTS/NOT EXISTS JOIN не нужен в основном запросе
  }

  tabsQuery += ` ${whereClause}\nGROUP BY hp.name\nORDER BY hp.name ASC`;

  // console.log("Запрос для табов приоритетов:", tabsQuery);

  const tabs = await sequelize.query(tabsQuery, {
    replacements,
    type: sequelize.QueryTypes.SELECT,
  });

  console.log("Табы приоритетов:", tabs);

  if (tabs.length === 0) {
    return {
      items: [],
      pagination: {
        currentPage: pageNum,
        totalPages: 0,
        totalItems: 0,
        hasNext: false,
        hasPrev: false,
      },
      tabs: [],
    };
  }

  const priorityName = groupValue ? groupValue : tabs[0].value;

  if (groupValue) {
    const existsInTabs = tabs.some((tab) => tab.value == priorityName);
    if (!existsInTabs) {
      tabs.unshift({
        value: priorityName,
        name: null,
        host_count: 0,
      });
    }
  }

  // Основной запрос для хостов
  // Сначала создаем базовый запрос для hosts_with_priority
  let hostsWithPriorityQuery = `
    SELECT DISTINCT h.id
    FROM hosts h
    LEFT JOIN host_priorities hp ON h.priority_id = hp.id
  `;

  // Динамически добавляем JOIN в hosts_with_priority
  if (
    whereClause.includes("p.port") ||
    whereClause.includes("openedPort") ||
    whereClause.includes("filteredPort")
  ) {
    hostsWithPriorityQuery = hostsWithPriorityQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nINNER JOIN ports p ON h.id = p.host_id"
    );
  }

  if (whereClause.includes("wk.key_name") || whereClause.includes("keyword")) {
    hostsWithPriorityQuery = hostsWithPriorityQuery.includes(
      "INNER JOIN ports p"
    )
      ? hostsWithPriorityQuery.replace(
          "INNER JOIN ports p",
          "INNER JOIN ports p\nLEFT JOIN whois w ON w.host_id = h.id\nLEFT JOIN whois_keys wk ON w.key_id = wk.id"
        )
      : hostsWithPriorityQuery.replace(
          "FROM hosts h",
          "FROM hosts h\nLEFT JOIN whois w ON w.host_id = h.id\nLEFT JOIN whois_keys wk ON w.key_id = wk.id"
        );
  }

  if (whereClause.includes("hg.name") || whereClause.includes("groupNames")) {
    const hasPortsJoin = hostsWithPriorityQuery.includes("INNER JOIN ports p");
    const hasWhoisJoin = hostsWithPriorityQuery.includes("LEFT JOIN whois w");

    if (hasWhoisJoin) {
      hostsWithPriorityQuery = hostsWithPriorityQuery.replace(
        "LEFT JOIN whois_keys wk",
        "LEFT JOIN whois_keys wk\nLEFT JOIN host_groupings hg ON h.grouping_id = hg.id"
      );
    } else if (hasPortsJoin) {
      hostsWithPriorityQuery = hostsWithPriorityQuery.replace(
        "INNER JOIN ports p",
        "INNER JOIN ports p\nLEFT JOIN host_groupings hg ON h.grouping_id = hg.id"
      );
    } else {
      hostsWithPriorityQuery = hostsWithPriorityQuery.replace(
        "FROM hosts h",
        "FROM hosts h\nLEFT JOIN host_groupings hg ON h.grouping_id = hg.id"
      );
    }
  }

  if (whereClause.includes("c.name") || whereClause.includes("countryNames")) {
    const hasGroupJoin = hostsWithPriorityQuery.includes(
      "LEFT JOIN host_groupings hg"
    );

    if (hasGroupJoin) {
      hostsWithPriorityQuery = hostsWithPriorityQuery.replace(
        "LEFT JOIN host_groupings hg",
        "LEFT JOIN host_groupings hg\nLEFT JOIN countries c ON h.country_id = c.id"
      );
    } else {
      hostsWithPriorityQuery = hostsWithPriorityQuery.replace(
        "FROM hosts h",
        "FROM hosts h\nLEFT JOIN countries c ON h.country_id = c.id"
      );
    }
  }

  // Создаем WHERE условие для hosts_with_priority
  let hostsWhereClause = whereClause;
  if (whereClause) {
    hostsWhereClause = `${whereClause} AND hp.name = :priorityName`;
  } else {
    hostsWhereClause = `WHERE hp.name = :priorityName`;
  }

  hostsWithPriorityQuery += ` ${hostsWhereClause}`;

  const hostsQuery = `
    WITH hosts_with_priority AS (
      ${hostsWithPriorityQuery}
    ),
    sorted_hosts AS (
      SELECT 
        h.id,
        ROW_NUMBER() OVER (
          ORDER BY 
            CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
            h.priority_id DESC NULLS LAST,
            h.updated_at DESC
        ) as rn
      FROM hosts h
      WHERE h.id IN (SELECT id FROM hosts_with_priority)
    ),
    paginated_hosts AS (
      SELECT id FROM sorted_hosts
      WHERE rn > :offset AND rn <= :offsetPlusLimit
      ORDER BY rn
    ),
    host_details AS (
      SELECT 
        h.id,
        h.ip,
        h.reachable,
        TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
        h.priority_id,
        h.grouping_id,
        h.country_id,
        hp.name as priority_name,
        hg.name as grouping_name,
        c.name as country_name,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'port', p.port,
                'type', p.type,
                'port_name', wkp.name
              )
              ORDER BY p.port
            ),
            '[]'::json
          )
          FROM ports p
          LEFT JOIN well_known_ports wkp ON p.port = wkp.port
          WHERE p.host_id = h.id
        ) as ports_json,
        EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois,
        sh.rn
      FROM hosts h
      INNER JOIN paginated_hosts ph ON h.id = ph.id
      INNER JOIN sorted_hosts sh ON h.id = sh.id
      LEFT JOIN host_priorities hp ON h.priority_id = hp.id
      LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
      LEFT JOIN countries c ON h.country_id = c.id
    ),
    total_count AS (
      SELECT COUNT(*) as total_count
      FROM hosts_with_priority
    )
    SELECT 
      hd.*,
      tc.total_count
    FROM host_details hd
    CROSS JOIN total_count tc
    ORDER BY hd.rn
  `;

  console.log("Запрос для хостов приоритетов:", hostsQuery);

  const hostsReplacements = {
    ...replacements,
    priorityName,
    offset: offset,
    offsetPlusLimit: offset + limitNum,
  };

  console.log("Replacements для хостов:", hostsReplacements);

  const hosts = await sequelize.query(hostsQuery, {
    replacements: hostsReplacements,
    type: sequelize.QueryTypes.SELECT,
  });

  console.log("Найдено хостов:", hosts.length);

  const totalItems =
    hosts.length > 0 ? parseInt(hosts[0]?.total_count || 0) : 0;
  const totalPages = Math.ceil(totalItems / limitNum);

  const items =
    hosts.length > 0
      ? hosts.map((host) => {
          const formatted = formatHostFromRaw(host);
          delete formatted.rn;
          return formatted;
        })
      : [];

  return {
    items,
    pagination: {
      currentPage: pageNum,
      totalPages: totalPages,
      totalItems: totalItems,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
    tabs,
  };
}

// Группировка по группам хостов
async function groupByHostGroup(
  whereClause,
  replacements,
  pageNum,
  limitNum,
  offset,
  groupValue,
  portOpened,
  portFiltered,
  keyword
) {
  console.log("groupByHostGroup groupValue:", groupValue);

  let tabsQuery = `
    SELECT 
      hg.name as value,
      COUNT(DISTINCT h.id) as host_count
    FROM hosts h
    LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
  `;

  // Добавляем JOIN для фильтров
  if (
    whereClause.includes("p.port") ||
    whereClause.includes("openedPort") ||
    whereClause.includes("filteredPort")
  ) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nINNER JOIN ports p ON h.id = p.host_id"
    );
  }

  if (whereClause.includes("wk.key_name") || whereClause.includes("keyword")) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nLEFT JOIN whois w ON w.host_id = h.id\nLEFT JOIN whois_keys wk ON w.key_id = wk.id"
    );
  }

  if (whereClause.includes("hp.name") || whereClause.includes("priority")) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nLEFT JOIN host_priorities hp ON h.priority_id = hp.id"
    );
  }

  if (whereClause.includes("c.name") || whereClause.includes("countryNames")) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nLEFT JOIN countries c ON h.country_id = c.id"
    );
  }

  if (
    whereClause.includes("EXISTS (SELECT") ||
    whereClause.includes("w2.host_id")
  ) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nLEFT JOIN whois w2 ON w2.host_id = h.id"
    );
  }

  tabsQuery += ` ${whereClause}\nGROUP BY hg.name\nORDER BY hg.name ASC`;

  console.log("Запрос для табов групп:", tabsQuery);

  const tabs = await sequelize.query(tabsQuery, {
    replacements,
    type: sequelize.QueryTypes.SELECT,
  });

  console.log("Табы групп:", tabs);

  if (tabs.length === 0) {
    return {
      items: [],
      pagination: {
        currentPage: pageNum,
        totalPages: 0,
        totalItems: 0,
        hasNext: false,
        hasPrev: false,
      },
      tabs: [],
    };
  }

  const groupName = groupValue ? groupValue : tabs[0].value;

  if (groupValue) {
    const existsInTabs = tabs.some((tab) => tab.value == groupName);
    if (!existsInTabs) {
      tabs.unshift({
        value: groupName,
        name: null,
        host_count: 0,
      });
    }
  }

  let hostsWhereClause = whereClause;
  let hostsReplacements = {
    ...replacements,
    groupName,
    offset,
    offsetPlusLimit: offset + limitNum,
  };

  if (whereClause) {
    hostsWhereClause = `${whereClause} AND hg.name = :groupName`;
  } else {
    hostsWhereClause = `WHERE hg.name = :groupName`;
  }

  const hostsQuery = `
    WITH hosts_with_group AS (
      SELECT DISTINCT h.id
      FROM hosts h
      LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
      ${hostsWhereClause}
    ),
    sorted_hosts AS (
      SELECT 
        h.id,
        ROW_NUMBER() OVER (
          ORDER BY 
            CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
            h.priority_id DESC NULLS LAST,
            h.updated_at DESC
        ) as rn
      FROM hosts h
      WHERE h.id IN (SELECT id FROM hosts_with_group)
    ),
    paginated_hosts AS (
      SELECT id FROM sorted_hosts
      WHERE rn > :offset AND rn <= :offsetPlusLimit
      ORDER BY rn
    ),
    host_details AS (
      SELECT 
        h.id,
        h.ip,
        h.reachable,
        TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
        h.priority_id,
        h.grouping_id,
        h.country_id,
        hp.name as priority_name,
        hg.name as grouping_name,
        c.name as country_name,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'port', p.port,
                'type', p.type,
                'port_name', wkp.name
              )
              ORDER BY p.port
            ),
            '[]'::json
          )
          FROM ports p
          LEFT JOIN well_known_ports wkp ON p.port = wkp.port
          WHERE p.host_id = h.id
        ) as ports_json,
        EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois,
        sh.rn
      FROM hosts h
      INNER JOIN paginated_hosts ph ON h.id = ph.id
      INNER JOIN sorted_hosts sh ON h.id = sh.id
      LEFT JOIN host_priorities hp ON h.priority_id = hp.id
      LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
      LEFT JOIN countries c ON h.country_id = c.id
    ),
    total_count AS (
      SELECT COUNT(*) as total_count
      FROM hosts_with_group
    )
    SELECT 
      hd.*,
      tc.total_count
    FROM host_details hd
    CROSS JOIN total_count tc
    ORDER BY hd.rn
  `;

  const hosts = await sequelize.query(hostsQuery, {
    replacements: hostsReplacements,
    type: sequelize.QueryTypes.SELECT,
  });

  const totalItems =
    hosts.length > 0 ? parseInt(hosts[0]?.total_count || 0) : 0;
  const totalPages = Math.ceil(totalItems / limitNum);

  const items =
    hosts.length > 0
      ? hosts.map((host) => {
          const formatted = formatHostFromRaw(host);
          delete formatted.rn;
          return formatted;
        })
      : [];

  return {
    items,
    pagination: {
      currentPage: pageNum,
      totalPages: totalPages,
      totalItems: totalItems,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
    tabs,
  };
}

// Группировка по странам
async function groupByCountry(
  whereClause,
  replacements,
  pageNum,
  limitNum,
  offset,
  groupValue,
  portOpened,
  portFiltered,
  keyword
) {
  console.log("groupByCountry groupValue:", groupValue);

  let tabsQuery = `
    SELECT 
      c.name as value,
      COUNT(DISTINCT h.id) as host_count
    FROM hosts h
    LEFT JOIN countries c ON h.country_id = c.id
  `;

  // Добавляем JOIN для фильтров
  if (
    whereClause.includes("p.port") ||
    whereClause.includes("openedPort") ||
    whereClause.includes("filteredPort")
  ) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nINNER JOIN ports p ON h.id = p.host_id"
    );
  }

  if (whereClause.includes("wk.key_name") || whereClause.includes("keyword")) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nLEFT JOIN whois w ON w.host_id = h.id\nLEFT JOIN whois_keys wk ON w.key_id = wk.id"
    );
  }

  if (whereClause.includes("hp.name") || whereClause.includes("priority")) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nLEFT JOIN host_priorities hp ON h.priority_id = hp.id"
    );
  }

  if (whereClause.includes("hg.name") || whereClause.includes("groupNames")) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nLEFT JOIN host_groupings hg ON h.grouping_id = hg.id"
    );
  }

  if (
    whereClause.includes("EXISTS (SELECT") ||
    whereClause.includes("w2.host_id")
  ) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nLEFT JOIN whois w2 ON w2.host_id = h.id"
    );
  }

  tabsQuery += ` ${whereClause}\nGROUP BY c.name\nORDER BY c.name ASC`;

  console.log("Запрос для табов стран:", tabsQuery);

  const tabs = await sequelize.query(tabsQuery, {
    replacements,
    type: sequelize.QueryTypes.SELECT,
  });

  console.log("Табы стран:", tabs);

  if (tabs.length === 0) {
    return {
      items: [],
      pagination: {
        currentPage: pageNum,
        totalPages: 0,
        totalItems: 0,
        hasNext: false,
        hasPrev: false,
      },
      tabs: [],
    };
  }

  const countryName = groupValue ? groupValue : tabs[0].value;

  if (groupValue) {
    const existsInTabs = tabs.some((tab) => tab.value == countryName);
    if (!existsInTabs) {
      tabs.unshift({
        value: countryName,
        name: null,
        host_count: 0,
      });
    }
  }

  let hostsWhereClause = whereClause;
  let hostsReplacements = {
    ...replacements,
    countryName,
    offset,
    offsetPlusLimit: offset + limitNum,
  };

  if (whereClause) {
    hostsWhereClause = `${whereClause} AND c.name = :countryName`;
  } else {
    hostsWhereClause = `WHERE c.name = :countryName`;
  }

  const hostsQuery = `
    WITH hosts_with_country AS (
      SELECT DISTINCT h.id
      FROM hosts h
      LEFT JOIN countries c ON h.country_id = c.id
      ${hostsWhereClause}
    ),
    sorted_hosts AS (
      SELECT 
        h.id,
        ROW_NUMBER() OVER (
          ORDER BY 
            CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
            h.priority_id DESC NULLS LAST,
            h.updated_at DESC
        ) as rn
      FROM hosts h
      WHERE h.id IN (SELECT id FROM hosts_with_country)
    ),
    paginated_hosts AS (
      SELECT id FROM sorted_hosts
      WHERE rn > :offset AND rn <= :offsetPlusLimit
      ORDER BY rn
    ),
    host_details AS (
      SELECT 
        h.id,
        h.ip,
        h.reachable,
        TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
        h.priority_id,
        h.grouping_id,
        h.country_id,
        hp.name as priority_name,
        hg.name as grouping_name,
        c.name as country_name,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'port', p.port,
                'type', p.type,
                'port_name', wkp.name
              )
              ORDER BY p.port
            ),
            '[]'::json
          )
          FROM ports p
          LEFT JOIN well_known_ports wkp ON p.port = wkp.port
          WHERE p.host_id = h.id
        ) as ports_json,
        EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois,
        sh.rn
      FROM hosts h
      INNER JOIN paginated_hosts ph ON h.id = ph.id
      INNER JOIN sorted_hosts sh ON h.id = sh.id
      LEFT JOIN host_priorities hp ON h.priority_id = hp.id
      LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
      LEFT JOIN countries c ON h.country_id = c.id
    ),
    total_count AS (
      SELECT COUNT(*) as total_count
      FROM hosts_with_country
    )
    SELECT 
      hd.*,
      tc.total_count
    FROM host_details hd
    CROSS JOIN total_count tc
    ORDER BY hd.rn
  `;

  const hosts = await sequelize.query(hostsQuery, {
    replacements: hostsReplacements,
    type: sequelize.QueryTypes.SELECT,
  });

  const totalItems =
    hosts.length > 0 ? parseInt(hosts[0]?.total_count || 0) : 0;
  const totalPages = Math.ceil(totalItems / limitNum);

  const items =
    hosts.length > 0
      ? hosts.map((host) => {
          const formatted = formatHostFromRaw(host);
          delete formatted.rn;
          return formatted;
        })
      : [];

  return {
    items,
    pagination: {
      currentPage: pageNum,
      totalPages: totalPages,
      totalItems: totalItems,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
    tabs,
  };
}

// Группировка по WHOIS
async function groupByWhois(
  whereClause,
  replacements,
  pageNum,
  limitNum,
  offset,
  groupValue,
  portOpened,
  portFiltered,
  keyword
) {
  console.log("groupByWhois groupValue:", groupValue);

  // Создаем табы для WHOIS
  let tabsQuery = `
    SELECT 
      CASE 
        WHEN EXISTS (SELECT 1 FROM whois w WHERE w.host_id = h.id) 
        THEN 'С WHOIS данными'
        ELSE 'Без WHOIS данных'
      END as value,
      COUNT(DISTINCT h.id) as host_count
    FROM hosts h
  `;

  // Добавляем JOIN для фильтров
  if (
    whereClause.includes("p.port") ||
    whereClause.includes("openedPort") ||
    whereClause.includes("filteredPort")
  ) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nINNER JOIN ports p ON h.id = p.host_id"
    );
  }

  if (whereClause.includes("wk.key_name") || whereClause.includes("keyword")) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nLEFT JOIN whois w2 ON w2.host_id = h.id\nLEFT JOIN whois_keys wk ON w2.key_id = wk.id"
    );
  }

  if (whereClause.includes("hp.name") || whereClause.includes("priority")) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nLEFT JOIN host_priorities hp ON h.priority_id = hp.id"
    );
  }

  if (whereClause.includes("hg.name") || whereClause.includes("groupNames")) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nLEFT JOIN host_groupings hg ON h.grouping_id = hg.id"
    );
  }

  if (whereClause.includes("c.name") || whereClause.includes("countryNames")) {
    tabsQuery = tabsQuery.replace(
      "FROM hosts h",
      "FROM hosts h\nLEFT JOIN countries c ON h.country_id = c.id"
    );
  }

  tabsQuery += ` ${whereClause}
    GROUP BY 
      CASE 
        WHEN EXISTS (SELECT 1 FROM whois w WHERE w.host_id = h.id) 
        THEN 'С WHOIS данными'
        ELSE 'Без WHOIS данных'
      END
    ORDER BY value ASC`;

  console.log("Запрос для табов WHOIS:", tabsQuery);

  const tabs = await sequelize.query(tabsQuery, {
    replacements,
    type: sequelize.QueryTypes.SELECT,
  });

  console.log("Табы WHOIS:", tabs);

  if (tabs.length === 0) {
    return {
      items: [],
      pagination: {
        currentPage: pageNum,
        totalPages: 0,
        totalItems: 0,
        hasNext: false,
        hasPrev: false,
      },
      tabs: [],
    };
  }

  // Определяем, какой статус WHOIS использовать
  const whoisStatus = groupValue || tabs[0].value;
  const isWithWhois = whoisStatus === "С WHOIS данными";

  let hostsWhereClause = whereClause;
  let hostsReplacements = {
    ...replacements,
    offset,
    offsetPlusLimit: offset + limitNum,
  };

  if (isWithWhois) {
    if (whereClause) {
      hostsWhereClause = `${whereClause} AND EXISTS (SELECT 1 FROM whois w WHERE w.host_id = h.id)`;
    } else {
      hostsWhereClause = `WHERE EXISTS (SELECT 1 FROM whois w WHERE w.host_id = h.id)`;
    }
  } else {
    if (whereClause) {
      hostsWhereClause = `${whereClause} AND NOT EXISTS (SELECT 1 FROM whois w WHERE w.host_id = h.id)`;
    } else {
      hostsWhereClause = `WHERE NOT EXISTS (SELECT 1 FROM whois w WHERE w.host_id = h.id)`;
    }
  }

  const hostsQuery = `
    WITH hosts_with_whois_status AS (
      SELECT DISTINCT h.id
      FROM hosts h
      ${hostsWhereClause}
    ),
    sorted_hosts AS (
      SELECT 
        h.id,
        ROW_NUMBER() OVER (
          ORDER BY 
            CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
            h.priority_id DESC NULLS LAST,
            h.updated_at DESC
        ) as rn
      FROM hosts h
      WHERE h.id IN (SELECT id FROM hosts_with_whois_status)
    ),
    paginated_hosts AS (
      SELECT id FROM sorted_hosts
      WHERE rn > :offset AND rn <= :offsetPlusLimit
      ORDER BY rn
    ),
    host_details AS (
      SELECT 
        h.id,
        h.ip,
        h.reachable,
        TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
        h.priority_id,
        h.grouping_id,
        h.country_id,
        hp.name as priority_name,
        hg.name as grouping_name,
        c.name as country_name,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'port', p.port,
                'type', p.type,
                'port_name', wkp.name
              )
              ORDER BY p.port
            ),
            '[]'::json
          )
          FROM ports p
          LEFT JOIN well_known_ports wkp ON p.port = wkp.port
          WHERE p.host_id = h.id
        ) as ports_json,
        ${isWithWhois ? "TRUE" : "FALSE"} as has_whois,
        sh.rn
      FROM hosts h
      INNER JOIN paginated_hosts ph ON h.id = ph.id
      INNER JOIN sorted_hosts sh ON h.id = sh.id
      LEFT JOIN host_priorities hp ON h.priority_id = hp.id
      LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
      LEFT JOIN countries c ON h.country_id = c.id
    ),
    total_count AS (
      SELECT COUNT(*) as total_count
      FROM hosts_with_whois_status
    )
    SELECT 
      hd.*,
      tc.total_count
    FROM host_details hd
    CROSS JOIN total_count tc
    ORDER BY hd.rn
  `;

  const hosts = await sequelize.query(hostsQuery, {
    replacements: hostsReplacements,
    type: sequelize.QueryTypes.SELECT,
  });

  const totalItems =
    hosts.length > 0 ? parseInt(hosts[0]?.total_count || 0) : 0;
  const totalPages = Math.ceil(totalItems / limitNum);

  const items =
    hosts.length > 0
      ? hosts.map((host) => {
          const formatted = formatHostFromRaw(host);
          delete formatted.rn;
          return formatted;
        })
      : [];

  return {
    items,
    pagination: {
      currentPage: pageNum,
      totalPages: totalPages,
      totalItems: totalItems,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
    tabs,
  };
}

// Получение всех хостов (без группировки)
async function getAllHosts(
  whereClause,
  replacements,
  pageNum,
  limitNum,
  offset,
  groupValue
) {
  console.log("getAllHosts groupValue:", groupValue);

  const hostsQuery = `
    WITH sorted_hosts AS (
      SELECT 
        h.id,
        ROW_NUMBER() OVER (
          ORDER BY 
            CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
            h.priority_id DESC NULLS LAST,
            h.updated_at DESC
        ) as rn
      FROM hosts h
      ${whereClause}
    ),
    paginated_hosts AS (
      SELECT id FROM sorted_hosts
      WHERE rn > :offset AND rn <= :offsetPlusLimit
      ORDER BY rn
    ),
    host_details AS (
      SELECT 
        h.id,
        h.ip,
        h.reachable,
        TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
        h.priority_id,
        h.grouping_id,
        h.country_id,
        hp.name as priority_name,
        hg.name as grouping_name,
        c.name as country_name,
        (
          SELECT COALESCE(
            json_agg(
              json_build_object(
                'port', p.port,
                'type', p.type,
                'port_name', wkp.name
              )
              ORDER BY p.port
            ),
            '[]'::json
          )
          FROM ports p
          LEFT JOIN well_known_ports wkp ON p.port = wkp.port
          WHERE p.host_id = h.id
        ) as ports_json,
        EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
      FROM hosts h
      INNER JOIN paginated_hosts ph ON h.id = ph.id
      LEFT JOIN host_priorities hp ON h.priority_id = hp.id
      LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
      LEFT JOIN countries c ON h.country_id = c.id
    ),
    total_count AS (
      SELECT COUNT(DISTINCT h.id) as total_count
      FROM hosts h
      ${whereClause}
    )
    SELECT 
      hd.*,
      tc.total_count
    FROM host_details hd
    CROSS JOIN total_count tc
    ORDER BY (
      SELECT rn FROM sorted_hosts sh WHERE sh.id = hd.id
    )
  `;

  const hosts = await sequelize.query(hostsQuery, {
    replacements: {
      ...replacements,
      offset: offset,
      offsetPlusLimit: offset + limitNum,
    },
    type: sequelize.QueryTypes.SELECT,
  });

  const totalItems =
    hosts.length > 0 ? parseInt(hosts[0]?.total_count || 0) : 0;
  const totalPages = Math.ceil(totalItems / limitNum);
  const items = hosts.map(formatHostFromRaw);

  return {
    items,
    pagination: {
      currentPage: pageNum,
      totalPages: totalPages,
      totalItems: totalItems,
      hasNext: pageNum < totalPages,
      hasPrev: pageNum > 1,
    },
    tabs: [],
  };
}

// Функция для получения данных по группе с пагинацией
export const getGroupDetails = async (req, res) => {
  try {
    const { group, page = 1, limit = 10 } = req.query;
    const { pageNum, limitNum, offset } = paginate(req);

    const hostsQuery = `
      WITH sorted_hosts AS (
        SELECT 
          h.id,
          ROW_NUMBER() OVER (
            ORDER BY 
              CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
              h.priority_id DESC NULLS LAST,
              h.updated_at DESC
          ) as rn
        FROM hosts h
        INNER JOIN host_groupings hg ON h.grouping_id = hg.id
        WHERE hg.name = :groupName
      ),
      paginated_hosts AS (
        SELECT id FROM sorted_hosts
        WHERE rn > :offset AND rn <= :offsetPlusLimit
        ORDER BY rn
      ),
      host_details AS (
        SELECT 
          h.id,
          h.ip,
          h.reachable,
          TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
          h.priority_id,
          h.grouping_id,
          h.country_id,
          hp.name as priority_name,
          hg.name as grouping_name,
          c.name as country_name,
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'port', p.port,
                  'type', p.type,
                  'port_name', wkp.name
                )
                ORDER BY p.port
              ),
              '[]'::json
            )
            FROM ports p
            LEFT JOIN well_known_ports wkp ON p.port = wkp.port
            WHERE p.host_id = h.id
          ) as ports_json,
          EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
        FROM hosts h
        INNER JOIN paginated_hosts ph ON h.id = ph.id
        LEFT JOIN host_priorities hp ON h.priority_id = hp.id
        INNER JOIN host_groupings hg ON h.grouping_id = hg.id
        LEFT JOIN countries c ON h.country_id = c.id
        WHERE hg.name = :groupName
      ),
      total_count AS (
        SELECT COUNT(*) as total_count
        FROM hosts h
        INNER JOIN host_groupings hg ON h.grouping_id = hg.id
        WHERE hg.name = :groupName
      )
      SELECT 
        hd.*,
        tc.total_count
      FROM host_details hd
      CROSS JOIN total_count tc
      ORDER BY (
        SELECT rn FROM sorted_hosts sh WHERE sh.id = hd.id
      )
    `;

    const hosts = await sequelize.query(hostsQuery, {
      replacements: {
        groupName: group,
        offset: offset,
        offsetPlusLimit: offset + limitNum,
      },
      type: sequelize.QueryTypes.SELECT,
    });

    if (hosts.length === 0) {
      return res.status(404).json({
        message: "Группа не найдена или в ней нет хостов",
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

    const totalItems = parseInt(hosts[0]?.total_count || 0);
    const totalPages = Math.ceil(totalItems / limitNum);
    const items = hosts.map(formatHostFromRaw);

    return res.json({
      items,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: totalItems,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      type: "search",
      field: "group",
    });
  } catch (error) {
    console.error("Ошибка в getGroupDetails:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// Функция для получения данных по стране с пагинацией
export const getCountryDetails = async (req, res) => {
  try {
    const { country, page = 1, limit = 10 } = req.query;
    const { pageNum, limitNum, offset } = paginate(req);

    const hostsQuery = `
      WITH sorted_hosts AS (
        SELECT 
          h.id,
          ROW_NUMBER() OVER (
            ORDER BY 
              CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
              h.priority_id DESC NULLS LAST,
              h.updated_at DESC
          ) as rn
        FROM hosts h
        INNER JOIN countries c ON h.country_id = c.id
        WHERE c.name = :countryName
      ),
      paginated_hosts AS (
        SELECT id FROM sorted_hosts
        WHERE rn > :offset AND rn <= :offsetPlusLimit
        ORDER BY rn
      ),
      host_details AS (
        SELECT 
          h.id,
          h.ip,
          h.reachable,
          TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
          h.priority_id,
          h.grouping_id,
          h.country_id,
          hp.name as priority_name,
          hg.name as grouping_name,
          c.name as country_name,
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'port', p.port,
                  'type', p.type,
                  'port_name', wkp.name
                )
                ORDER BY p.port
              ),
              '[]'::json
            )
            FROM ports p
            LEFT JOIN well_known_ports wkp ON p.port = wkp.port
            WHERE p.host_id = h.id
          ) as ports_json,
          EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
        FROM hosts h
        INNER JOIN paginated_hosts ph ON h.id = ph.id
        LEFT JOIN host_priorities hp ON h.priority_id = hp.id
        LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
        INNER JOIN countries c ON h.country_id = c.id
        WHERE c.name = :countryName
      ),
      total_count AS (
        SELECT COUNT(*) as total_count
        FROM hosts h
        INNER JOIN countries c ON h.country_id = c.id
        WHERE c.name = :countryName
      )
      SELECT 
        hd.*,
        tc.total_count
      FROM host_details hd
      CROSS JOIN total_count tc
      ORDER BY (
        SELECT rn FROM sorted_hosts sh WHERE sh.id = hd.id
      )
    `;

    const hosts = await sequelize.query(hostsQuery, {
      replacements: {
        countryName: country,
        offset: offset,
        offsetPlusLimit: offset + limitNum,
      },
      type: sequelize.QueryTypes.SELECT,
    });

    if (hosts.length === 0) {
      return res.status(404).json({
        message: "Страна не найдена или в ней нет хостов",
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

    const totalItems = parseInt(hosts[0]?.total_count || 0);
    const totalPages = Math.ceil(totalItems / limitNum);
    const items = hosts.map(formatHostFromRaw);

    return res.json({
      items,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: totalItems,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      type: "search",
      field: "country",
    });
  } catch (error) {
    console.error("Ошибка в getCountryDetails:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// Функция для получения данных по приоритету с пагинацией
export const getPriorityDetails = async (req, res) => {
  try {
    const { priority, page = 1, limit = 10 } = req.query;
    const { pageNum, limitNum, offset } = paginate(req);

    const hostsQuery = `
      WITH sorted_hosts AS (
        SELECT 
          h.id,
          ROW_NUMBER() OVER (
            ORDER BY 
              CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
              h.priority_id DESC NULLS LAST,
              h.updated_at DESC
          ) as rn
        FROM hosts h
        INNER JOIN host_priorities hp ON h.priority_id = hp.id
        WHERE hp.name = :priorityName
      ),
      paginated_hosts AS (
        SELECT id FROM sorted_hosts
        WHERE rn > :offset AND rn <= :offsetPlusLimit
        ORDER BY rn
      ),
      host_details AS (
        SELECT 
          h.id,
          h.ip,
          h.reachable,
          TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
          h.priority_id,
          h.grouping_id,
          h.country_id,
          hp.name as priority_name,
          hg.name as grouping_name,
          c.name as country_name,
          (
            SELECT COALESCE(
              json_agg(
                json_build_object(
                  'port', p.port,
                  'type', p.type,
                  'port_name', wkp.name
                )
                ORDER BY p.port
              ),
              '[]'::json
            )
            FROM ports p
            LEFT JOIN well_known_ports wkp ON p.port = wkp.port
            WHERE p.host_id = h.id
          ) as ports_json,
          EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
        FROM hosts h
        INNER JOIN paginated_hosts ph ON h.id = ph.id
        INNER JOIN host_priorities hp ON h.priority_id = hp.id
        LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
        LEFT JOIN countries c ON h.country_id = c.id
        WHERE hp.name = :priorityName
      ),
      total_count AS (
        SELECT COUNT(*) as total_count
        FROM hosts h
        INNER JOIN host_priorities hp ON h.priority_id = hp.id
        WHERE hp.name = :priorityName
      )
      SELECT 
        hd.*,
        tc.total_count
      FROM host_details hd
      CROSS JOIN total_count tc
      ORDER BY (
        SELECT rn FROM sorted_hosts sh WHERE sh.id = hd.id
      )
    `;

    const hosts = await sequelize.query(hostsQuery, {
      replacements: {
        priorityName: priority,
        offset: offset,
        offsetPlusLimit: offset + limitNum,
      },
      type: sequelize.QueryTypes.SELECT,
    });

    if (hosts.length === 0) {
      return res.status(404).json({
        message: "Приоритет не найден или в нем нет хостов",
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

    const totalItems = parseInt(hosts[0]?.total_count || 0);
    const totalPages = Math.ceil(totalItems / limitNum);
    const items = hosts.map(formatHostFromRaw);

    return res.json({
      items,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: totalItems,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      type: "search",
      field: "priority",
    });
  } catch (error) {
    console.error("Ошибка в getPriorityDetails:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

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

// // Функция извлечения портов из JSON (унифицированная)
// const extractPortsFromJson = (portsJson) => {
//   const result = { open: [], filtered: [] };

//   if (!portsJson) return result;

//   try {
//     const ports = typeof portsJson === 'string' ? JSON.parse(portsJson) : portsJson;

//     if (!Array.isArray(ports) || ports.length === 0) return result;

//     for (let i = 0; i < ports.length; i++) {
//       const port = ports[i];
//       if (port && port.port && port.type) {
//         const portInfo = {
//           port: port.port,
//           name: port.port_name || null,
//         };

//         if (port.type === "open") {
//           result.open.push(portInfo);
//         } else if (port.type === "filtered") {
//           result.filtered.push(portInfo);
//         }
//       }
//     }
//   } catch (e) {
//     console.error("Error extracting ports:", e);
//   }

//   return result;
// };

// // Универсальная функция форматирования данных хоста
// const formatHostFromRaw = (host) => {
//   const formatted = {
//     id: host.id,
//     ip: host.ip,
//     reachable: host.reachable,
//     updated_at: host.updated_at,
//     port_data: extractPortsFromJson(host.ports_json),
//     priority_info: {
//       priority: host.priority_id ? {
//         id: host.priority_id,
//         name: host.priority_name || "Unknown",
//       } : null,
//       grouping: host.grouping_id ? {
//         id: host.grouping_id,
//         name: host.grouping_name || null,
//       } : null,
//     },
//     country_info: host.country_id ? {
//       id: host.country_id,
//       name: host.country_name || null,
//     } : null,
//     has_whois: !!host.has_whois,
//   };

//   // Удаляем служебные поля, если они есть
//   delete formatted.rn;
//   delete formatted.total_count;

//   return formatted;
// };

// // Вспомогательная функция для пагинации
// const paginate = (req) => {
//   const { page = 1, limit = 10 } = req.body || req.query;
//   const pageNum = Math.max(1, parseInt(page, 10) || 1);
//   const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
//   const offset = (pageNum - 1) * limitNum;
//   return { pageNum, limitNum, offset };
// };

// // Основная функция группировки (оптимизированная)
// export const getGrouping = async (req, res) => {
//   try {
//     const {
//       groupingType = "port",
//       page = 1,
//       limit = 10,
//       groupValue,
//       ...filters
//     } = req.body;

//     const { pageNum, limitNum, offset } = paginate(req);

//     // Базовый запрос для хостов с учетом фильтров
//     let whereConditions = [];
//     let replacements = {};

//     // Фильтр по IP
//     if (filters.ip) {
//       whereConditions.push(`h.ip::text ILIKE :ipPattern`);
//       replacements.ipPattern = `${filters.ip}%`;
//     }

//     // Фильтр по дате
//     if (filters.dateRange?.startDate || filters.dateRange?.endDate) {
//       const dateConditions = [];
//       if (filters.dateRange.startDate) {
//         dateConditions.push(`h.updated_at >= :startDate`);
//         replacements.startDate = filters.dateRange.startDate;
//       }
//       if (filters.dateRange.endDate) {
//         dateConditions.push(`h.updated_at <= :endDate`);
//         replacements.endDate = filters.dateRange.endDate;
//       }
//       if (dateConditions.length > 0) {
//         whereConditions.push(`(${dateConditions.join(' AND ')})`);
//       }
//     }

//     // Фильтр по приоритету
//     if (filters.priority) {
//       const priorityNames = Array.isArray(filters.priority) ? filters.priority : [filters.priority];
//       whereConditions.push(`hp.name IN (:priorityNames)`);
//       replacements.priorityNames = priorityNames;
//     }

//     // Фильтр по группе
//     if (filters.group) {
//       const groupNames = Array.isArray(filters.group) ? filters.group : [filters.group];
//       whereConditions.push(`hg.name IN (:groupNames)`);
//       replacements.groupNames = groupNames;
//     }

//     // Фильтр по стране
//     if (filters.country) {
//       const countryNames = Array.isArray(filters.country) ? filters.country : [filters.country];
//       whereConditions.push(`c.name IN (:countryNames)`);
//       replacements.countryNames = countryNames;
//     }

//     // Фильтр по WHOIS
//     if (filters.whois && filters.whois !== 'all') {
//       if (filters.whois === 'withWhois') {
//         whereConditions.push(`EXISTS (SELECT 1 FROM whois w2 WHERE w2.host_id = h.id)`);
//       } else if (filters.whois === 'noWhois') {
//         whereConditions.push(`NOT EXISTS (SELECT 1 FROM whois w2 WHERE w2.host_id = h.id)`);
//       }
//     }

//     // Фильтр по ключевым словам
//     if (filters.keyword) {
//       const keywords = Array.isArray(filters.keyword) ? filters.keyword : [filters.keyword];
//       const keywordConditions = keywords.map((kw, idx) =>
//         `(LOWER(w.value) LIKE LOWER(:keyword${idx}) OR LOWER(wk.key_name) LIKE LOWER(:keyword${idx}))`
//       );
//       whereConditions.push(`(${keywordConditions.join(' OR ')})`);
//       keywords.forEach((kw, idx) => {
//         replacements[`keyword${idx}`] = `%${kw}%`;
//       });
//     }

//     // Фильтр по портам
//     if (filters.portOpened || filters.portFiltered) {
//       const portConditions = [];

//       if (filters.portOpened) {
//         const openedPorts = Array.isArray(filters.portOpened) ? filters.portOpened : [filters.portOpened];
//         openedPorts.forEach((port, idx) => {
//           portConditions.push(`(p.port = :openedPort${idx} AND p.type = 'open')`);
//           replacements[`openedPort${idx}`] = parseInt(port) || port;
//         });
//       }

//       if (filters.portFiltered) {
//         const filteredPorts = Array.isArray(filters.portFiltered) ? filters.portFiltered : [filters.portFiltered];
//         filteredPorts.forEach((port, idx) => {
//           portConditions.push(`(p.port = :filteredPort${idx} AND p.type = 'filtered')`);
//           replacements[`filteredPort${idx}`] = parseInt(port) || port;
//         });
//       }

//       if (portConditions.length > 0) {
//         whereConditions.push(`(${portConditions.join(' OR ')})`);
//       }
//     }

//     // Формируем WHERE условие
//     const whereClause = whereConditions.length > 0 ? `WHERE ${whereConditions.join(' AND ')}` : '';

//     // В зависимости от типа группировки выполняем разные запросы
//     let result;
//     switch (groupingType) {
//       case 'port':
//         result = await groupByPort(whereClause, replacements, pageNum, limitNum, offset, groupValue);
//         break;
//       case 'keyword':
//         result = await groupByKeyword(whereClause, replacements, pageNum, limitNum, offset, groupValue);
//         break;
//       case 'priority':
//         result = await groupByPriority(whereClause, replacements, pageNum, limitNum, offset, groupValue);
//         break;
//       case 'group':
//         result = await groupByHostGroup(whereClause, replacements, pageNum, limitNum, offset, groupValue);
//         break;
//       case 'country':
//         result = await groupByCountry(whereClause, replacements, pageNum, limitNum, offset, groupValue);
//         break;
//       case 'whois':
//         result = await groupByWhois(whereClause, replacements, pageNum, limitNum, offset, groupValue);
//         break;
//       case 'ip':
//         result = await getAllHosts(whereClause, replacements, pageNum, limitNum, offset, groupValue);
//         break;
//       default:
//         result = await groupByPort(whereClause, replacements, pageNum, limitNum, offset, groupValue);
//     }

//     return res.json({
//       items: result.items,
//       pagination: result.pagination,
//       type: "group",
//       field: groupingType,
//       tabs: result.tabs || [],
//     });

//   } catch (error) {
//     console.error("Ошибка в getGrouping:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// // Группировка по портам
// // Группировка по портам
// async function groupByPort(whereClause, replacements, pageNum, limitNum, offset, groupValue) {
//     console.log('groupByPort whereClause >> ', whereClause)
//   // Запрос для получения уникальных портов (табы)
//   const tabsQuery = `
//     SELECT
//       p.port as value,
//       wkp.name as name,
//       COUNT(DISTINCT h.id) as host_count
//     FROM hosts h
//     INNER JOIN ports p ON h.id = p.host_id
//     LEFT JOIN well_known_ports wkp ON p.port = wkp.port
//     ${whereClause}
//     GROUP BY p.port, wkp.name
//     ORDER BY p.port ASC
//   `;

//   const tabs = await sequelize.query(tabsQuery, {
//     replacements,
//     type: sequelize.QueryTypes.SELECT,
//   });

//   if (tabs.length === 0) {
//     return {
//       items: [],
//       pagination: {
//         currentPage: pageNum,
//         totalPages: 0,
//         totalItems: 0,
//         hasNext: false,
//         hasPrev: false,
//       },
//       tabs: []
//     };
//   }

//   // Получаем данные для первого порта
//   const firstPort = tabs[0];
//   const portNumber = groupValue ?? firstPort.value;

//   // Основной запрос с правильным JOIN для фильтрации по порту
//   const hostsQuery = `
//     WITH hosts_with_port AS (
//       SELECT DISTINCT h.id
//       FROM hosts h
//       INNER JOIN ports p ON h.id = p.host_id
//       ${whereClause ? whereClause + ' AND p.port = :portNumber' : 'WHERE p.port = :portNumber'}
//     ),
//     sorted_hosts AS (
//       SELECT
//         h.id,
//         ROW_NUMBER() OVER (
//           ORDER BY
//             CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//             h.priority_id DESC NULLS LAST,
//             h.updated_at DESC
//         ) as rn
//       FROM hosts h
//       WHERE h.id IN (SELECT id FROM hosts_with_port)
//     ),
//     paginated_hosts AS (
//       SELECT id FROM sorted_hosts
//       WHERE rn > :offset AND rn <= :offsetPlusLimit
//       ORDER BY rn
//     ),
//     host_details AS (
//       SELECT
//         h.id,
//         h.ip,
//         h.reachable,
//         TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
//         h.priority_id,
//         h.grouping_id,
//         h.country_id,
//         hp.name as priority_name,
//         hg.name as grouping_name,
//         c.name as country_name,
//         (
//           SELECT COALESCE(
//             json_agg(
//               json_build_object(
//                 'port', p2.port,
//                 'type', p2.type,
//                 'port_name', wkp.name
//               )
//               ORDER BY p2.port
//             ),
//             '[]'::json
//           )
//           FROM ports p2
//           LEFT JOIN well_known_ports wkp ON p2.port = wkp.port
//           WHERE p2.host_id = h.id
//         ) as ports_json,
//         EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois,
//         sh.rn
//       FROM hosts h
//       INNER JOIN paginated_hosts ph ON h.id = ph.id
//       INNER JOIN sorted_hosts sh ON h.id = sh.id
//       LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//       LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//       LEFT JOIN countries c ON h.country_id = c.id
//     ),
//     total_count AS (
//       SELECT COUNT(*) as total_count
//       FROM hosts_with_port
//     )
//     SELECT
//       hd.*,
//       tc.total_count
//     FROM host_details hd
//     CROSS JOIN total_count tc
//     ORDER BY hd.rn
//   `;

//   const hosts = await sequelize.query(hostsQuery, {
//     replacements: {
//       ...replacements,
//       portNumber,
//       offset: offset,
//       offsetPlusLimit: offset + limitNum,
//     },
//     type: sequelize.QueryTypes.SELECT,
//   });

//   if (hosts.length === 0) {
//     return {
//       items: [],
//       pagination: {
//         currentPage: pageNum,
//         totalPages: 0,
//         totalItems: 0,
//         hasNext: false,
//         hasPrev: false,
//       },
//       tabs
//     };
//   }

//   const totalItems = parseInt(hosts[0]?.total_count || 0);
//   const totalPages = Math.ceil(totalItems / limitNum);
//   const items = hosts.map(host => {
//     const formatted = formatHostFromRaw(host);
//     // Удаляем rn из результата
//     delete formatted.rn;
//     return formatted;
//   });

//   return {
//     items,
//     pagination: {
//       currentPage: pageNum,
//       totalPages: totalPages,
//       totalItems: totalItems,
//       hasNext: pageNum < totalPages,
//       hasPrev: pageNum > 1,
//     },
//     tabs
//   };
// }
// // Группировка по ключевым словам
// async function groupByKeyword(whereClause, replacements, pageNum, limitNum, offset, groupValue) {
//   // Запрос для получения уникальных ключевых слов (табы)
//   console.log('groupByKeyword whereClause >> ', whereClause)
//   const tabsQuery = `
//     SELECT
//       wk.key_name as value,
//       COUNT(DISTINCT h.id) as host_count
//     FROM hosts h
//     INNER JOIN whois w ON h.id = w.host_id
//     INNER JOIN whois_keys wk ON w.key_id = wk.id
//     ${whereClause}
//     GROUP BY wk.key_name
//     ORDER BY wk.key_name ASC
//   `;

//   const tabs = await sequelize.query(tabsQuery, {
//     replacements,
//     type: sequelize.QueryTypes.SELECT,
//   });

//   if (tabs.length === 0) {
//     return {
//       items: [],
//       pagination: {
//         currentPage: pageNum,
//         totalPages: 0,
//         totalItems: 0,
//         hasNext: false,
//         hasPrev: false,
//       },
//       tabs: []
//     };
//   }

//   // Получаем данные для первого ключевого слова
//   const firstKeyword = tabs[0];
//   const keywordName = groupValue ?? firstKeyword.value;

//   // Основной запрос с правильным JOIN для фильтрации по ключевому слову
//   const hostsQuery = `
//     WITH hosts_with_keyword AS (
//       SELECT DISTINCT h.id
//       FROM hosts h
//       INNER JOIN whois w ON h.id = w.host_id
//       INNER JOIN whois_keys wk ON w.key_id = wk.id
//       ${whereClause ? whereClause + ' AND wk.key_name = :keywordName' : 'WHERE wk.key_name = :keywordName'}
//     ),
//     sorted_hosts AS (
//       SELECT
//         h.id,
//         ROW_NUMBER() OVER (
//           ORDER BY
//             CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//             h.priority_id DESC NULLS LAST,
//             h.updated_at DESC
//         ) as rn
//       FROM hosts h
//       WHERE h.id IN (SELECT id FROM hosts_with_keyword)
//     ),
//     paginated_hosts AS (
//       SELECT id FROM sorted_hosts
//       WHERE rn > :offset AND rn <= :offsetPlusLimit
//       ORDER BY rn
//     ),
//     host_details AS (
//       SELECT
//         h.id,
//         h.ip,
//         h.reachable,
//         TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
//         h.priority_id,
//         h.grouping_id,
//         h.country_id,
//         hp.name as priority_name,
//         hg.name as grouping_name,
//         c.name as country_name,
//         (
//           SELECT COALESCE(
//             json_agg(
//               json_build_object(
//                 'port', p.port,
//                 'type', p.type,
//                 'port_name', wkp.name
//               )
//               ORDER BY p.port
//             ),
//             '[]'::json
//           )
//           FROM ports p
//           LEFT JOIN well_known_ports wkp ON p.port = wkp.port
//           WHERE p.host_id = h.id
//         ) as ports_json,
//         TRUE as has_whois,
//         sh.rn
//       FROM hosts h
//       INNER JOIN paginated_hosts ph ON h.id = ph.id
//       INNER JOIN sorted_hosts sh ON h.id = sh.id
//       LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//       LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//       LEFT JOIN countries c ON h.country_id = c.id
//     ),
//     total_count AS (
//       SELECT COUNT(*) as total_count
//       FROM hosts_with_keyword
//     )
//     SELECT
//       hd.*,
//       tc.total_count
//     FROM host_details hd
//     CROSS JOIN total_count tc
//     ORDER BY hd.rn
//   `;

//   const hosts = await sequelize.query(hostsQuery, {
//     replacements: {
//       ...replacements,
//       keywordName,
//       offset: offset,
//       offsetPlusLimit: offset + limitNum,
//     },
//     type: sequelize.QueryTypes.SELECT,
//   });

//   if (hosts.length === 0) {
//     return {
//       items: [],
//       pagination: {
//         currentPage: pageNum,
//         totalPages: 0,
//         totalItems: 0,
//         hasNext: false,
//         hasPrev: false,
//       },
//       tabs
//     };
//   }

//   const totalItems = parseInt(hosts[0]?.total_count || 0);
//   const totalPages = Math.ceil(totalItems / limitNum);
//   const items = hosts.map(host => {
//     const formatted = formatHostFromRaw(host);
//     delete formatted.rn;
//     return formatted;
//   });

//   return {
//     items,
//     pagination: {
//       currentPage: pageNum,
//       totalPages: totalPages,
//       totalItems: totalItems,
//       hasNext: pageNum < totalPages,
//       hasPrev: pageNum > 1,
//     },
//     tabs
//   };
// }

// // Группировка по приоритету
// async function groupByPriority(whereClause, replacements, pageNum, limitNum, offset, groupValue) {
//   const tabsQuery = `
//     SELECT
//       hp.name as value,
//       COUNT(DISTINCT h.id) as host_count
//     FROM hosts h
//     LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//     ${whereClause}
//     GROUP BY hp.name
//     ORDER BY hp.name ASC
//   `;

//   const tabs = await sequelize.query(tabsQuery, {
//     replacements,
//     type: sequelize.QueryTypes.SELECT,
//   });

//   if (tabs.length === 0) {
//     return {
//       items: [],
//       pagination: {
//         currentPage: pageNum,
//         totalPages: 0,
//         totalItems: 0,
//         hasNext: false,
//         hasPrev: false,
//       },
//       tabs: []
//     };
//   }

//   // Поскольку приоритеты обычно немного, показываем все хосты с пагинацией
//   const hostsQuery = `
//     WITH sorted_hosts AS (
//       SELECT
//         h.id,
//         ROW_NUMBER() OVER (
//           ORDER BY
//             CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//             h.priority_id DESC NULLS LAST,
//             h.updated_at DESC
//         ) as rn
//       FROM hosts h
//       LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//       ${whereClause}
//     ),
//     paginated_hosts AS (
//       SELECT id FROM sorted_hosts
//       WHERE rn > :offset AND rn <= :offsetPlusLimit
//       ORDER BY rn
//     ),
//     host_details AS (
//       SELECT
//         h.id,
//         h.ip,
//         h.reachable,
//         TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
//         h.priority_id,
//         h.grouping_id,
//         h.country_id,
//         hp.name as priority_name,
//         hg.name as grouping_name,
//         c.name as country_name,
//         (
//           SELECT COALESCE(
//             json_agg(
//               json_build_object(
//                 'port', p.port,
//                 'type', p.type,
//                 'port_name', wkp.name
//               )
//               ORDER BY p.port
//             ),
//             '[]'::json
//           )
//           FROM ports p
//           LEFT JOIN well_known_ports wkp ON p.port = wkp.port
//           WHERE p.host_id = h.id
//         ) as ports_json,
//         EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
//       FROM hosts h
//       INNER JOIN paginated_hosts ph ON h.id = ph.id
//       LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//       LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//       LEFT JOIN countries c ON h.country_id = c.id
//     ),
//     total_count AS (
//       SELECT COUNT(DISTINCT h.id) as total_count
//       FROM hosts h
//       LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//       ${whereClause}
//     )
//     SELECT
//       hd.*,
//       tc.total_count
//     FROM host_details hd
//     CROSS JOIN total_count tc
//     ORDER BY (
//       SELECT rn FROM sorted_hosts sh WHERE sh.id = hd.id
//     )
//   `;

//   const hosts = await sequelize.query(hostsQuery, {
//     replacements: {
//       ...replacements,
//       offset: offset,
//       offsetPlusLimit: offset + limitNum,
//     },
//     type: sequelize.QueryTypes.SELECT,
//   });

//   if (hosts.length === 0) {
//     return {
//       items: [],
//       pagination: {
//         currentPage: pageNum,
//         totalPages: 0,
//         totalItems: 0,
//         hasNext: false,
//         hasPrev: false,
//       },
//       tabs
//     };
//   }
//   console.log('hosts[0] >> ', hosts[0])
//   const totalItems = parseInt(hosts[0]?.total_count || 0);
//   const totalPages = Math.ceil(totalItems / limitNum);
//   const items = hosts.map(formatHostFromRaw);

//   return {
//     items,
//     pagination: {
//       currentPage: pageNum,
//       totalPages: totalPages,
//       totalItems: totalItems,
//       hasNext: pageNum < totalPages,
//       hasPrev: pageNum > 1,
//     },
//     tabs
//   };
// }

// // Группировка по группам хостов
// async function groupByHostGroup(whereClause, replacements, pageNum, limitNum, offset, groupValue) {
//   const tabsQuery = `
//     SELECT
//       hg.name as value,
//       COUNT(DISTINCT h.id) as host_count
//     FROM hosts h
//     LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//     ${whereClause}
//     GROUP BY hg.name
//     ORDER BY hg.name ASC
//   `;

//   const tabs = await sequelize.query(tabsQuery, {
//     replacements,
//     type: sequelize.QueryTypes.SELECT,
//   });

//   if (tabs.length === 0) {
//     return {
//       items: [],
//       pagination: {
//         currentPage: pageNum,
//         totalPages: 0,
//         totalItems: 0,
//         hasNext: false,
//         hasPrev: false,
//       },
//       tabs: []
//     };
//   }

//   const hostsQuery = `
//     WITH sorted_hosts AS (
//       SELECT
//         h.id,
//         ROW_NUMBER() OVER (
//           ORDER BY
//             CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//             h.priority_id DESC NULLS LAST,
//             h.updated_at DESC
//         ) as rn
//       FROM hosts h
//       LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//       ${whereClause}
//     ),
//     paginated_hosts AS (
//       SELECT id FROM sorted_hosts
//       WHERE rn > :offset AND rn <= :offsetPlusLimit
//       ORDER BY rn
//     ),
//     host_details AS (
//       SELECT
//         h.id,
//         h.ip,
//         h.reachable,
//         TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
//         h.priority_id,
//         h.grouping_id,
//         h.country_id,
//         hp.name as priority_name,
//         hg.name as grouping_name,
//         c.name as country_name,
//         (
//           SELECT COALESCE(
//             json_agg(
//               json_build_object(
//                 'port', p.port,
//                 'type', p.type,
//                 'port_name', wkp.name
//               )
//               ORDER BY p.port
//             ),
//             '[]'::json
//           )
//           FROM ports p
//           LEFT JOIN well_known_ports wkp ON p.port = wkp.port
//           WHERE p.host_id = h.id
//         ) as ports_json,
//         EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
//       FROM hosts h
//       INNER JOIN paginated_hosts ph ON h.id = ph.id
//       LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//       LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//       LEFT JOIN countries c ON h.country_id = c.id
//     ),
//     total_count AS (
//       SELECT COUNT(DISTINCT h.id) as total_count
//       FROM hosts h
//       LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//       ${whereClause}
//     )
//     SELECT
//       hd.*,
//       tc.total_count
//     FROM host_details hd
//     CROSS JOIN total_count tc
//     ORDER BY (
//       SELECT rn FROM sorted_hosts sh WHERE sh.id = hd.id
//     )
//   `;

//   const hosts = await sequelize.query(hostsQuery, {
//     replacements: {
//       ...replacements,
//       offset: offset,
//       offsetPlusLimit: offset + limitNum,
//     },
//     type: sequelize.QueryTypes.SELECT,
//   });

//   if (hosts.length === 0) {
//     return {
//       items: [],
//       pagination: {
//         currentPage: pageNum,
//         totalPages: 0,
//         totalItems: 0,
//         hasNext: false,
//         hasPrev: false,
//       },
//       tabs
//     };
//   }

//   const totalItems = parseInt(hosts[0]?.total_count || 0);
//   const totalPages = Math.ceil(totalItems / limitNum);
//   const items = hosts.map(formatHostFromRaw);

//   return {
//     items,
//     pagination: {
//       currentPage: pageNum,
//       totalPages: totalPages,
//       totalItems: totalItems,
//       hasNext: pageNum < totalPages,
//       hasPrev: pageNum > 1,
//     },
//     tabs
//   };
// }

// // Группировка по странам
// async function groupByCountry(whereClause, replacements, pageNum, limitNum, offset, groupValue) {
//   const tabsQuery = `
//     SELECT
//       c.name as value,
//       COUNT(DISTINCT h.id) as host_count
//     FROM hosts h
//     LEFT JOIN countries c ON h.country_id = c.id
//     ${whereClause}
//     GROUP BY c.name
//     ORDER BY c.name ASC
//   `;

//   const tabs = await sequelize.query(tabsQuery, {
//     replacements,
//     type: sequelize.QueryTypes.SELECT,
//   });

//   if (tabs.length === 0) {
//     return {
//       items: [],
//       pagination: {
//         currentPage: pageNum,
//         totalPages: 0,
//         totalItems: 0,
//         hasNext: false,
//         hasPrev: false,
//       },
//       tabs: []
//     };
//   }

//   const hostsQuery = `
//     WITH sorted_hosts AS (
//       SELECT
//         h.id,
//         ROW_NUMBER() OVER (
//           ORDER BY
//             CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//             h.priority_id DESC NULLS LAST,
//             h.updated_at DESC
//         ) as rn
//       FROM hosts h
//       LEFT JOIN countries c ON h.country_id = c.id
//       ${whereClause}
//     ),
//     paginated_hosts AS (
//       SELECT id FROM sorted_hosts
//       WHERE rn > :offset AND rn <= :offsetPlusLimit
//       ORDER BY rn
//     ),
//     host_details AS (
//       SELECT
//         h.id,
//         h.ip,
//         h.reachable,
//         TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
//         h.priority_id,
//         h.grouping_id,
//         h.country_id,
//         hp.name as priority_name,
//         hg.name as grouping_name,
//         c.name as country_name,
//         (
//           SELECT COALESCE(
//             json_agg(
//               json_build_object(
//                 'port', p.port,
//                 'type', p.type,
//                 'port_name', wkp.name
//               )
//               ORDER BY p.port
//             ),
//             '[]'::json
//           )
//           FROM ports p
//           LEFT JOIN well_known_ports wkp ON p.port = wkp.port
//           WHERE p.host_id = h.id
//         ) as ports_json,
//         EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
//       FROM hosts h
//       INNER JOIN paginated_hosts ph ON h.id = ph.id
//       LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//       LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//       LEFT JOIN countries c ON h.country_id = c.id
//     ),
//     total_count AS (
//       SELECT COUNT(DISTINCT h.id) as total_count
//       FROM hosts h
//       LEFT JOIN countries c ON h.country_id = c.id
//       ${whereClause}
//     )
//     SELECT
//       hd.*,
//       tc.total_count
//     FROM host_details hd
//     CROSS JOIN total_count tc
//     ORDER BY (
//       SELECT rn FROM sorted_hosts sh WHERE sh.id = hd.id
//     )
//   `;

//   const hosts = await sequelize.query(hostsQuery, {
//     replacements: {
//       ...replacements,
//       offset: offset,
//       offsetPlusLimit: offset + limitNum,
//     },
//     type: sequelize.QueryTypes.SELECT,
//   });

//   if (hosts.length === 0) {
//     return {
//       items: [],
//       pagination: {
//         currentPage: pageNum,
//         totalPages: 0,
//         totalItems: 0,
//         hasNext: false,
//         hasPrev: false,
//       },
//       tabs
//     };
//   }

//   const totalItems = parseInt(hosts[0]?.total_count || 0);
//   const totalPages = Math.ceil(totalItems / limitNum);
//   const items = hosts.map(formatHostFromRaw);

//   return {
//     items,
//     pagination: {
//       currentPage: pageNum,
//       totalPages: totalPages,
//       totalItems: totalItems,
//       hasNext: pageNum < totalPages,
//       hasPrev: pageNum > 1,
//     },
//     tabs
//   };
// }

// // Группировка по WHOIS
// async function groupByWhois(whereClause, replacements, pageNum, limitNum, offset, groupValue) {
//   const tabs = [
//     { value: 'С WHOIS данными', host_count: 0 },
//     { value: 'Без WHOIS данных', host_count: 0 }
//   ];

//   const hostsQuery = `
//     WITH sorted_hosts AS (
//       SELECT
//         h.id,
//         CASE
//           WHEN EXISTS (SELECT 1 FROM whois w WHERE w.host_id = h.id) THEN 'С WHOIS данными'
//           ELSE 'Без WHOIS данных'
//         END as whois_status,
//         ROW_NUMBER() OVER (
//           PARTITION BY
//             CASE
//               WHEN EXISTS (SELECT 1 FROM whois w WHERE w.host_id = h.id) THEN 'С WHOIS данными'
//               ELSE 'Без WHOIS данных'
//             END
//           ORDER BY
//             CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//             h.priority_id DESC NULLS LAST,
//             h.updated_at DESC
//         ) as rn
//       FROM hosts h
//       ${whereClause}
//     ),
//     paginated_hosts AS (
//       SELECT id, whois_status FROM sorted_hosts
//       WHERE rn > :offset AND rn <= :offsetPlusLimit
//       ORDER BY whois_status, rn
//     ),
//     host_details AS (
//       SELECT
//         h.id,
//         h.ip,
//         h.reachable,
//         TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
//         h.priority_id,
//         h.grouping_id,
//         h.country_id,
//         hp.name as priority_name,
//         hg.name as grouping_name,
//         c.name as country_name,
//         (
//           SELECT COALESCE(
//             json_agg(
//               json_build_object(
//                 'port', p.port,
//                 'type', p.type,
//                 'port_name', wkp.name
//               )
//               ORDER BY p.port
//             ),
//             '[]'::json
//           )
//           FROM ports p
//           LEFT JOIN well_known_ports wkp ON p.port = wkp.port
//           WHERE p.host_id = h.id
//         ) as ports_json,
//         EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois,
//         ph.whois_status
//       FROM hosts h
//       INNER JOIN paginated_hosts ph ON h.id = ph.id
//       LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//       LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//       LEFT JOIN countries c ON h.country_id = c.id
//     ),
//     total_count AS (
//       SELECT
//         CASE
//           WHEN EXISTS (SELECT 1 FROM whois w WHERE w.host_id = h.id) THEN 'С WHOIS данными'
//           ELSE 'Без WHOIS данных'
//         END as whois_status,
//         COUNT(*) as total_count
//       FROM hosts h
//       ${whereClause}
//       GROUP BY
//         CASE
//           WHEN EXISTS (SELECT 1 FROM whois w WHERE w.host_id = h.id) THEN 'С WHOIS данными'
//           ELSE 'Без WHOIS данных'
//         END
//     )
//     SELECT
//       hd.*,
//       tc.total_count
//     FROM host_details hd
//     CROSS JOIN total_count tc
//     WHERE tc.whois_status = hd.whois_status
//     ORDER BY hd.whois_status, (
//       SELECT rn FROM sorted_hosts sh WHERE sh.id = hd.id
//     )
//   `;

//   const hosts = await sequelize.query(hostsQuery, {
//     replacements: {
//       ...replacements,
//       offset: offset,
//       offsetPlusLimit: offset + limitNum,
//     },
//     type: sequelize.QueryTypes.SELECT,
//   });

//   if (hosts.length === 0) {
//     return {
//       items: [],
//       pagination: {
//         currentPage: pageNum,
//         totalPages: 0,
//         totalItems: 0,
//         hasNext: false,
//         hasPrev: false,
//       },
//       tabs: []
//     };
//   }

//   const totalItems = hosts.reduce((sum, host) => sum + (parseInt(host.total_count) || 0), 0);
//   const totalPages = Math.ceil(totalItems / limitNum);
//   const items = hosts.map(formatHostFromRaw);

//   return {
//     items,
//     pagination: {
//       currentPage: pageNum,
//       totalPages: totalPages,
//       totalItems: totalItems,
//       hasNext: pageNum < totalPages,
//       hasPrev: pageNum > 1,
//     },
//     tabs: tabs.filter(tab => {
//       const count = hosts.find(h => h.has_whois === (tab.value === 'С WHOIS данными'))?.total_count || 0;
//       return count > 0;
//     })
//   };
// }

// // Получение всех хостов (без группировки)
// async function getAllHosts(whereClause, replacements, pageNum, limitNum, offset, groupValue) {
//   const hostsQuery = `
//     WITH sorted_hosts AS (
//       SELECT
//         h.id,
//         ROW_NUMBER() OVER (
//           ORDER BY
//             CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//             h.priority_id DESC NULLS LAST,
//             h.updated_at DESC
//         ) as rn
//       FROM hosts h
//       ${whereClause}
//     ),
//     paginated_hosts AS (
//       SELECT id FROM sorted_hosts
//       WHERE rn > :offset AND rn <= :offsetPlusLimit
//       ORDER BY rn
//     ),
//     host_details AS (
//       SELECT
//         h.id,
//         h.ip,
//         h.reachable,
//         TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
//         h.priority_id,
//         h.grouping_id,
//         h.country_id,
//         hp.name as priority_name,
//         hg.name as grouping_name,
//         c.name as country_name,
//         (
//           SELECT COALESCE(
//             json_agg(
//               json_build_object(
//                 'port', p.port,
//                 'type', p.type,
//                 'port_name', wkp.name
//               )
//               ORDER BY p.port
//             ),
//             '[]'::json
//           )
//           FROM ports p
//           LEFT JOIN well_known_ports wkp ON p.port = wkp.port
//           WHERE p.host_id = h.id
//         ) as ports_json,
//         EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
//       FROM hosts h
//       INNER JOIN paginated_hosts ph ON h.id = ph.id
//       LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//       LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//       LEFT JOIN countries c ON h.country_id = c.id
//     ),
//     total_count AS (
//       SELECT COUNT(DISTINCT h.id) as total_count
//       FROM hosts h
//       ${whereClause}
//     )
//     SELECT
//       hd.*,
//       tc.total_count
//     FROM host_details hd
//     CROSS JOIN total_count tc
//     ORDER BY (
//       SELECT rn FROM sorted_hosts sh WHERE sh.id = hd.id
//     )
//   `;

//   const hosts = await sequelize.query(hostsQuery, {
//     replacements: {
//       ...replacements,
//       offset: offset,
//       offsetPlusLimit: offset + limitNum,
//     },
//     type: sequelize.QueryTypes.SELECT,
//   });

//   if (hosts.length === 0) {
//     return {
//       items: [],
//       pagination: {
//         currentPage: pageNum,
//         totalPages: 0,
//         totalItems: 0,
//         hasNext: false,
//         hasPrev: false,
//       },
//       tabs: []
//     };
//   }

//   const totalItems = parseInt(hosts[0]?.total_count || 0);
//   const totalPages = Math.ceil(totalItems / limitNum);
//   const items = hosts.map(formatHostFromRaw);

//   return {
//     items,
//     pagination: {
//       currentPage: pageNum,
//       totalPages: totalPages,
//       totalItems: totalItems,
//       hasNext: pageNum < totalPages,
//       hasPrev: pageNum > 1,
//     },
//     tabs: []
//   };
// }

// // Функция для получения данных по группе с пагинацией
// export const getGroupDetails = async (req, res) => {
//   try {
//     const { group, page = 1, limit = 10 } = req.query;
//     const { pageNum, limitNum, offset } = paginate(req);

//     const hostsQuery = `
//       WITH sorted_hosts AS (
//         SELECT
//           h.id,
//           ROW_NUMBER() OVER (
//             ORDER BY
//               CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//               h.priority_id DESC NULLS LAST,
//               h.updated_at DESC
//           ) as rn
//         FROM hosts h
//         INNER JOIN host_groupings hg ON h.grouping_id = hg.id
//         WHERE hg.name = :groupName
//       ),
//       paginated_hosts AS (
//         SELECT id FROM sorted_hosts
//         WHERE rn > :offset AND rn <= :offsetPlusLimit
//         ORDER BY rn
//       ),
//       host_details AS (
//         SELECT
//           h.id,
//           h.ip,
//           h.reachable,
//           TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
//           h.priority_id,
//           h.grouping_id,
//           h.country_id,
//           hp.name as priority_name,
//           hg.name as grouping_name,
//           c.name as country_name,
//           (
//             SELECT COALESCE(
//               json_agg(
//                 json_build_object(
//                   'port', p.port,
//                   'type', p.type,
//                   'port_name', wkp.name
//                 )
//                 ORDER BY p.port
//               ),
//               '[]'::json
//             )
//             FROM ports p
//             LEFT JOIN well_known_ports wkp ON p.port = wkp.port
//             WHERE p.host_id = h.id
//           ) as ports_json,
//           EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
//         FROM hosts h
//         INNER JOIN paginated_hosts ph ON h.id = ph.id
//         LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//         INNER JOIN host_groupings hg ON h.grouping_id = hg.id
//         LEFT JOIN countries c ON h.country_id = c.id
//         WHERE hg.name = :groupName
//       ),
//       total_count AS (
//         SELECT COUNT(*) as total_count
//         FROM hosts h
//         INNER JOIN host_groupings hg ON h.grouping_id = hg.id
//         WHERE hg.name = :groupName
//       )
//       SELECT
//         hd.*,
//         tc.total_count
//       FROM host_details hd
//       CROSS JOIN total_count tc
//       ORDER BY (
//         SELECT rn FROM sorted_hosts sh WHERE sh.id = hd.id
//       )
//     `;

//     const hosts = await sequelize.query(hostsQuery, {
//       replacements: {
//         groupName: group,
//         offset: offset,
//         offsetPlusLimit: offset + limitNum,
//       },
//       type: sequelize.QueryTypes.SELECT,
//     });

//     if (hosts.length === 0) {
//       return res.status(404).json({
//         message: "Группа не найдена или в ней нет хостов",
//         items: [],
//         pagination: {
//           currentPage: pageNum,
//           totalPages: 0,
//           totalItems: 0,
//           hasNext: false,
//           hasPrev: false,
//         }
//       });
//     }

//     const totalItems = parseInt(hosts[0]?.total_count || 0);
//     const totalPages = Math.ceil(totalItems / limitNum);
//     const items = hosts.map(formatHostFromRaw);

//     return res.json({
//       items,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalItems: totalItems,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },
//       type: "search",
//       field: "group",
//     });
//   } catch (error) {
//     console.error("Ошибка в getGroupDetails:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// // Функция для получения данных по стране с пагинацией
// export const getCountryDetails = async (req, res) => {
//   try {
//     const { country, page = 1, limit = 10 } = req.query;
//     const { pageNum, limitNum, offset } = paginate(req);

//     const hostsQuery = `
//       WITH sorted_hosts AS (
//         SELECT
//           h.id,
//           ROW_NUMBER() OVER (
//             ORDER BY
//               CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//               h.priority_id DESC NULLS LAST,
//               h.updated_at DESC
//           ) as rn
//         FROM hosts h
//         INNER JOIN countries c ON h.country_id = c.id
//         WHERE c.name = :countryName
//       ),
//       paginated_hosts AS (
//         SELECT id FROM sorted_hosts
//         WHERE rn > :offset AND rn <= :offsetPlusLimit
//         ORDER BY rn
//       ),
//       host_details AS (
//         SELECT
//           h.id,
//           h.ip,
//           h.reachable,
//           TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
//           h.priority_id,
//           h.grouping_id,
//           h.country_id,
//           hp.name as priority_name,
//           hg.name as grouping_name,
//           c.name as country_name,
//           (
//             SELECT COALESCE(
//               json_agg(
//                 json_build_object(
//                   'port', p.port,
//                   'type', p.type,
//                   'port_name', wkp.name
//                 )
//                 ORDER BY p.port
//               ),
//               '[]'::json
//             )
//             FROM ports p
//             LEFT JOIN well_known_ports wkp ON p.port = wkp.port
//             WHERE p.host_id = h.id
//           ) as ports_json,
//           EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
//         FROM hosts h
//         INNER JOIN paginated_hosts ph ON h.id = ph.id
//         LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//         LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//         INNER JOIN countries c ON h.country_id = c.id
//         WHERE c.name = :countryName
//       ),
//       total_count AS (
//         SELECT COUNT(*) as total_count
//         FROM hosts h
//         INNER JOIN countries c ON h.country_id = c.id
//         WHERE c.name = :countryName
//       )
//       SELECT
//         hd.*,
//         tc.total_count
//       FROM host_details hd
//       CROSS JOIN total_count tc
//       ORDER BY (
//         SELECT rn FROM sorted_hosts sh WHERE sh.id = hd.id
//       )
//     `;

//     const hosts = await sequelize.query(hostsQuery, {
//       replacements: {
//         countryName: country,
//         offset: offset,
//         offsetPlusLimit: offset + limitNum,
//       },
//       type: sequelize.QueryTypes.SELECT,
//     });

//     if (hosts.length === 0) {
//       return res.status(404).json({
//         message: "Страна не найдена или в ней нет хостов",
//         items: [],
//         pagination: {
//           currentPage: pageNum,
//           totalPages: 0,
//           totalItems: 0,
//           hasNext: false,
//           hasPrev: false,
//         }
//       });
//     }

//     const totalItems = parseInt(hosts[0]?.total_count || 0);
//     const totalPages = Math.ceil(totalItems / limitNum);
//     const items = hosts.map(formatHostFromRaw);

//     return res.json({
//       items,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalItems: totalItems,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },
//       type: "search",
//       field: "country",
//     });
//   } catch (error) {
//     console.error("Ошибка в getCountryDetails:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// // Функция для получения данных по приоритету с пагинацией
// export const getPriorityDetails = async (req, res) => {
//   try {
//     const { priority, page = 1, limit = 10 } = req.query;
//     const { pageNum, limitNum, offset } = paginate(req);

//     const hostsQuery = `
//       WITH sorted_hosts AS (
//         SELECT
//           h.id,
//           ROW_NUMBER() OVER (
//             ORDER BY
//               CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//               h.priority_id DESC NULLS LAST,
//               h.updated_at DESC
//           ) as rn
//         FROM hosts h
//         INNER JOIN host_priorities hp ON h.priority_id = hp.id
//         WHERE hp.name = :priorityName
//       ),
//       paginated_hosts AS (
//         SELECT id FROM sorted_hosts
//         WHERE rn > :offset AND rn <= :offsetPlusLimit
//         ORDER BY rn
//       ),
//       host_details AS (
//         SELECT
//           h.id,
//           h.ip,
//           h.reachable,
//           TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
//           h.priority_id,
//           h.grouping_id,
//           h.country_id,
//           hp.name as priority_name,
//           hg.name as grouping_name,
//           c.name as country_name,
//           (
//             SELECT COALESCE(
//               json_agg(
//                 json_build_object(
//                   'port', p.port,
//                   'type', p.type,
//                   'port_name', wkp.name
//                 )
//                 ORDER BY p.port
//               ),
//               '[]'::json
//             )
//             FROM ports p
//             LEFT JOIN well_known_ports wkp ON p.port = wkp.port
//             WHERE p.host_id = h.id
//           ) as ports_json,
//           EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
//         FROM hosts h
//         INNER JOIN paginated_hosts ph ON h.id = ph.id
//         INNER JOIN host_priorities hp ON h.priority_id = hp.id
//         LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//         LEFT JOIN countries c ON h.country_id = c.id
//         WHERE hp.name = :priorityName
//       ),
//       total_count AS (
//         SELECT COUNT(*) as total_count
//         FROM hosts h
//         INNER JOIN host_priorities hp ON h.priority_id = hp.id
//         WHERE hp.name = :priorityName
//       )
//       SELECT
//         hd.*,
//         tc.total_count
//       FROM host_details hd
//       CROSS JOIN total_count tc
//       ORDER BY (
//         SELECT rn FROM sorted_hosts sh WHERE sh.id = hd.id
//       )
//     `;

//     const hosts = await sequelize.query(hostsQuery, {
//       replacements: {
//         priorityName: priority,
//         offset: offset,
//         offsetPlusLimit: offset + limitNum,
//       },
//       type: sequelize.QueryTypes.SELECT,
//     });

//     if (hosts.length === 0) {
//       return res.status(404).json({
//         message: "Приоритет не найден или в нем нет хостов",
//         items: [],
//         pagination: {
//           currentPage: pageNum,
//           totalPages: 0,
//           totalItems: 0,
//           hasNext: false,
//           hasPrev: false,
//         }
//       });
//     }

//     const totalItems = parseInt(hosts[0]?.total_count || 0);
//     const totalPages = Math.ceil(totalItems / limitNum);
//     const items = hosts.map(formatHostFromRaw);

//     return res.json({
//       items,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalItems: totalItems,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },
//       type: "search",
//       field: "priority",
//     });
//   } catch (error) {
//     console.error("Ошибка в getPriorityDetails:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };
