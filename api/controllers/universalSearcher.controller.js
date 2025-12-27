// ОПТИМИЗИРОВАННЫЙ КОД МБ
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
  Country,
} from "../models/index.js";

// Кэш для часто запрашиваемых данных
const cache = {
  priorities: new Map(),
  groups: new Map(),
  countries: new Map(),
  lastCleanup: Date.now()
};

// Очистка кэша каждые 5 минут
const cleanupCache = () => {
  const now = Date.now();
  if (now - cache.lastCleanup > 300000) {
    cache.priorities.clear();
    cache.groups.clear();
    cache.countries.clear();
    cache.lastCleanup = now;
  }
};

// Оптимизированная функция форматирования данных хоста
const formatHostData = (host) => {
  const portData = { open: [], filtered: [] };
  const portSets = { open: new Set(), filtered: new Set() };
  
  if (host.Ports && host.Ports.length) {
    for (let i = 0; i < host.Ports.length; i++) {
      const port = host.Ports[i];
      const portNum = port.port;
      const portType = port.type;
      
      if (portType === 'open' && !portSets.open.has(portNum)) {
        portData.open.push({
          port: portNum,
          name: port.WellKnownPort?.name || null
        });
        portSets.open.add(portNum);
      } else if (portType === 'filtered' && !portSets.filtered.has(portNum)) {
        portData.filtered.push({
          port: portNum,
          name: port.WellKnownPort?.name || null
        });
        portSets.filtered.add(portNum);
      }
    }
  }
  
  let formattedDate = null;
  if (host.updated_at) {
    const date = new Date(host.updated_at);
    formattedDate = `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}-${date.getDate().toString().padStart(2, '0')} ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;
  }
  
  return {
    id: host.id,
    ip: host.ip,
    reachable: host.reachable,
    updated_at: formattedDate,
    port_data: portData,
    priority_info: {
      priority: host.priority_id ? {
        id: host.priority_id,
        name: host.Priority?.name || "Unknown"
      } : null,
      grouping: host.grouping_id ? {
        id: host.grouping_id,
        name: host.Grouping?.name || null
      } : null
    },
    country_info: host.Country ? {
      id: host.Country.id,
      name: host.Country.name
    } : null,
    has_whois: !!(host.Whois && host.Whois.length > 0)
  };
};

// Быстрый парсинг портов
const parsePortsString = (portString) => {
  if (!portString) return [];
  
  const ports = new Set();
  
  if (Array.isArray(portString)) {
    for (const item of portString) {
      if (typeof item === 'string') {
        const match = item.match(/\d+/);
        if (match) {
          const port = parseInt(match[0], 10);
          if (port >= 1 && port <= 65535) {
            ports.add(port);
          }
        }
      }
    }
  } else if (typeof portString === 'string') {
    const parts = portString.split(',');
    for (const part of parts) {
      const match = part.trim().match(/\d+/);
      if (match) {
        const port = parseInt(match[0], 10);
        if (port >= 1 && port <= 65535) {
          ports.add(port);
        }
      }
    }
  }
  
  return Array.from(ports);
};

// Оптимизированные функции получения ID с кэшированием
const getPriorityIdsFromNames = async (priorityNames) => {
  if (!priorityNames) return [];
  
  const names = Array.isArray(priorityNames) ? priorityNames : [priorityNames];
  const result = [];
  const toFetch = [];
  
  cleanupCache();
  
  for (const name of names) {
    if (cache.priorities.has(name)) {
      result.push(cache.priorities.get(name));
    } else {
      toFetch.push(name);
    }
  }
  
  if (toFetch.length > 0) {
    const priorities = await Priority.findAll({
      attributes: ['id', 'name'],
      where: { name: { [Op.in]: toFetch } },
      raw: true
    });
    
    for (const p of priorities) {
      cache.priorities.set(p.name, p.id);
      result.push(p.id);
    }
  }
  
  return result;
};

const getGroupIdsFromNames = async (groupNames) => {
  if (!groupNames) return [];
  
  const names = Array.isArray(groupNames) ? groupNames : [groupNames];
  const result = [];
  const toFetch = [];
  
  cleanupCache();
  
  for (const name of names) {
    if (cache.groups.has(name)) {
      result.push(cache.groups.get(name));
    } else {
      toFetch.push(name);
    }
  }
  
  if (toFetch.length > 0) {
    const groups = await Grouping.findAll({
      attributes: ['id', 'name'],
      where: { name: { [Op.in]: toFetch } },
      raw: true
    });
    
    for (const g of groups) {
      cache.groups.set(g.name, g.id);
      result.push(g.id);
    }
  }
  
  return result;
};

const getCountryIdsFromNames = async (countryNames) => {
  if (!countryNames) return [];
  
  const names = Array.isArray(countryNames) ? countryNames : [countryNames];
  const result = [];
  const toFetch = [];
  
  cleanupCache();
  
  for (const name of names) {
    if (cache.countries.has(name)) {
      result.push(cache.countries.get(name));
    } else {
      toFetch.push(name);
    }
  }
  
  if (toFetch.length > 0) {
    const countries = await Country.findAll({
      attributes: ['id', 'name'],
      where: { name: { [Op.in]: toFetch } },
      raw: true
    });
    
    for (const c of countries) {
      cache.countries.set(c.name, c.id);
      result.push(c.id);
    }
  }
  
  return result;
};

// Функция для правильного экранирования SQL значений с указанием типов
const escapeSql = (value, type = 'auto') => {
  if (value === null || value === undefined) return 'NULL';
  
  if (Array.isArray(value)) {
    if (value.length === 0) return 'ARRAY[]::integer[]';
    
    // Определяем тип элементов массива
    const firstItem = value[0];
    let pgType = 'integer';
    
    if (typeof firstItem === 'string') {
      // Проверяем, можно ли преобразовать в число
      if (/^\d+$/.test(firstItem)) {
        pgType = 'integer';
      } else {
        pgType = 'text';
      }
    } else if (typeof firstItem === 'number') {
      pgType = Number.isInteger(firstItem) ? 'integer' : 'numeric';
    }
    
    const escapedValues = value.map(v => {
      if (typeof v === 'string' && pgType === 'integer') {
        return v;
      }
      return `'${v.toString().replace(/'/g, "''")}'`;
    }).join(',');
    
    return `ARRAY[${escapedValues}]::${pgType}[]`;
  }
  
  if (value instanceof Date) {
    return `'${value.toISOString()}'::timestamp`;
  }
  
  if (typeof value === 'number') {
    return value.toString();
  }
  
  if (typeof value === 'boolean') {
    return value ? 'TRUE' : 'FALSE';
  }
  
  // Строки
  return `'${value.toString().replace(/'/g, "''")}'`;
};

export const getInfo = async (req, res) => {
  const {
    ip,
    portOpened,
    portFiltered,
    keyword,
    priority,
    group,
    country,
    whois,
    dateRange: { startDate, endDate } = {},
    page = 1,
    limit = 10,
  } = req.body;

  try {
    const startTime = Date.now();
    console.log("Получен запрос поиска:", req.body);

    // Параметры пагинации
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 10));
    const offset = (pageNum - 1) * limitNum;

    // Получаем ID для фильтров параллельно
    const [priorityIds, groupIds, countryIds] = await Promise.all([
      priority ? getPriorityIdsFromNames(priority) : Promise.resolve([]),
      group ? getGroupIdsFromNames(group) : Promise.resolve([]),
      country ? getCountryIdsFromNames(country) : Promise.resolve([])
    ]);

    // Проверяем условия, которые могут привести к пустому результату
    if ((priority && priorityIds.length === 0) ||
        (group && groupIds.length === 0) ||
        (country && countryIds.length === 0)) {
      return res.json({
        items: [],
        total: 0,
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalItems: 0,
          hasNext: false,
          hasPrev: false,
        }
      });
    }

    // Парсим порты
    const openedPorts = parsePortsString(portOpened);
    const filteredPorts = parsePortsString(portFiltered);

    // Строим условия WHERE
    const whereConditions = [];
    
    // 1. Фильтр по IP
    if (ip) {
      whereConditions.push(`CAST(h.ip AS TEXT) ILIKE ${escapeSql(ip + '%')}`);
    }

    // 2. Фильтр по дате
    if (startDate || endDate) {
      const dateConditions = [];
      if (startDate) {
        dateConditions.push(`h.updated_at >= ${escapeSql(new Date(startDate))}`);
      }
      if (endDate) {
        dateConditions.push(`h.updated_at <= ${escapeSql(new Date(endDate))}`);
      }
      if (dateConditions.length > 0) {
        whereConditions.push(`(${dateConditions.join(' AND ')})`);
      }
    }

    // 3. Фильтр по приоритету
    if (priorityIds.length > 0) {
      whereConditions.push(`h.priority_id = ANY(${escapeSql(priorityIds)})`);
    }

    // 4. Фильтр по группировке
    if (groupIds.length > 0) {
      whereConditions.push(`h.grouping_id = ANY(${escapeSql(groupIds)})`);
    }

    // 5. Фильтр по стране
    if (countryIds.length > 0) {
      whereConditions.push(`h.country_id = ANY(${escapeSql(countryIds)})`);
    }

    // 6. Фильтр по WHOIS
    if (whois === 'withWhois') {
      whereConditions.push(`EXISTS (SELECT 1 FROM whois w WHERE w.host_id = h.id)`);
    } else if (whois === 'noWhois') {
      whereConditions.push(`NOT EXISTS (SELECT 1 FROM whois w WHERE w.host_id = h.id)`);
    }

    // 7. Фильтр по ключевым словам
    if (keyword) {
      const keywords = Array.isArray(keyword) ? keyword : [keyword];
      const keywordConditions = [];
      
      for (const kw of keywords) {
        if (kw && typeof kw === 'string') {
          keywordConditions.push(
            `EXISTS (
              SELECT 1 FROM whois w 
              JOIN whois_keys wk ON w.key_id = wk.id
              WHERE w.host_id = h.id 
              AND (LOWER(w.value) LIKE LOWER(${escapeSql('%' + kw + '%')}) 
                OR LOWER(wk.key_name) LIKE LOWER(${escapeSql('%' + kw + '%')}))
            )`
          );
        }
      }
      
      if (keywordConditions.length > 0) {
        whereConditions.push(`(${keywordConditions.join(' OR ')})`);
      }
    }

    // 8. Условия для портов
    const portConditions = [];
    const hasPortConditions = openedPorts.length > 0 || filteredPorts.length > 0;
    
    if (openedPorts.length > 0) {
      portConditions.push(`(p.type = 'open' AND p.port = ANY(${escapeSql(openedPorts)}))`);
    }

    if (filteredPorts.length > 0) {
      portConditions.push(`(p.type = 'filtered' AND p.port = ANY(${escapeSql(filteredPorts)}))`);
    }

    // ГЛАВНЫЙ ОПТИМИЗИРОВАННЫЙ ЗАПРОС
    let mainQuery = '';
    
    if (hasPortConditions) {
      // Если есть фильтры по портам, используем JOIN с портами
      mainQuery = `
        SELECT DISTINCT h.id
        FROM hosts h
        INNER JOIN ports p ON h.id = p.host_id
        ${whereConditions.length > 0 || portConditions.length > 0 ? 'WHERE' : ''}
        ${whereConditions.length > 0 ? whereConditions.join(' AND ') : ''}
        ${whereConditions.length > 0 && portConditions.length > 0 ? ' AND ' : ''}
        ${portConditions.length > 0 ? `(${portConditions.join(' OR ')})` : ''}
      `;
    } else {
      // Если нет фильтров по портам, не делаем JOIN с ports
      mainQuery = `
        SELECT h.id
        FROM hosts h
        ${whereConditions.length > 0 ? 'WHERE' : ''}
        ${whereConditions.length > 0 ? whereConditions.join(' AND ') : ''}
      `;
    }

    // ЗАПРОС ДЛЯ ПАГИНАЦИИ И КОЛИЧЕСТВА
    const paginationQuery = `
      WITH filtered_ids AS (
        ${mainQuery}
      ),
      paginated_ids AS (
        SELECT 
          fi.id,
          ROW_NUMBER() OVER (ORDER BY 
            COALESCE((SELECT priority_id FROM hosts WHERE id = fi.id), 0) DESC,
            (SELECT updated_at FROM hosts WHERE id = fi.id) DESC
          ) as row_num,
          COUNT(*) OVER() as total_count
        FROM filtered_ids fi
      )
      SELECT id, total_count
      FROM paginated_ids
      WHERE row_num > ${offset} AND row_num <= ${offset + limitNum}
      ORDER BY row_num
    `;

    // Выполняем запрос пагинации
    const hostResults = await sequelize.query(paginationQuery, {
      type: sequelize.QueryTypes.SELECT,
      logging: false
    });

    if (hostResults.length === 0) {
      return res.json({
        items: [],
        total: 0,
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalItems: 0,
          hasNext: false,
          hasPrev: false,
        }
      });
    }

    const totalCount = parseInt(hostResults[0].total_count, 10);
    const hostIds = hostResults.map(row => row.id);

    // ЗАПРОС ДЛЯ ПОЛУЧЕНИЯ ДЕТАЛЬНЫХ ДАННЫХ
    const detailsQuery = `
      SELECT 
        h.id, h.ip, h.reachable, h.updated_at,
        h.priority_id, h.grouping_id, h.country_id,
        pr.name as priority_name,
        gr.name as grouping_name,
        c.name as country_name,
        jsonb_agg(
          DISTINCT jsonb_build_object(
            'port', p.port,
            'type', p.type,
            'WellKnownPort', 
              CASE WHEN wkp.name IS NOT NULL 
              THEN jsonb_build_object('name', wkp.name) 
              ELSE NULL END
          )
        ) FILTER (WHERE p.port IS NOT NULL) as ports,
        CASE 
          WHEN EXISTS (SELECT 1 FROM whois w2 WHERE w2.host_id = h.id) 
          THEN jsonb_agg(DISTINCT jsonb_build_object('value', w.value))
          ELSE '[]'::jsonb 
        END as whois_data
      FROM hosts h
      LEFT JOIN host_priorities pr ON h.priority_id = pr.id
      LEFT JOIN host_groupings gr ON h.grouping_id = gr.id
      LEFT JOIN countries c ON h.country_id = c.id
      LEFT JOIN ports p ON h.id = p.host_id
      LEFT JOIN well_known_ports wkp ON p.port = wkp.port
      LEFT JOIN whois w ON h.id = w.host_id
      WHERE h.id = ANY(${escapeSql(hostIds)})
      GROUP BY h.id, h.ip, h.reachable, h.updated_at,
               h.priority_id, h.grouping_id, h.country_id,
               pr.name, gr.name, c.name
      ORDER BY 
        COALESCE(h.priority_id, 0) DESC,
        h.updated_at DESC
    `;

    const hostsData = await sequelize.query(detailsQuery, {
      type: sequelize.QueryTypes.SELECT,
      logging: false
    });

    // Быстрая обработка результатов
    const items = [];
    for (const row of hostsData) {
      const host = {
        id: row.id,
        ip: row.ip,
        reachable: row.reachable,
        updated_at: row.updated_at,
        priority_id: row.priority_id,
        grouping_id: row.grouping_id,
        country_id: row.country_id,
        Priority: row.priority_name ? { name: row.priority_name } : null,
        Grouping: row.grouping_name ? { name: row.grouping_name } : null,
        Country: row.country_name ? { id: row.country_id, name: row.country_name } : null,
        Ports: row.ports || [],
        Whois: row.whois_data || []
      };
      
      items.push(formatHostData(host));
    }

    const totalPages = Math.ceil(totalCount / limitNum);
    const endTime = Date.now();
    
    console.log(`Поиск выполнен за ${endTime - startTime}ms. Найдено: ${totalCount} записей`);

    return res.json({
      items,
      total: totalCount,
      pagination: {
        currentPage: pageNum,
        totalPages,
        totalItems: totalCount,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      search_params: req.body
    });

  } catch (error) {
    console.error("Ошибка в getInfo:", error);
    console.error("SQL ошибка:", error.sql);
    return res.status(500).json({ 
      error: "Внутренняя ошибка сервера",
      details: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// // РАБОЧИЙ КОД с пагинацией
// // controllers/search.controller.js
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

//   if (host.Ports && Array.isArray(host.Ports)) {
//     host.Ports.forEach((port) => {
//       const portInfo = {
//         port: port.port,
//         name: port.WellKnownPort?.name || null,
//       };

//       if (port.type === "open" && !openPortsSet.has(port.port)) {
//         openPorts.push(portInfo);
//         openPortsSet.add(port.port);
//       } else if (port.type === "filtered" && !filteredPortsSet.has(port.port)) {
//         filteredPorts.push(portInfo);
//         filteredPortsSet.add(port.port);
//       }
//     });
//   }

//   const hasWhois = host.Whois && Array.isArray(host.Whois) && host.Whois.length > 0;

//   const priorityInfo = {
//     priority: null,
//     grouping: null,
//   };

//   if (host.priority_id || host.Priority) {
//     priorityInfo.priority = {
//       id: host.priority_id,
//       name: host.Priority?.name || "Unknown",
//     };
//   }

//   if (host.grouping_id || host.Grouping) {
//     priorityInfo.grouping = {
//       id: host.grouping_id,
//       name: host.Grouping?.name || null,
//     };
//   }

//   // Добавляем информацию о стране
//   const countryInfo = host.Country ? {
//     id: host.Country.id,
//     name: host.Country.name,
//   } : null;

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

// // Вспомогательная функция для парсинга портов из строки
// const parsePortsFromString = (portString) => {
//   if (!portString) return [];
  
//   // Проверяем, является ли portString массивом
//   const values = Array.isArray(portString) ? portString : [portString];
//   const ports = [];
  
//   values.forEach(value => {
//     if (typeof value === 'string') {
//       // Обрабатываем формат "21 (ftp)" или просто "21"
//       const portMatch = value.match(/(\d+)/);
//       if (portMatch) {
//         const portNumber = parseInt(portMatch[1]);
//         if (portNumber >= 1 && portNumber <= 65535) {
//           ports.push(portNumber);
//         }
//       }
//     }
//   });
  
//   return [...new Set(ports)]; // Убираем дубликаты
// };

// // Функция для получения ID приоритетов по названиям
// const getPriorityIdsFromNames = async (priorityNames) => {
//   if (!priorityNames) return [];
  
//   const names = Array.isArray(priorityNames) ? priorityNames : [priorityNames];
//   const priorities = await Priority.findAll({
//     attributes: ['id'],
//     where: {
//       name: { [Op.in]: names }
//     },
//     raw: true
//   });
  
//   return priorities.map(p => p.id);
// };

// // Функция для получения ID групп по названиям
// const getGroupIdsFromNames = async (groupNames) => {
//   if (!groupNames) return [];
  
//   const names = Array.isArray(groupNames) ? groupNames : [groupNames];
//   const groups = await Grouping.findAll({
//     attributes: ['id'],
//     where: {
//       name: { [Op.in]: names }
//     },
//     raw: true
//   });
  
//   return groups.map(g => g.id);
// };

// // Функция для получения ID стран по названиям
// const getCountryIdsFromNames = async (countryNames) => {
//   if (!countryNames) return [];
  
//   const names = Array.isArray(countryNames) ? countryNames : [countryNames];
//   const countries = await Country.findAll({
//     attributes: ['id'],
//     where: {
//       name: { [Op.in]: names }
//     },
//     raw: true
//   });
  
//   return countries.map(c => c.id);
// };

// // Функция для извлечения значений из MultiSelectDataList
// const extractValues = (input) => {
//   if (!input) return [];
//   if (Array.isArray(input)) return input;
//   if (typeof input === 'string') return [input];
//   return [];
// };

// // Функция для парсинга строки портов с запятыми
// const parsePortsString = (portString) => {
//   if (!portString) return [];
//   if (Array.isArray(portString)) {
//     return parsePortsFromString(portString);
//   }
  
//   // Разделяем строку по запятым
//   const portStrings = portString.split(',').map(s => s.trim());
//   const ports = [];
  
//   portStrings.forEach(str => {
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

// export const getInfo = async (req, res) => {
//   const {
//     ip,
//     portOpened,
//     portFiltered,
//     keyword,
//     priority,
//     group,
//     country,
//     whois,
//     dateRange: { startDate, endDate } = {},
//     page = 1,
//     limit = 10,
//   } = req.body;

//   try {
//     console.log("Получен запрос поиска:", req.body);

//     // Параметры пагинации
//     const pageNum = Math.max(1, parseInt(page) || 1);
//     const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
//     const offset = (pageNum - 1) * limitNum;

//     let hostIds = new Set();

//     // 1. Фильтр по IP
//     if (ip) {
//       console.log("Фильтр по IP:", ip);
      
//       // Используем raw query для корректной работы с типом INET
//       const ipQuery = `
//         SELECT id FROM hosts 
//         WHERE CAST(ip AS TEXT) ILIKE :ipPattern
//       `;
      
//       const ipHosts = await sequelize.query(ipQuery, {
//         replacements: { 
//           ipPattern: `${ip}%`
//         },
//         type: sequelize.QueryTypes.SELECT,
//         raw: true
//       });
      
//       if (ipHosts.length === 0) {
//         return res.json({ 
//           items: [], 
//           total: 0,
//           pagination: {
//             currentPage: pageNum,
//             totalPages: 0,
//             totalItems: 0,
//             hasNext: false,
//             hasPrev: false,
//           }
//         });
//       }
      
//       ipHosts.forEach(host => hostIds.add(host.id));
//       console.log(`После фильтра по IP: ${hostIds.size} хостов`);
//     }

//     // 2. Фильтр по дате
//     if (startDate || endDate) {
//       console.log("Фильтр по дате:", { startDate, endDate });
//       const dateWhere = {};
//       if (startDate) dateWhere[Op.gte] = new Date(startDate);
//       if (endDate) dateWhere[Op.lte] = new Date(endDate);
      
//       const dateHosts = await Host.findAll({
//         attributes: ['id'],
//         where: hostIds.size > 0 ? { 
//           id: Array.from(hostIds),
//           updated_at: dateWhere 
//         } : { updated_at: dateWhere },
//         raw: true
//       });
      
//       if (dateHosts.length === 0) {
//         return res.json({ 
//           items: [], 
//           total: 0,
//           pagination: {
//             currentPage: pageNum,
//             totalPages: 0,
//             totalItems: 0,
//             hasNext: false,
//             hasPrev: false,
//           }
//         });
//       }
      
//       const dateHostIds = new Set(dateHosts.map(h => h.id));
//       hostIds = hostIds.size > 0 
//         ? new Set(Array.from(hostIds).filter(id => dateHostIds.has(id)))
//         : dateHostIds;
//       console.log(`После фильтра по дате: ${hostIds.size} хостов`);
//     }

//     // 3. Фильтр по приоритету
//     if (priority) {
//       console.log("Фильтр по приоритету:", priority);
//       const priorityIds = await getPriorityIdsFromNames(priority);
      
//       if (priorityIds.length > 0) {
//         const priorityHosts = await Host.findAll({
//           attributes: ['id'],
//           where: hostIds.size > 0 ? { 
//             id: Array.from(hostIds),
//             priority_id: priorityIds
//           } : { 
//             priority_id: priorityIds
//           },
//           raw: true
//         });
        
//         if (priorityHosts.length === 0) {
//           return res.json({ 
//             items: [], 
//             total: 0,
//             pagination: {
//               currentPage: pageNum,
//               totalPages: 0,
//               totalItems: 0,
//               hasNext: false,
//               hasPrev: false,
//             }
//           });
//         }
        
//         const priorityHostIds = new Set(priorityHosts.map(h => h.id));
//         hostIds = hostIds.size > 0 
//           ? new Set(Array.from(hostIds).filter(id => priorityHostIds.has(id)))
//           : priorityHostIds;
//       }
//       console.log(`После фильтра по приоритету: ${hostIds.size} хостов`);
//     }

//     // 4. Фильтр по группировке
//     if (group) {
//       console.log("Фильтр по группировке:", group);
//       const groupIds = await getGroupIdsFromNames(group);
      
//       if (groupIds.length > 0) {
//         const groupHosts = await Host.findAll({
//           attributes: ['id'],
//           where: hostIds.size > 0 ? { 
//             id: Array.from(hostIds),
//             grouping_id: groupIds
//           } : { 
//             grouping_id: groupIds
//           },
//           raw: true
//         });
        
//         if (groupHosts.length === 0) {
//           return res.json({ 
//             items: [], 
//             total: 0,
//             pagination: {
//               currentPage: pageNum,
//               totalPages: 0,
//               totalItems: 0,
//               hasNext: false,
//               hasPrev: false,
//             }
//           });
//         }
        
//         const groupHostIds = new Set(groupHosts.map(h => h.id));
//         hostIds = hostIds.size > 0 
//           ? new Set(Array.from(hostIds).filter(id => groupHostIds.has(id)))
//           : groupHostIds;
//       }
//       console.log(`После фильтра по группировке: ${hostIds.size} хостов`);
//     }

//     // 5. Фильтр по стране
//     if (country) {
//       console.log("Фильтр по стране:", country);
//       const countryIds = await getCountryIdsFromNames(country);
      
//       if (countryIds.length > 0) {
//         const countryHosts = await Host.findAll({
//           attributes: ['id'],
//           where: hostIds.size > 0 ? { 
//             id: Array.from(hostIds),
//             country_id: countryIds
//           } : { 
//             country_id: countryIds
//           },
//           raw: true
//         });
        
//         if (countryHosts.length === 0) {
//           return res.json({ 
//             items: [], 
//             total: 0,
//             pagination: {
//               currentPage: pageNum,
//               totalPages: 0,
//               totalItems: 0,
//               hasNext: false,
//               hasPrev: false,
//             }
//           });
//         }
        
//         const countryHostIds = new Set(countryHosts.map(h => h.id));
//         hostIds = hostIds.size > 0 
//           ? new Set(Array.from(hostIds).filter(id => countryHostIds.has(id)))
//           : countryHostIds;
//       }
//       console.log(`После фильтра по стране: ${hostIds.size} хостов`);
//     }

//     // 6. Фильтр по наличию WHOIS данных
//     if (whois !== 'all') {
//       console.log("Фильтр по наличию WHOIS:", whois);
      
//       if (whois==='withWhois') {
//         // Только с WHOIS
//         const whoisHosts = await Host.findAll({
//           attributes: ['id'],
//           include: [{
//             model: Whois,
//             attributes: [],
//             required: true
//           }],
//           where: hostIds.size > 0 ? { id: Array.from(hostIds) } : {},
//           raw: true
//         });
        
//         if (whoisHosts.length === 0) {
//           return res.json({ 
//             items: [], 
//             total: 0,
//             pagination: {
//               currentPage: pageNum,
//               totalPages: 0,
//               totalItems: 0,
//               hasNext: false,
//               hasPrev: false,
//             }
//           });
//         }
        
//         const whoisHostIds = new Set(whoisHosts.map(h => h.id));
//         hostIds = hostIds.size > 0 
//           ? new Set(Array.from(hostIds).filter(id => whoisHostIds.has(id)))
//           : whoisHostIds;
//       }  else if (whois==='noWhois') {
//         // Только без WHOIS
//         const noWhoisHosts = await Host.findAll({
//           attributes: ['id'],
//           include: [{
//             model: Whois,
//             attributes: [],
//             required: false
//           }],
//           where: hostIds.size > 0 ? { 
//             id: Array.from(hostIds),
//             '$Whois.id$': null
//           } : { 
//             '$Whois.id$': null
//           },
//           raw: true
//         });
        
//         if (noWhoisHosts.length === 0) {
//           return res.json({ 
//             items: [], 
//             total: 0,
//             pagination: {
//               currentPage: pageNum,
//               totalPages: 0,
//               totalItems: 0,
//               hasNext: false,
//               hasPrev: false,
//             }
//           });
//         }
        
//         const noWhoisHostIds = new Set(noWhoisHosts.map(h => h.id));
//         hostIds = hostIds.size > 0 
//           ? new Set(Array.from(hostIds).filter(id => noWhoisHostIds.has(id)))
//           : noWhoisHostIds;
//       }
//       console.log(`После фильтра по WHOIS: ${hostIds.size} хостов`);
//     }

//     // 7. Фильтр по ключевым словам
//     if (keyword) {
//       console.log("Фильтр по ключевым словам:", keyword);
      
//       const keywords = extractValues(keyword);
      
//       if (keywords.length > 0) {
//         // Для каждого ключевого слова ищем совпадения
//         const keywordPromises = keywords.map(kw => {
//           const keywordSql = `
//             SELECT DISTINCT h.id
//             FROM hosts h
//             INNER JOIN whois w ON h.id = w.host_id
//             INNER JOIN whois_keys wk ON w.key_id = wk.id
//             WHERE (LOWER(w.value) LIKE LOWER(:keyword) 
//                OR LOWER(wk.key_name) LIKE LOWER(:keyword))
//                ${hostIds.size > 0 ? 'AND h.id IN (:hostIds)' : ''}
//           `;
          
//           return sequelize.query(keywordSql, {
//             replacements: { 
//               keyword: `%${kw}%`,
//               hostIds: hostIds.size > 0 ? Array.from(hostIds) : []
//             },
//             type: sequelize.QueryTypes.SELECT,
//           });
//         });
        
//         const keywordResults = await Promise.all(keywordPromises);
//         const keywordHostIds = new Set();
        
//         keywordResults.forEach(result => {
//           result.forEach(row => keywordHostIds.add(row.id));
//         });
        
//         if (keywordHostIds.size === 0) {
//           return res.json({ 
//             items: [], 
//             total: 0,
//             pagination: {
//               currentPage: pageNum,
//               totalPages: 0,
//               totalItems: 0,
//               hasNext: false,
//               hasPrev: false,
//             }
//           });
//         }
        
//         hostIds = hostIds.size > 0 
//           ? new Set(Array.from(hostIds).filter(id => keywordHostIds.has(id)))
//           : keywordHostIds;
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
//           type: 'open'
//         });
//       }
      
//       if (filteredPorts.length > 0) {
//         portWhereConditions.push({
//           port: filteredPorts,
//           type: 'filtered'
//         });
//       }
      
//       if (portWhereConditions.length > 0) {
//         const portHosts = await Port.findAll({
//           attributes: ['host_id'],
//           where: {
//             [Op.or]: portWhereConditions,
//             ...(hostIds.size > 0 && { host_id: Array.from(hostIds) })
//           },
//           raw: true
//         });
        
//         if (portHosts.length === 0) {
//           return res.json({ 
//             items: [], 
//             total: 0,
//             pagination: {
//               currentPage: pageNum,
//               totalPages: 0,
//               totalItems: 0,
//               hasNext: false,
//               hasPrev: false,
//             }
//           });
//         }
        
//         const portHostIds = new Set(portHosts.map(p => p.host_id));
//         hostIds = hostIds.size > 0 
//           ? new Set(Array.from(hostIds).filter(id => portHostIds.has(id)))
//           : portHostIds;
//         console.log(`После фильтра по портам: ${hostIds.size} хостов`);
//       }
//     }

//     // ФИНАЛЬНЫЙ ЗАПРОС - получаем полные данные для найденных хостов с пагинацией
//     const finalHostIds = Array.from(hostIds);
    
//     if (finalHostIds.length === 0) {
//       return res.json({ 
//         items: [], 
//         total: 0,
//         pagination: {
//           currentPage: pageNum,
//           totalPages: 0,
//           totalItems: 0,
//           hasNext: false,
//           hasPrev: false,
//         }
//       });
//     }

//     console.log(`Финальный отбор: ${finalHostIds.length} хостов`);

//     // Получаем общее количество для пагинации
//     const totalCount = finalHostIds.length;
//     const totalPages = Math.ceil(totalCount / limitNum);

//     // Получаем данные с пагинацией
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
//       where: { id: finalHostIds },
//       order: [["priority_id", "DESC"], ["updated_at", "DESC"]],
//       limit: limitNum,
//       offset: offset,
//     });

//     const items = hosts.map(formatHostData);

//     return res.json({
//       items: items,
//       total: totalCount,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalItems: totalCount,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },
//       search_params: req.body
//     });

//   } catch (error) {
//     console.error("Ошибка в getInfo:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };
