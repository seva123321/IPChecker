import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Оптимизированный список портов для массового сканирования
const OPTIMIZED_PORTS = '21,22,23,25,53,80,110,135,139,143,179,443,445,520,993,995,1723,3306,3389,5060,5432,5900,6379,8080,27017';


// /**
//  * Функция для сканирования открытых и отфильтрованных портов, а также получения информации о сервисах и ОС.
//  *
//  * @param {string} ip - IP-адрес, который нужно сканировать.
//  * @param {string} ports - Диапазон портов для сканирования (по умолчанию OPTIMIZED_PORTS).
//  * @returns {Promise<{ open: number[], filtered: number[], services: object, os: string }>} - Объект с массивами открытых и отфильтрованных портов, объектом сервисов и строкой ОС.
//  */
// export async function scanPortsSimple(ip, ports = OPTIMIZED_PORTS) {
//   try { //   nmap -sS -sU -T3 --max-hostgroup 100  <IP_адрес> 
//     const command = `nmap -p ${ports} -Pn --host-timeout 8s --max-rtt-timeout 500ms --max-retries 1 -O -sV ${ip}`;
//     // const command = `nmap -sS -sU -T3 -O -sV -D -p ${ports} -Pn --host-timeout 8s --max-rtt-timeout 500ms --max-retries 1  ${ip}`;
//     const { stdout } = await execAsync(command, { timeout: 10000 });
    
//     const openPorts = [];
//     const filteredPorts = [];
//     const services = {};
//     let osName = 'Не удалось определить ОС';
    
//     const lines = stdout.split('\n');
    
//     for (const line of lines) {
//       const portMatch = line.match(/(\d+)\/(tcp|udp)\s+(open|filtered)\s+[\w\s]+\s+([\w\s]+)/);
      
//       if (portMatch) {
//         const port = parseInt(portMatch[1]);
//         const state = portMatch[3];
//         const serviceName = portMatch[4].trim();
        
//         if (state === 'open') {
//           openPorts.push(port);
//           services[port] = { service: serviceName };
//         } else if (state === 'filtered') {
//           filteredPorts.push(port);
//         }
//       }
      
//       // Определение операционной системы
//       const osMatch = line.match(/OS CPE: cpe:/);
//       if (osMatch) {
//         osName = line.replace(/^.*?Description:\s*/, '').trim();
//         break;
//       }
//     }
//     console.log('services >> ', services, 'os >> ', os)
    
//     return { open: openPorts, filtered: filteredPorts, services, os: osName };
//   } catch (error) {
//     console.error(`Ошибка nmap для ${ip}:`, error.message);
//     return { open: [], filtered: [], services: {}, os: 'Не удалось определить ОС' };
//   }
// }


// без ос ! Рабочая версия
export async function scanPortsSimple(ip, ports = OPTIMIZED_PORTS) {
  try {
    // сканирования TCP и UDP включая версии сервисов и операционной системы
    //   nmap -sS -sU -T4 -O <IP_адрес>
    // Оптимизированные параметры nmap для скорости
    const command = `nmap -p ${ports} -Pn --host-timeout 8s --max-rtt-timeout 500ms --max-retries 1 ${ip}`;
    
    const { stdout } = await execAsync(command, { timeout: 10000 });

    const openPorts = [];
    const filteredPorts = [];

    const lines = stdout.split('\n');
    for (const line of lines) {
      const portMatch = line.match(/(\d+)\/(tcp|udp)\s+(open|filtered)\s+/);
      if (portMatch) {
        const port = parseInt(portMatch[1]);
        const state = portMatch[3];
        
        if (state === 'open') {
          openPorts.push(port);
        } else if (state === 'filtered') {
          filteredPorts.push(port);
        }
      }
    }

    return { open: openPorts, filtered: filteredPorts };
    
  } catch (error) {
    console.error(`Ошибка nmap для ${ip}:`, error.message);
    return { open: [], filtered: [] };
  }
}

/**
 * Объединенная функция сканирования nmap для проверки доступности и портов
 */
export async function scanPortsWithReachabilityCheck(ip, ports = OPTIMIZED_PORTS) {
  try {
    // Комбинированная команда nmap для проверки доступности и сканирования портов
    const command = `nmap -p ${ports} -Pn --host-timeout 8s --max-rtt-timeout 500ms --max-retries 1 ${ip}`;
    
    const { stdout } = await execAsync(command, { timeout: 10000 });
    
    const lines = stdout.split('\n');
    let hostIsUp = false;
    const openPorts = [];
    const filteredPorts = [];
    
    for (const line of lines) {
      // Проверка статуса хоста
      if (line.includes('Host is up')) {
        hostIsUp = true;
      }
      
      // Парсинг информации о портах
      const portMatch = line.match(/(\d+)\/(tcp|udp)\s+(open|filtered|closed)\s+/);
      if (portMatch) {
        const port = parseInt(portMatch[1]);
        const state = portMatch[3];
        
        if (state === 'open') {
          openPorts.push(port);
        } else if (state === 'filtered') {
          filteredPorts.push(port);
        }
      }
      
      // Альтернативный формат вывода nmap
      const altPortMatch = line.match(/^(\d+)\/(tcp|udp)\s+(\w+)/);
      if (altPortMatch && !portMatch) {
        const port = parseInt(altPortMatch[1]);
        const state = altPortMatch[3];
        
        if (state === 'open') {
          openPorts.push(port);
        } else if (state === 'filtered') {
          filteredPorts.push(port);
        }
      }
    }
    
    // Если в выводе нет явного 'Host is up', но есть открытые порты, считаем хост доступным
    if (!hostIsUp && openPorts.length > 0) {
      hostIsUp = true;
    }
    
    return { 
      open: openPorts, 
      filtered: filteredPorts,
      reachable: hostIsUp 
    };
    
  } catch (error) {
    console.error(`Ошибка сканирования ${ip}:`, error.message);
    return { open: [], filtered: [], reachable: false };
  }
}


export async function scanVersionDetection(ip, ports = OPTIMIZED_PORTS) {
  try {
    const command = `nmap -sV -p ${ports} -Pn --host-timeout 15s ${ip}`;
    console.log(`Версионное сканирование для ${ip}: ${command}`);
    
    const { stdout } = await execAsync(command, { timeout: 20000 });

    const serviceVersions = [];
    const lines = stdout.split('\n');

    // Улучшенный парсинг для версионного сканирования
    for (const line of lines) {
      // Более гибкий regex для разных форматов вывода
      const match = line.match(/^(\d+)\/(tcp|udp)\s+(\w+)\s+(\w*)\s*(.*)$/);
      if (match) {
        const port = parseInt(match[1]);
        const protocol = match[2];
        const state = match[3];
        const service = match[4] || 'unknown';
        const serviceInfo = match[5].trim();

        serviceVersions.push({
          port,
          protocol,
          state,
          service,
          serviceInfo
        });
      }
    }

    console.log(`Версионное сканирование для ${ip}: найдено ${serviceVersions.length} сервисов`);
    return serviceVersions;
    
  } catch (error) {
    console.error(`Ошибка версионного сканирования для ${ip}:`, error.message);
    return [];
  }
}

export async function getOS(ip) {
  try {
    const command = `nmap -O ${ip}`;
    
    const { stdout } = await execAsync(command, { timeout: 10000 });
    
    let osName = 'Не удалось определить ОС';
    
    const lines = stdout.split('\n');
    
    for (const line of lines) {
      const osMatch = line.match(/OS CPE: cpe:/);
      
      if (osMatch) {
        osName = line.replace(/^.*?Description:\s*/, '').trim();
        break;
      }
    }
    
    return osName;
  } catch (error) {
    console.error(`Ошибка при определении ОС для ${ip}:`, error.message);
    return 'Не удалось определить ОС';
  }
}

// РАБОЧИЙ НО НЕ ДЛЯ БОЛЬШИХ ОБЪЕМОВ
// import { exec } from 'child_process';
// import { promisify } from 'util';

// const execAsync = promisify(exec);

// export async function scanPortsSimple(ip, ports = '21,22,23,25,53,80,110,135,139,143,443,445,587,993,995,1723,3306,3389,5432,5900,6379,8080,27017') {
//   try {
//     const command = `nmap -p ${ports} -Pn --host-timeout 10s ${ip}`;
//     console.log(`Сканируем порты для ${ip}: ${command}`);
    
//     const { stdout } = await execAsync(command, { timeout: 15000 });

//     const openPorts = [];
//     const filteredPorts = [];

//     // Улучшенный парсинг вывода nmap
//     const lines = stdout.split('\n');
    
//     for (const line of lines) {
//       // Ищем строки с информацией о портах
//       const portMatch = line.match(/(\d+)\/(tcp|udp)\s+(open|filtered|closed)\s+/);
//       if (portMatch) {
//         const port = parseInt(portMatch[1]);
//         const state = portMatch[3];
        
//         if (state === 'open' && !openPorts.includes(port)) {
//           openPorts.push(port);
//         } else if (state === 'filtered' && !filteredPorts.includes(port)) {
//           filteredPorts.push(port);
//         }
//       }
      
//       // Дополнительный парсинг для verbose вывода
//       const verboseMatch = line.match(/^(\d+)\/(tcp|udp).*filtered/);
//       if (verboseMatch && !portMatch) {
//         const port = parseInt(verboseMatch[1]);
//         if (!filteredPorts.includes(port)) {
//           filteredPorts.push(port);
//         }
//       }
//     }

//     console.log(`Результат для ${ip}: открыто ${openPorts.length}, фильтровано ${filteredPorts.length}`);
//     return { open: openPorts, filtered: filteredPorts };
    
//   } catch (error) {
//     console.error(`Ошибка nmap для ${ip}:`, error.message);
//     return { open: [], filtered: [] };
//   }
// }

// export async function scanVersionDetection(ip, ports = '21,22,23,25,53,80,110,135,139,143,443,445,587,993,995,1723,3306,3389,5432,5900,6379,8080,27017') {
//   try {
//     const command = `nmap -sV -p ${ports} -Pn --host-timeout 15s ${ip}`;
//     console.log(`Версионное сканирование для ${ip}: ${command}`);
    
//     const { stdout } = await execAsync(command, { timeout: 20000 });

//     const serviceVersions = [];
//     const lines = stdout.split('\n');

//     // Улучшенный парсинг для версионного сканирования
//     for (const line of lines) {
//       // Более гибкий regex для разных форматов вывода
//       const match = line.match(/^(\d+)\/(tcp|udp)\s+(\w+)\s+(\w*)\s*(.*)$/);
//       if (match) {
//         const port = parseInt(match[1]);
//         const protocol = match[2];
//         const state = match[3];
//         const service = match[4] || 'unknown';
//         const serviceInfo = match[5].trim();

//         serviceVersions.push({
//           port,
//           protocol,
//           state,
//           service,
//           serviceInfo
//         });
//       }
//     }

//     console.log(`Версионное сканирование для ${ip}: найдено ${serviceVersions.length} сервисов`);
//     return serviceVersions;
    
//   } catch (error) {
//     console.error(`Ошибка версионного сканирования для ${ip}:`, error.message);
//     return [];
//   }
// }

// // Функция для сканирования портов без использования libnmap
// // Это пример простого сканирования портов с использованием nmap через exec
// export async function scanPortsSimple(ip, ports = '21,22,23,25,53,80,110,135,139,143,443,445,993,995,1723,3306,3389,5900,8080') {
//   try {
//     // Пример: запуск nmap через exec
//     // Обратите внимание: этот метод может быть менее надежным и медленным
//     // Если nmap не установлен или нет прав, будет ошибка
//     const command = `nmap -p ${ports} -Pn --host-timeout 10s ${ip}`;
//     console.log(`Выполняем команду: ${command}`);
//     const { stdout, stderr } = await execAsync(command, { timeout: 15000 }); // Таймаут 15 секунд

//     // Парсинг вывода (примерный парсинг, зависит от формата вывода nmap)
//     // Это очень упрощенный пример, в реальности нужен более точный парсер
//     const openPorts = [];
//     const filteredPorts = [];

//     const lines = stdout.split('\n');
//     lines.forEach(line => {
//       // Пример: "80/tcp open  http"
//       const match = line.match(/(\d+)\/(tcp|udp)\s+(open|filtered)\s+/);
//       if (match) {
//         const port = parseInt(match[1]);
//         const state = match[3];
//         if (state === 'open') {
//           openPorts.push(port);
//         } else if (state === 'filtered') {
//           filteredPorts.push(port);
//         }
//       }
//     });

//     console.log(`Парсинг портов для ${ip}: открыто ${openPorts.length}, фильтровано ${filteredPorts.length}`);
//     return { open: openPorts, filtered: filteredPorts };
//   } catch (e) {
//     console.error(`Nmap error for ${ip}:`, e.message);
//     // Возвращаем пустые массивы в случае ошибки
//     return { open: [], filtered: [] };
//   }
// }


// import pkg from 'libnmap';
// const { scan } = pkg;

// export async function scanPorts(ip, ports = '21,22,23,25,53,80,110,135,139,143,443,445,993,995,1723,3306,3389,5900,8080') {
//   try {
//     // Добавляем проверку на существование функции scan
//     if (typeof scan !== 'function') {
//       console.error(`Функция scan не определена`);
//       return { open: [], filtered: [] };
//     }

//     const report = await scan({ range: [ip], ports, flags: ['-Pn'] }); // -Pn = treat as online
//     const host = report && report[0]; // Добавляем проверку на существование report
//     if (!host) return { open: [], filtered: [] };

//     // Добавляем дополнительную проверку на массивы
//     const openPorts = Array.isArray(host.openPorts) ? host.openPorts.map(p => p.port) : [];
//     const filteredPorts = Array.isArray(host.filteredPorts) ? host.filteredPorts.map(p => p.port) : [];

//     // Проверяем, что все элементы массивов - числа
//     const validOpenPorts = openPorts.filter(port => typeof port === 'number' && port >= 1 && port <= 65535);
//     const validFilteredPorts = filteredPorts.filter(port => typeof port === 'number' && port >= 1 && port <= 65535);

//     return {
//       open: validOpenPorts,
//       filtered: validFilteredPorts
//     };
//   } catch (e) {
//     console.error(`Nmap error for ${ip}:`, e.message);
//     // Возвращаем пустые массивы в случае ошибки
//     return { open: [], filtered: [] };
//   }
// }