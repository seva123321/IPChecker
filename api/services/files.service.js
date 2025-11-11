// services/files.service.js
import fs from "fs";
import path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import pLimit from "p-limit";
import FileRepository from "../repositories/files.repository.js";
import {
  checkReachability,
  scanPortsSimple, // Убедитесь, что эта функция определена
  isLocalIp,
  WhoisClient,
} from "../utils/scanner.js";
import { Op } from 'sequelize';
import { Host, Port, Whois, WhoisKey, WellKnownPort } from "../models/index.js";


const execAsync = promisify(exec); // For executing shell commands

export default class FileService {
  static async searchIP(fileContent) {
    try {
      // Извлечение IP-адресов из содержимого файла
      const ipRegex =
        /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
      const ipMatches = fileContent.match(ipRegex);
      const uniqueIPs = [...new Set(ipMatches)]; // Убираем дубликаты

      if (!uniqueIPs || uniqueIPs.length === 0) {
        console.warn("В файле не найдено IP-адресов.");
        return { message: "IP-адреса не найдены в файле." };
      }

      console.log(`Найдено уникальных IP-адресов: ${uniqueIPs.length}`);

      // Ограничиваем количество одновременных задач для предотвращения перегрузки
      const limit = pLimit(5); // Максимум 5 одновременных задачи

      // Разбиваем IP-адреса на части для обработки по частям (например, по 100)
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
            // Проверяем, является ли IP локальным
            if (isLocalIp(ip)) {
              return Promise.resolve({ ip, error: "Local IP address skipped" });
            }

            // Используем limit для ограничения параллелизма внутри части
            return limit(async () => {
              try {
                // Проверяем доступность хоста
                const reachable = await checkReachability(ip, 1000);

                // Сканируем порты (используем упрощенную реализацию)
                let portScanResult = { open: [], filtered: [] };
                try {
                  // Используем упрощенную функцию сканирования
                  portScanResult = await Promise.race([
                    scanPortsSimple(ip),
                    new Promise(
                      (_, reject) =>
                        setTimeout(() => reject(new Error("Timeout")), 15000) // Таймаут 15 секунд
                    ),
                  ]);
                } catch (timeoutError) {
                  console.warn(
                    `Таймаут сканирования портов для ${ip}:`,
                    timeoutError.message
                  );
                  // Продолжаем без портов
                }

                // Получаем WHOIS информацию
                const whoisClient = new WhoisClient();
                const whoisData = await whoisClient.getWhois(ip);
                // console.log(`WHOIS данные для ${ip}:`, whoisData); // ДЕТАЛЬНАЯ ИНФ

                // Подготавливаем данные для вставки в БД
                const dbData = {
                  ip: ip,
                  reachable: reachable,
                  port_data: portScanResult, // Используем объект portScanResult напрямую
                  whois: whoisData || {}, // Используем поле whois напрямую
                };

                // Добавляем данные в БД
                await FileService.addedJSONoneObj(dbData);

                return { ip, success: true };
              } catch (scanError) {
                console.error(`Ошибка при обработке IP ${ip}:`, scanError);
                return { ip, error: scanError.message };
              }
            });
          })
        );

        // Собираем результаты части
        allResults = allResults.concat(chunkResults);
        const successfulInChunk = chunkResults.filter(
          (r) => r.status === "fulfilled" && r.value.error === undefined
        ).length;
        const failedInChunk = chunkResults.filter(
          (r) => r.status === "rejected" || r.value.error !== undefined
        ).length;
        successfulCount += successfulInChunk;
        failedCount += failedInChunk;
      }

      // Логирование результатов
      console.log(
        `Обработка завершена. Всего: ${uniqueIPs.length}, Успешно: ${successfulCount}, Неудачно: ${failedCount}`
      );

      return {
        message: `Обработка завершена. Всего: ${uniqueIPs.length}, Успешно: ${successfulCount}, Неудачно: ${failedCount}`,
        successful: allResults
          .filter(
            (r) => r.status === "fulfilled" && r.value.error === undefined
          )
          .map((r) => r.value.ip),
        failed: allResults
          .filter((r) => r.status === "rejected" || r.value.error !== undefined)
          .map((r) => ({
            ip: r.value?.ip || "unknown",
            error: r.reason?.message || r.value?.error || "Unknown error",
          })),
      };
    } catch (error) {
      console.error("Ошибка в searchIP:", error);
      throw new Error(
        "Ошибка при поиске и обработке IP-адресов: " + error.message
      );
    }
  }

  static async addedJSONfile(fileContentRes) {
    try {
      const fileContent = JSON.parse(fileContentRes);

      if (!Array.isArray(fileContent.items)) {
        throw new Error("Неверный формат данных JSON для добавления в БД.");
      }

      for (const item of fileContent.items) {
        const ip = item.ip;
        const reachable = item.reachable;
        // Исправление: корректная обработка port_data
        const portData = item.port_data || {};
        const openPorts = Array.isArray(portData.open)
          ? portData.open
          : [];
        const filteredPorts = Array.isArray(portData.filtered)
          ? portData.filtered
          : [];
        const whoisData = item.whois || {};

        if (!ip) {
          throw new Error("IP адрес отсутствует в данных.");
        }

        const whoisJsonb = JSON.stringify(whoisData);
        await FileRepository.setJSONData({
          ip,
          reachable,
          openPorts,
          filteredPorts,
          whoisData: whoisJsonb,
        });
        console.log(`Данные для IP ${ip} успешно добавлены в БД.`);
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

    // Извлекаем данные из входного объекта
    const ip = fileContent.ip;
    const reachable = fileContent.reachable;
    const portData = fileContent.port_data || {};
    const openPorts = Array.isArray(portData.open) ? portData.open : [];
    const filteredPorts = Array.isArray(portData.filtered) ? portData.filtered : [];
    const whoisData = fileContent.whois || {};

    if (!ip) {
      throw new Error("IP адрес отсутствует в данных.");
    }

    // Находим или создаем хост
    let host = await Host.findOne({ where: { ip: ip } });
    if (!host) {
      host = await Host.create({ ip: ip, reachable: reachable });
    } else {
      // Обновляем поле reachable, если оно изменилось
      if (host.reachable !== reachable) {
        host.reachable = reachable;
        await host.save();
      }
    }

    // Удаляем старые порты для этого хоста
    await Port.destroy({ where: { host_id: host.id } });

    // Добавляем новые порты
    const openPortPromises = openPorts.map(port => 
      Port.findOrCreate({
        where: { host_id: host.id, port: port },
        defaults: { host_id: host.id, port: port, type: 'open' }
      })
    );
    
    const filteredPortPromises = filteredPorts.map(port => 
      Port.findOrCreate({
        where: { host_id: host.id, port: port },
        defaults: { host_id: host.id, port: port, type: 'filtered' }
      })
    );

    await Promise.all([...openPortPromises, ...filteredPortPromises]);

    // Получаем все допустимые ключи из таблицы whois_keys
    const allowedKeys = await WhoisKey.findAll({
      attributes: ['key_name']
    });
    const allowedKeyNames = new Set(allowedKeys.map(k => k.key_name));

    // Удаляем старые WHOIS записи для этого хоста
    await Whois.destroy({ where: { host_id: host.id } });

    // Добавляем новые WHOIS записи только для разрешенных ключей
    const whoisPromises = Object.entries(whoisData)
      .filter(([key]) => allowedKeyNames.has(key)) // Фильтруем по разрешенным ключам
      .filter(([key, value]) => value !== null && value !== undefined && value !== "")
      .map(async ([key, value]) => {
        // Находим или создаем ключ WHOIS
        const [whoisKey, created] = await WhoisKey.findOrCreate({
          where: { key_name: key },
          defaults: { key_name: key }
        });

        // Создаем запись WHOIS
        return Whois.create({
          host_id: host.id,
          key_id: whoisKey.id,
          value: value
        });
      });

    await Promise.all(whoisPromises);

    console.log(`Данные для IP ${ip} успешно добавлены в БД.`);
  } catch (error) {
    console.error("Ошибка в addedJSONoneObj:", error);
    throw new Error(
      "Ошибка при добавлении JSON данных в БД: " + error.message
    );
  }
}

  static async getFileDb() {
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

  static async getFileDbRange(startDate, endDate) {
    try {
      // Используем Sequelize.where для корректной работы с датами
      const hosts = await Host.findAll({
        where: {
          updated_at: {
            [Op.gte]: new Date(startDate),
            [Op.lte]: new Date(endDate),
          },
        },
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
      console.error("Ошибка в getFileDbRange:", error);
      throw new Error("Ошибка при получении данных из БД по диапазону дат");
    }
  }

    // Новая функция для сканирования версий сервисов по IP
  static async scanVersionDetection(ip) {
    try {
      console.log(`Запуск сканирования версий для IP: ${ip}`);
      // Проверяем, является ли IP локальным
      if (isLocalIp(ip)) {
        console.log(`IP ${ip} является локальным, пропускаем сканирование.`);
        return { ip, error: "Local IP address skipped for version scan" };
      }

      // Проверяем доступность хоста перед сканированием версий
      const reachable = await checkReachability(ip, 1000);
      if (!reachable) {
        console.log(`Хост ${ip} недоступен, пропускаем сканирование версий.`);
        return { ip, error: "Host is not reachable for version scan" };
      }

      // Сканируем версии сервисов
      let versionScanResult = [];
      try {
        // Используем scanVersionDetection для получения информации о версиях
        // Добавляем таймаут для безопасности
        versionScanResult = await Promise.race([
          scanVersionDetection(ip),
          new Promise(
            (_, reject) => setTimeout(() => reject(new Error("Timeout")), 20000) // Таймаут 20 секунд
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

      // Возвращаем результат
      return {
        ip: ip,
        serviceVersions: versionScanResult || [],
        message: `Version scan completed for ${ip}`,
      };
    } catch (error) {
      console.error(`Ошибка при версионном сканировании IP ${ip}:`, error);
      return { ip, error: error.message };
    }
  }
}
// // services/files.service.js
// import fs from "fs";
// import path from "path";
// import { exec } from "child_process";
// import { promisify } from "util";
// import pLimit from "p-limit";
// import FileRepository from "../repositories/files.repository.js";
// import {
//   checkReachability,
//   scanPortsSimple, // Убедитесь, что эта функция определена
//   isLocalIp,
//   WhoisClient,
// } from "../utils/scanner.js";
// import { Op } from 'sequelize';
// import { Host, Port, Whois, WhoisKey, WellKnownPort } from "../models/index.js";


// const execAsync = promisify(exec); // For executing shell commands

// export default class FileService {
//   static async searchIP(fileContent) {
//     try {
//       // Извлечение IP-адресов из содержимого файла
//       const ipRegex =
//         /\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b/g;
//       const ipMatches = fileContent.match(ipRegex);
//       const uniqueIPs = [...new Set(ipMatches)]; // Убираем дубликаты

//       if (!uniqueIPs || uniqueIPs.length === 0) {
//         console.warn("В файле не найдено IP-адресов.");
//         return { message: "IP-адреса не найдены в файле." };
//       }

//       console.log(`Найдено уникальных IP-адресов: ${uniqueIPs.length}`);

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
//               return Promise.resolve({ ip, error: "Local IP address skipped" });
//             }

//             // Используем limit для ограничения параллелизма внутри части
//             return limit(async () => {
//               try {
//                 // Проверяем доступность хоста
//                 const reachable = await checkReachability(ip, 1000);

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

//                 // Получаем WHOIS информацию
//                 const whoisClient = new WhoisClient();
//                 const whoisData = await whoisClient.getWhois(ip);
//                 // console.log(`WHOIS данные для ${ip}:`, whoisData); // ДЕТАЛЬНАЯ ИНФ

//                 // Подготавливаем данные для вставки в БД
//                 const dbData = {
//                   ip: ip,
//                   reachable: reachable,
//                   port_data: portScanResult, // Используем объект portScanResult напрямую
//                   whois: whoisData || {}, // Используем поле whois напрямую
//                 };

//                 // Добавляем данные в БД
//                 await FileService.addedJSONoneObj(dbData);

//                 return { ip, success: true };
//               } catch (scanError) {
//                 console.error(`Ошибка при обработке IP ${ip}:`, scanError);
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
//       const fileContent = JSON.parse(fileContentRes);

//       if (!Array.isArray(fileContent.items)) {
//         throw new Error("Неверный формат данных JSON для добавления в БД.");
//       }

//       for (const item of fileContent.items) {
//         const ip = item.ip;
//         const reachable = item.reachable;
//         // Исправление: корректная обработка port_data
//         const portData = item.port_data || {};
//         const openPorts = Array.isArray(portData.open)
//           ? portData.open
//           : [];
//         const filteredPorts = Array.isArray(portData.filtered)
//           ? portData.filtered
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
//       // Исправление: корректная обработка входных данных
//       const ip = fileContent.ip;
//       const reachable = fileContent.reachable;
//       // Исправление: корректная обработка port_data
//       const portData = fileContent.port_data || {}; // Убедиться, что port_data существует
//       const openPorts = Array.isArray(portData.open)
//         ? portData.open
//         : [];
//       const filteredPorts = Array.isArray(portData.filtered)
//         ? portData.filtered
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

//   static async getFileDb() {
//     try {
//       const hosts = await Host.findAll({
//         include: [
//           {
//             model: Port,
//             attributes: ["port", "type"],
//             include: [
//               {
//                 model: WellKnownPort,
//                 attributes: ["name"],
//               },
//             ],
//           },
//           {
//             model: Whois,
//             attributes: ["value"],
//             include: [
//               {
//                 model: WhoisKey,
//                 attributes: ["key_name"],
//               },
//             ],
//           },
//         ],
//         order: [["updated_at", "DESC"]],
//       });

//       const items = hosts.map((host) => {
//         const openPorts = [];
//         const filteredPorts = [];

//         host.Ports.forEach((port) => {
//           const portInfo = {
//             port: port.port,
//             name: port.WellKnownPort?.name || null,
//           };

//           if (port.type === "open") {
//             openPorts.push(portInfo);
//           } else if (port.type === "filtered") {
//             filteredPorts.push(portInfo);
//           }
//         });

//         const whois = {};
//         let hasWhois = false;
//         host.Whois.forEach((w) => {
//           if (w.WhoisKey && w.value !== null) {
//             whois[w.WhoisKey.key_name] = w.value;
//             hasWhois = true;
//           }
//         });

//         if (!hasWhois) {
//           whois.error = "Whois query failed";
//         }

//         return {
//           ip: host.ip,
//           country: whois.Country || null,
//           has_whois: hasWhois,
//           whois,
//           updated_at: host.updated_at
//             ? host.updated_at.toISOString().replace("T", " ").substring(0, 19)
//             : null,
//           reachable: host.reachable,
//           port_data: {
//             open: openPorts,
//             filtered: filteredPorts,
//           },
//         };
//       });

//       return { items };
//     } catch (error) {
//       console.error("Ошибка в getFileDb:", error);
//       throw new Error("Ошибка при получении данных из БД");
//     }
//   }

//   static async getFileDbRange(startDate, endDate) {
//     try {
//       // Используем Sequelize.where для корректной работы с датами
//       const hosts = await Host.findAll({
//         where: {
//           updated_at: {
//             [Op.gte]: new Date(startDate),
//             [Op.lte]: new Date(endDate),
//           },
//         },
//         include: [
//           {
//             model: Port,
//             attributes: ["port", "type"],
//             include: [
//               {
//                 model: WellKnownPort,
//                 attributes: ["name"],
//               },
//             ],
//           },
//           {
//             model: Whois,
//             attributes: ["value"],
//             include: [
//               {
//                 model: WhoisKey,
//                 attributes: ["key_name"],
//               },
//             ],
//           },
//         ],
//         order: [["updated_at", "DESC"]],
//       });

//       const items = hosts.map((host) => {
//         const openPorts = [];
//         const filteredPorts = [];

//         host.Ports.forEach((port) => {
//           const portInfo = {
//             port: port.port,
//             name: port.WellKnownPort?.name || null,
//           };

//           if (port.type === "open") {
//             openPorts.push(portInfo);
//           } else if (port.type === "filtered") {
//             filteredPorts.push(portInfo);
//           }
//         });

//         const whois = {};
//         let hasWhois = false;
//         host.Whois.forEach((w) => {
//           if (w.WhoisKey && w.value !== null) {
//             whois[w.WhoisKey.key_name] = w.value;
//             hasWhois = true;
//           }
//         });

//         if (!hasWhois) {
//           whois.error = "Whois query failed";
//         }

//         return {
//           ip: host.ip,
//           country: whois.Country || null,
//           has_whois: hasWhois,
//           whois,
//           updated_at: host.updated_at
//             ? host.updated_at.toISOString().replace("T", " ").substring(0, 19)
//             : null,
//           reachable: host.reachable,
//           port_data: {
//             open: openPorts,
//             filtered: filteredPorts,
//           },
//         };
//       });

//       return { items };
//     } catch (error) {
//       console.error("Ошибка в getFileDbRange:", error);
//       throw new Error("Ошибка при получении данных из БД по диапазону дат");
//     }
//   }

//     // Новая функция для сканирования версий сервисов по IP
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
