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

// Генерация ключа для кэша на основе IP
const getCacheKey = (req) => {
  const ip = req.ip || 'unknown';
  return `${ip}`; // Только IP, без порта
};

// Ультра-оптимизированная функция groupPort для больших объемов данных с сортировкой по приоритету
export const groupPort = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      port: portQuery,
      o: portOpened,
      f: portFiltered 
    } = req.query;
    
    const pageNum = Math.max(1, parseInt(page, 10));
    const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));

    // Проверяем, есть ли фильтр по порту
    let portFilter = null;
    let portFilterCondition = '';
    let portTypeCondition = '';
    
    // Получаем последние параметры фильтрации из кэша
    const cacheKey = getCacheKey(req);
    const cachedFilters = filterCache.get(cacheKey);
    
    // Определяем, использовать ли новые параметры или сохраненные
    let useOpened, useFiltered;
    
    // Если в запросе явно указаны параметры o или f, используем их и обновляем кэш
    const hasExplicitFilters = portOpened !== undefined || portFiltered !== undefined;
    
    if (hasExplicitFilters) {
      useOpened = portOpened === 'true';
      useFiltered = portFiltered === 'true';
      
      // Сохраняем новые параметры в кэш
      filterCache.set(cacheKey, {
        o: useOpened,
        f: useFiltered,
        timestamp: Date.now(),
        lastUsed: Date.now()
      });
      
    } else if (cachedFilters) {
      // Используем сохраненные параметры
      useOpened = cachedFilters.o;
      useFiltered = cachedFilters.f;
      // Обновляем время последнего использования
      cachedFilters.lastUsed = Date.now();
      console.log(`Используем сохраненные параметры для ${cacheKey}: o=${useOpened}, f=${useFiltered}`);
    } else {
      // По умолчанию, если нет сохраненных параметров и не указаны в запросе
      useOpened = false;
      useFiltered = false;
      console.log(`Используем параметры по умолчанию для ${cacheKey}: o=${useOpened}, f=${useFiltered}`);
    }

    if (portQuery !== undefined && portQuery !== "") {
      let processedQuery = portQuery.trim();
      const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);
      if (portWithNameMatch) {
        processedQuery = portWithNameMatch[1];
      }

      const isNumeric = /^\d+$/.test(processedQuery);
      if (!isNumeric) {
        return res.status(400).json({
          error: "Для группировки портов необходим числовой порт",
        });
      }

      portFilter = Number(processedQuery);
      if (portFilter < 1 || portFilter > 65535) {
        return res
          .status(400)
          .json({ error: "Порт должен быть числом от 1 до 65535" });
      }
      
      portFilterCondition = `WHERE p.port = ${portFilter}`;
    }
    
    // Очищаем старые записи из кэша (старше 1 часа с последнего использования)
    const now = Date.now();
    const oneHour = 60 * 60 * 1000;
    for (const [key, value] of filterCache.entries()) {
      if (now - value.lastUsed > oneHour) {
        filterCache.delete(key);
        console.log(`Удален устаревший кэш для ${key}`);
      }
    }
    
    // Условие для типа порта (open/filtered)
    if (useOpened && !useFiltered) {
      portTypeCondition = "p.type = 'open'";
    } else if (!useOpened && useFiltered) {
      portTypeCondition = "p.type = 'filtered'";
    } else if (useOpened && useFiltered) {
      // Если оба true, то ищем оба типа
      portTypeCondition = "(p.type = 'open' OR p.type = 'filtered')";
    }

    // ============ ШАГ 1: Получаем уникальные порты с учетом фильтрации ============
    let uniquePortsQuery = `
      SELECT 
        p.port,
        wkp.name as port_name,
        COUNT(DISTINCT h.id) as host_count
      FROM ports p
      INNER JOIN hosts h ON p.host_id = h.id
      LEFT JOIN well_known_ports wkp ON p.port = wkp.port
    `;

    // Добавляем условия WHERE
    const whereConditions = [];
    
    if (portFilter) {
      whereConditions.push(`p.port = ${portFilter}`);
    }
    
    // Добавляем условие типа порта
    if (portTypeCondition) {
      whereConditions.push(portTypeCondition);
    }
    
    // Если есть условия, добавляем WHERE
    if (whereConditions.length > 0) {
      uniquePortsQuery += ` WHERE ${whereConditions.join(' AND ')}`;
    }
    
    uniquePortsQuery += `
      GROUP BY p.port, wkp.name
      ORDER BY p.port ASC
    `;

    const [uniquePorts] = await Promise.all([
      sequelize.query(uniquePortsQuery, { type: sequelize.QueryTypes.SELECT }),
    ]);

    if (uniquePorts.length === 0) {
      return res.status(404).json({
        message: "Нет данных",
        items: [],
        pagination: {
          currentPage: pageNum,
          totalPages: 0,
          totalItems: 0,
          hasNext: false,
          hasPrev: false,
        },
        // Возвращаем текущие параметры фильтрации
        filter_params: {
          o: useOpened,
          f: useFiltered,
          port: portFilter || undefined,
          using_cached: !hasExplicitFilters && cachedFilters !== undefined
        }
      });
    }

    // ============ ШАГ 2: Получаем хосты для найденных портов ============
    const portGroupsPromises = uniquePorts.map(async (portInfo) => {
      const portNumber = portInfo.port;
      
      // ============ ШАГ 2.1.1: Получаем ID хостов, отсортированных по приоритету для этого порта с учетом фильтрации ============
      let sortedHostIdsQuery = `
        WITH port_hosts AS (
          SELECT DISTINCT p.host_id
          FROM ports p
          WHERE p.port = ${portNumber}
      `;
      
      // Добавляем условие типа порта, если указано
      if (portTypeCondition) {
        sortedHostIdsQuery += ` AND ${portTypeCondition}`;
      }
      
      // Для подсчета общего количества хостов с учетом фильтрации
      let totalCountQuery = `
        SELECT COUNT(DISTINCT h.id) as total
        FROM ports p
        INNER JOIN hosts h ON p.host_id = h.id
        WHERE p.port = ${portNumber}
      `;
      if (portTypeCondition) {
        totalCountQuery += ` AND ${portTypeCondition}`;
      }
      
      sortedHostIdsQuery += `
        ),
        sorted_hosts AS (
          SELECT 
            h.id,
            h.priority_id,
            h.updated_at,
            ROW_NUMBER() OVER (
              ORDER BY 
                CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
                h.priority_id DESC NULLS LAST,
                h.updated_at DESC
            ) as rn
          FROM hosts h
          INNER JOIN port_hosts ph ON h.id = ph.host_id
        )
        SELECT id, rn FROM sorted_hosts
        ORDER BY rn
      `;

      const [sortedHosts, totalCountResult] = await Promise.all([
        sequelize.query(sortedHostIdsQuery, { type: sequelize.QueryTypes.SELECT }),
        sequelize.query(totalCountQuery, { type: sequelize.QueryTypes.SELECT })
      ]);

      const totalHosts = parseInt(totalCountResult[0]?.total || 0);
      const totalPages = Math.ceil(totalHosts / pageSize);
      
      // Проверяем, есть ли хосты на текущей странице для этого порта
      const offset = (pageNum - 1) * pageSize;
      
      // Если нет хостов на этой странице для этого порта
      if (totalHosts === 0 || offset >= totalHosts) {
        return {
          port: portNumber,
          count: totalHosts, // Используем отфильтрованное количество
          name: portInfo.port_name || null,
          items: [],
          pagination: {
            currentPage: pageNum,
            totalPages: totalPages,
            totalItems: totalHosts,
            hasNext: pageNum < totalPages,
            hasPrev: pageNum > 1,
          },
        };
      }

      // Получаем ID хостов для текущей страницы
      const paginatedHostIds = sortedHosts
        .slice(offset, offset + pageSize)
        .map(host => host.id);

      if (paginatedHostIds.length === 0) {
        return {
          port: portNumber,
          count: totalHosts,
          name: portInfo.port_name || null,
          items: [],
          pagination: {
            currentPage: pageNum,
            totalPages: totalPages,
            totalItems: totalHosts,
            hasNext: pageNum < totalPages,
            hasPrev: pageNum > 1,
          },
        };
      }

      // ============ ШАГ 2.1.2: Получаем детали хостов с правильным порядком ============
      const hostIdsString = paginatedHostIds.join(',');
      
      // Формируем условие для подзапроса портов
      let portSubqueryCondition = '';
      if (portTypeCondition) {
        // Заменяем p.type на p2.type для корректного обращения к таблице в подзапросе
        portSubqueryCondition = ' AND ' + portTypeCondition.replace(/p\.type/g, 'p2.type');
      }
      
      const hostsDetailsQuery = `
        WITH ordered_hosts AS (
          SELECT 
            h.id,
            ROW_NUMBER() OVER (
              ORDER BY 
                CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
                h.priority_id DESC NULLS LAST,
                h.updated_at DESC
            ) as order_idx
          FROM hosts h
          WHERE h.id IN (${hostIdsString})
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
              ${portSubqueryCondition}
            ) as ports_json,
            EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
          FROM hosts h
          INNER JOIN ordered_hosts oh ON h.id = oh.id
          LEFT JOIN host_priorities hp ON h.priority_id = hp.id
          LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
        )
        SELECT * FROM host_details
        ORDER BY (
          SELECT order_idx FROM ordered_hosts oh2 WHERE oh2.id = host_details.id
        )
      `;

      const hostsForPort = await sequelize.query(hostsDetailsQuery, { 
        type: sequelize.QueryTypes.SELECT 
      });

      // ============ ШАГ 2.1.3: Фильтруем хосты по типу порта ============
      const filteredHosts = hostsForPort.filter(host => {
        // Если нет фильтрации по типу порта, возвращаем все хосты
        if (!useOpened && !useFiltered) return true;
        
        // Извлекаем порты из JSON
        let portsJson = host.ports_json;
        if (typeof portsJson === 'string') {
          try {
            portsJson = JSON.parse(portsJson);
          } catch (e) {
            return false;
          }
        }
        
        if (!Array.isArray(portsJson)) return false;
        
        // Ищем порт с указанным номером
        const targetPort = portsJson.find(p => p.port === portNumber);
        if (!targetPort) return false;
        
        // Проверяем тип порта
        if (useOpened && !useFiltered) {
          return targetPort.type === 'open';
        } else if (!useOpened && useFiltered) {
          return targetPort.type === 'filtered';
        } else if (useOpened && useFiltered) {
          return targetPort.type === 'open' || targetPort.type === 'filtered';
        }
        
        return false;
      });

      // ============ ШАГ 2.1.4: Форматируем хосты ============
      const formattedHosts = filteredHosts.map(host => {
        // Фильтруем порты в JSON по типу
        let filteredPortsJson = { open: [], filtered: [] };
        try {
          const ports = typeof host.ports_json === 'string' 
            ? JSON.parse(host.ports_json) 
            : host.ports_json;
          
          if (Array.isArray(ports)) {
            ports.forEach(port => {
              if (port && port.port && port.type) {
                if (port.type === "open") {
                  filteredPortsJson.open.push({
                    port: port.port,
                    name: port.port_name || null,
                  });
                } else if (port.type === "filtered") {
                  filteredPortsJson.filtered.push({
                    port: port.port,
                    name: port.port_name || null,
                  });
                }
              }
            });
          }
        } catch (e) {
          console.error("Error parsing ports JSON:", e);
        }

        return {
          id: host.id,
          ip: host.ip,
          reachable: host.reachable,
          updated_at: host.updated_at,
          port_data: filteredPortsJson,
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
        };
      });

      return {
        port: portNumber,
        count: totalHosts,
        name: portInfo.port_name || null,
        items: formattedHosts,
        pagination: {
          currentPage: pageNum,
          totalPages: totalPages,
          totalItems: totalHosts,
          hasNext: pageNum < totalPages,
          hasPrev: pageNum > 1,
        },
      };
    });

    const portGroups = await Promise.all(portGroupsPromises);

    // ============ ШАГ 3: Фильтруем и сортируем группы ============
    // Фильтруем группы, где есть хосты на текущей странице
    const filteredGroups = portGroups.filter(group => 
      group.items.length > 0
    );

    if (filteredGroups.length === 0) {
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
        field: "port",
        // Возвращаем текущие параметры фильтрации
        filter_params: {
          o: useOpened,
          f: useFiltered,
          port: portFilter || undefined,
          // Флаг, показывающий, что используются сохраненные параметры
          using_cached: !hasExplicitFilters && cachedFilters !== undefined
        }
      });
    }

    // Сортируем группы по номеру порта
    filteredGroups.sort((a, b) => a.port - b.port);

    // ============ ШАГ 4: Формируем общую пагинацию ============
    // Для общего ответа используем пагинацию из первой группы с данными
    const firstGroupWithData = filteredGroups[0];
    
    // Формируем URL для пагинации с учетом текущих параметров фильтрации
    const queryParams = new URLSearchParams({
      page: pageNum.toString(),
      limit: limit.toString()
    });
    
    if (portFilter) {
      queryParams.set('port', portFilter.toString());
    }
    // Всегда добавляем текущие параметры фильтрации в URL
    if (useOpened) {
      queryParams.set('o', 'true');
    }
    if (useFiltered) {
      queryParams.set('f', 'true');
    }

    // Формируем полные URL для пагинации
    const basePath = '/ports/group';
    const currentQueryString = queryParams.toString();
    const nextPageUrl = pageNum < firstGroupWithData.pagination.totalPages 
      ? `${basePath}?${currentQueryString.replace(`page=${pageNum}`, `page=${pageNum + 1}`)}` 
      : null;
    const prevPageUrl = pageNum > 1 
      ? `${basePath}?${currentQueryString.replace(`page=${pageNum}`, `page=${pageNum - 1}`)}` 
      : null;

    const response = {
      items: filteredGroups,
      pagination: {
        currentPage: pageNum,
        totalPages: firstGroupWithData.pagination.totalPages,
        totalItems: firstGroupWithData.pagination.totalItems,
        hasNext: pageNum < firstGroupWithData.pagination.totalPages,
        hasPrev: pageNum > 1,
        // Добавляем URL для следующей и предыдущей страниц с сохранением параметров фильтрации
        nextPageUrl: nextPageUrl,
        prevPageUrl: prevPageUrl,
        // Также возвращаем параметры для ручного формирования URL
        params: {
          page: pageNum,
          limit: limit,
          port: portFilter || undefined,
          o: useOpened,
          f: useFiltered
        }
      },
      type: "group",
      field: "port",
      // Добавляем параметры фильтрации в ответ для клиента
      filter_params: {
        o: useOpened,
        f: useFiltered,
        port: portFilter || undefined,
        // Флаг, показывающий, что используются сохраненные параметры
        using_cached: !hasExplicitFilters && cachedFilters !== undefined,
        // Сохраняем информацию о том, были ли явно указаны параметры в запросе
        explicit_filters: hasExplicitFilters
      }
    };

    return res.json(response);

  } catch (error) {
    console.error("Ошибка в groupPort:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};

// Быстрая функция извлечения портов из JSON
const extractPortsFromJson = (portsJson) => {
  const result = { open: [], filtered: [] };
  
  if (!portsJson) return result;
  
  try {
    const ports = typeof portsJson === 'string' ? JSON.parse(portsJson) : portsJson;
    
    if (!Array.isArray(ports) || ports.length === 0) return result;
    
    // Используем for loop для максимальной производительности
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

// Также оптимизируем getPortInfo для консистентности с сортировкой по приоритету
export const getPortInfo = async (req, res) => {
  try {
    const {
      port: portQuery,
      page = 1,
      limit = 10,
      o: portOpened,
      f: portFiltered,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    if (portQuery === undefined) {
      return res.status(400).json({ error: "Параметр 'port' обязателен" });
    }

    // Обработка запроса порта
    let processedQuery = portQuery.trim();
    const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);
    if (portWithNameMatch) {
      processedQuery = portWithNameMatch[1];
    }

    const isNumeric = /^\d+$/.test(processedQuery);
    let targetPortNumber = null;

    if (isNumeric) {
      const portNum = Number(processedQuery);
      if (portNum < 1 || portNum > 65535) {
        return res
          .status(400)
          .json({ error: "Порт должен быть числом от 1 до 65535" });
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
      targetPortNumber = knownPort.port;
    }

    // Определяем тип порта
    const isOpened = portOpened === 'true';
    const isFiltered = portFiltered === 'true';
    
    // Специальный случай: хосты без портов
    if (!isOpened && !isFiltered) {
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

      const items = hostsNotInPorts.map(host => ({
        id: host.id,
        ip: host.ip,
        reachable: host.reachable,
        updated_at: host.updated_at,
        port_data: { open: [], filtered: [] },
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
      }));

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

    // Основной поиск по порту
    let portTypeCondition = '';
    if (isOpened && !isFiltered) {
      portTypeCondition = "AND p.type = 'open'";
    } else if (!isOpened && isFiltered) {
      portTypeCondition = "AND p.type = 'filtered'";
    } else if (isOpened && isFiltered) {
      portTypeCondition = "AND (p.type = 'open' OR p.type = 'filtered')";
    }

    // Оптимизированный запрос для поиска по порту с сортировкой по приоритету
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
        ${portTypeCondition}
        GROUP BY p.host_id, h.priority_id, h.updated_at
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
          EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
        FROM hosts h
        INNER JOIN paginated_hosts ph ON h.id = ph.host_id
        LEFT JOIN host_priorities hp ON h.priority_id = hp.id
        LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
      ),
      total_count AS (
        SELECT COUNT(DISTINCT p.host_id) as total
        FROM ports p
        WHERE p.port = ${targetPortNumber}
        ${portTypeCondition}
      )
      SELECT 
        hd.*,
        tc.total,
        (
          SELECT rn FROM sorted_port_hosts sph 
          WHERE sph.host_id = hd.id
        ) as order_idx
      FROM host_details hd
      CROSS JOIN total_count tc
      ORDER BY order_idx
    `;

    const results = await sequelize.query(searchQuery, { 
      type: sequelize.QueryTypes.SELECT 
    });

    if (results.length === 0) {
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

    const totalItems = parseInt(results[0].total || 0);
    const totalPages = Math.ceil(totalItems / limitNum);
    const items = results.map(host => ({
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
    }));

    // Фильтруем по конкретному порту и типу
    const filteredItems = items.filter(host => {
      // Ищем порт в списке открытых и фильтрованных портов
      const hasOpenPort = host.port_data.open.some(p => p.port === targetPortNumber);
      const hasFilteredPort = host.port_data.filtered.some(p => p.port === targetPortNumber);
      
      if (isOpened && !isFiltered) {
        return hasOpenPort;
      } else if (!isOpened && isFiltered) {
        return hasFilteredPort;
      } else if (isOpened && isFiltered) {
        return hasOpenPort || hasFilteredPort;
      }
      
      // Если не указаны параметры фильтрации, возвращаем хосты с любым типом порта
      return hasOpenPort || hasFilteredPort;
    });

    if (filteredItems.length === 0) {
      return res.status(404).json({
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

    const response = {
      items: filteredItems,
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
    };

    return res.json(response);
  } catch (error) {
    console.error("Ошибка в getPortInfo:", error);
    return res.status(500).json({ error: "Внутренняя ошибка сервера" });
  }
};



// ОПТИМИЗИРОВАННЫЕ и РАБОЧИЕ
/********************************************** */
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


// Ультра-оптимизированная функция groupPort для больших объемов данных
// export const groupPort = async (req, res) => {
//   try {
//     const { page = 1, limit = 10, port: portQuery } = req.query;
//     const pageNum = Math.max(1, parseInt(page, 10));
//     const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));

//     // Проверяем, есть ли фильтр по порту
//     let portFilter = null;
//     let portFilterCondition = '';
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

//     // ============ ШАГ 1: Получаем уникальные порты БЕЗ пагинации ============
//     // При фильтре по конкретному порту получаем только этот порт
//     const uniquePortsQuery = `
//       SELECT 
//         p.port,
//         wkp.name as port_name,
//         COUNT(DISTINCT h.id) as host_count
//       FROM ports p
//       INNER JOIN hosts h ON p.host_id = h.id
//       LEFT JOIN well_known_ports wkp ON p.port = wkp.port
//       ${portFilterCondition}
//       GROUP BY p.port, wkp.name
//       ORDER BY p.port ASC
//     `;

//     const [uniquePorts] = await Promise.all([
//       sequelize.query(uniquePortsQuery, { type: sequelize.QueryTypes.SELECT }),
//     ]);

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
//       });
//     }

//     // ============ ШАГ 2: Получаем хосты для найденных портов ============
//     const portNumbers = uniquePorts.map(p => p.port);
//     const portNumbersString = portNumbers.join(',');

//     // ============ ШАГ 2.1: Получаем общее количество хостов для каждого порта ============
//     // Это нужно для правильной пагинации
//     const hostCountsQuery = `
//       SELECT 
//         p.port,
//         COUNT(DISTINCT p.host_id) as total_hosts
//       FROM ports p
//       WHERE p.port IN (${portNumbersString})
//       GROUP BY p.port
//       ORDER BY p.port ASC
//     `;

//     const hostCountsResult = await sequelize.query(hostCountsQuery, { 
//       type: sequelize.QueryTypes.SELECT 
//     });

//     const hostCountsMap = new Map();
//     hostCountsResult.forEach(row => {
//       hostCountsMap.set(row.port, parseInt(row.total_hosts));
//     });

//     // ============ ШАГ 2.2: Получаем хосты с пагинацией для каждого порта ============
//     // Для каждого порта получаем только хосты для текущей страницы
//     const portGroupsPromises = uniquePorts.map(async (portInfo) => {
//       const portNumber = portInfo.port;
//       const totalHosts = hostCountsMap.get(portNumber) || 0;
//       const totalPages = Math.ceil(totalHosts / pageSize);
      
//       // Проверяем, есть ли хосты на текущей странице для этого порта
//       const offset = (pageNum - 1) * pageSize;
//       if (offset >= totalHosts) {
//         // Нет хостов на этой странице для этого порта
//         return {
//           port: portNumber,
//           count: parseInt(portInfo.host_count),
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

//       // Получаем хосты для этого порта с пагинацией
//       const hostsForPortQuery = `
//         WITH port_hosts AS (
//           SELECT DISTINCT p.host_id
//           FROM ports p
//           WHERE p.port = ${portNumber}
//           ORDER BY p.host_id
//           LIMIT ${pageSize} OFFSET ${offset}
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
//               SELECT json_agg(
//                 json_build_object(
//                   'port', p2.port,
//                   'type', p2.type,
//                   'port_name', wkp.name
//                 )
//               )
//               FROM ports p2
//               LEFT JOIN well_known_ports wkp ON p2.port = wkp.port
//               WHERE p2.host_id = h.id
//             ) as ports_json,
//             EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
//           FROM hosts h
//           INNER JOIN port_hosts ph ON h.id = ph.host_id
//           LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//           LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//           ORDER BY 
//             CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//             h.priority_id DESC NULLS LAST,
//             h.updated_at DESC
//         )
//         SELECT * FROM host_details
//       `;

//       const hostsForPort = await sequelize.query(hostsForPortQuery, { 
//         type: sequelize.QueryTypes.SELECT 
//       });

//       // Форматируем хосты
//       const formattedHosts = hostsForPort.map(host => ({
//         id: host.id,
//         ip: host.ip,
//         reachable: host.reachable,
//         updated_at: host.updated_at,
//         port_data: extractPortsFromJson(host.ports_json),
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

//       return {
//         port: portNumber,
//         count: parseInt(portInfo.host_count),
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
//     // Фильтруем группы, где есть хосты на текущей странице ИЛИ общее количество хостов > 0
//     const filteredGroups = portGroups.filter(group => 
//       group.items.length > 0 || group.pagination.totalItems > 0
//     );

//     if (filteredGroups.length === 0) {
//       // Проверяем, есть ли вообще данные
//       const hasAnyData = portGroups.some(group => group.pagination.totalItems > 0);
      
//       if (hasAnyData) {
//         // Данные есть, но не на этой странице
//         return res.json({
//           items: portGroups.filter(group => group.pagination.totalItems > 0),
//           pagination: {
//             currentPage: pageNum,
//             totalPages: portGroups.length > 0 ? portGroups[0].pagination.totalPages : 1,
//             totalItems: portGroups.length > 0 ? portGroups[0].pagination.totalItems : 0,
//             hasNext: pageNum < (portGroups.length > 0 ? portGroups[0].pagination.totalPages : 1),
//             hasPrev: pageNum > 1,
//           },
//           type: "group",
//           field: "port",
//         });
//       }
      
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
//       });
//     }

//     // Сортируем группы по номеру порта
//     filteredGroups.sort((a, b) => a.port - b.port);

//     // ============ ШАГ 4: Формируем общую пагинацию ============
//     // Для общего ответа используем пагинацию из первой группы (все группы имеют одинаковую пагинацию)
//     const firstGroupWithData = filteredGroups.find(group => group.items.length > 0) || filteredGroups[0];

//     const response = {
//       items: filteredGroups,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: firstGroupWithData.pagination.totalPages,
//         totalItems: firstGroupWithData.pagination.totalItems,
//         hasNext: pageNum < firstGroupWithData.pagination.totalPages,
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

// // Оптимизированная функция форматирования хоста
// const formatHostDataOptimized = (host) => {
//   return {
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
//     has_whois: host.has_whois,
//   };
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

// // Оптимизированная сортировка хостов по приоритету
// const sortHostsByPriority = async (hosts) => {
//   if (hosts.length <= 1) return hosts;
  
//   // Используем быструю сортировку
//   return hosts.sort((a, b) => {
//     const priorityA = a.priority_info?.priority?.id || 0;
//     const priorityB = b.priority_info?.priority?.id || 0;
    
//     if (priorityB !== priorityA) {
//       return priorityB - priorityA;
//     }
    
//     if (a.updated_at && b.updated_at) {
//       return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
//     }
//     return 0;
//   });
// };

// // Также оптимизируем getPortInfo для консистентности
// export const getPortInfo = async (req, res) => {
//   try {
//     const {
//       port: portQuery,
//       page = 1,
//       limit = 10,
//       o: portOpened,
//       f: portFiltered,
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
//           SELECT 
//             h.id,
//             h.ip,
//             h.reachable,
//             TO_CHAR(h.updated_at, 'YYYY-MM-DD HH24:MI:SS') as updated_at,
//             h.priority_id,
//             h.grouping_id,
//             hp.name as priority_name,
//             hg.name as grouping_name,
//             '[]'::json as ports_json,
//             EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
//           FROM hosts h
//           LEFT JOIN host_priorities hp ON h.priority_id = hp.id
//           LEFT JOIN host_groupings hg ON h.grouping_id = hg.id
//           WHERE NOT EXISTS (
//             SELECT 1 FROM ports p WHERE p.host_id = h.id
//           )
//           ORDER BY 
//             CASE WHEN h.priority_id IS NULL THEN 1 ELSE 0 END,
//             h.priority_id DESC NULLS LAST
//           LIMIT ${limitNum} OFFSET ${offset}
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

//       const items = hostsNotInPorts.map(formatHostDataOptimized);

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
//     }

//     // Оптимизированный запрос для поиска по порту
//     const searchQuery = `
//       WITH port_hosts AS (
//         SELECT DISTINCT p.host_id
//         FROM ports p
//         WHERE p.port = ${targetPortNumber}
//         ${portTypeCondition}
//         LIMIT ${limitNum} OFFSET ${offset}
//       ),
//       host_data AS (
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
//             SELECT json_agg(
//               json_build_object(
//                 'port', p2.port,
//                 'type', p2.type,
//                 'port_name', wkp.name
//               )
//             )
//             FROM ports p2
//             LEFT JOIN well_known_ports wkp ON p2.port = wkp.port
//             WHERE p2.host_id = h.id
//           ) as ports_json,
//           EXISTS(SELECT 1 FROM whois w WHERE w.host_id = h.id) as has_whois
//         FROM hosts h
//         INNER JOIN port_hosts ph ON h.id = ph.host_id
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
//         tc.total
//       FROM host_data hd
//       CROSS JOIN total_count tc
//       ORDER BY 
//         CASE WHEN hd.priority_id IS NULL THEN 1 ELSE 0 END,
//         hd.priority_id DESC NULLS LAST
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
//     const items = results.map(host => {
//       const formatted = formatHostDataOptimized(host);
//       return formatted;
//     });

//     // Фильтруем по конкретному порту
//     const filteredItems = items.filter(host => {
//       const hasTargetPort = host.port_data.open.some(p => p.port === targetPortNumber) ||
//                            host.port_data.filtered.some(p => p.port === targetPortNumber);
      
//       if (isOpened && !isFiltered) {
//         return host.port_data.open.some(p => p.port === targetPortNumber);
//       } else if (!isOpened && isFiltered) {
//         return host.port_data.filtered.some(p => p.port === targetPortNumber);
//       }
      
//       return hasTargetPort;
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
/******************************************************************************** */

// // Рабочий код но долгий
// /*********************************************** */
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

// // Вспомогательная функция для форматирования данных хоста (без WHOIS и комментариев)
// const formatHostData = (host) => {
//   const openPorts = [];
//   const filteredPorts = [];

//   // Проверяем, что Ports существует и является массивом
//   if (host.Ports && Array.isArray(host.Ports)) {
//     host.Ports.forEach((port) => {
//       const portInfo = {
//         port: port.port,
//         name: port.WellKnownPort?.name || null,
//       };

//       if (port.type === "open") {
//         openPorts.push(portInfo);
//       } else if (port.type === "filtered") {
//         filteredPorts.push(portInfo);
//       }
//     });
//   }

//   // Проверяем наличие WHOIS данных для поля has_whois
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

// // Универсальная функция сортировки по приоритету
// const sortItemsByPriority = (items) => {
//   return items.sort((a, b) => {
//     // Сначала сортируем по приоритету (DESC)
//     const priorityA = a.priority_info?.priority?.id || 0;
//     const priorityB = b.priority_info?.priority?.id || 0;

//     if (priorityB !== priorityA) {
//       return priorityB - priorityA;
//     }

//     // Если приоритеты одинаковые, сортируем по дате обновления
//     if (a.updated_at && b.updated_at) {
//       return new Date(b.updated_at) - new Date(a.updated_at);
//     }
//     return 0;
//   });
// };

// /**
//  * Получение информации о конкретном порте с пагинацией
//  * Поддерживает поиск по числовому значению порта, по имени сервиса или по значениям вида "21 (ftp)"
//  */
// export const getPortInfo = async (req, res) => {
//   try {
//     const {
//       port: portQuery,
//       page = 1,
//       limit = 10,
//       o: portOpened,
//       f: portFiltered,
//     } = req.query;

//     // Проверка параметров пагинации
//     const pageNum = Math.max(1, parseInt(page) || 1);
//     const limitNum = Math.min(100, Math.max(1, parseInt(limit) || 10));
//     const offset = (pageNum - 1) * limitNum;

//     if (portQuery === undefined) {
//       return res.status(400).json({ error: "Параметр 'port' обязателен" });
//     }

//     // Обработка значений вида "21 (ftp)" - извлекаем число из скобок
//     let processedQuery = portQuery.trim();

//     // Проверяем формат "число (название)"
//     const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);

//     if (portWithNameMatch) {
//       // Если формат "21 (ftp)", используем только числовую часть
//       processedQuery = portWithNameMatch[1];
//     }

//     // Определяем, передано число или строка
//     const isNumeric = /^\d+$/.test(processedQuery);
//     let whereCondition;
//     let targetPortNumber = null;

//     if (isNumeric) {
//       const portNum = Number(processedQuery);
//       if (portNum < 1 || portNum > 65535) {
//         return res
//           .status(400)
//           .json({ error: "Порт должен быть числом от 1 до 65535" });
//       }
//       // Поиск по числовому значению порта
//       whereCondition = { port: portNum };
//       targetPortNumber = portNum;
//     } else {
//       // Поиск по имени сервиса (например, 'https', 'ftp')
//       const knownPort = await WellKnownPort.findOne({
//         where: {
//           name: { [Op.iLike]: processedQuery },
//         },
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

//       // Если порт найден в well_known_ports, ищем порты с таким значением
//       whereCondition = {
//         port: knownPort.port,
//       };
//       targetPortNumber = knownPort.port;
//     }

//     // Определяем условие для типа порта на основе параметров
//     let portTypeCondition = {};
    
//     // Конвертируем параметры в boolean
//     const isOpened = portOpened === 'true';
//     const isFiltered = portFiltered === 'true';
    
//     if (isOpened && !isFiltered) {
//       portTypeCondition.type = 'open';
//     } else if (!isOpened && isFiltered) {
//       portTypeCondition.type = 'filtered';
//     } else if (isOpened && isFiltered) {
//       // Если оба параметра true, ищем оба типа
//       portTypeCondition.type = { [Op.in]: ['open', 'filtered'] };
//     } else if (!isOpened && !isFiltered) {
//       // все host, id которыx нет в ports.host_id 
//           const hostsNotInPorts = await Host.findAll({
//             where: {
//               id: {
//                 [Op.notIn]: (await Port.findAll({ attributes: ['host_id'], raw: true })).map(p => p.host_id),
//               },
//             },
//             include: [
//               {
//                 model: Priority,
//                 attributes: ["id", "name"],
//                 required: false,
//               },
//               {
//                 model: Grouping,
//                 attributes: ["id", "name"],
//                 required: false,
//               },
//               {
//                 model: Whois,
//                 attributes: ["value"],
//                 include: [
//                   {
//                     model: WhoisKey,
//                     attributes: ["key_name"],
//                     required: false,
//                   },
//                 ],
//                 required: false,
//               },
//             ],
//             order: [["priority_id", "DESC"]],
//             limit: limitNum,
//             offset: offset,
//           });
//           const totalCount = await Host.count({
//             where: {
//               id: {
//                 [Op.notIn]: (await Port.findAll({ attributes: ['host_id'], raw: true })).map(p => p.host_id),
//               },
//             },
//           });
//           const totalPages = Math.ceil(totalCount / limitNum);
//           return res.json({
//             items: hostsNotInPorts.map(formatHostData),
//             pagination: {
//               currentPage: pageNum,
//               totalPages: totalPages,
//               totalItems: totalCount,
//               hasNext: pageNum < totalPages,
//               hasPrev: pageNum > 1,
//             },
//             type: "search",
//             field: "port",
//             port_info: {
//               port: null,
//               name: null,
//             },
//           });
        
//     }
//     // Если оба false или не указаны - ищем все типы

//     // Создаем условие для поиска портов
//     const portSearchCondition = {
//       ...whereCondition,
//       ...portTypeCondition
//     };

//     // Находим все порты, соответствующие условиям и получаем ИД хостов
//     const ports = await Port.findAll({
//       where: portSearchCondition,
//       include: [
//         {
//           model: Host,
//           attributes: ["id"],
//           required: true,
//         },
//       ],
//       attributes: ['id'],
//       raw: true,
//     });

//     // Получаем уникальные ID хостов
//     const hostIds = [...new Set(ports.map((p) => p['Host.id']))];

//     if (hostIds.length === 0) {
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

//     // Получаем общее количество записей для пагинации
//     const totalCount = hostIds.length;

//     // Получаем общее количество страниц
//     const totalPages = Math.ceil(totalCount / limitNum);

//     // Теперь получаем полные данные для этих хостов с пагинацией
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
//         id: { [Op.in]: hostIds },
//       },
//       order: [["priority_id", "DESC"]],
//       limit: limitNum,
//       offset: offset,
//     });

//     // Формируем результат в нужном формате
//     const formattedHosts = hosts.map(formatHostData);

//     // Фильтруем результаты: оставляем только те хосты, у которых есть указанный порт с нужным типом
//     const filteredItems = formattedHosts.filter(host => {
//       const hasPort = host.port_data.open.some(p => p.port === targetPortNumber) ||
//                       host.port_data.filtered.some(p => p.port === targetPortNumber);
      
//       // Если указан тип порта, проверяем конкретный тип
//       if (isOpened && !isFiltered) {
//         return host.port_data.open.some(p => p.port === targetPortNumber);
//       } else if (!isOpened && isFiltered) {
//         return host.port_data.filtered.some(p => p.port === targetPortNumber);
//       }
      
//       return hasPort;
//     });

//     if (filteredItems.length === 0) {
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

//     // Получаем имя порта для ответа
//     let portName = null;
//     if (targetPortNumber) {
//       const knownPort = await WellKnownPort.findOne({
//         where: { port: targetPortNumber },
//         attributes: ["name"],
//       });
//       portName = knownPort?.name || null;
//     }

//     const response = {
//       items: filteredItems,
//       pagination: {
//         currentPage: pageNum,
//         totalPages: totalPages,
//         totalItems: totalCount,
//         hasNext: pageNum < totalPages,
//         hasPrev: pageNum > 1,
//       },
//       type: "search",
//       field: "port",
//       port_info: {
//         port: targetPortNumber,
//         name: portName,
//       },
//     };

//     return res.json(response);
//   } catch (error) {
//     console.error("Ошибка в getPortInfo:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };

// // Вспомогательная функция для получения уникальных портов и хостов для конкретного порта
// async function getUniquePortsAndHosts(portQuery) {
//   // Обработка значений вида "21 (ftp)" - извлекаем число из скобок
//   let processedQuery = portQuery.trim();

//   // Проверяем формат "число (название)"
//   const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);

//   if (portWithNameMatch) {
//     // Если формат "21 (ftp)", используем только числовую часть
//     processedQuery = portWithNameMatch[1];
//   }

//   const isNumeric = /^\d+$/.test(processedQuery);
//   const portNumber = isNumeric ? Number(processedQuery) : null;

//   if (!isNumeric) {
//     throw new Error("Для группировки портов необходим числовой порт");
//   }

//   // Используем raw SQL для получения уникальных портов с подсчетом хостов
//   const rawUniquePortsResult = await sequelize.query(
//     `
//     SELECT DISTINCT p."port", COUNT(DISTINCT h."id") as "count", w."name" as "port_name"
//     FROM "ports" AS p
//     INNER JOIN "hosts" AS h ON p."host_id" = h."id"
//     LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
//     WHERE p."port" = :port
//     GROUP BY p."port", w."name"
//     ORDER BY p."port" ASC
//   `,
//     {
//       replacements: { port: portNumber },
//       type: sequelize.QueryTypes.SELECT,
//     }
//   );

//   const uniquePorts = rawUniquePortsResult.map((row) => ({
//     dataValues: {
//       port: row.port,
//       count: row.count,
//       "WellKnownPort.name": row.port_name,
//     },
//   }));

//   // Получаем ID хостов с указанным портом
//   const hostIdsResult = await sequelize.query(
//     `
//     SELECT DISTINCT h."id"
//     FROM "hosts" AS h
//     INNER JOIN "ports" AS p ON h."id" = p."host_id"
//     WHERE p."port" = :port
//   `,
//     {
//       replacements: { port: portNumber },
//       type: sequelize.QueryTypes.SELECT,
//     }
//   );

//   const hostIds = hostIdsResult.map((row) => row.id);

//   // Получаем полные данные для хостов через Sequelize
//   const hosts = await Host.findAll({
//     include: [
//       {
//         model: Port,
//         attributes: ["port", "type"],
//         include: [
//           {
//             model: WellKnownPort,
//             attributes: ["name"],
//             required: false,
//           },
//         ],
//       },
//       {
//         model: Priority,
//         attributes: ["id", "name"],
//         required: false,
//       },
//       {
//         model: Grouping,
//         attributes: ["id", "name"],
//         required: false,
//       },
//       {
//         model: Whois,
//         attributes: ["value"],
//         include: [
//           {
//             model: WhoisKey,
//             attributes: ["key_name"],
//             required: false,
//           },
//         ],
//         required: false,
//       },
//     ],
//     where: {
//       id: { [Op.in]: hostIds },
//     },
//     order: [
//       ["priority_id", "DESC"],
//       ["updated_at", "DESC"],
//     ],
//   });

//   return { uniquePorts, hosts };
// }

// // Вспомогательная функция для получения всех уникальных портов и хостов
// async function getAllUniquePortsAndHosts() {
//   // Используем raw SQL для получения уникальных портов
//   const rawUniquePortsResult = await sequelize.query(
//     `
//     SELECT DISTINCT p."port", COUNT(DISTINCT h."id") as "count", w."name" as "port_name"
//     FROM "ports" AS p
//     INNER JOIN "hosts" AS h ON p."host_id" = h."id"
//     LEFT JOIN "well_known_ports" AS w ON p."port" = w."port"
//     GROUP BY p."port", w."name"
//     ORDER BY p."port" ASC
//   `,
//     {
//       type: sequelize.QueryTypes.SELECT,
//     }
//   );

//   const uniquePorts = rawUniquePortsResult.map((row) => ({
//     dataValues: {
//       port: row.port,
//       count: row.count,
//       "WellKnownPort.name": row.port_name,
//     },
//   }));

//   // Получаем все хосты с полными данными через Sequelize
//   const hosts = await Host.findAll({
//     include: [
//       {
//         model: Port,
//         attributes: ["port", "type"],
//         include: [
//           {
//             model: WellKnownPort,
//             attributes: ["name"],
//             required: false,
//           },
//         ],
//       },
//       {
//         model: Priority,
//         attributes: ["id", "name"],
//         required: false,
//       },
//       {
//         model: Grouping,
//         attributes: ["id", "name"],
//         required: false,
//       },
//       {
//         model: Whois,
//         attributes: ["value"],
//         include: [
//           {
//             model: WhoisKey,
//             attributes: ["key_name"],
//             required: false,
//           },
//         ],
//         required: false,
//       },
//     ],
//     order: [
//       ["priority_id", "DESC"],
//       ["updated_at", "DESC"],
//     ],
//   });

//   return { uniquePorts, hosts };
// }

// // Вспомогательная функция для формирования ответа
// function buildResponse(items, pageNum, totalPages, totalCount, type, field) {
//   return {
//     items: items,
//     pagination: {
//       currentPage: pageNum,
//       totalPages: totalPages,
//       totalItems: totalCount,
//       hasNext: pageNum < totalPages,
//       hasPrev: pageNum > 1,
//     },
//     type: type,
//     field: field,
//   };
// }

// // Основная функция контроллера
// export const groupPort = async (req, res) => {
//   try {
//     // Get pagination parameters from request query
//     const { page = 1, limit = 10, port: portQuery } = req.query;
//     const pageNum = Math.max(1, parseInt(page, 10));
//     const pageSize = Math.min(100, Math.max(1, parseInt(limit, 10)));

//     let uniquePorts;
//     let hosts;

//     // Проверяем, есть ли фильтр по порту
//     if (portQuery !== undefined && portQuery !== "") {
//       // Обработка значений вида "21 (ftp)" - извлекаем число из скобок
//       let processedQuery = portQuery.trim();

//       // Проверяем формат "число (название)"
//       const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);

//       if (portWithNameMatch) {
//         // Если формат "21 (ftp)", используем только числовую часть
//         processedQuery = portWithNameMatch[1];
//       }

//       const isNumeric = /^\d+$/.test(processedQuery);

//       if (!isNumeric) {
//         return res.status(400).json({
//           error: "Для группировки портов необходим числовой порт",
//         });
//       }

//       const portNum = Number(processedQuery);
//       if (portNum < 1 || portNum > 65535) {
//         return res
//           .status(400)
//           .json({ error: "Порт должен быть числом от 1 до 65535" });
//       }

//       const result = await getUniquePortsAndHosts(processedQuery);
//       uniquePorts = result.uniquePorts;
//       hosts = result.hosts;
//     } else {
//       // Если фильтра нет, работаем как обычно
//       const result = await getAllUniquePortsAndHosts();
//       uniquePorts = result.uniquePorts;
//       hosts = result.hosts;
//     }

//     const totalCount = uniquePorts.length;

//     // Формируем карту отформатированных хостов для избежания дублирования
//     const formattedHostsMap = new Map();

//     hosts.forEach((host) => {
//       if (!formattedHostsMap.has(host.id)) {
//         formattedHostsMap.set(host.id, formatHostData(host));
//       }
//     });

//     // Группируем хосты по портам
//     const portGroups = {};

//     for (const portRecord of uniquePorts) {
//       const portNumber = portRecord.dataValues.port;
//       const portCount = portRecord.dataValues.count;

//       portGroups[portNumber] = {
//         port: parseInt(portNumber),
//         count: portCount,
//         name: portRecord.dataValues["WellKnownPort.name"] || null,
//         items: [],
//       };
//     }

//     // Группируем хосты по портам
//     for (const host of hosts) {
//       const formattedHost = formattedHostsMap.get(host.id);

//       if (formattedHost && host.Ports && Array.isArray(host.Ports)) {
//         for (const port of host.Ports) {
//           const portNumber = port.port;
//           if (portGroups[portNumber]) {
//             // Проверяем, что хост еще не добавлен в эту группу
//             const hostExists = portGroups[portNumber].items.some(
//               (item) => item.id === formattedHost.id
//             );
//             if (!hostExists) {
//               portGroups[portNumber].items.push(formattedHost);
//             }
//           }
//         }
//       }
//     }

//     // Сортируем хосты внутри каждой группы по приоритету
//     Object.values(portGroups).forEach((group) => {
//       sortItemsByPriority(group.items);
//     });

//     // Преобразуем в нужный формат и сортируем по возрастанию портов
//     let items = Object.values(portGroups)
//       .filter((group) => group.items.length > 0)
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
//     if (portQuery !== undefined && portQuery !== "") {
//       let processedQuery = portQuery.trim();
//       const portWithNameMatch = processedQuery.match(/^(\d+)\s*\((.*)\)$/);
//       if (portWithNameMatch) {
//         processedQuery = portWithNameMatch[1];
//       }

//       const portNum = Number(processedQuery);
//       const filteredItems = items.filter((item) => item.port === portNum);

//       if (filteredItems.length > 0) {
//         items = filteredItems;
//       } else {
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
//         message: "Нет данных",
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

//     const response = buildResponse(
//       items,
//       pageNum,
//       totalPages,
//       totalCount,
//       "group",
//       "port"
//     );

//     return res.json(response);
//   } catch (error) {
//     console.error("Ошибка в groupPort:", error);
//     return res.status(500).json({ error: "Внутренняя ошибка сервера" });
//   }
// };
