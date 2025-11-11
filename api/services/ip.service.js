// services/files.service.js

import { exec } from "child_process";
import { promisify } from "util";

import { Host, Port, Whois, WhoisKey, WellKnownPort } from "../models/index.js";


const execAsync = promisify(exec); // For executing shell commands

export default class IpService {
  static async getGroupIp() {
    try {
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
        ],
        order: [["updated_at", "DESC"]],
      });

      const items = hosts.map((host) => {
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
        };
      });

      return { items };
    } catch (error) {
      console.error("Ошибка в getFileDb:", error);
      throw new Error("Ошибка при получении данных из БД");
    }
  }
}
// // services/files.service.js
// import fs from "fs";
// import path from "path";
// import { exec } from "child_process";
// import { promisify } from "util";
// import FileRepository from "../repositories/files.repository.js";
// import {
//   checkReachability,
//   scanPortsSimple,
//   isLocalIp,
//   WhoisClient,
// } from "../utils/scanner.js"; // Убран scanPorts
// import pLimit from "p-limit"; // Импортируем p-limit

// const execAsync = promisify(exec); // For executing shell commands

// export default class FileService {
//   static async searchIP(fileContent) {
//     try {
//       // Извлечение IP-адресов из содержимого файла
//       // Регулярное выражение для извлечения IP-адресов из формата "IP (Comment) TAB PORT"
//       const ipRegex =
//         /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
//       const ipMatches = fileContent.match(ipRegex);
//       const uniqueIPs = [...new Set(ipMatches)]; // Убираем дубликаты

//       if (!uniqueIPs || uniqueIPs.length === 0) {
//         console.warn("В файле не найдено IP-адресов.");
//         return { message: "IP-адреса не найдены в файле." };
//       }

//       console.log(`Найдено уникальных IP-адресов: ${uniqueIPs.length}`);
//       // console.log("IP-адреса:", uniqueIPs);

//       // Ограничиваем количество одновременных задач для предотвращения перегрузки
//       const limit = pLimit(5); // Максимум 5 одновременных задачи

//       // Разбиваем IP-адреса на части для обработки по частям (например, по 100)
//       const chunkSize = 100;
//       const chunks = [];
//       for (let i = 0; i < uniqueIPs.length; i += chunkSize) {
//         chunks.push(uniqueIPs.slice(i, i + chunkSize));
//       }

//       let allResults = [];
//       let successfulCount = 0;
//       let failedCount = 0;

//       // Обрабатываем каждую часть
//       for (let i = 0; i < chunks.length; i++) {
//         const chunk = chunks[i];
//         console.log(
//           `Обрабатываем часть ${i + 1}/${chunks.length} (${chunk.length} IP)`
//         );

//         const chunkResults = await Promise.allSettled(
//           chunk.map((ip) => {
//             // Проверяем, является ли IP локальным
//             if (isLocalIp(ip)) {
//               // console.log(`IP ${ip} является локальным, пропускаем.`);
//               return Promise.resolve({ ip, error: "Local IP address skipped" });
//             }

//             // Используем limit для ограничения параллелизма внутри части
//             return limit(async () => {
//               try {
//                 // Проверяем доступность хоста
//                 const reachable = await checkReachability(ip, 1000);
//                 // console.log(`Хост ${ip} доступен: ${reachable}`);

//                 // Сканируем порты (используем упрощенную реализацию)
//                 let portScanResult = { open: [], filtered: [] };
//                 try {
//                   // Используем упрощенную функцию сканирования
//                   portScanResult = await Promise.race([
//                     scanPortsSimple(ip),
//                     new Promise(
//                       (_, reject) =>
//                         setTimeout(() => reject(new Error("Timeout")), 15000) // Таймаут 15 секунд
//                     ),
//                   ]);
//                 } catch (timeoutError) {
//                   console.warn(
//                     `Таймаут сканирования портов для ${ip}:`,
//                     timeoutError.message
//                   );
//                   // Продолжаем без портов
//                 }
//                 // console.log(`Сканирование портов для ${ip}:`, portScanResult);

//                 // Получаем WHOIS информацию
//                 const whoisClient = new WhoisClient();
//                 const whoisData = await whoisClient.getWhois(ip);
//                 // console.log(`WHOIS данные для ${ip}:`, whoisData); // ДЕТАЛЬНАЯ ИНФ

//                 // Подготавливаем данные для вставки в БД
//                 const dbData = {
//                   ip: ip,
//                   reachable: reachable,
//                   openPorts: portScanResult.open || [],
//                   filteredPorts: portScanResult.filtered || [],
//                   whoisData: whoisData || {},
//                 };

//                 // Добавляем данные в БД
//                 await FileService.addedJSONoneObj(dbData);

//                 return { ip, success: true };
//               } catch (scanError) {
//                 // console.error(`Ошибка при обработке IP ${ip}:`, scanError);
//                 return { ip, error: scanError.message };
//               }
//             });
//           })
//         );

//         // Собираем результаты части
//         allResults = allResults.concat(chunkResults);
//         const successfulInChunk = chunkResults.filter(
//           (r) => r.status === "fulfilled" && r.value.error === undefined
//         ).length;
//         const failedInChunk = chunkResults.filter(
//           (r) => r.status === "rejected" || r.value.error !== undefined
//         ).length;
//         successfulCount += successfulInChunk;
//         failedCount += failedInChunk;
//         // console.log(`Часть ${i + 1} обработана: Успешно ${successfulInChunk}, Неудачно ${failedInChunk}`);
//       }

//       // Логирование результатов
//       console.log(
//         `Обработка завершена. Всего: ${uniqueIPs.length}, Успешно: ${successfulCount}, Неудачно: ${failedCount}`
//       );

//       return {
//         message: `Обработка завершена. Всего: ${uniqueIPs.length}, Успешно: ${successfulCount}, Неудачно: ${failedCount}`,
//         successful: allResults
//           .filter(
//             (r) => r.status === "fulfilled" && r.value.error === undefined
//           )
//           .map((r) => r.value.ip),
//         failed: allResults
//           .filter((r) => r.status === "rejected" || r.value.error !== undefined)
//           .map((r) => ({
//             ip: r.value?.ip || "unknown",
//             error: r.reason?.message || r.value?.error || "Unknown error",
//           })),
//       };
//     } catch (error) {
//       console.error("Ошибка в searchIP:", error);
//       throw new Error(
//         "Ошибка при поиске и обработке IP-адресов: " + error.message
//       );
//     }
//   }

//   static async addedJSONfile(fileContentRes) {
//     try {
//       console.log("JSON.parse(fileContent) > ", JSON.parse(fileContentRes));
//       const fileContent = JSON.parse(fileContentRes);

//       if (!Array.isArray(fileContent.items)) {
//         throw new Error("Неверный формат данных JSON для добавления в БД.");
//       }

//       for (const item of fileContent.items) {
//         const ip = item.ip;
//         const reachable = item.reachable;
//         const openPorts = Array.isArray(item.port_data.open)
//           ? item.port_data.open
//           : [];
//         const filteredPorts = Array.isArray(item.port_data.filtered)
//           ? item.port_data.filtered
//           : [];
//         const whoisData = item.whois || {};

//         if (!ip) {
//           throw new Error("IP адрес отсутствует в данных.");
//         }

//         const whoisJsonb = JSON.stringify(whoisData);
//         await FileRepository.setJSONData({
//           ip,
//           reachable,
//           openPorts,
//           filteredPorts,
//           whoisData: whoisJsonb,
//         });
//         console.log(`Данные для IP ${ip} успешно добавлены в БД.`);
//       }
//     } catch (error) {
//       console.error("Ошибка в addedJSONfile:", error);
//       throw new Error(
//         "Ошибка при добавлении JSON данных в БД: " + error.message
//       );
//     }
//   }

//   static async addedJSONoneObj(fileContent) {
//     try {
//       const ip = fileContent.ip;
//       const reachable = fileContent.reachable;
//       const openPorts = Array.isArray(fileContent.port_data.open)
//         ? fileContent.port_data.open
//         : [];
//       const filteredPorts = Array.isArray(fileContent.port_data.filtered)
//         ? fileContent.port_data.filtered
//         : [];
//       const whoisData = fileContent.whois || {};

//       if (!ip) {
//         throw new Error("IP адрес отсутствует в данных.");
//       }

//       const whoisJsonb = JSON.stringify(whoisData);

//       await FileRepository.setJSONData({
//         ip,
//         reachable,
//         openPorts,
//         filteredPorts,
//         whoisData: whoisJsonb,
//       });

//       console.log(`Данные для IP ${ip} успешно добавлены в БД.`);
//     } catch (error) {
//       console.error("Ошибка в addedJSONoneObj:", error);
//       throw new Error(
//         "Ошибка при добавлении JSON данных в БД: " + error.message
//       );
//     }
//   }

//   // Новая функция для сканирования версий сервисов по IP
//   static async scanVersionDetection(ip) {
//     try {
//       console.log(`Запуск сканирования версий для IP: ${ip}`);
//       // Проверяем, является ли IP локальным
//       if (isLocalIp(ip)) {
//         console.log(`IP ${ip} является локальным, пропускаем сканирование.`);
//         return { ip, error: "Local IP address skipped for version scan" };
//       }

//       // Проверяем доступность хоста перед сканированием версий
//       const reachable = await checkReachability(ip, 1000);
//       if (!reachable) {
//         console.log(`Хост ${ip} недоступен, пропускаем сканирование версий.`);
//         return { ip, error: "Host is not reachable for version scan" };
//       }

//       // Сканируем версии сервисов
//       let versionScanResult = [];
//       try {
//         // Используем scanVersionDetection для получения информации о версиях
//         // Добавляем таймаут для безопасности
//         versionScanResult = await Promise.race([
//           scanVersionDetection(ip),
//           new Promise(
//             (_, reject) => setTimeout(() => reject(new Error("Timeout")), 20000) // Таймаут 20 секунд
//           ),
//         ]);
//       } catch (timeoutError) {
//         console.warn(
//           `Таймаут версионного сканирования для ${ip}:`,
//           timeoutError.message
//         );
//         return { ip, error: "Version scan timeout" };
//       }
//       console.log(`Версионное сканирование для ${ip}:`, versionScanResult);

//       // Возвращаем результат
//       return {
//         ip: ip,
//         serviceVersions: versionScanResult || [],
//         message: `Version scan completed for ${ip}`,
//       };
//     } catch (error) {
//       console.error(`Ошибка при версионном сканировании IP ${ip}:`, error);
//       return { ip, error: error.message };
//     }
//   }
// }


/*
// services/files.service.js
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import FileRepository from "../repositories/files.repository.js";
import {
  checkReachability,
  scanPortsSimple,
  isLocalIp,
  WhoisClient,
} from "../utils/scanner.js"; // Убран scanPorts
import pLimit from "p-limit"; // Импортируем p-limit

const execAsync = promisify(exec); // For executing shell commands

export default class FileService {
  static async searchIP(fileContent) {
    try {
      // Извлечение IP-адресов из содержимого файла
      const ipRegex =
        /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
      const ipMatches = fileContent.match(ipRegex);
      if (!ipMatches || ipMatches.length === 0) {
        console.warn("В файле не найдено IP-адресов.");
        return { message: "IP-адреса не найдены в файле." };
      }

      const uniqueIPs = [...new Set(ipMatches)]; // Убираем дубликаты
      console.log(`Найдено уникальных IP-адресов: ${uniqueIPs.length}`);

      const limit = pLimit(5); // Ограничиваем количество одновременных задач для предотвращения перегрузки
      const chunkSize = 100;
      const chunks = [];
      for (let i = 0; i < uniqueIPs.length; i += chunkSize) {
        chunks.push(uniqueIPs.slice(i, i + chunkSize));
      }

      let allResults = [];
      let successfulCount = 0;
      let failedCount = 0;

      // Обрабатываем каждую часть
      for (let i = 0; i < chunks.length; i++) {
        const chunk = chunks[i];
        console.log(
          `Обрабатываем часть ${i + 1}/${chunks.length} (${chunk.length} IP)`
        );

        const chunkResults = await Promise.allSettled(
          chunk.map((ip) => {
            return limit(async () => {
              if (isLocalIp(ip)) {
                return { ip, error: "Local IP address skipped" };
              }

              const reachable = await checkReachability(ip, 1000);
              if (!reachable) {
                return { ip, error: "Host is not reachable" };
              }

              let portData = {};
              try {
                portData = await scanPortsSimple(ip);
              } catch (error) {
                console.error(
                  `Ошибка при сканировании портов для IP ${ip}:`,
                  error
                );
              }

              const whoisClient = new WhoisClient();
              let whoisData;
              try {
                whoisData = await whoisClient.lookup(ip);
              } catch (error) {
                console.error(
                  `Ошибка при получении WHOIS данных для IP ${ip}:`,
                  error
                );
              }

              const item = {
                ip,
                reachable,
                port_data: portData,
                whois: whoisData,
              };

              return FileService.itemJsonParser(item);
            });
          })
        );

        allResults = allResults.concat(chunkResults);

        successfulCount += chunkResults.filter(
          (r) => r.status === "fulfilled" && !r.value.error
        ).length;

        failedCount += chunkResults.filter(
          (r) => r.status === "rejected"
        ).length;
      }

      // Логирование результатов
      console.log(
        `Обработка завершена. Всего: ${uniqueIPs.length}, Успешно: ${successfulCount}, Неудачно: ${failedCount}`
      );

      return {
        message: `Обработка завершена. Всего: ${uniqueIPs.length}, Успешно: ${successfulCount}, Неудачно: ${failedCount}`,
        successful: allResults
          .filter((r) => r.status === "fulfilled" && !r.value.error)
          .map((r) => r.value),
        failed: allResults
          .filter((r) => r.status === "rejected")
          .map((r) => ({
            ip: r.reason?.ip || "unknown",
            error: r.reason?.message || "Unknown error",
          })),
      };
    } catch (error) {
      console.error("Ошибка в searchIP:", error);
      throw new Error(
        "Ошибка при поиске и обработке IP-адресов: " + error.message
      );
    }
  }
  static async itemJsonParser(item) {
    const ip = item.ip || null; // Обеспечиваем наличие поля ip
    if (!ip) {
      throw new Error("IP address is missing.");
    }
    
    const reachable = item.reachable || false;
    const openPorts = Array.isArray(item.port_data.open)
      ? item.port_data.open
      : [];
    const filteredPorts = Array.isArray(item.port_data.filtered)
      ? item.port_data.filtered
      : [];
    const whoisData = item.whois || {};
    const whoisJsonb = JSON.stringify(whoisData);
  
    return {
      ip,
      reachable,
      open_ports: openPorts,
      filtered_ports: filteredPorts,
      whois_data: whoisJsonb
    };
  }

  static async addedJSONfile(fileContentRes) {
    try {
      console.log("JSON.parse(fileContent) > ", JSON.parse(fileContentRes));
      const fileContent = JSON.parse(fileContentRes);
      if (!Array.isArray(fileContent.items)) {
        throw new Error("Неверный формат данных JSON для добавления в БД.");
      }
      for (const item of fileContent.items) {
        if (!item.ip) {
          throw new Error("IP адрес отсутствует в данных.");
        }
        const data = FileService.itemJsonParser(item);
        await FileRepository.setJSONData(data);
        console.log(`Данные для IP ${data.ip} успешно добавлены в БД.`);
      }
    } catch (error) {
      console.error("Ошибка в addedJSONfile:", error);
      throw new Error(
        "Ошибка при добавлении JSON данных в БД: " + error.message
      );
    }
  }

  static async addedJSONoneObj(fileContent) {
    try {
      if (!fileContent.ip) {
        throw new Error("IP адрес отсутствует в данных.");
      }
      const data = FileService.itemJsonParser(fileContent);
      await FileRepository.setJSONData(data);
      console.log(`Данные для IP ${data.ip} успешно добавлены в БД.`);
    } catch (error) {
      console.error("Ошибка в addedJSONoneObj:", error);
      throw new Error(
        "Ошибка при добавлении JSON данных в БД: " + error.message
      );
    }
  }

  // Новая функция для сканирования версий сервисов по IP
  static async scanVersionDetection(ip) {
    try {
      console.log(`Запуск сканирования версий для IP: ${ip}`);
      if (isLocalIp(ip)) {
        console.log(`IP ${ip} является локальным, пропускаем сканирование.`);
        return { ip, error: "Local IP address skipped for version scan" };
      }

      const reachable = await checkReachability(ip, 1000);
      if (!reachable) {
        console.log(`Хост ${ip} недоступен, пропускаем сканирование версий.`);
        return { ip, error: "Host is not reachable for version scan" };
      }

      let versionScanResult = [];
      try {
        // Предполагается, что scanVersionDetection определена в scanner.js
        versionScanResult = await Promise.race([
          scanVersionDetection(ip),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error("Timeout")), 20000)
          ),
        ]);
      } catch (timeoutError) {
        console.warn(
          `Таймаут версионного сканирования для ${ip}:`,
          timeoutError.message
        );
        return { ip, error: "Version scan timeout" };
      }

      console.log(`Версионное сканирование для ${ip}:`, versionScanResult);

      return {
        ip,
        service_versions: versionScanResult || [],
        message: `Version scan completed for ${ip}`,
      };
    } catch (error) {
      console.error(`Ошибка при версионном сканировании IP ${ip}:`, error);
      return { ip, error: error.message };
    }
  }
}
*/