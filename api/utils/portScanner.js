import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

// Оптимизированный список портов для массового сканирования
const OPTIMIZED_PORTS = '21,22,23,25,53,80,110,135,139,143,179,443,445,520,993,995,1723,3306,3389,5060,5432,5900,6379,8080,27017';

export async function scanPortsSimple(ip, ports = OPTIMIZED_PORTS) {
  try {
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