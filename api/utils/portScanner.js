import { exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

export async function scanPortsSimple(ip, ports = '21,22,23,25,53,80,110,135,139,143,443,445,993,995,1723,3306,3389,5900,8080') {
  try {
    const command = `nmap -p ${ports} -Pn --host-timeout 10s ${ip}`;
    console.log(`Выполняем команду: ${command}`);
    const { stdout, stderr } = await execAsync(command, { timeout: 15000 });

    const openPorts = [];
    const filteredPorts = [];

    const lines = stdout.split('\n');
    lines.forEach(line => {
      const match = line.match(/(\d+)\/(tcp|udp)\s+(open|filtered)\s+/);
      if (match) {
        const port = parseInt(match[1]);
        const state = match[3];
        if (state === 'open') {
          openPorts.push(port);
        } else if (state === 'filtered') {
          filteredPorts.push(port);
        }
      }
    });

    console.log(`Парсинг портов для ${ip}: открыто ${openPorts.length}, фильтровано ${filteredPorts.length}`);
    return { open: openPorts, filtered: filteredPorts };
  } catch (e) {
    console.error(`Nmap error for ${ip}:`, e.message);
    return { open: [], filtered: [] };
  }
}

// Новая функция для сканирования версий сервисов
export async function scanVersionDetection(ip, ports = '21,22,23,25,53,80,110,135,139,143,443,445,993,995,1723,3306,3389,5900,8080') {
  try {
    // Используем nmap с флагом -sV для версионного сканирования
    const command = `nmap -sV -p ${ports} -Pn --host-timeout 15s ${ip}`;
    console.log(`Выполняем команду версионного сканирования: ${command}`);
    const { stdout, stderr } = await execAsync(command, { timeout: 20000 }); // Таймаут 20 секунд

    // Парсинг вывода
    // Пример строки из вывода: "22/tcp open  ssh        OpenSSH 8.9p1 Ubuntu 3ubuntu0.1"
    // Или "80/tcp open  http       Apache httpd 2.4.41 ((Ubuntu))"
    const serviceVersions = [];

    const lines = stdout.split('\n');
    // Ищем строки, начинающиеся с номера порта
    lines.forEach(line => {
      // Регулярное выражение для извлечения порта, состояния, сервиса и версии
      // Это упрощенный пример, реальный парсер может быть сложнее
      // Пример: 22/tcp open  ssh        OpenSSH 8.9p1 Ubuntu 3ubuntu0.1
      const match = line.match(/^(\d+)\/(\w+)\s+(\w+)\s+(.*)$/);
      if (match) {
        const port = parseInt(match[1]);
        const protocol = match[2];
        const state = match[3];
        const serviceInfo = match[4].trim(); // Информация о сервисе и версии

        // Добавляем в массив
        serviceVersions.push({
          port,
          protocol,
          state,
          serviceInfo // Полная строка с информацией о сервисе и версии
        });
      }
    });

    console.log(`Парсинг версий сервисов для ${ip}: найдено ${serviceVersions.length} записей`);
    return serviceVersions; // Возвращаем массив объектов с информацией о сервисах и версиях
  } catch (e) {
    console.error(`Ошибка версионного сканирования для ${ip}:`, e.message);
    // Возвращаем пустой массив в случае ошибки
    return [];
  }
}


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