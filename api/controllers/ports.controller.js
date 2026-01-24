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

// Хранилище для последних параметров фильтрации по сессиям/запросам
const filterCache = new Map();

// Очистка старых записей из кэша
const cleanupCache = () => {
  const now = Date.now();
  const oneHour = 60 * 60 * 1000;
  
  for (const [key, value] of filterCache.entries()) {
    if (now - value.lastUsed > oneHour) {
      filterCache.delete(key);
    }
  }
};

// Генерация ключа для кэша
const getCacheKey = (req) => req.ip || 'unknown';

// Получение фильтров с кэшированием
const getFilters = (req, portOpened, portFiltered) => {
  const cacheKey = getCacheKey(req);
  const cachedFilters = filterCache.get(cacheKey);
  
  // Очищаем старый кэш
  cleanupCache();
  
  const hasExplicitFilters = portOpened !== undefined || portFiltered !== undefined;
  
  let useOpened, useFiltered;
  
  if (hasExplicitFilters) {
    useOpened = portOpened === 'true';
    useFiltered = portFiltered === 'true';
    
    // Сохраняем в кэш
    filterCache.set(cacheKey, {
      portOpened: useOpened,
      portFiltered: useFiltered,
      timestamp: Date.now(),
      lastUsed: Date.now()
    });
  } else if (cachedFilters) {
    useOpened = cachedFilters.portOpened;
    useFiltered = cachedFilters.portFiltered;
    cachedFilters.lastUsed = Date.now();
  } else {
    useOpened = false;
    useFiltered = false;
  }
  
  return {
    useOpened,
    useFiltered,
    hasExplicitFilters,
    cachedFilters: cachedFilters !== undefined
  };
};

// Быстрая функция извлечения портов из JSON
const extractPortsFromJson = (portsJson) => {
  const result = { open: [], filtered: [] };
  
  if (!portsJson) return result;
  
  try {
    const ports = typeof portsJson === 'string' ? JSON.parse(portsJson) : portsJson;
    
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

// Формирование условий фильтрации портов
const buildPortTypeCondition = (useOpened, useFiltered, alias = 'p') => {
  if (!useOpened && !useFiltered) return '';
  
  const conditions = [];
  if (useOpened) conditions.push(`${alias}.type = 'open'`);
  if (useFiltered) conditions.push(`${alias}.type = 'filtered'`);
  
  if (conditions.length === 0) return '';
  
  return conditions.length === 1 
    ? conditions[0] 
    : `(${conditions.join(' OR ')})`;
};

// Форматирование данных хоста
const formatHostData = (host) => ({
  id: host.id,
  ip: host.ip,
  reachable: host.reachable,
  updated_at: host.updated_at,
  port_data: extractPortsFromJson(host.ports_json),
  priority_info: {
    priority: host.priority_id ? {
      id: host.priority_id,
      name: host.priority_name || "Unknown",
    } : null,
    grouping: host.grouping_id ? {
      id: host.grouping_id,
      name: host.grouping_name || null,
    } : null,
  },
  has_whois: host.has_whois,
});

// Основная функция группировки портов
export const groupPort = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      port: portQuery,
      portOpened,
      portFiltered 
    } = req.query;
    
    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));
    const offset = (pageNum - 1) * pageSize;

    // Получаем фильтры
    const filters = getFilters(req, portOpened, portFiltered);
    const portTypeCondition = buildPortTypeCondition(filters.useOpened, filters.useFiltered);

    // Проверяем фильтр по порту
    let targetPort = null;
    if (portQuery !== undefined && portQuery !== "") {
      const processedQuery = portQuery.trim();
      const portMatch = processedQuery.match(/^(\d+)/);
      
      if (!portMatch || !/^\d+$/.test(portMatch[1])) {
        return res.status(400).json({
          error: "Для группировки портов необходим числовой порт",
        });
      }

      targetPort = Number(portMatch[1]);
      if (targetPort < 1 || targetPort > 65535) {
        return res.status(400).json({ 
          error: "Порт должен быть числом от 1 до 65535" 
        });
      }
    }

    // Получаем уникальные порты
    let uniquePortsQuery = `
      SELECT 
        p.port as value,
        wkp.name as name,
        COUNT(DISTINCT h.id) as host_count
      FROM ports p
      INNER JOIN hosts h ON p.host_id = h.id
      LEFT JOIN well_known_ports wkp ON p.port = wkp.port
    `;
    
    // Формируем условия WHERE
    const whereConditions = [];
    
    if (targetPort) {
      whereConditions.push(`p.port = ${targetPort}`);
    }
    
    if (portTypeCondition) {
      whereConditions.push(portTypeCondition);
    }
    
    if (whereConditions.length > 0) {
      uniquePortsQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    uniquePortsQuery += `
      GROUP BY p.port, wkp.name
      ORDER BY p.port ASC
    `;

    const uniquePorts = await sequelize.query(uniquePortsQuery, { 
      type: sequelize.QueryTypes.SELECT 
    });

    if (uniquePorts.length === 0) {
      return res.json({
        message: "Нет данных",
        items: [],
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalItems: 0,
          hasNext: false,
          hasPrev: false,
        },
        filter_params: {
          portOpened: filters.useOpened,
          portFiltered: filters.useFiltered,
          port: targetPort || undefined,
          using_cached: !filters.hasExplicitFilters && filters.cachedFilters
        }
      });
    }

    // Получаем хосты для первого порта
    const firstPort = uniquePorts[0];
    const portNumber = firstPort.value;

    // Получаем общее количество хостов для этого порта
    const countQuery = `
      SELECT COUNT(DISTINCT h.id) as total
      FROM ports p
      INNER JOIN hosts h ON p.host_id = h.id
      WHERE p.port = ${portNumber}
      ${portTypeCondition ? `AND ${portTypeCondition}` : ''}
    `;

    const totalCountResult = await sequelize.query(countQuery, { 
      type: sequelize.QueryTypes.SELECT 
    });
    const totalHosts = parseInt(totalCountResult[0]?.total || 0);
    const totalPages = Math.ceil(totalHosts / pageSize);

    if (totalHosts === 0 || offset >= totalHosts) {
      return res.json({
        items: [],
        pagination: {
          currentPage: pageNum,
          totalPages: totalPages,
          totalItems: totalHosts,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
        filter_params: {
          portOpened: filters.useOpened,
          portFiltered: filters.useFiltered,
          port: targetPort || undefined,
          using_cached: !filters.hasExplicitFilters && filters.cachedFilters
        }
      });
    }

    // Формируем условие для порта с учетом типа
    let portFilterCondition = portTypeCondition ? `AND ${portTypeCondition}` : '';
    
    // Получаем хосты с пагинацией
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
        WHERE EXISTS (
          SELECT 1 FROM ports p 
          WHERE p.host_id = h.id 
          AND p.port = ${portNumber}
          ${portFilterCondition}
        )
      ),
      paginated_hosts AS (
        SELECT id FROM sorted_hosts
        WHERE rn > ${offset} AND rn <= ${offset + pageSize}
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
          hp.name as priority_name,
          hg.name as grouping_name,
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
          EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
        FROM hosts h
        INNER JOIN paginated_hosts ph ON h.id = ph.id
        LEFT JOIN host_priorities hp ON h.priority_id = hp.id
        LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
      )
      SELECT * FROM host_details
      ORDER BY (
        SELECT rn FROM sorted_hosts sh WHERE sh.id = host_details.id
      )
    `;

    const hosts = await sequelize.query(hostsQuery, { 
      type: sequelize.QueryTypes.SELECT 
    });

    // Форматируем результат
    const formattedHosts = hosts.map(formatHostData);

    return res.json({
      items: formattedHosts,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: totalHosts,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      type: "group",
      field: "port",
      tabs: uniquePorts,
      filter_params: {
        portOpened: filters.useOpened,
        portFiltered: filters.useFiltered,
        port: targetPort || undefined,
        using_cached: !filters.hasExplicitFilters && filters.cachedFilters,
        explicit_filters: filters.hasExplicitFilters
      }
    });

  } catch (error) {
    console.error("Ошибка в groupPort:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// Функция получения информации о порте
export const getPortInfo = async (req, res) => {
  try {
    const {
      port: portQuery,
      page = 1,
      limit = 10,
      portOpened,
      portFiltered,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    if (portQuery === undefined) {
      return res.status(400).json({ error: "Параметр 'port' обязателен" });
    }

    // Обработка запроса порта
    let targetPortNumber = null;
    let processedQuery = portQuery.trim();
    const portMatch = processedQuery.match(/^(\d+)/);
    
    if (portMatch && /^\d+$/.test(portMatch[1])) {
      const portNum = Number(portMatch[1]);
      if (portNum < 1 || portNum > 65535) {
        return res.status(400).json({ 
          error: "Порт должен быть числом от 1 до 65535" 
        });
      }
      targetPortNumber = portNum;
    } else {
      const knownPort = await WellKnownPort.findOne({
        where: {
          name: { [Op.iLike]: processedQuery },
        },
        raw: true,
      });

      if (!knownPort) {
        return res.json({
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
      targetPortNumber = knownPort.port;
    }

    // Получаем фильтры
    const filters = getFilters(req, portOpened, portFiltered);
    const portTypeCondition = buildPortTypeCondition(filters.useOpened, filters.useFiltered);

    // Специальный случай: хосты без портов
    if (!filters.useOpened && !filters.useFiltered) {
      const [hostsNotInPorts, totalCount] = await Promise.all([
        sequelize.query(`
          WITH sorted_hosts AS (
            SELECT 
              h.id,
              h.ip,
              h.reachable,
              TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
              h.priority_id,
              h.grouping_id,
              hp.name as priority_name,
              hg.name as grouping_name,
              '[]'::json as ports_json,
              EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois,
              ROW_NUMBER() OVER (
                ORDER BY 
                  CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
                  h.priority_id DESC NULLS LAST,
                  h.updated_at DESC
              ) as rn
            FROM hosts h
            LEFT JOIN host_priorities hp ON h.priority_id = hp.id
            LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
            WHERE NOT EXISTS (
              SELECT 1 FROM ports p WHERE p.host_id = h.id
            )
          )
          SELECT * FROM sorted_hosts
          WHERE rn > ${offset} AND rn <= ${offset + limitNum}
          ORDER BY rn
        `, { type: sequelize.QueryTypes.SELECT }),
        sequelize.query(`
          SELECT COUNT(*) as total
          FROM hosts h
          WHERE NOT EXISTS (
            SELECT 1 FROM ports p WHERE p.host_id = h.id
          )
        `, { type: sequelize.QueryTypes.SELECT }),
      ]);

      const totalItems = parseInt(totalCount[0]?.total || 0);
      const totalPages = Math.ceil(totalItems / limitNum);

      const items = hostsNotInPorts.map(formatHostData);

      return res.json({
        items: items,
        pagination: {
          currentPage: pageNum,
          totalPages: totalPages,
          totalItems: totalItems,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
        type: "search",
        field: "port",
        port_info: {
          port: null,
          name: null,
        },
      });
    }

    // Формируем условие для типа порта
    const portTypeFilter = portTypeCondition ? `AND ${portTypeCondition}` : '';

    // Основной поиск по порту
    const searchQuery = `
      WITH sorted_port_hosts AS (
        SELECT 
          p.host_id,
          ROW_NUMBER() OVER (
            ORDER BY 
              CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
              h.priority_id DESC NULLS LAST,
              h.updated_at DESC
          ) as rn
        FROM ports p
        INNER JOIN hosts h ON p.host_id = h.id
        WHERE p.port = ${targetPortNumber}
        ${portTypeFilter}
      ),
      paginated_hosts AS (
        SELECT host_id FROM sorted_port_hosts
        WHERE rn > ${offset} AND rn <= ${offset + limitNum}
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
          hp.name as priority_name,
          hg.name as grouping_name,
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
          sph.rn as order_idx
        FROM hosts h
        INNER JOIN paginated_hosts ph ON h.id = ph.host_id
        INNER JOIN sorted_port_hosts sph ON h.id = sph.host_id
        LEFT JOIN host_priorities hp ON h.priority_id = hp.id
        LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
      ),
      total_count AS (
        SELECT COUNT(DISTINCT p.host_id) as total
        FROM ports p
        WHERE p.port = ${targetPortNumber}
        ${portTypeFilter}
      )
      SELECT 
        hd.*,
        tc.total
      FROM host_details hd
      CROSS JOIN total_count tc
      ORDER BY hd.order_idx
    `;

    const results = await sequelize.query(searchQuery, { 
      type: sequelize.QueryTypes.SELECT 
    });

    if (results.length === 0) {
      return res.json({
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

    const totalItems = parseInt(results[0].total || 0);
    const totalPages = Math.ceil(totalItems / limitNum);
    
    // Фильтруем по конкретному порту
    const items = results
      .map(formatHostData)
      .filter(host => {
        const hasOpenPort = host.port_data.open.some(p => p.port === targetPortNumber);
        const hasFilteredPort = host.port_data.filtered.some(p => p.port === targetPortNumber);
        
        if (filters.useOpened && !filters.useFiltered) {
          return hasOpenPort;
        } else if (!filters.useOpened && filters.useFiltered) {
          return hasFilteredPort;
        }
        
        return hasOpenPort || hasFilteredPort;
      });

    if (items.length === 0) {
      return res.json({
        message: "Нет данных соответствующих поиску",
        items: [],
        pagination: {
          currentPage: pageNum,
          totalPages: totalPages,
          totalItems: totalItems,
          hasNext: false,
          hasPrev: false,
        },
      });
    }

    const portName = await WellKnownPort.findOne({
      where: { port: targetPortNumber },
      attributes: ["name"],
      raw: true,
    });

    return res.json({
      items: items,
      pagination: {
        currentPage: pageNum,
        totalPages: totalPages,
        totalItems: totalItems,
        hasNext: pageNum < totalPages,
        hasPrev: pageNum > 1,
      },
      type: "search",
      field: "port",
      port_info: {
        port: targetPortNumber,
        name: portName?.name || null,
      },
    });
  } catch (error) {
    console.error("Ошибка в getPortInfo:", error);
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
// } from "../models/index.js";

// // Хранилище для последних параметров фильтрации по сессиям/запросам
// const filterCache = new Map();

// // Генерация ключа для кэша на основе IP
// const getCacheKey = (req) => {
//   const ip = req.ip || 'unknown';
//   return `${ip}`; // Только IP, без порта
// };

// // Ультра-оптимизированная функция groupPort для больших объемов данных с сортировкой по приоритету
// export const groupPort = async (req, res) => {
//   try {
//     const { 
//       page = 1, 
//       limit = 10, 
//       port: portQuery,
//       portOpened: portOpened,
//       portFiltered: portFiltered 
//     } = req.query;
    
//     const pageNum = Math.max(1, parseInt(page, 10));
//     const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));

//     // Проверяем, есть ли фильтр по порту
//     let portFilter = null;
//     let portFilterCondition = '';
//     let portTypeCondition = '';
    
//     // Получаем последние параметры фильтрации из кэша
//     const cacheKey = getCacheKey(req);
//     const cachedFilters = filterCache.get(cacheKey);
    
//     // Определяем, использовать ли новые параметры или сохраненные
//     let useOpened, useFiltered;
    
//     // Если в запросе явно указаны параметры o или f, используем их и обновляем кэш
//     const hasExplicitFilters = portOpened !== undefined || portFiltered !== undefined;
    
//     if (hasExplicitFilters) {
//       useOpened = portOpened === 'true';
//       useFiltered = portFiltered === 'true';
      
//       // Сохраняем новые параметры в кэш
//       filterCache.set(cacheKey, {
//         portOpened: useOpened,
//         portFiltered: useFiltered,
//         timestamp: Date.now(),
//         lastUsed: Date.now()
//       });
      
//     } else if (cachedFilters) {
//       // Используем сохраненные параметры
//       useOpened = cachedFilters.o;
//       useFiltered = cachedFilters.f;
//       // Обновляем время последнего использования
//       cachedFilters.lastUsed = Date.now();
//       console.log(`Используем сохраненные параметры для ${cacheKey}: o=${useOpened}, f=${useFiltered}`);
//     } else {
//       // По умолчанию, если нет сохраненных параметров и не указаны в запросе
//       useOpened = false;
//       useFiltered = false;
//       console.log(`Используем параметры по умолчанию для ${cacheKey}: o=${useOpened}, f=${useFiltered}`);
//     }

//     if (portQuery !== undefined && portQuery !== "") {
//       let processedQuery = portQuery.trim();
//       const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);
//       if (portWithNameMatch) {
//         processedQuery = portWithNameMatch[1];
//       }

//       const isNumeric = /^\d+$/.test(processedQuery);
//       if (!isNumeric) {
//         return res.status(400).json({
//           error: "Для группировки портов необходим числовой порт",
//         });
//       }

//       portFilter = Number(processedQuery);
//       if (portFilter < 1 || portFilter > 65535) {
//         return res
//           .status(400)
//           .json({ error: "Порт должен быть числом от 1 до 65535" });
//       }
      
//       portFilterCondition = `WHERE p.port = ${portFilter}`;
//     }
    
//     // Очищаем старые записи из кэша (старше 1 часа с последнего использования)
//     const now = Date.now();
//     const oneHour = 60 * 60 * 1000;
//     for (const [key, value] of filterCache.entries()) {
//       if (now - value.lastUsed > oneHour) {
//         filterCache.delete(key);
//         console.log(`Удален устаревший кэш для ${key}`);
//       }
//     }
    
//     // Условие для типа порта (open/filtered)
//     if (useOpened && !useFiltered) {
//       portTypeCondition = "p.type = 'open'";
//     } else if (!useOpened && useFiltered) {
//       portTypeCondition = "p.type = 'filtered'";
//     } else if (useOpened && useFiltered) {
//       // Если оба true, то ищем оба типа
//       portTypeCondition = "(p.type = 'open' OR p.type = 'filtered')";
//     }

//     // ============ ШАГ 1: Получаем уникальные порты с учетом фильтрации ============
//     let uniquePortsQuery = `
//       SELECT 
//         p.port as value,
//         wkp.name as name,
//         COUNT(DISTINCT h.id) as host_count
//       FROM ports p
//       INNER JOIN hosts h ON p.host_id = h.id
//       LEFT JOIN well_known_ports wkp ON p.port = wkp.port
//     `;

//     // Добавляем условия WHERE
//     const whereConditions = [];
    
//     if (portFilter) {
//       whereConditions.push(`p.port = ${portFilter}`);
//     }
    
//     // Добавляем условие типа порта
//     if (portTypeCondition) {
//       whereConditions.push(portTypeCondition);
//     }
    
//     // Если есть условия, добавляем WHERE
//     if (whereConditions.length > 0) {
//       uniquePortsQuery += ` WHERE ${whereConditions.join(' AND ')}`;
//     }
    
//     uniquePortsQuery += `
//       GROUP BY p.port, wkp.name
//       ORDER BY p.port ASC
//     `;

//     const [uniquePorts] = await Promise.all([
//       sequelize.query(uniquePortsQuery, { type: sequelize.QueryTypes.SELECT }),
//     ]);
//     console.log(uniquePorts)

//     if (uniquePorts.length === 0) {
//       return res.status(404).json({
//         message: "Нет данных",
//         items: [],
//         pagination: {
//           currentPage: pageNum,
//           totalPages: 0,
//           totalItems: 0,
//           hasNext: false,
//           hasPrev: false,
//         },
//         // Возвращаем текущие параметры фильтрации
//         filter_params: {
//           portOpened: useOpened,
//           portFiltered: useFiltered,
//           port: portFilter || undefined,
//           using_cached: !hasExplicitFilters && cachedFilters !== undefined
//         }
//       });
//     }

//     // ============ ШАГ 2: Получаем хосты для найденных портов ============
//     const portGroupsPromises = [(uniquePorts[0])].map(async (portInfo) => {
//       const portNumber = portInfo.value;
      
//       // ============ ШАГ 2.1.1: Получаем ID хостов, отсортированных по приоритету для этого порта с учетом фильтрации ============
//       let sortedHostIdsQuery = `
//         WITH port_hosts AS (
//           SELECT DISTINCT p.host_id
//           FROM ports p
//           WHERE p.port = ${portNumber}
//       `;
      
//       // Добавляем условие типа порта, если указано
//       if (portTypeCondition) {
//         sortedHostIdsQuery += ` AND ${portTypeCondition}`;
//       }
      
//       // Для подсчета общего количества хостов с учетом фильтрации
//       let totalCountQuery = `
//         SELECT COUNT(DISTINCT h.id) as total
//         FROM ports p
//         INNER JOIN hosts h ON p.host_id = h.id
//         WHERE p.port = ${portNumber}
//       `;
//       if (portTypeCondition) {
//         totalCountQuery += ` AND ${portTypeCondition}`;
//       }
      
//       sortedHostIdsQuery += `
//         ),
//         sorted_hosts AS (
//           SELECT 
//             h.id,
//             h.priority_id,
//             h.updated_at,
//             ROW_NUMBER() OVER (
//               ORDER BY 
//                 CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//                 h.priority_id DESC NULLS LAST,
//                 h.updated_at DESC
//             ) as rn
//           FROM hosts h
//           INNER JOIN port_hosts ph ON h.id = ph.host_id
//         )
//         SELECT id, rn FROM sorted_hosts
//         ORDER BY rn
//       `;

//       const [sortedHosts, totalCountResult] = await Promise.all([
//         sequelize.query(sortedHostIdsQuery, { type: sequelize.QueryTypes.SELECT }),
//         sequelize.query(totalCountQuery, { type: sequelize.QueryTypes.SELECT })
//       ]);

//       const totalHosts = parseInt(totalCountResult[0]?.total || 0);
//       const totalPages = Math.ceil(totalHosts / pageSize);
      
//       // Проверяем, есть ли хосты на текущей странице для этого порта
//       const offset = (pageNum - 1) * pageSize;
      
//       // Если нет хостов на этой странице для этого порта
//       if (totalHosts === 0 || offset >= totalHosts) {
//         return {
//           port: portNumber,
//           count: totalHosts, // Используем отфильтрованное количество
//           name: portInfo.name || null,
//           items: [],
//           pagination: {
//             currentPage: pageNum,
//             totalPages: totalPages,
//             totalItems: totalHosts,
//             hasNext: pageNum < totalPages,
//             hasPrev: pageNum > 1,
//           },
//         };
//       }

//       // Получаем ID хостов для текущей страницы
//       const paginatedHostIds = sortedHosts
//         .slice(offset, offset + pageSize)
//         .map(host => host.id);

//       if (paginatedHostIds.length === 0) {
//         return {items: []}
//         return {
//           port: portNumber,
//           count: totalHosts,
//           name: portInfo.port_name || null,
//           items: [],
//           pagination: {
//             currentPage: pageNum,
//             totalPages: totalPages,
//             totalItems: totalHosts,
//             hasNext: pageNum < totalPages,
//             hasPrev: pageNum > 1,
//           },
//         };
//       }

//       // ============ ШАГ 2.1.2: Получаем детали хостов с правильным порядком ============
//       const hostIdsString = paginatedHostIds.join(',');
      
//       // Формируем условие для подзапроса портов
//       let portSubqueryCondition = '';
//       if (portTypeCondition) {
//         // Заменяем p.type на p2.type для корректного обращения к таблице в подзапросе
//         portSubqueryCondition = ' AND ' + portTypeCondition.replace(/p\.type/g, 'p2.type');
//       }
      
//       const hostsDetailsQuery = `
//         WITH ordered_hosts AS (
//           SELECT 
//             h.id,
//             ROW_NUMBER() OVER (
//               ORDER BY 
//                 CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//                 h.priority_id DESC NULLS LAST,
//                 h.updated_at DESC
//             ) as order_idx
//           FROM hosts h
//           WHERE h.id IN (${hostIdsString})
//         ),
//         host_details AS (
//           SELECT 
//             h.id,
//             h.ip,
//             h.reachable,
//             TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
//             h.priority_id,
//             h.grouping_id,
//             hp.name as priority_name,
//             hg.name as grouping_name,
//             (
//               SELECT COALESCE(
//                 json_agg(
//                   json_build_object(
//                     'port', p2.port,
//                     'type', p2.type,
//                     'port_name', wkp.name
//                   )
//                   ORDER BY p2.port
//                 ),
//                 '[]'::json
//               )
//               FROM ports p2
//               LEFT JOIN well_known_ports wkp ON p2.port = wkp.port
//               WHERE p2.host_id = h.id
//               ${portSubqueryCondition}
//             ) as ports_json,
//             EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
//           FROM hosts h
//           INNER JOIN ordered_hosts oh ON h.id = oh.id
//           LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//           LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//         )
//         SELECT * FROM host_details
//         ORDER BY (
//           SELECT order_idx FROM ordered_hosts oh2 WHERE oh2.id = host_details.id
//         )
//       `;

//       const hostsForPort = await sequelize.query(hostsDetailsQuery, { 
//         type: sequelize.QueryTypes.SELECT 
//       });

//       // ============ ШАГ 2.1.3: Фильтруем хосты по типу порта ============
//       const filteredHosts = hostsForPort.filter(host => {
//         // Если нет фильтрации по типу порта, возвращаем все хосты
//         if (!useOpened && !useFiltered) return true;
        
//         // Извлекаем порты из JSON
//         let portsJson = host.ports_json;
//         if (typeof portsJson === 'string') {
//           try {
//             portsJson = JSON.parse(portsJson);
//           } catch (e) {
//             return false;
//           }
//         }
        
//         if (!Array.isArray(portsJson)) return false;
        
//         // Ищем порт с указанным номером
//         const targetPort = portsJson.find(p => p.port === portNumber);
//         if (!targetPort) return false;
        
//         // Проверяем тип порта
//         if (useOpened && !useFiltered) {
//           return targetPort.type === 'open';
//         } else if (!useOpened && useFiltered) {
//           return targetPort.type === 'filtered';
//         } else if (useOpened && useFiltered) {
//           return targetPort.type === 'open' || targetPort.type === 'filtered';
//         }
        
//         return false;
//       });

//       // ============ ШАГ 2.1.4: Форматируем хосты ============
//       const formattedHosts = filteredHosts.map(host => {
//         // Фильтруем порты в JSON по типу
//         let filteredPortsJson = { open: [], filtered: [] };
//         try {
//           const ports = typeof host.ports_json === 'string' 
//             ? JSON.parse(host.ports_json) 
//             : host.ports_json;
          
//           if (Array.isArray(ports)) {
//             ports.forEach(port => {
//               if (port && port.port && port.type) {
//                 if (port.type === "open") {
//                   filteredPortsJson.open.push({
//                     port: port.port,
//                     name: port.port_name || null,
//                   });
//                 } else if (port.type === "filtered") {
//                   filteredPortsJson.filtered.push({
//                     port: port.port,
//                     name: port.port_name || null,
//                   });
//                 }
//               }
//             });
//           }
//         } catch (e) {
//           console.error("Error parsing ports JSON:", e);
//         }

//         return {
//           id: host.id,
//           ip: host.ip,
//           reachable: host.reachable,
//           updated_at: host.updated_at,
//           port_data: filteredPortsJson,
//           priority_info: {
//             priority: host.priority_id ? {
//               id: host.priority_id,
//               name: host.priority_name || "Unknown",
//             } : null,
//             grouping: host.grouping_id ? {
//               id: host.grouping_id,
//               name: host.grouping_name || null,
//             } : null,
//           },
//           has_whois: host.has_whois,
//         };
//       });


//       return {
//         items: formattedHosts,
//         pagination: {
//           currentPage: pageNum,
//           totalPages: totalPages,
//           totalItems: totalHosts,
//           hasNext: pageNum < totalPages,
//           hasPrev: pageNum > 1,
//         },
//       }
//       return {
//         port: portNumber,
//         count: totalHosts,
//         name: portInfo.port_name || null,
//         items: formattedHosts,
//         pagination: {
//           currentPage: pageNum,
//           totalPages: totalPages,
//           totalItems: totalHosts,
//           hasNext: pageNum < totalPages,
//           hasPrev: pageNum > 1,
//         },
//       };
//     });

//     const portGroups = await Promise.all(portGroupsPromises);

//     // ============ ШАГ 3: Фильтруем и сортируем группы ============
//     // Фильтруем группы, где есть хосты на текущей странице
//     const filteredGroups = portGroups.filter(group => 
//       group.items.length > 0
//     );

//     if (filteredGroups.length === 0) {
//       return res.json({
//         items: [],
//         pagination: {
//           currentPage: pageNum,
//           totalPages: 0,
//           totalItems: 0,
//           hasNext: false,
//           hasPrev: false,
//         },
//         type: "group",
//         field: "port",
//         // Возвращаем текущие параметры фильтрации
//         filter_params: {
//           portOpened: useOpened,
//           portFiltered: useFiltered,
//           port: portFilter || undefined,
//           // Флаг, показывающий, что используются сохраненные параметры
//           using_cached: !hasExplicitFilters && cachedFilters !== undefined
//         }
//       });
//     }

//     // Сортируем группы по номеру порта
//     filteredGroups.sort((a, b) => a.port - b.port);

//     // ============ ШАГ 4: Формируем общую пагинацию ============
//     // Для общего ответа используем пагинацию из первой группы с данными
//     const firstGroupWithData = filteredGroups[0];
    
//     // Формируем URL для пагинации с учетом текущих параметров фильтрации
//     const queryParams = new URLSearchParams({
//       page: pageNum.toString(),
//       limit: limit.toString()
//     });
    
//     if (portFilter) {
//       queryParams.set('port', portFilter.toString());
//     }
//     // Всегда добавляем текущие параметры фильтрации в URL
//     if (useOpened) {
//       queryParams.set('o', 'true');
//     }
//     if (useFiltered) {
//       queryParams.set('f', 'true');
//     }

//     // Формируем полные URL для пагинации
//     const basePath = '/ports/group';
//     const currentQueryString = queryParams.toString();
//     const nextPageUrl = pageNum < firstGroupWithData.pagination.totalPages 
//       ? `${basePath}?${currentQueryString.replace(`page=${pageNum}`, `page=${pageNum + 1}`)}` 
//       : null;
//     const prevPageUrl = pageNum > 1 
//       ? `${basePath}?${currentQueryString.replace(`page=${pageNum}`, `page=${pageNum - 1}`)}` 
//       : null;

//     const response = {
//       items: filteredGroups[0].items,
//       pagination: filteredGroups[0].pagination,
//       // pagination: {
//       //   currentPage: pageNum,
//       //   totalPages: firstGroupWithData.pagination.totalPages,
//       //   totalItems: filteredGroups.length,
//       //   hasNext: pageNum < firstGroupWithData.pagination.totalPages,
//       //   hasPrev: pageNum > 1,
//       //   // Добавляем URL для следующей и предыдущей страниц с сохранением параметров фильтрации
//       //   nextPageUrl: nextPageUrl,
//       //   prevPageUrl: prevPageUrl,
//       //   // Также возвращаем параметры для ручного формирования URL
//       //   params: {
//       //     page: pageNum,
//       //     limit: limit,
//       //     port: portFilter || undefined,
//       //     o: useOpened,
//       //     f: useFiltered
//       //   }
//       // },
//       type: "group",
//       field: "port",
//       tabs: uniquePorts, //!
//       // Добавляем параметры фильтрации в ответ для клиента
//       filter_params: {
//         portOpened: useOpened,
//         portFiltered: useFiltered,
//         port: portFilter || undefined,
//         // Флаг, показывающий, что используются сохраненные параметры
//         using_cached: !hasExplicitFilters && cachedFilters !== undefined,
//         // Сохраняем информацию о том, были ли явно указаны параметры в запросе
//         explicit_filters: hasExplicitFilters
//       }
//     };

//     return res.json(response);

//   } catch (error) {
//     console.error("Ошибка в groupPort:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// // Быстрая функция извлечения портов из JSON
// const extractPortsFromJson = (portsJson) => {
//   const result = { open: [], filtered: [] };
  
//   if (!portsJson) return result;
  
//   try {
//     const ports = typeof portsJson === 'string' ? JSON.parse(portsJson) : portsJson;
    
//     if (!Array.isArray(ports) || ports.length === 0) return result;
    
//     // Используем for loop для максимальной производительности
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

// // Также оптимизируем getPortInfo для консистентности с сортировкой по приоритету
// export const getPortInfo = async (req, res) => {
//   try {
//     const {
//       port: portQuery,
//       page = 1,
//       limit = 10,
//       portOpened: portOpened,
//       portFiltered: portFiltered,
//     } = req.query;

//     const pageNum = Math.max(1, parseInt(page) || 1);
//     const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
//     const offset = (pageNum - 1) * limitNum;

//     if (portQuery === undefined) {
//       return res.status(400).json({ error: "Параметр 'port' обязателен" });
//     }

//     // Обработка запроса порта
//     let processedQuery = portQuery.trim();
//     const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);
//     if (portWithNameMatch) {
//       processedQuery = portWithNameMatch[1];
//     }

//     const isNumeric = /^\d+$/.test(processedQuery);
//     let targetPortNumber = null;

//     if (isNumeric) {
//       const portNum = Number(processedQuery);
//       if (portNum < 1 || portNum > 65535) {
//         return res
//           .status(400)
//           .json({ error: "Порт должен быть числом от 1 до 65535" });
//       }
//       targetPortNumber = portNum;
//     } else {
//       const knownPort = await WellKnownPort.findOne({
//         where: {
//           name: { [Op.iLike]: processedQuery },
//         },
//         raw: true,
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
//       targetPortNumber = knownPort.port;
//     }

//     // Определяем тип порта
//     const isOpened = portOpened === 'true';
//     const isFiltered = portFiltered === 'true';
    
//     // Специальный случай: хосты без портов
//     if (!isOpened && !isFiltered) {
//       const [hostsNotInPorts, totalCount] = await Promise.all([
//         sequelize.query(`
//           WITH sorted_hosts AS (
//             SELECT 
//               h.id,
//               h.ip,
//               h.reachable,
//               TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
//               h.priority_id,
//               h.grouping_id,
//               hp.name as priority_name,
//               hg.name as grouping_name,
//               '[]'::json as ports_json,
//               EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois,
//               ROW_NUMBER() OVER (
//                 ORDER BY 
//                   CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//                   h.priority_id DESC NULLS LAST,
//                   h.updated_at DESC
//               ) as rn
//             FROM hosts h
//             LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//             LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//             WHERE NOT EXISTS (
//               SELECT 1 FROM ports p WHERE p.host_id = h.id
//             )
//           )
//           SELECT * FROM sorted_hosts
//           WHERE rn > ${offset} AND rn <= ${offset + limitNum}
//           ORDER BY rn
//         `, { type: sequelize.QueryTypes.SELECT }),
//         sequelize.query(`
//           SELECT COUNT(*) as total
//           FROM hosts h
//           WHERE NOT EXISTS (
//             SELECT 1 FROM ports p WHERE p.host_id = h.id
//           )
//         `, { type: sequelize.QueryTypes.SELECT }),
//       ]);

//       const totalItems = parseInt(totalCount[0]?.total || 0);
//       const totalPages = Math.ceil(totalItems / limitNum);

//       const items = hostsNotInPorts.map(host => ({
//         id: host.id,
//         ip: host.ip,
//         reachable: host.reachable,
//         updated_at: host.updated_at,
//         port_data: { open: [], filtered: [] },
//         priority_info: {
//           priority: host.priority_id ? {
//             id: host.priority_id,
//             name: host.priority_name || "Unknown",
//           } : null,
//           grouping: host.grouping_id ? {
//             id: host.grouping_id,
//             name: host.grouping_name || null,
//           } : null,
//         },
//         has_whois: host.has_whois,
//       }));

//       return res.json({
//         items: items,
//         pagination: {
//           currentPage: pageNum,
//           totalPages: totalPages,
//           totalItems: totalItems,
//           hasNext: pageNum < totalPages,
//           hasPrev: pageNum > 1,
//         },
//         type: "search",
//         field: "port",
//         port_info: {
//           port: null,
//           name: null,
//         },
//       });
//     }

//     // Основной поиск по порту
//     let portTypeCondition = '';
//     if (isOpened && !isFiltered) {
//       portTypeCondition = "AND p.type = 'open'";
//     } else if (!isOpened && isFiltered) {
//       portTypeCondition = "AND p.type = 'filtered'";
//     } else if (isOpened && isFiltered) {
//       portTypeCondition = "AND (p.type = 'open' OR p.type = 'filtered')";
//     }

//     // Оптимизированный запрос для поиска по порту с сортировкой по приоритету
//     const searchQuery = `
//       WITH sorted_port_hosts AS (
//         SELECT 
//           p.host_id,
//           ROW_NUMBER() OVER (
//             ORDER BY 
//               CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//               h.priority_id DESC NULLS LAST,
//               h.updated_at DESC
//           ) as rn
//         FROM ports p
//         INNER JOIN hosts h ON p.host_id = h.id
//         WHERE p.port = ${targetPortNumber}
//         ${portTypeCondition}
//         GROUP BY p.host_id, h.priority_id, h.updated_at
//       ),
//       paginated_hosts AS (
//         SELECT host_id FROM sorted_port_hosts
//         WHERE rn > ${offset} AND rn <= ${offset + limitNum}
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
//           hp.name as priority_name,
//           hg.name as grouping_name,
//           (
//             SELECT COALESCE(
//               json_agg(
//                 json_build_object(
//                   'port', p2.port,
//                   'type', p2.type,
//                   'port_name', wkp.name
//                 )
//                 ORDER BY p2.port
//               ),
//               '[]'::json
//             )
//             FROM ports p2
//             LEFT JOIN well_known_ports wkp ON p2.port = wkp.port
//             WHERE p2.host_id = h.id
//           ) as ports_json,
//           EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
//         FROM hosts h
//         INNER JOIN paginated_hosts ph ON h.id = ph.host_id
//         LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//         LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//       ),
//       total_count AS (
//         SELECT COUNT(DISTINCT p.host_id) as total
//         FROM ports p
//         WHERE p.port = ${targetPortNumber}
//         ${portTypeCondition}
//       )
//       SELECT 
//         hd.*,
//         tc.total,
//         (
//           SELECT rn FROM sorted_port_hosts sph 
//           WHERE sph.host_id = hd.id
//         ) as order_idx
//       FROM host_details hd
//       CROSS JOIN total_count tc
//       ORDER BY order_idx
//     `;

//     const results = await sequelize.query(searchQuery, { 
//       type: sequelize.QueryTypes.SELECT 
//     });

//     if (results.length === 0) {
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

//     const totalItems = parseInt(results[0].total || 0);
//     const totalPages = Math.ceil(totalItems / limitNum);
//     const items = results.map(host => ({
//       id: host.id,
//       ip: host.ip,
//       reachable: host.reachable,
//       updated_at: host.updated_at,
//       port_data: extractPortsFromJson(host.ports_json),
//       priority_info: {
//         priority: host.priority_id ? {
//           id: host.priority_id,
//           name: host.priority_name || "Unknown",
//         } : null,
//         grouping: host.grouping_id ? {
//           id: host.grouping_id,
//           name: host.grouping_name || null,
//         } : null,
//       },
//       has_whois: host.has_whois,
//     }));

//     // Фильтруем по конкретному порту и типу
//     const filteredItems = items.filter(host => {
//       // Ищем порт в списке открытых и фильтрованных портов
//       const hasOpenPort = host.port_data.open.some(p => p.port === targetPortNumber);
//       const hasFilteredPort = host.port_data.filtered.some(p => p.port === targetPortNumber);
      
//       if (isOpened && !isFiltered) {
//         return hasOpenPort;
//       } else if (!isOpened && isFiltered) {
//         return hasFilteredPort;
//       } else if (isOpened && isFiltered) {
//         return hasOpenPort || hasFilteredPort;
//       }
      
//       // Если не указаны параметры фильтрации, возвращаем хосты с любым типом порта
//       return hasOpenPort || hasFilteredPort;
//     });

//     if (filteredItems.length === 0) {
//       return res.status(404).json({
//         message: "Нет данных соответствующих поиску",
//         items: [],
//         pagination: {
//           currentPage: pageNum,
//           totalPages: totalPages,
//           totalItems: totalItems,
//           hasNext: false,
//           hasPrev: false,
//         },
//       });
//     }

//     const portName = await WellKnownPort.findOne({
//       where: { port: targetPortNumber },
//       attributes: ["name"],
//       raw: true,
//     });

//     const response = {
//       items: filteredItems,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalItems: totalItems,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },
//       type: "search",
//       field: "port",
//       port_info: {
//         port: targetPortNumber,
//         name: portName?.name || null,
//       },
//     };

//     return res.json(response);
//   } catch (error) {
//     console.error("Ошибка в getPortInfo:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };
