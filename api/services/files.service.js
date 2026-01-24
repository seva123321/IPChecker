import fs from "fs";
import path from "path";
import pLimit from "p-limit";
import {
  isLocalIp,
  scanPortsSimple,
  scanVersionDetection,
  checkReachability,
  WhoisClient,
} from "../utils/index.js";
import { Op } from "sequelize";
import {
  Host,
  Port,
  Whois,
  WhoisKey,
  WellKnownPort,
  sequelize,
  FileSource,
  Country,
  Priority,
  Grouping,
  PriorityComment,
  HostFileSource,
} from "../models/index.js";
import sessionManager from "../utils/sessionManager.js";

// Конфигурация масштабирования
const SCALING_CONFIG = {
  SMALL: {
    // до 100 IP
    concurrentBatches: 1,
    batchSize: 25,
    ipConcurrency: 5,
    portScanTimeout: 15000,
    reachabilityTimeout: 2000,
  },
  MEDIUM: {
    // 100-500 IP
    concurrentBatches: 2,
    batchSize: 50,
    ipConcurrency: 8,
    portScanTimeout: 10000,
    reachabilityTimeout: 1500,
  },
  LARGE: {
    // 500+ IP
    concurrentBatches: 3,
    batchSize: 100,
    ipConcurrency: 12,
    portScanTimeout: 8000,
    reachabilityTimeout: 1000,
  },
};

// Кеш для WHOIS запросов
const whoisCache = new Map();

export default class FileService {
  static async searchIP(
    fileContent,
    fileName = null,
    progressCallback = () => {},
    clientId = null
  ) {
    try {
      const ipRegex =
        /(\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b)/g;
      const ipMatches = fileContent.match(ipRegex) || [];

      const uniqueIPs = [...new Set(ipMatches)].filter((ip) => {
        const parts = ip.split(".");
        if (parts.length !== 4) return false;
        return parts.every((part) => {
          const num = parseInt(part, 10);
          return !isNaN(num) && num >= 0 && num <= 255;
        });
      });

      if (uniqueIPs.length === 0) {
        progressCallback({
          type: "processing_started",
          totalIPs: 0,
          processedIPs: 0,
          progress: 100,
          fileName: fileName,
        });
        return { message: "IP-адреса не найдены в файле." };
      }

      console.log(
        `🔍 Начало обработки ${uniqueIPs.length} IP для файла: "${fileName}"`
      );

      // Отправляем начальный прогресс
      progressCallback({
        type: "processing_started",
        totalIPs: uniqueIPs.length,
        processedIPs: 0,
        progress: 0,
        fileName: fileName,
      });

      const config = FileService.getScalingConfig(uniqueIPs.length);

      let result;
      if (uniqueIPs.length > 100) {
        // Передаем fileName в processLargeBatch
        result = await FileService.processLargeBatch(
          uniqueIPs,
          config,
          fileName,
          progressCallback
        );
      } else {
        // Передаем fileName в processStandardBatch
        result = await FileService.processStandardBatch(
          uniqueIPs,
          config,
          fileName,
          progressCallback
        );
      }

      // Финальный прогресс
      progressCallback({
        type: "processing_completed",
        ...result,
        fileName: fileName,
      });

      // Если указан clientId, сохраняем файл через SessionManager
      if (clientId) {
        const session = sessionManager.createSession(clientId);
        await FileService.saveProcessedFile(fileName, result, session.id);

        // Возвращаем sessionId для клиента
        return {
          ...result,
          sessionId: session.id,
        };
      }

      return result;
    } catch (error) {
      console.error("❌ Критическая ошибка в searchIP:", error);
      progressCallback({
        type: "processing_error",
        error: error.message,
        fileName: fileName,
      });
      throw new Error("Ошибка обработки IP-адресов: " + error.message);
    }
  }

  static getScalingConfig(ipCount) {
    // Исправлено: убрал лишний пробел
    if (ipCount <= 100) {
      return { ...SCALING_CONFIG.SMALL, mode: "SMALL" };
    } else if (ipCount <= 500) {
      return { ...SCALING_CONFIG.MEDIUM, mode: "MEDIUM" };
    } else {
      return { ...SCALING_CONFIG.LARGE, mode: "LARGE" };
    }
  }

  static async getCachedWhois(ip) {
    // Проверяем кеш
    if (whoisCache.has(ip)) {
      return whoisCache.get(ip);
    }

    // Выполняем запрос
    const whoisClient = new WhoisClient();
    const result = await Promise.race([
      whoisClient.getWhois(ip),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("WHOIS timeout")), 10000)
      ),
    ]);

    // Сохраняем в кеш
    whoisCache.set(ip, result);

    // Ограничиваем размер кеша
    if (whoisCache.size > 500) {
      const firstKey = whoisCache.keys().next().value;
      whoisCache.delete(firstKey);
    }

    return result;
  }

  static async processLargeBatch(
    uniqueIPs,
    config,
    fileName = null,
    progressCallback = () => {}
  ) {
    console.log(
      `🚀 Запуск оптимизированной обработки для ${uniqueIPs.length} IP, файл: ${fileName}`
    );

    const batches = [];
    for (let i = 0; i < uniqueIPs.length; i += config.batchSize) {
      batches.push(uniqueIPs.slice(i, i + config.batchSize));
    }

    let globalSuccessCount = 0;
    let globalFailedCount = 0;
    const allResults = [];
    let processedBatches = 0;

    const batchLimit = pLimit(config.concurrentBatches);

    const batchPromises = batches.map((batch, batchIndex) =>
      batchLimit(async () => {
        try {
          console.log(
            `\n📦 Запуск батча ${batchIndex + 1}/${
              batches.length
            }, файл: ${fileName}`
          );

          // Прогресс начала батча
          progressCallback({
            type: "batch_start",
            batchIndex: batchIndex + 1,
            totalBatches: batches.length,
            batchSize: batch.length,
            fileName: fileName,
          });

          // Передаем fileName в processOptimizedBatch
          const batchResults = await FileService.processOptimizedBatch(
            batch,
            batchIndex,
            config,
            fileName
          );

          globalSuccessCount += batchResults.successful;
          globalFailedCount += batchResults.failed;
          allResults.push(...batchResults.details);
          processedBatches++;

          // Прогресс завершения батча
          const processedIPs = globalSuccessCount + globalFailedCount;
          const progress = Math.round((processedIPs / uniqueIPs.length) * 100);

          progressCallback({
            type: "batch_complete",
            batchIndex: batchIndex + 1,
            totalBatches: batches.length,
            successful: batchResults.successful,
            failed: batchResults.failed,
            processedIPs: processedIPs,
            totalIPs: uniqueIPs.length,
            progress: progress,
            fileName: fileName,
          });

          console.log(
            `📊 Прогресс батча ${batchIndex + 1}: ${processedIPs}/${
              uniqueIPs.length
            } IP (${progress}%), файл: ${fileName}`
          );
        } catch (batchError) {
          console.error(
            `❌ Ошибка обработки батча ${batchIndex + 1}:`,
            batchError
          );
          globalFailedCount += batch.length;

          progressCallback({
            type: "batch_error",
            batchIndex: batchIndex + 1,
            error: batchError.message,
            fileName: fileName,
          });
        }
      })
    );

    const batchResults = await Promise.allSettled(batchPromises);

    // Статистика по батчам
    const successfulBatches = batchResults.filter(
      (r) => r.status === "fulfilled"
    ).length;
    console.log(
      `\n✅ Обработка завершена: ${successfulBatches}/${batches.length} батчей успешно, файл: ${fileName}`
    );
    console.log(
      `🎯 Итог: ${globalSuccessCount}/${uniqueIPs.length} IP обработано`
    );

    // Очистка кеша
    whoisCache.clear();

    return {
      message: `Обработано ${globalSuccessCount} из ${uniqueIPs.length} IP-адресов`,
      total: uniqueIPs.length,
      successful: globalSuccessCount,
      failed: globalFailedCount,
      statistics: {
        success_rate:
          ((globalSuccessCount / uniqueIPs.length) * 100).toFixed(1) + "%",
        batches_processed: `${successfulBatches}/${batches.length}`,
        whois_cache_size: whoisCache.size,
      },
      details: {
        successful_ips: allResults
          .filter((r) => r.success && !r.skipped)
          .map((r) => r.ip),
        skipped_ips: allResults.filter((r) => r.skipped).map((r) => r.ip),
        failed_ips: allResults
          .filter((r) => r.error)
          .map((r) => ({ ip: r.ip, error: r.error })),
      },
    };
  }

  static async processOptimizedBatch(
    batch,
    batchIndex,
    config,
    fileName = null,
    progressCallback = () => {}
  ) {
    const ipLimit = pLimit(config.ipConcurrency);
    let batchSuccessCount = 0;
    let batchFailedCount = 0;
    const batchResults = [];

    const batchPromises = batch.map((ip) =>
      ipLimit(async () => {
        try {
          // Добавляем проверку на существование IP
          if (!ip || ip === "unknown") {
            return { ip: ip || "unknown", error: "Invalid IP address" };
          }

          if (isLocalIp(ip)) {
            return { ip, skipped: true, reason: "Local IP" };
          }

          // Передаем fileName в processIPOptimized
          const result = await FileService.processIPOptimized(
            ip,
            batchIndex,
            config,
            fileName
          );

          if (result.success) {
            batchSuccessCount++;
          } else {
            batchFailedCount++;
          }

          return result;
        } catch (error) {
          batchFailedCount++;
          console.error(`❌ Ошибка обработки IP ${ip}:`, error.message);
          return { ip: ip || "unknown", error: error.message };
        }
      })
    );

    const results = await Promise.allSettled(batchPromises);

    results.forEach((result) => {
      if (result.status === "fulfilled") {
        batchResults.push(result.value);
      } else {
        batchResults.push({
          ip: "unknown",
          error: result.reason?.message || "Unknown error",
        });
      }
    });

    return {
      successful: batchSuccessCount,
      failed: batchFailedCount,
      details: batchResults,
    };
  }

  static async processIPOptimized(ip, batchIndex, config, fileName = null) {
    const startTime = Date.now();

    try {
      console.log(
        `🔍 [Батч ${batchIndex}] Начало обработки IP: ${ip}, файл: "${fileName}"`
      );

      // 1. Проверка доступности
      // console.log(`   📡 Проверка доступности ${ip}...`);
      const reachable = await checkReachability(ip, config.reachabilityTimeout);
      // console.log(`   📡 ${ip} доступен: ${reachable}`);

      let portScanResult = { open: [], filtered: [] };
      let whoisData = {};

      // 2. Получение данных только для доступных хостов
      if (reachable) {
        try {
          // console.log(`   🔌 Сканирование портов для ${ip}...`);
          const [portResult, whoisResult] = await Promise.allSettled([
            scanPortsSimple(ip).catch(() => ({ open: [], filtered: [] })),
            FileService.getCachedWhois(ip).catch(() => ({})),
          ]);

          portScanResult =
            portResult.status === "fulfilled"
              ? portResult.value
              : { open: [], filtered: [] };
          whoisData =
            whoisResult.status === "fulfilled" ? whoisResult.value : {};

          // console.log(
          //   `   🔌 ${ip}: найдено ${portScanResult.open.length} открытых портов, ${portScanResult.filtered.length} фильтрованных портов`
          // );
          // console.log(
          //   `   📝 ${ip}: получено ${
          //     Object.keys(whoisData).length
          //   } WHOIS записей`
          // );
        } catch (error) {
          console.error(
            `   ❌ Ошибка получения данных для ${ip}:`,
            error.message
          );
        }
      }

      // 3. Подготовка данных для сохранения
      const dbData = {
        ip: ip,
        reachable: reachable,
        port_data: portScanResult,
        whois: whoisData,
      };

      // console.log(`   💾 Вызов addedJSONoneObj для ${ip}...`);

      // 4. Сохраняем в базу
      const result = await FileService.addedJSONoneObj(dbData, null, fileName);

      const processingTime = Date.now() - startTime;
      console.log(
        `✅ [Батч ${batchIndex}] ${ip} - обработан за ${processingTime}мс, результат:`,
        result
      );

      return { ip, success: true, ...result };
    } catch (error) {
      const processingTime = Date.now() - startTime;
      console.error(
        `❌ [Батч ${batchIndex}] ${ip} - ошибка за ${processingTime}мс:`,
        error.message
      );
      console.error("   Stack:", error.stack);
      return { ip, success: false, error: error.message };
    }
  }

  // static async processStandardBatch(
  //   uniqueIPs,
  //   config,
  //   fileName = null,
  //   progressCallback = () => {}
  // ) {
  //   console.log(
  //     `🔧 Стандартная обработка для ${uniqueIPs.length} IP, файл: ${fileName}`
  //   );

  //   const limit = pLimit(config.ipConcurrency);
  //   const chunkSize = config.batchSize;
  //   const chunks = [];

  //   for (let i = 0; i < uniqueIPs.length; i += chunkSize) {
  //     chunks.push(uniqueIPs.slice(i, i + chunkSize));
  //   }

  //   let allResults = [];
  //   let successfulCount = 0;
  //   let failedCount = 0;

  //   for (let i = 0; i < chunks.length; i++) {
  //     const chunk = chunks[i];
  //     console.log(
  //       `Обрабатываем часть ${i + 1}/${chunks.length} (${
  //         chunk.length
  //       } IP), файл: ${fileName}`
  //     );

  //     // Отправляем событие начала батча
  //     progressCallback({
  //       type: "batch_start",
  //       batchIndex: i + 1,
  //       totalBatches: chunks.length,
  //       batchSize: chunk.length,
  //       fileName: fileName,
  //     });

  //     const chunkResults = await Promise.allSettled(
  //       chunk.map((ip) => {
  //         if (isLocalIp(ip)) {
  //           return Promise.resolve({ ip, error: "Local IP address skipped" });
  //         }

  //         return limit(async () => {
  //           try {
  //             const reachable = await checkReachability(
  //               ip,
  //               config.reachabilityTimeout
  //             );

  //             let portScanResult = { open: [], filtered: [] };
  //             try {
  //               portScanResult = await Promise.race([
  //                 scanPortsSimple(ip),
  //                 new Promise((_, reject) =>
  //                   setTimeout(
  //                     () => reject(new Error("Timeout")),
  //                     config.portScanTimeout
  //                   )
  //                 ),
  //               ]);
  //             } catch (timeoutError) {
  //               console.warn(
  //                 `Таймаут сканирования портов для ${ip}:`,
  //                 timeoutError.message
  //               );
  //             }

  //             const whoisData = await FileService.getCachedWhois(ip).catch(
  //               () => ({})
  //             );

  //             const dbData = {
  //               ip: ip,
  //               reachable: reachable,
  //               port_data: portScanResult,
  //               whois: whoisData,
  //             };

  //             // Передаем fileName в addedJSONoneObj
  //             await FileService.addedJSONoneObj(dbData, null, fileName);
  //             return { ip, success: true };
  //           } catch (scanError) {
  //             console.error(`Ошибка при обработке IP ${ip}:`, scanError);
  //             return { ip, error: scanError.message };
  //           }
  //         });
  //       })
  //     );

  //     allResults = allResults.concat(chunkResults);

  //     // Обновляем счетчики
  //     const chunkSuccessful = chunkResults.filter(
  //       (result) => result.status === "fulfilled" && !result.value.error
  //     ).length;
  //     const chunkFailed = chunkResults.length - chunkSuccessful;

  //     successfulCount += chunkSuccessful;
  //     failedCount += chunkFailed;

  //     // Отправляем прогресс после каждого батча
  //     const processedIPs = successfulCount + failedCount;
  //     const progress = Math.round((processedIPs / uniqueIPs.length) * 100);

  //     progressCallback({
  //       type: "batch_complete",
  //       batchIndex: i + 1,
  //       totalBatches: chunks.length,
  //       processedIPs: processedIPs,
  //       totalIPs: uniqueIPs.length,
  //       progress: progress,
  //       successful: successfulCount,
  //       failed: failedCount,
  //       fileName: fileName,
  //     });

  //     console.log(
  //       `📊 Прогресс: ${processedIPs}/${uniqueIPs.length} IP (${progress}%), файл: ${fileName}`
  //     );

  //     // Пауза между чанками
  //     if (i < chunks.length - 1) {
  //       await new Promise((resolve) => setTimeout(resolve, 1000));
  //     }
  //   }

  //   console.log(
  //     `Обработка завершена. Всего: ${uniqueIPs.length}, Успешно: ${successfulCount}, Неудачно: ${failedCount}, файл: ${fileName}`
  //   );

  //   return {
  //     message: `Обработка завершена. Всего: ${uniqueIPs.length}, Успешно: ${successfulCount}, Неудачно: ${failedCount}`,
  //     total: uniqueIPs.length,
  //     successful: successfulCount,
  //     failed: failedCount,
  //     details: {
  //       successful_ips: allResults
  //         .filter((r) => r.status === "fulfilled" && !r.value.error)
  //         .map((r) => r.value.ip),
  //       failed_ips: allResults
  //         .filter((r) => r.status === "rejected" || r.value.error)
  //         .map((r) => ({
  //           ip: r.status === "fulfilled" ? r.value.ip : "unknown",
  //           error: r.status === "rejected" ? r.reason?.message : r.value.error,
  //         })),
  //     },
  //   };
  // }

  static async processStandardBatch(
  uniqueIPs,
  config,
  fileName = null,
  progressCallback = () => {}
) {
  console.log(
    `🔧 Стандартная обработка для ${uniqueIPs.length} IP, файл: ${fileName}`
  );

  const limit = pLimit(config.ipConcurrency);
  const chunkSize = config.batchSize;
  const totalChunks = Math.ceil(uniqueIPs.length / chunkSize);
  
  // Предварительное кэширование WHOIS для всех IP
  const whoisCache = new Map();
  
  // Предзагрузка WHOIS данных асинхронно
  const preloadWhois = async (ip) => {
    if (isLocalIp(ip)) return null;
    try {
      const data = await FileService.getCachedWhois(ip);
      whoisCache.set(ip, data);
      return data;
    } catch {
      whoisCache.set(ip, {});
      return {};
    }
  };

  // Параллельная предзагрузка WHOIS для первой порции IP
  const initialPreload = uniqueIPs
    .slice(0, Math.min(uniqueIPs.length, config.ipConcurrency * 2))
    .map(ip => limit(() => preloadWhois(ip)));

  await Promise.allSettled(initialPreload);

  let allResults = [];
  let successfulCount = 0;
  let failedCount = 0;
  
  // Обработка с использованием for...of для асинхронных итераций
  for (let i = 0; i < uniqueIPs.length; i += chunkSize) {
    const chunk = uniqueIPs.slice(i, i + chunkSize);
    const chunkIndex = Math.floor(i / chunkSize) + 1;
    
    console.log(
      `Обрабатываем часть ${chunkIndex}/${totalChunks} (${chunk.length} IP), файл: ${fileName}`
    );

    // Асинхронная предзагрузка WHOIS для следующей порции
    if (i + chunkSize < uniqueIPs.length) {
      const nextChunk = uniqueIPs.slice(i + chunkSize, i + 2 * chunkSize);
      nextChunk.forEach(ip => {
        if (!whoisCache.has(ip) && !isLocalIp(ip)) {
          limit(() => preloadWhois(ip)).catch(() => {});
        }
      });
    }

    progressCallback({
      type: "batch_start",
      batchIndex: chunkIndex,
      totalBatches: totalChunks,
      batchSize: chunk.length,
      fileName: fileName,
    });

    // Оптимизированная обработка чанка
    const chunkPromises = chunk.map((ip) => {
      if (isLocalIp(ip)) {
        return Promise.resolve({ ip, error: "Local IP address skipped", skipped: true });
      }

      return limit(async () => {
        try {
          // Параллельная проверка доступности и сканирование портов
          const [reachable, portScanResult] = await Promise.all([
            checkReachability(ip, config.reachabilityTimeout),
            Promise.race([
              scanPortsSimple(ip),
              new Promise((_, reject) =>
                setTimeout(() => reject(new Error("Port scan timeout")), config.portScanTimeout)
              ),
            ]).catch((timeoutError) => {
              console.warn(`Таймаут сканирования портов для ${ip}:`, timeoutError.message);
              return { open: [], filtered: [] };
            })
          ]);

          // Получаем WHOIS из кэша или загружаем
          let whoisData;
          if (whoisCache.has(ip)) {
            whoisData = whoisCache.get(ip);
          } else {
            whoisData = await preloadWhois(ip);
          }

          const dbData = {
            ip: ip,
            reachable: reachable,
            port_data: portScanResult || { open: [], filtered: [] },
            whois: whoisData || {},
          };

          // Параллельная запись в базу данных
          await Promise.race([
            FileService.addedJSONoneObj(dbData, null, fileName),
            new Promise((_, reject) =>
              setTimeout(() => reject(new Error("Database write timeout")), 10000)
            )
          ]).catch((dbError) => {
            console.error(`Ошибка записи для IP ${ip}:`, dbError.message);
          });

          return { ip, success: true };
        } catch (scanError) {
          console.error(`Ошибка при обработке IP ${ip}:`, scanError);
          return { ip, error: scanError.message };
        }
      });
    });

    const chunkResults = await Promise.allSettled(chunkPromises);
    allResults = allResults.concat(chunkResults);

    // Оптимизированный подсчет результатов
    const chunkStats = chunkResults.reduce((acc, result) => {
      if (result.status === 'fulfilled') {
        if (result.value.skipped) {
          acc.skipped++;
        } else if (result.value.error) {
          acc.failed++;
        } else {
          acc.successful++;
        }
      } else {
        acc.failed++;
      }
      return acc;
    }, { successful: 0, failed: 0, skipped: 0 });

    successfulCount += chunkStats.successful;
    failedCount += chunkStats.failed;

    const processedIPs = successfulCount + failedCount;
    const progress = Math.round((processedIPs / uniqueIPs.length) * 100);

    progressCallback({
      type: "batch_complete",
      batchIndex: chunkIndex,
      totalBatches: totalChunks,
      processedIPs: processedIPs,
      totalIPs: uniqueIPs.length,
      progress: progress,
      successful: successfulCount,
      failed: failedCount,
      fileName: fileName,
    });

    console.log(
      `📊 Прогресс: ${processedIPs}/${uniqueIPs.length} IP (${progress}%), файл: ${fileName}`
    );

    // Динамическая пауза между чанками (меньше при успешной обработке)
    if (chunkIndex < totalChunks) {
      const pauseTime = chunkStats.failed > chunkStats.successful * 0.1 ? 2000 : 500;
      await new Promise(resolve => setTimeout(resolve, pauseTime));
    }
  }

  console.log(
    `Обработка завершена. Всего: ${uniqueIPs.length}, Успешно: ${successfulCount}, Неудачно: ${failedCount}, файл: ${fileName}`
  );

  // Оптимизированное формирование результатов
  const successfulIPs = [];
  const failedIPs = [];

  for (const result of allResults) {
    if (result.status === 'fulfilled') {
      if (result.value.error) {
        failedIPs.push({
          ip: result.value.ip,
          error: result.value.error
        });
      } else if (!result.value.skipped) {
        successfulIPs.push(result.value.ip);
      }
    } else {
      failedIPs.push({
        ip: 'unknown',
        error: result.reason?.message || 'Unknown error'
      });
    }
  }

  return {
    message: `Обработка завершена. Всего: ${uniqueIPs.length}, Успешно: ${successfulCount}, Неудачно: ${failedCount}`,
    total: uniqueIPs.length,
    successful: successfulCount,
    failed: failedIPs.length,
    // failed: failedCount,
    details: {
      successful_ips: successfulIPs,
      failed_ips: failedIPs,
    },
  };
}

  static async saveProcessedFile(fileName, result, clientId) {
    try {
      // Сначала получаем данные в нужном формате из базы данных
      const fileSource = await FileSource.findOne({
        where: { name: decodeURIComponent(fileName) },
        include: [
          {
            model: Host,
            include: [
              {
                model: Port,
                include: [
                  {
                    model: WellKnownPort,
                    attributes: ["name"],
                  },
                ],
              },
              {
                model: Whois,
                include: [
                  {
                    model: WhoisKey,
                    attributes: ["key_name"],
                  },
                ],
              },
              {
                model: Priority,
                attributes: ["id", "name"],
              },
              {
                model: Grouping,
                attributes: ["id", "name"],
              },
              {
                model: Country,
                attributes: ["id", "name"],
              },
            ],
          },
        ],
      });

      if (!fileSource || !fileSource.Hosts || fileSource.Hosts.length === 0) {
        console.warn(
          `⚠️ Не удалось получить данные файла ${fileName} для сохранения`
        );
        return null;
      }

      // Форматируем данные
      const formattedData = FileService.formattedDataProcess(fileSource);

      // Сохраняем в формате formattedDataProcess С МИНИФИКАЦИЕЙ
      return sessionManager.saveFormattedFile(
        clientId,
        fileName,
        formattedData,
        {
          id: fileSource.id,
          uploaded_at: fileSource.uploaded_at,
          updated_at: fileSource.updated_at,
          encoding: fileSource.encoding,
        },
        true // Минифицировать
      );
    } catch (error) {
      console.error(
        `❌ Ошибка сохранения обработанного файла ${fileName}:`,
        error
      );

      // Если не удалось получить форматированные данные, сохраняем сырые (минифицированные)
      try {
        return sessionManager.saveFileToSession(
          clientId,
          fileName,
          {
            rawResult: result,
            error: "Не удалось получить форматированные данные",
            timestamp: new Date().toISOString(),
          },
          true // Минифицировать
        );
      } catch (fallbackError) {
        console.error(`❌ Критическая ошибка сохранения файла:`, fallbackError);
        throw fallbackError;
      }
    }
  }

  static formatTime(seconds) {
    if (seconds < 60) return `${Math.ceil(seconds)} сек`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)} мин`;

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    return `${hours} ч ${minutes} мин`;
  }

  //****************************** */
  static async addedJSONfile(jsonContent, progressCallback) {
    try {
      console.log("Начало обработки JSON файла...");
      const data = JSON.parse(jsonContent);

      const results = {
        files_processed: 0,
        created: 0,
        updated: 0,
        skipped: 0,
        errors: 0,
        total_hosts: data.meta.statistics.total_hosts,
        processed_hosts: 0,
        details: {
          ports_created: 0,
          ports_deleted: 0,
          whois_created: 0,
          whois_deleted: 0,
          host_errors: [],
          skipped_reasons: {},
        },
        errors: [],
      };

      // Отправляем событие начала обработки всего JSON
      if (progressCallback) {
        progressCallback({
          type: "processing_start",
          message: "Начало обработки JSON файла",
          total: data.files ? data.files.length : 0,
          total_hosts: results.total_hosts,
          processed: 0,
          timestamp: new Date().toISOString(),
        });
      }

      // Обрабатываем каждый файл из JSON в отдельной транзакции
      if (data.files && Array.isArray(data.files)) {
        let totalProcessedHosts = -1; //!

        for (let fileIndex = 0; fileIndex < data.files.length; fileIndex++) {
          const fileData = data.files[fileIndex];
          const fileName = fileData.file_info.file_name;

          try {
            console.log(
              `Обработка файла ${fileIndex + 1}/${
                data.files.length
              }: "${fileName}"`
            );

            // Отправляем событие начала обработки файла
            if (progressCallback) {
              progressCallback({
                type: "file_start",
                clientId: "temp",
                fileIndex: fileIndex,
                fileName: fileName,
                totalFiles: data.files.length,
                total_hosts: results.total_hosts,
                timestamp: new Date().toISOString(),
              });
            }

            // Создаем или находим запись FileSource ВНЕ транзакции
            let fileSource;
            try {
              fileSource = await FileSource.findOne({
                where: { name: fileName },
              });

              let isNewFile = false;
              if (!fileSource) {
                fileSource = await FileSource.create({
                  name: fileName,
                  encoding: fileData.file_info.encoding || "UTF-8",
                  uploaded_at: new Date(fileData.file_info.uploaded_at),
                  updated_at: new Date(
                    fileData.file_info.updated_at ||
                      fileData.file_info.uploaded_at
                  ),
                });
                console.log(`📁 Создан новый файл: ${fileSource.name}`);
                isNewFile = true;
              } else {
                // Обновляем время обновления файла
                await fileSource.update({
                  updated_at: new Date(
                    fileData.file_info.updated_at ||
                      fileData.file_info.uploaded_at
                  ),
                });
                console.log(
                  `📁 Обновлен существующий файл: ${fileSource.name}`
                );
              }
            } catch (fileSourceError) {
              console.error(
                `❌ Ошибка работы с FileSource "${fileName}":`,
                fileSourceError
              );
              throw new Error(
                `Ошибка работы с файлом: ${fileSourceError.message}`
              );
            }

            // 2. Обрабатываем хосты из файла - каждый хост в своей транзакции
            let fileHostsCreated = 0;
            let fileHostsUpdated = 0;
            let fileHostsSkipped = 0;
            let fileHostsErrors = 0;
            let filePortsCreated = 0;
            let filePortsDeleted = 0;
            let fileWhoisCreated = 0;
            let fileWhoisDeleted = 0;
            let fileErrors = [];

            if (fileData.data && Array.isArray(fileData.data)) {
              const totalHostsInFile = fileData.data.length;

              for (
                let hostIndex = 0;
                hostIndex < totalHostsInFile;
                hostIndex++
              ) {
                const hostData = fileData.data[hostIndex];

                try {
                  // Создаем отдельную транзакцию для каждого хоста
                  const transaction = await sequelize.transaction();

                  try {
                    const hostResult = await this.processHostData(
                      hostData,
                      fileSource.id,
                      transaction
                    );

                    await transaction.commit();

                    // Обновляем счетчики на основе результата
                    switch (hostResult.action) {
                      case "created":
                        fileHostsCreated++;
                        results.created++;
                        // console.log(`✅ Создан хост: ${hostData.ip}`);
                        break;
                      case "updated":
                        fileHostsUpdated++;
                        results.updated++;
                        // console.log(`🔄 Обновлен хост: ${hostData.ip}`);
                        break;
                      case "skipped":
                        fileHostsSkipped++;
                        results.skipped++;

                        // Записываем причину пропуска
                        if (
                          hostResult.reason &&
                          hostResult.reason.includes("skipped")
                        ) {
                          if (!results.details.skipped_reasons["data_older"]) {
                            results.details.skipped_reasons["data_older"] = 0;
                          }
                          results.details.skipped_reasons["data_older"]++;
                        }
                        // console.log(
                        //   `⏭️ Пропущен хост: ${hostData.ip} - ${hostResult.reason}`
                        // );
                        break;
                      case "error":
                        fileHostsErrors++;
                        results.errors++;
                        fileErrors.push(`${hostData.ip}: ${hostResult.error}`);
                        results.details.host_errors.push(
                          `${hostData.ip}: ${hostResult.error}`
                        );
                        // console.log(
                        //   `❌ Ошибка хоста: ${hostData.ip} - ${hostResult.error}`
                        // );
                        break;
                    }
                  } catch (transactionError) {
                    // Откатываем транзакцию при ошибке
                    try {
                      await transaction.rollback();
                    } catch (rollbackError) {
                      console.error(
                        `❌ Ошибка при откате транзакции для ${hostData.ip}:`,
                        rollbackError
                      );
                    }

                    fileHostsErrors++;
                    results.errors++;
                    const errorMsg =
                      transactionError.message ||
                      "Неизвестная ошибка транзакции";
                    fileErrors.push(`${hostData.ip}: ${errorMsg}`);
                    results.details.host_errors.push(
                      `${hostData.ip}: ${errorMsg}`
                    );
                    console.error(
                      `❌ Транзакционная ошибка хоста ${hostData.ip}:`,
                      transactionError
                    );
                  }

                  results.processed_hosts++;
                  totalProcessedHosts++;

                  // Отправляем прогресс каждые 50 хостов
                  if (
                    hostIndex % 50 === 0 ||
                    hostIndex === totalHostsInFile - 1
                  ) {
                    if (progressCallback) {
                      progressCallback({
                        type: "file_progress",
                        fileIndex: fileIndex,
                        fileName: fileName,
                        processedHosts: totalProcessedHosts + 1,
                        totalHosts: totalHostsInFile,
                        timestamp: new Date().toISOString(),
                      });
                    }
                  }
                } catch (hostError) {
                  console.error(
                    `❌ Критическая ошибка обработки хоста ${hostData.ip}:`,
                    hostError
                  );
                  fileHostsErrors++;
                  results.errors++;
                  fileErrors.push(`${hostData.ip}: ${hostError.message}`);
                  results.details.host_errors.push(
                    `${hostData.ip}: ${hostError.message}`
                  );
                }
              }
            }

            results.files_processed++;

            // Отправляем событие завершения файла с детальной статистикой
            if (progressCallback) {
              progressCallback({
                type: "file_complete",
                clientId: "temp",
                fileIndex: fileIndex,
                fileName: fileName,
                result: {
                  total: fileData.data ? fileData.data.length : 0,
                  processed: fileData.data ? fileData.data.length : 0,
                  created: fileHostsCreated,
                  updated: fileHostsUpdated,
                  skipped: fileHostsSkipped,
                  errors: fileHostsErrors,
                  ports_created: filePortsCreated,
                  ports_deleted: filePortsDeleted,
                  whois_created: fileWhoisCreated,
                  whois_deleted: fileWhoisDeleted,
                  file_errors: fileErrors,
                  hosts_processed: fileData.data ? fileData.data.length : 0,
                },
                timestamp: new Date().toISOString(),
              });
            }
          } catch (fileError) {
            console.error(
              `❌ Ошибка обработки файла "${fileName}":`,
              fileError
            );
            results.errors.push(`Файл ${fileName}: ${fileError.message}`);

            if (progressCallback) {
              progressCallback({
                type: "file_error",
                clientId: "temp",
                fileIndex: fileIndex,
                fileName: fileName,
                error: fileError.message,
                timestamp: new Date().toISOString(),
              });
            }

            // Продолжаем обработку следующих файлов
            continue;
          }
        }
      }

      console.log("✅ Все файлы обработаны");

      // Добавляем общую статистику по всем файлам
      const finalStats = {
        // ...results,
        summary: {
          total_files: data.files ? data.files.length : 0,
          files_processed: results.files_processed,
          total_hosts: results.total_hosts,
          hosts_processed: results.processed_hosts,
          hosts_created_percentage:
            results.total_hosts > 0
              ? Math.round((results.created / results.total_hosts) * 100)
              : 0,
          hosts_updated_percentage:
            results.total_hosts > 0
              ? Math.round((results.updated / results.total_hosts) * 100)
              : 0,
          hosts_skipped_percentage:
            results.total_hosts > 0
              ? Math.round((results.skipped / results.total_hosts) * 100)
              : 0,
          error_percentage:
            results.total_hosts > 0
              ? Math.round((results.errors / results.total_hosts) * 100)
              : 0,
        },
      };

      // Отправляем финальное событие
      if (progressCallback) {
        progressCallback({
          type: "processing_complete",
          clientId: "temp",
          results: finalStats,
          message: "Обработка JSON файла завершена",
          timestamp: new Date().toISOString(),
        });
      }

      console.log(
        "📊 Итоговая статистика:",
        JSON.stringify(finalStats.summary, null, 2)
      );
      return finalStats;
    } catch (error) {
      console.error("❌ Критическая ошибка обработки JSON:", error);

      if (progressCallback) {
        progressCallback({
          type: "processing_error",
          clientId: "temp",
          error: error.message,
          timestamp: new Date().toISOString(),
        });
      }

      throw new Error(`Ошибка обработки JSON: ${error.message}`);
    }
  }
  //****************************** */

  // Вспомогательный метод для обработки данных хоста
  static async processHostData(hostData, fileSourceId, transaction) {
    try {
      // Проверяем наличие IP
      if (!hostData.ip) {
        throw new Error("Отсутствует IP адрес");
      }

      const currentTimestamp = new Date();
      const hostUpdatedAt = hostData.updated_at
        ? new Date(hostData.updated_at)
        : currentTimestamp;

      // Поиск существующего хоста
      let host = await Host.findOne({
        where: { ip: hostData.ip },
        transaction,
      });

      // Определяем действие
      let action = "";
      let isHostExisted = !!host;
      let shouldUpdate = false;

      if (!host) {
        // Новый хост - всегда обновляем
        action = "created";
        shouldUpdate = true;
      } else {
        // Существующий хост - проверяем время обновления
        const existingHostUpdatedAt = new Date(host.updated_at);
        shouldUpdate = hostUpdatedAt > existingHostUpdatedAt;
        action = shouldUpdate ? "updated" : "skipped";
      }

      if (shouldUpdate) {
        // Подготовка данных для хоста
        const hostUpdateData = {
          ip: hostData.ip,
          reachable:
            hostData.reachable !== undefined ? hostData.reachable : true,
          updated_at: hostUpdatedAt,
          priority_id: null,
          grouping_id: null,
          country_id: null,
        };

        // Обработка priority_info (упрощенно, без транзакций внутри транзакции)
        if (hostData.priority_info) {
          if (hostData.priority_info.priority) {
            // Используем findOrCreate для приоритета
            const [priority] = await Priority.findOrCreate({
              where: { name: hostData.priority_info.priority.name },
              defaults: { name: hostData.priority_info.priority.name },
              transaction,
            });
            hostUpdateData.priority_id = priority.id;
          }

          // Обработка grouping
          if (hostData.priority_info.grouping) {
            const [grouping] = await Grouping.findOrCreate({
              where: { name: hostData.priority_info.grouping.name },
              defaults: { name: hostData.priority_info.grouping.name },
              transaction,
            });
            hostUpdateData.grouping_id = grouping.id;
          }

          // Обработка country
          if (hostData.priority_info.country) {
            const [country] = await Country.findOrCreate({
              where: { name: hostData.priority_info.country.name },
              defaults: { name: hostData.priority_info.country.name },
              transaction,
            });
            hostUpdateData.country_id = country.id;
          }
        }

        // Обновляем или создаем хост
        if (host) {
          await host.update(hostUpdateData, { transaction });
        } else {
          host = await Host.create(hostUpdateData, { transaction });
        }

        // Создаем связь с файлом
        await HostFileSource.findOrCreate({
          where: {
            host_id: host.id,
            file_source_id: fileSourceId,
          },
          defaults: {
            host_id: host.id,
            file_source_id: fileSourceId,
            created_at: currentTimestamp,
          },
          transaction,
        });

        // Обработка портов
        if (
          hostData.ports &&
          hostData.ports.all &&
          Array.isArray(hostData.ports.all)
        ) {
          // Удаляем старые порты этого хоста
          await Port.destroy({
            where: { host_id: host.id },
            transaction,
          });

          // Обрабатываем все порты
          for (const portData of hostData.ports.all) {
            let portType = "filtered";
            const openPorts = hostData.ports.open || [];
            const isOpen = openPorts.some(
              (openPort) => openPort.port === portData.port
            );

            if (isOpen) {
              portType = "open";
            }

            await Port.create(
              {
                port: portData.port,
                type: portType,
                host_id: host.id,
              },
              { transaction }
            );
          }
        }

        // Обработка Whois данных
        if (hostData.whois && typeof hostData.whois === "object") {
          // Удаляем старые whois записи
          await Whois.destroy({
            where: { host_id: host.id },
            transaction,
          });

          // Обрабатываем каждый whois ключ
          for (const [keyName, value] of Object.entries(hostData.whois)) {
            if (value !== null && value !== undefined) {
              const [whoisKey] = await WhoisKey.findOrCreate({
                where: { key_name: keyName },
                defaults: { key_name: keyName },
                transaction,
              });

              await Whois.create(
                {
                  value: String(value),
                  host_id: host.id,
                  key_id: whoisKey.id,
                },
                { transaction }
              );
            }
          }
        }
      } else if (host) {
        // Данные старее, но хост существует - только связь с файлом
        // console.log(
        //   `⏭️ Хост ${hostData.ip} пропущен (данные старее) - file: ${hostUpdatedAt}, db: ${host.updated_at}`
        // );

        // Убедимся, что связь существует
        await HostFileSource.findOrCreate({
          where: {
            host_id: host.id,
            file_source_id: fileSourceId,
          },
          defaults: {
            host_id: host.id,
            file_source_id: fileSourceId,
            created_at: currentTimestamp,
          },
          transaction,
        });
      }

      // Формируем детальную статистику
      return {
        action: action,
        hostId: host ? host.id : null,
        ip: hostData.ip,
        isNewHost: !isHostExisted,
        hostUpdatedAt: hostUpdatedAt,
        existingHostUpdatedAt: host ? new Date(host.updated_at) : null,
        fileSourceLinked: true,
        reason: shouldUpdate
          ? `Data updated (file: ${hostUpdatedAt} > db: ${
              host ? host.updated_at : "N/A"
            })`
          : `Data skipped (file: ${hostUpdatedAt} <= db: ${
              host ? host.updated_at : "N/A"
            })`,
      };
    } catch (error) {
      console.error(`❌ Ошибка обработки хоста ${hostData.ip}:`, error);
      throw error; // Пробрасываем ошибку для отката транзакции
    }
  }
// files.service.js - добавьте эти методы

// Метод для сканирования и обновления одного IP
static async scanAndUpdateSingleIP(ip, config) {
  try {
    console.log(`🔍 Сканирование и обновление одного IP: ${ip}`)
    
    // 1. Сначала получаем текущие данные хоста из базы
    const existingHost = await Host.findOne({
      where: { ip: ip },
      include: [
        {
          model: Priority,
          attributes: ["id", "name"]
        },
        {
          model: Grouping,
          attributes: ["id", "name"]
        },
        {
          model: Country,
          attributes: ["id", "name"]
        }
      ]
    })
    
    // Сохраняем существующие значения
    const existingPriority = existingHost?.Priority
    const existingGrouping = existingHost?.Grouping
    const existingCountry = existingHost?.Country
    
    // 2. Проверяем, что IP не локальный
    if (isLocalIp(ip)) {
      return { 
        success: false, 
        error: "Локальный IP адрес",
        existingData: existingHost ? {
          priority: existingPriority,
          grouping: existingGrouping,
          country: existingCountry
        } : null
      }
    }
    
    // 3. Проверяем доступность
    const reachable = await checkReachability(ip, config.reachabilityTimeout)
    console.log(`📡 IP ${ip} доступен: ${reachable}`)
    
    let portScanResult = { open: [], filtered: [] }
    let whoisData = {}
    
    // 4. Получаем данные только для доступных хостов
    if (reachable) {
      try {
        // Параллельно сканируем порты и получаем WHOIS
        const [portResult, whoisResult] = await Promise.allSettled([
          scanPortsSimple(ip).catch(() => ({ open: [], filtered: [] })),
          this.getCachedWhois(ip).catch(() => ({}))
        ])
        
        portScanResult = portResult.status === "fulfilled" 
          ? portResult.value 
          : { open: [], filtered: [] }
        
        whoisData = whoisResult.status === "fulfilled" 
          ? whoisResult.value 
          : {}
        
        console.log(`🔌 ${ip}: найдено ${portScanResult.open.length} открытых и ${portScanResult.filtered.length} фильтрованных портов`)
        console.log(`📝 ${ip}: получено ${Object.keys(whoisData).length} WHOIS записей`)
      } catch (scanError) {
        console.error(`❌ Ошибка сканирования ${ip}:`, scanError)
      }
    }
    
    // 5. Подготавливаем данные для сохранения, включая существующие значения
    const dbData = {
      ip: ip,
      reachable: reachable,
      port_data: portScanResult,
      whois: whoisData,
      // Добавляем существующие данные из базы
      existing_priority: existingPriority,
      existing_grouping: existingGrouping,
      existing_country: existingCountry
    }
    
    // 6. Сохраняем данные в базу с передачей существующих значений
    const result = await this.updateSingleIP(dbData, existingHost?.id)
    
    return {
      success: true,
      ip: ip,
      reachable: reachable,
      ports: portScanResult,
      whoisCount: Object.keys(whoisData).length,
      existingData: {
        priority: existingPriority,
        grouping: existingGrouping,
        country: existingCountry
      },
      message: `IP ${ip} успешно обновлен`
    }
    
  } catch (error) {
    console.error(`❌ Ошибка при обновлении IP ${ip}:`, error)
    return {
      success: false,
      error: error.message,
      ip: ip
    }
  }
}

static async updateSingleIP(dbData, hostId = null) {
  const transaction = await sequelize.transaction();
  
  try {
    console.log(`🔄 Обновление одного IP: ${dbData.ip}`)
    
    const { 
      ip, 
      reachable, 
      port_data, 
      whois,
      existing_priority,
      existing_grouping,
      existing_country
    } = dbData
    
    // 1. Находим или создаем хост
    let host;
    if (hostId) {
      host = await Host.findByPk(hostId, { transaction });
    }
    
    if (!host) {
      host = await Host.findOne({
        where: { ip: ip },
        transaction
      });
    }
    
    if (!host) {
      // Создаем новый хост
      host = await Host.create({
        ip: ip,
        reachable: Boolean(reachable),
        updated_at: new Date(),
        // Используем существующие значения или значения по умолчанию
        priority_id: existing_priority?.id || null,
        grouping_id: existing_grouping?.id || null,
        country_id: existing_country?.id || null
      }, { transaction });
      console.log(`✅ Создан новый хост: ${ip}`);
    } else {
      // Обновляем существующий хост, сохраняем существующие значения
      const updateData = {
        reachable: Boolean(reachable),
        updated_at: new Date()
      };
      
      // Только если не null/undefined, сохраняем существующие значения
      if (existing_priority !== undefined && existing_priority !== null) {
        updateData.priority_id = existing_priority.id;
      }
      if (existing_grouping !== undefined && existing_grouping !== null) {
        updateData.grouping_id = existing_grouping.id;
      }
      if (existing_country !== undefined && existing_country !== null) {
        updateData.country_id = existing_country.id;
      }
      
      await host.update(updateData, { transaction });
      console.log(`🔄 Обновлен существующий хост: ${ip}`);
    }
    
    // 2. Обработка портов
    console.log(`   🔌 Обработка портов для ${ip}...`);
    
    // Удаляем старые порты
    await Port.destroy({
      where: { host_id: host.id },
      transaction
    });
    
    // Создаем новые порты
    const portPromises = [];
    
    // Для открытых портов
    const openPorts = Array.isArray(port_data?.open) ? port_data.open : [];
    for (const port of openPorts) {
      const portNumber = typeof port === "object" && port.port ? port.port : port;
      portPromises.push(
        Port.create({
          host_id: host.id,
          port: portNumber,
          type: "open"
        }, { transaction })
      );
    }
    
    // Для filtered портов
    const filteredPorts = Array.isArray(port_data?.filtered) ? port_data.filtered : [];
    for (const port of filteredPorts) {
      const portNumber = typeof port === "object" && port.port ? port.port : port;
      portPromises.push(
        Port.create({
          host_id: host.id,
          port: portNumber,
          type: "filtered"
        }, { transaction })
      );
    }
    
    if (portPromises.length > 0) {
      await Promise.all(portPromises);
      console.log(`   ✅ Порты созданы: ${portPromises.length} записей`);
    }
    
    // 3. Обработка WHOIS данных
    console.log(`   📝 Обработка WHOIS данных для ${ip}...`);
    
    // Удаляем старые WHOIS записи
    await Whois.destroy({
      where: { host_id: host.id },
      transaction
    });
    
    // Получаем разрешенные ключи WHOIS
    const allowedKeys = await WhoisKey.findAll({
      attributes: ["key_name"],
      transaction
    });
    
    const allowedKeyNames = new Set(allowedKeys.map(k => k.key_name));
    
    // Создаем новые WHOIS записи
    const whoisPromises = Object.entries(whois || {})
      .filter(([key]) => allowedKeyNames.has(key))
      .filter(([key, value]) => value !== null && value !== undefined && value !== "")
      .map(async ([key, value]) => {
        const [whoisKey] = await WhoisKey.findOrCreate({
          where: { key_name: key },
          defaults: { key_name: key },
          transaction
        });
        
        return Whois.create({
          host_id: host.id,
          key_id: whoisKey.id,
          value: String(value)
        }, { transaction });
      });
    
    if (whoisPromises.length > 0) {
      await Promise.all(whoisPromises);
      console.log(`   ✅ WHOIS данные созданы: ${whoisPromises.length} записей`);
    }
    
    // 4. Коммит транзакции
    await transaction.commit();
    console.log(`   ✅ Транзакция закоммичена для IP ${ip}`);
    
    return {
      success: true,
      hostId: host.id,
      ip: ip,
      priority_id: host.priority_id,
      grouping_id: host.grouping_id,
      country_id: host.country_id
    };
    
  } catch (error) {
    console.error(`❌ Ошибка при обновлении IP ${dbData.ip}:`, error);
    
    if (transaction) {
      try {
        await transaction.rollback();
        console.log(`↩️ Транзакция откатана для IP ${dbData.ip}`);
      } catch (rollbackError) {
        console.error(`❌ Ошибка при откате транзакции:`, rollbackError);
      }
    }
    
    throw error;
  }
}

// Метод для форматирования данных одного хоста
static formatSingleHostData(host) {
  if (!host) return null
  
  // Формируем данные портов
  const portData = {
    open: [],
    filtered: [],
    all: []
  }
  
  if (host.Ports && host.Ports.length > 0) {
    host.Ports.forEach((port) => {
      const portInfo = {
        port: port.port,
        service: port.WellKnownPort ? port.WellKnownPort.name : null,
        protocol: "tcp"
      }
      
      if (port.type === "open") {
        portData.open.push(portInfo)
      } else if (port.type === "filtered") {
        portData.filtered.push(portInfo)
      }
      portData.all.push(portInfo)
    })
  }
  
  // Формируем данные WHOIS
  const whoisObject = {}
  if (host.Whois && host.Whois.length > 0) {
    host.Whois.forEach((whois) => {
      if (whois.WhoisKey && whois.WhoisKey.key_name) {
        whoisObject[whois.WhoisKey.key_name] = whois.value
      }
    })
  }
  
  // Форматируем данные как в useItemData
  return {
    id: host.id,
    ip: host.ip,
    reachable: host.reachable !== undefined ? host.reachable : false,
    updated_at: host.updated_at,
    port_data: portData,
    priority_info: {
      priority: host.Priority ? {
        id: host.Priority.id,
        name: host.Priority.name
      } : null,
      grouping: host.Grouping ? {
        id: host.Grouping.id,
        name: host.Grouping.name
      } : null,
      country: host.Country ? {
        id: host.Country.id,
        name: host.Country.name
      } : null,
      comment: host.comment || null
    },
    has_whois: Object.keys(whoisObject).length > 0,
    whois_count: Object.keys(whoisObject).length,
    port_count: {
      total: portData.all.length,
      open: portData.open.length,
      filtered: portData.filtered.length
    },
    whois: Object.keys(whoisObject).length > 0 ? whoisObject : undefined
  }
}

  // РАБОЧИЙ СТАРЫЙ Вспомогательный метод для обработки данных хоста
  // static async processHostData(
  //   hostData,
  //   fileSourceId,
  //   transaction,
  //   progressCallback
  // ) {
  //   try {
  //     // Проверяем наличие IP
  //     if (!hostData.ip) {
  //       throw new Error("Отсутствует IP адрес");
  //     }

  //     const currentTimestamp = new Date();
  //     const hostUpdatedAt = hostData.updated_at
  //       ? new Date(hostData.updated_at)
  //       : currentTimestamp;

  //     // Поиск существующего хоста
  //     let host = await Host.findOne({
  //       where: { ip: hostData.ip },
  //       transaction,
  //     });

  //     // Определяем действие
  //     let action = "";
  //     let isHostExisted = !!host;
  //     let shouldUpdate = false;

  //     if (!host) {
  //       // Новый хост - всегда обновляем
  //       action = "created";
  //       shouldUpdate = true;
  //     } else {
  //       // Существующий хост - проверяем время обновления
  //       const existingHostUpdatedAt = new Date(host.updated_at);
  //       shouldUpdate = hostUpdatedAt > existingHostUpdatedAt;
  //       action = shouldUpdate ? "updated" : "skipped";
  //     }

  //     // Счетчик для портов и whois
  //     let portsCreated = 0;
  //     let whoisCreated = 0;
  //     let portsDeleted = 0;
  //     let whoisDeleted = 0;

  //     // ВСЕГДА проверяем/создаем связь с файлом
  //     const hostFileSourceLink = await HostFileSource.findOrCreate({
  //       where: {
  //         host_id: host ? host.id : null, // будет null для нового хоста
  //         file_source_id: fileSourceId,
  //       },
  //       defaults: {
  //         host_id: host ? host.id : null,
  //         file_source_id: fileSourceId,
  //         created_at: currentTimestamp,
  //       },
  //       transaction,
  //     });

  //     if (shouldUpdate) {
  //       // Подготовка данных для хоста
  //       const hostUpdateData = {
  //         ip: hostData.ip,
  //         reachable:
  //           hostData.reachable !== undefined ? hostData.reachable : true,
  //         updated_at: hostUpdatedAt,
  //         priority_id: null,
  //         grouping_id: null,
  //         country_id: null,
  //       };

  //       // Обработка priority_info
  //       if (hostData.priority_info) {
  //         if (hostData.priority_info.priority) {
  //           // Находим или создаем приоритет
  //           let priority = await Priority.findOne({
  //             where: { name: hostData.priority_info.priority.name },
  //             transaction,
  //           });

  //           if (!priority) {
  //             priority = await Priority.create(
  //               {
  //                 name: hostData.priority_info.priority.name,
  //               },
  //               { transaction }
  //             );
  //           }

  //           hostUpdateData.priority_id = priority.id;
  //         }

  //         // Обработка grouping (если есть)
  //         if (hostData.priority_info.grouping) {
  //           let grouping = await Grouping.findOne({
  //             where: { name: hostData.priority_info.grouping.name },
  //             transaction,
  //           });

  //           if (!grouping) {
  //             grouping = await Grouping.create(
  //               {
  //                 name: hostData.priority_info.grouping.name,
  //               },
  //               { transaction }
  //             );
  //           }

  //           hostUpdateData.grouping_id = grouping.id;
  //         }

  //         // Обработка country (если есть)
  //         if (hostData.priority_info.country) {
  //           let country = await Country.findOne({
  //             where: { name: hostData.priority_info.country.name },
  //             transaction,
  //           });

  //           if (!country) {
  //             // @TODO проверить
  //             // const strName= hostData.priority_info.country.name
  //             // const isDifficultName = [...strName].some((el) => el === ",");

  //             // const name = isDifficultName
  //             //     ? strName.split(',').at()
  //             //     : hostData.priority_info.country.name

  //               country = await Country.create(
  //                 {
  //                   name: hostData.priority_info.country.name,
  //                   // name: name,
  //                 },
  //                 { transaction }
  //               );
  //           }

  //           hostUpdateData.country_id = country.id;
  //         }
  //       }

  //       // console.log('hostData.updated_at > ', hostData.updated_at)
  //       // console.log('host.updated_at > ', host.updated_at)
  //       // hostData.updated_at >  undefined
  //       // host.updated_at >  2025-12-13T19:05:15.907Z

  //       // Обновляем или создаем хост
  //       if (host) {
  //         // Обновляем существующий хост
  //         await host.update(hostUpdateData, { transaction });
  //         // console.log(`🔄 Хост ${hostData.ip} обновлен (данные новее) - updated_at: ${hostUpdatedAt}`);
  //       } else {
  //         // Создаем новый хост
  //         host = await Host.create(hostUpdateData, { transaction });
  //         // console.log(`✅ Новый хост ${hostData.ip} создан`);

  //         // Обновляем связь с файлом, теперь с ID хоста
  //         if (hostFileSourceLink && hostFileSourceLink[0]) {
  //           await hostFileSourceLink[0].update(
  //             {
  //               host_id: host.id,
  //             },
  //             { transaction }
  //           );
  //         }
  //       }

  //       // 1. Обработка портов (только если данные новее)
  //       if (hostData.ports) {
  //         // Удаляем старые порты этого хоста
  //         const deletedPortsCount = await Port.destroy({
  //           where: { host_id: host.id },
  //           transaction,
  //         });
  //         // portsDeleted = deletedPortsCount;

  //         // Обрабатываем все порты из массива 'all'
  //         if (hostData.ports.all && Array.isArray(hostData.ports.all)) {
  //           for (const portData of hostData.ports.all) {
  //             // Определяем тип порта
  //             let portType = "filtered";
  //             const openPorts = hostData.ports.open || [];
  //             const isOpen = openPorts.some(
  //               (openPort) => openPort.port === portData.port
  //             );

  //             if (isOpen) {
  //               portType = "open";
  //             }

  //             // Создаем запись порта
  //             await Port.create(
  //               {
  //                 port: portData.port,
  //                 type: portType,
  //                 host_id: host.id,
  //               },
  //               { transaction }
  //             );

  //             // portsCreated++;

  //             // Обновляем well_known_ports если есть service
  //             if (portData.service && portData.service !== null) {
  //               await WellKnownPort.findOrCreate({
  //                 where: { port: portData.port },
  //                 defaults: {
  //                   port: portData.port,
  //                   name: portData.service,
  //                 },
  //                 transaction,
  //               });
  //             }
  //           }
  //         }
  //       }

  //       // 2. Обработка Whois данных (только если данные новее)
  //       if (hostData.whois && typeof hostData.whois === "object") {
  //         // Удаляем старые whois записи этого хоста
  //         const deletedWhoisCount = await Whois.destroy({
  //           where: { host_id: host.id },
  //           transaction,
  //         });
  //         // whoisDeleted = deletedWhoisCount;

  //         // Обрабатываем каждый whois ключ
  //         for (const [keyName, value] of Object.entries(hostData.whois)) {
  //           if (value !== null && value !== undefined) {
  //             // Находим или создаем ключ whois
  //             let whoisKey = await WhoisKey.findOne({
  //               where: { key_name: keyName },
  //               transaction,
  //             });

  //             if (!whoisKey) {
  //               whoisKey = await WhoisKey.create(
  //                 {
  //                   key_name: keyName,
  //                 },
  //                 { transaction }
  //               );
  //             }

  //             // Создаем запись whois
  //             await Whois.create(
  //               {
  //                 value: String(value),
  //                 host_id: host.id,
  //                 key_id: whoisKey.id,
  //               },
  //               { transaction }
  //             );

  //             // whoisCreated++;
  //           }
  //         }
  //       }
  //     } else if (host) {
  //       // Данные старее, но хост существует - только связь с файлом
  //       console.log(
  //         `⏭️ Хост ${hostData.ip} пропущен (данные старее) - file: ${hostUpdatedAt}, db: ${host.updated_at}`
  //       );

  //       // Убедимся, что связь существует
  //       if (!hostFileSourceLink[0].host_id && host.id) {
  //         await hostFileSourceLink[0].update(
  //           {
  //             host_id: host.id,
  //           },
  //           { transaction }
  //         );
  //       }
  //     }

  //     // Формируем детальную статистику
  //     const stats = {
  //       action: action,
  //       hostId: host ? host.id : null,
  //       ip: hostData.ip,
  //       isNewHost: !isHostExisted,
  //       // portsCreated: portsCreated,
  //       // portsDeleted: portsDeleted,
  //       // whoisCreated: whoisCreated,
  //       // whoisDeleted: whoisDeleted,
  //       hostUpdatedAt: hostUpdatedAt,
  //       existingHostUpdatedAt: host ? new Date(host.updated_at) : null,
  //       fileSourceLinked: true,
  //       reason: shouldUpdate
  //         ? `Data updated (file: ${hostUpdatedAt} > db: ${
  //             host ? host.updated_at : "N/A"
  //           })`
  //         : `Data skipped (file: ${hostUpdatedAt} <= db: ${
  //             host ? host.updated_at : "N/A"
  //           })`,
  //     };

  //     // Отправляем прогресс для каждого хоста (опционально)
  //     if (progressCallback && typeof progressCallback === "function") {
  //       progressCallback({
  //         type: "host_processed",
  //         action: action,
  //         ip: hostData.ip,
  //         stats: stats,
  //         timestamp: new Date().toISOString(),
  //       });
  //     }

  //     return stats;
  //   } catch (error) {
  //     console.error(`❌ Ошибка обработки хоста ${hostData.ip}:`, error);

  //     // Возвращаем информацию об ошибке для статистики
  //     return {
  //       action: "error",
  //       ip: hostData.ip || "unknown",
  //       error: error.message,
  //       errorDetails: error.toString(),
  //       timestamp: new Date().toISOString(),
  //     };
  //   }
  // }
  /***************** */
  static async normalizeAndFindFile(fileName) {
    // Просто ищем файл по имени как есть
    const fileSource = await FileSource.findOne({
      where: { name: fileName },
      include: [
        {
          model: Host,
          through: { attributes: [] },
          required: false,
        },
      ],
    });

    if (fileSource) {
      console.log(`✅ Файл найден: "${fileSource.name}"`);
      return fileSource;
    }

    return null;
  }

static async addedJSONoneObj(
  fileContent,
  externalTransaction = null,
  fileName = null
) {
  const shouldCommit = !externalTransaction;
  const transaction = externalTransaction || (await sequelize.transaction());

  try {
    console.log(
      `🔄 addedJSONoneObj: Начало обработки для IP ${fileContent.ip}, файл: "${fileName}"`
    );

    const ip = fileContent.ip;
    const reachable = fileContent.reachable;
    const portData = fileContent.port_data || {};
    const whoisData = fileContent.whois || {};

    if (!ip) {
      throw new Error("IP адрес отсутствует в данных.");
    }

    console.log(
      `   📊 Данные IP ${ip}: reachable=${reachable}, ports=${JSON.stringify(
        portData
      )}`
    );

 // 1. Сначала находим существующий хост (если есть)
    const existingHost = await Host.findOne({
      where: { ip: ip },
      transaction
    });

    // Сохраняем существующие значения
    const existingPriorityId = existingHost?.priority_id;
    const existingGroupingId = existingHost?.grouping_id;
    const existingCountryId = existingHost?.country_id;

      // 1. Находим или создаем источник файла
      let fileSource = null;
      if (fileName && typeof fileName === "string") {
        console.log(`   📁 Поиск/создание источника файла: "${fileName}"`);

        try {
          const originalFileName = fileName
            .replace(/%5B/g, "[")
            .replace(/%5D/g, "]")
            .replace(/%20/g, " ")
            .replace(/%E2%80%94/g, "—");

          console.log(
            `   📁 Оригинальное имя файла: "${originalFileName}" (длина: ${originalFileName.length})`
          );

          // Проверяем, есть ли уже такой файл
          const existingFile = await FileSource.findOne({
            where: { name: originalFileName },
            transaction,
          });

          if (existingFile) {
            console.log(
              `   ✅ Найден существующий FileSource: ID=${existingFile.id}, name="${existingFile.name}"`
            );
            fileSource = existingFile;

            // ОБНОВЛЯЕМ updated_at при повторной загрузке файла
            console.log(
              `   🔄 Обновление поля updated_at для файла ID=${fileSource.id}`
            );
            await fileSource.update(
              {
                updated_at: new Date(),
              },
              { transaction }
            );
            console.log(
              `   ✅ Файл обновлен: updated_at=${new Date().toISOString()}`
            );
          } else {
            console.log(
              `   ➕ Создание нового FileSource: "${originalFileName}"`
            );
            fileSource = await FileSource.create(
              {
                name: originalFileName,
                encoding: "UTF-8",
                uploaded_at: new Date(),
                updated_at: new Date(), // И для нового файла тоже
              },
              { transaction }
            );
            console.log(
              `   ✅ Создан FileSource: ID=${fileSource.id}, name="${fileSource.name}"`
            );
          }
        } catch (fileError) {
          console.error(
            `   ❌ Ошибка при работе с FileSource "${fileName}":`,
            fileError
          );
          if (shouldCommit) {
            await transaction.rollback();
          }
          throw new Error(`Ошибка работы с файлом: ${fileError.message}`);
        }
      } else {
        console.warn(`   ⚠️ fileName не указан или пустой: ${fileName}`);
      }

      // 2. Находим или создаем записи "Неопределено" для grouping и country
      console.log(`   🔍 Поиск/создание записей "Неопределено"...`);

      // Для группировки
      let defaultGrouping = await Grouping.findOne({
        where: { name: "Неопределено" },
        transaction,
      });

      if (!defaultGrouping) {
        defaultGrouping = await Grouping.create(
          {
            name: "Неопределено",
          },
          { transaction }
        );
        console.log(
          `   ✅ Создана запись Grouping "Неопределено": ID=${defaultGrouping.id}`
        );
      }

      // Для страны
      let defaultCountry = await Country.findOne({
        where: { name: "Неопределено" },
        transaction,
      });

      if (!defaultCountry) {
        defaultCountry = await Country.create(
          {
            name: "Неопределено",
          },
          { transaction }
        );
        console.log(
          `   ✅ Создана запись Country "Неопределено": ID=${defaultCountry.id}`
        );
      }

      // 2.1. Находим или создаем хост
 console.log(`   🔍 Поиск/создание хоста: ${ip}`);
    let host = existingHost;

    if (!host) {
      console.log(`   ➕ Создание нового хоста: ${ip}`);
      host = await Host.create(
        {
          ip: ip,
          reachable: Boolean(reachable),
          updated_at: new Date(),
          // Устанавливаем значения по умолчанию или существующие
          grouping_id: existingGroupingId || defaultGrouping.id,
          country_id: existingCountryId || defaultCountry.id,
        },
        { transaction }
      );
        console.log(
          `   ✅ Создан хост: ID=${host.id}, IP=${host.ip}, reachable=${host.reachable}`
        );
      } else {
        console.log(
          `   🔄 Обновление существующего хоста: ID=${host.id}, IP=${host.ip}`
        );
        await host.update(
        {
          reachable: Boolean(reachable),
          updated_at: new Date(),
          // Сохраняем существующие значения, если они есть
          grouping_id: existingGroupingId || host.grouping_id || defaultGrouping.id,
          country_id: existingCountryId || host.country_id || defaultCountry.id,
        },
        { transaction }
      );
        console.log(
          `   ✅ Хост обновлен: ID=${host.id}, reachable=${host.reachable}`
        );
      }

      // 4. Создаем связь между хостом и файлом
      if (fileSource && host) {
        console.log(
          `   🔗 Создание связи Host ${host.id} ↔ FileSource ${fileSource.id}`
        );

        try {
          // Проверяем, существует ли уже связь
          const existingLink = await HostFileSource.findOne({
            where: {
              host_id: host.id,
              file_source_id: fileSource.id,
            },
            transaction,
          });

          if (!existingLink) {
            console.log(`   ➕ Создание новой связи...`);
            const link = await HostFileSource.create(
              {
                host_id: host.id,
                file_source_id: fileSource.id,
                created_at: new Date(),
              },
              { transaction }
            );
            console.log(
              `   ✅ Создана связь: ID=${link.id}, Host=${host.id}, FileSource=${fileSource.id}`
            );
          } else {
            console.log(
              `   ℹ️ Связь уже существует: Host ${host.id} ↔ FileSource ${fileSource.id} (ID: ${existingLink.id})`
            );
          }

          // Проверим все связи этого хоста
          const allLinks = await HostFileSource.findAll({
            where: { host_id: host.id },
            transaction,
          });
          console.log(
            `   📋 У хоста ${host.id} всего связей с файлами: ${allLinks.length}`
          );
        } catch (linkError) {
          console.error(`   ❌ Ошибка при создании связи:`, linkError);
          console.error("   Детали ошибки:", linkError.stack);
        }
      } else {
        console.warn(
          `   ⚠️ Не удалось создать связь: host=${
            host ? "есть" : "нет"
          }, fileSource=${fileSource ? "есть" : "нет"}`
        );
      }

      // 4. Обработка портов - ИСПРАВЛЯЕМ ОШИБКУ с undefined
      console.log(`   🔌 Обработка портов для ${ip}...`);

      // Удаляем старые порты для этого хоста
      await Port.destroy({
        where: { host_id: host.id },
        transaction,
      });

      // Создаем новые порты
      const portPromises = [];

      // Для открытых портов - исправляем ошибку с undefined
      const openPorts = Array.isArray(portData.open) ? portData.open : [];
      console.log(`   🔌 Открытых портов: ${openPorts.length}`);
      for (const port of openPorts) {
        const portNumber =
          typeof port === "object" && port.port ? port.port : port;
        portPromises.push(
          Port.create(
            {
              host_id: host.id,
              port: portNumber,
              type: "open",
            },
            { transaction }
          )
        );
      }

      // Для filtered портов
      const filteredPorts = Array.isArray(portData.filtered)
        ? portData.filtered
        : [];
      console.log(`   🔌 Фильтрованных портов: ${filteredPorts.length}`);
      for (const port of filteredPorts) {
        const portNumber =
          typeof port === "object" && port.port ? port.port : port;
        portPromises.push(
          Port.create(
            {
              host_id: host.id,
              port: portNumber,
              type: "filtered",
            },
            { transaction }
          )
        );
      }

      if (portPromises.length > 0) {
        await Promise.all(portPromises);
        console.log(`   ✅ Порты созданы: ${portPromises.length} записей`);
      }

      // 5. Обработка WHOIS данных
      console.log(`   📝 Обработка WHOIS данных для ${ip}...`);
      const allowedKeys = await WhoisKey.findAll({
        attributes: ["key_name"],
        transaction,
      });

      const allowedKeyNames = new Set(allowedKeys.map((k) => k.key_name));
      console.log(
        `   📝 Разрешенные WHOIS ключи: ${Array.from(allowedKeyNames).join(
          ", "
        )}`
      );

      // Удаляем старые WHOIS записи
      await Whois.destroy({
        where: { host_id: host.id },
        transaction,
      });

      const whoisPromises = Object.entries(whoisData)
        .filter(([key]) => allowedKeyNames.has(key))
        .filter(
          ([key, value]) =>
            value !== null && value !== undefined && value !== ""
        )
        .map(async ([key, value]) => {
          const [whoisKey, created] = await WhoisKey.findOrCreate({
            where: { key_name: key },
            defaults: { key_name: key },
            transaction,
          });

          return Whois.create(
            {
              host_id: host.id,
              key_id: whoisKey.id,
              value: String(value),
            },
            { transaction }
          );
        });

      if (whoisPromises.length > 0) {
        await Promise.all(whoisPromises);
        console.log(
          `   ✅ WHOIS данные созданы: ${whoisPromises.length} записей`
        );
      }

      // 6. Коммит транзакции
      if (shouldCommit) {
        await transaction.commit();
        console.log(`   ✅ Транзакция закоммичена для IP ${ip}`);
      }

      return {
        success: true,
        ip: ip,
        hostId: host ? host.id : null,
        fileSourceId: fileSource ? fileSource.id : null,
        grouping_id: host.grouping_id,
        country_id: host.country_id,
      };
    } catch (error) {
      console.error(
        `❌ Критическая ошибка в addedJSONoneObj для IP ${fileContent.ip}:`,
        error
      );
      console.error("Stack:", error.stack);

      if (shouldCommit && transaction) {
        try {
          await transaction.rollback();
          console.log(`↩️ Транзакция откатана для IP ${fileContent.ip}`);
        } catch (rollbackError) {
          console.error(`❌ Ошибка при откате транзакции:`, rollbackError);
        }
      }

      throw new Error(
        `Ошибка при добавлении данных для IP ${fileContent.ip}: ` +
          error.message
      );
    }
  }
  // static async addedJSONoneObj(
  //   fileContent,
  //   externalTransaction = null,
  //   fileName = null
  // ) {
  //   const shouldCommit = !externalTransaction;
  //   const transaction = externalTransaction || (await sequelize.transaction());

  //   try {
  //     console.log(
  //       `🔄 addedJSONoneObj: Начало обработки для IP ${fileContent.ip}, файл: "${fileName}"`
  //     );

  //     const ip = fileContent.ip;
  //     const reachable = fileContent.reachable;
  //     const portData = fileContent.port_data || {};
  //     const whoisData = fileContent.whois || {};

  //     if (!ip) {
  //       throw new Error("IP адрес отсутствует в данных.");
  //     }

  //     console.log(
  //       `   📊 Данные IP ${ip}: reachable=${reachable}, ports=${JSON.stringify(
  //         portData
  //       )}`
  //     );

  //     // 1. Находим или создаем источник файла
  //     let fileSource = null;
  //     if (fileName && typeof fileName === "string") {
  //       console.log(`   📁 Поиск/создание источника файла: "${fileName}"`);

  //       try {
  //         const originalFileName = fileName
  //           .replace(/%5B/g, "[")
  //           .replace(/%5D/g, "]")
  //           .replace(/%20/g, " ")
  //           .replace(/%E2%80%94/g, "—");

  //         console.log(
  //           `   📁 Оригинальное имя файла: "${originalFileName}" (длина: ${originalFileName.length})`
  //         );

  //         // Проверяем, есть ли уже такой файл
  //         const existingFile = await FileSource.findOne({
  //           where: { name: originalFileName },
  //           transaction,
  //         });

  //         if (existingFile) {
  //           console.log(
  //             `   ✅ Найден существующий FileSource: ID=${existingFile.id}, name="${existingFile.name}"`
  //           );
  //           fileSource = existingFile;

  //           // ОБНОВЛЯЕМ updated_at при повторной загрузке файла
  //           console.log(
  //             `   🔄 Обновление поля updated_at для файла ID=${fileSource.id}`
  //           );
  //           await fileSource.update(
  //             {
  //               updated_at: new Date(),
  //             },
  //             { transaction }
  //           );
  //           console.log(
  //             `   ✅ Файл обновлен: updated_at=${new Date().toISOString()}`
  //           );
  //         } else {
  //           console.log(
  //             `   ➕ Создание нового FileSource: "${originalFileName}"`
  //           );
  //           fileSource = await FileSource.create(
  //             {
  //               name: originalFileName,
  //               encoding: "UTF-8",
  //               uploaded_at: new Date(),
  //               updated_at: new Date(), // И для нового файла тоже
  //             },
  //             { transaction }
  //           );
  //           console.log(
  //             `   ✅ Создан FileSource: ID=${fileSource.id}, name="${fileSource.name}"`
  //           );
  //         }
  //       } catch (fileError) {
  //         console.error(
  //           `   ❌ Ошибка при работе с FileSource "${fileName}":`,
  //           fileError
  //         );
  //         if (shouldCommit) {
  //           await transaction.rollback();
  //         }
  //         throw new Error(`Ошибка работы с файлом: ${fileError.message}`);
  //       }
  //     } else {
  //       console.warn(`   ⚠️ fileName не указан или пустой: ${fileName}`);
  //     }

  //     // 2. Находим или создаем записи "Неопределено" для grouping и country
  //     console.log(`   🔍 Поиск/создание записей "Неопределено"...`);

  //     // Для группировки
  //     let defaultGrouping = await Grouping.findOne({
  //       where: { name: "Неопределено" },
  //       transaction,
  //     });

  //     if (!defaultGrouping) {
  //       defaultGrouping = await Grouping.create(
  //         {
  //           name: "Неопределено",
  //         },
  //         { transaction }
  //       );
  //       console.log(
  //         `   ✅ Создана запись Grouping "Неопределено": ID=${defaultGrouping.id}`
  //       );
  //     }

  //     // Для страны
  //     let defaultCountry = await Country.findOne({
  //       where: { name: "Неопределено" },
  //       transaction,
  //     });

  //     if (!defaultCountry) {
  //       defaultCountry = await Country.create(
  //         {
  //           name: "Неопределено",
  //         },
  //         { transaction }
  //       );
  //       console.log(
  //         `   ✅ Создана запись Country "Неопределено": ID=${defaultCountry.id}`
  //       );
  //     }

  //     // 2.1. Находим или создаем хост
  //     console.log(`   🔍 Поиск/создание хоста: ${ip}`);
  //     let host = await Host.findOne({
  //       where: { ip: ip },
  //       transaction,
  //     });

  //     if (!host) {
  //       console.log(`   ➕ Создание нового хоста: ${ip}`);
  //       host = await Host.create(
  //         {
  //           ip: ip,
  //           reachable: Boolean(reachable),
  //           updated_at: new Date(),
  //           // Устанавливаем значения по умолчанию
  //           grouping_id: defaultGrouping.id,
  //           country_id: defaultCountry.id,
  //         },
  //         { transaction }
  //       );
  //       console.log(
  //         `   ✅ Создан хост: ID=${host.id}, IP=${host.ip}, reachable=${host.reachable}`
  //       );
  //     } else {
  //       console.log(
  //         `   🔄 Обновление существующего хоста: ID=${host.id}, IP=${host.ip}`
  //       );
  //       await host.update(
  //         {
  //           reachable: Boolean(reachable),
  //           updated_at: new Date(),
  //           // Обновляем значения по умолчанию если они не установлены
  //           grouping_id: host.grouping_id || defaultGrouping.id,
  //           country_id: host.country_id || defaultCountry.id,
  //         },
  //         { transaction }
  //       );
  //       console.log(
  //         `   ✅ Хост обновлен: ID=${host.id}, reachable=${host.reachable}`
  //       );
  //     }

  //     // 4. Создаем связь между хостом и файлом
  //     if (fileSource && host) {
  //       console.log(
  //         `   🔗 Создание связи Host ${host.id} ↔ FileSource ${fileSource.id}`
  //       );

  //       try {
  //         // Проверяем, существует ли уже связь
  //         const existingLink = await HostFileSource.findOne({
  //           where: {
  //             host_id: host.id,
  //             file_source_id: fileSource.id,
  //           },
  //           transaction,
  //         });

  //         if (!existingLink) {
  //           console.log(`   ➕ Создание новой связи...`);
  //           const link = await HostFileSource.create(
  //             {
  //               host_id: host.id,
  //               file_source_id: fileSource.id,
  //               created_at: new Date(),
  //             },
  //             { transaction }
  //           );
  //           console.log(
  //             `   ✅ Создана связь: ID=${link.id}, Host=${host.id}, FileSource=${fileSource.id}`
  //           );
  //         } else {
  //           console.log(
  //             `   ℹ️ Связь уже существует: Host ${host.id} ↔ FileSource ${fileSource.id} (ID: ${existingLink.id})`
  //           );
  //         }

  //         // Проверим все связи этого хоста
  //         const allLinks = await HostFileSource.findAll({
  //           where: { host_id: host.id },
  //           transaction,
  //         });
  //         console.log(
  //           `   📋 У хоста ${host.id} всего связей с файлами: ${allLinks.length}`
  //         );
  //       } catch (linkError) {
  //         console.error(`   ❌ Ошибка при создании связи:`, linkError);
  //         console.error("   Детали ошибки:", linkError.stack);
  //       }
  //     } else {
  //       console.warn(
  //         `   ⚠️ Не удалось создать связь: host=${
  //           host ? "есть" : "нет"
  //         }, fileSource=${fileSource ? "есть" : "нет"}`
  //       );
  //     }

  //     // 4. Обработка портов - ИСПРАВЛЯЕМ ОШИБКУ с undefined
  //     console.log(`   🔌 Обработка портов для ${ip}...`);

  //     // Удаляем старые порты для этого хоста
  //     await Port.destroy({
  //       where: { host_id: host.id },
  //       transaction,
  //     });

  //     // Создаем новые порты
  //     const portPromises = [];

  //     // Для открытых портов - исправляем ошибку с undefined
  //     const openPorts = Array.isArray(portData.open) ? portData.open : [];
  //     console.log(`   🔌 Открытых портов: ${openPorts.length}`);
  //     for (const port of openPorts) {
  //       const portNumber =
  //         typeof port === "object" && port.port ? port.port : port;
  //       portPromises.push(
  //         Port.create(
  //           {
  //             host_id: host.id,
  //             port: portNumber,
  //             type: "open",
  //           },
  //           { transaction }
  //         )
  //       );
  //     }

  //     // Для filtered портов
  //     const filteredPorts = Array.isArray(portData.filtered)
  //       ? portData.filtered
  //       : [];
  //     console.log(`   🔌 Фильтрованных портов: ${filteredPorts.length}`);
  //     for (const port of filteredPorts) {
  //       const portNumber =
  //         typeof port === "object" && port.port ? port.port : port;
  //       portPromises.push(
  //         Port.create(
  //           {
  //             host_id: host.id,
  //             port: portNumber,
  //             type: "filtered",
  //           },
  //           { transaction }
  //         )
  //       );
  //     }

  //     if (portPromises.length > 0) {
  //       await Promise.all(portPromises);
  //       console.log(`   ✅ Порты созданы: ${portPromises.length} записей`);
  //     }

  //     // 5. Обработка WHOIS данных
  //     console.log(`   📝 Обработка WHOIS данных для ${ip}...`);
  //     const allowedKeys = await WhoisKey.findAll({
  //       attributes: ["key_name"],
  //       transaction,
  //     });

  //     const allowedKeyNames = new Set(allowedKeys.map((k) => k.key_name));
  //     console.log(
  //       `   📝 Разрешенные WHOIS ключи: ${Array.from(allowedKeyNames).join(
  //         ", "
  //       )}`
  //     );

  //     // Удаляем старые WHOIS записи
  //     await Whois.destroy({
  //       where: { host_id: host.id },
  //       transaction,
  //     });

  //     const whoisPromises = Object.entries(whoisData)
  //       .filter(([key]) => allowedKeyNames.has(key))
  //       .filter(
  //         ([key, value]) =>
  //           value !== null && value !== undefined && value !== ""
  //       )
  //       .map(async ([key, value]) => {
  //         const [whoisKey, created] = await WhoisKey.findOrCreate({
  //           where: { key_name: key },
  //           defaults: { key_name: key },
  //           transaction,
  //         });

  //         return Whois.create(
  //           {
  //             host_id: host.id,
  //             key_id: whoisKey.id,
  //             value: String(value),
  //           },
  //           { transaction }
  //         );
  //       });

  //     if (whoisPromises.length > 0) {
  //       await Promise.all(whoisPromises);
  //       console.log(
  //         `   ✅ WHOIS данные созданы: ${whoisPromises.length} записей`
  //       );
  //     }

  //     // 6. Коммит транзакции
  //     if (shouldCommit) {
  //       await transaction.commit();
  //       console.log(`   ✅ Транзакция закоммичена для IP ${ip}`);
  //     }

  //     return {
  //       success: true,
  //       ip: ip,
  //       hostId: host ? host.id : null,
  //       fileSourceId: fileSource ? fileSource.id : null,
  //       grouping_id: host.grouping_id,
  //       country_id: host.country_id,
  //     };
  //   } catch (error) {
  //     console.error(
  //       `❌ Критическая ошибка в addedJSONoneObj для IP ${fileContent.ip}:`,
  //       error
  //     );
  //     console.error("Stack:", error.stack);

  //     if (shouldCommit && transaction) {
  //       try {
  //         await transaction.rollback();
  //         console.log(`↩️ Транзакция откатана для IP ${fileContent.ip}`);
  //       } catch (rollbackError) {
  //         console.error(`❌ Ошибка при откате транзакции:`, rollbackError);
  //       }
  //     }

  //     throw new Error(
  //       `Ошибка при добавлении данных для IP ${fileContent.ip}: ` +
  //         error.message
  //     );
  //   }
  // }

  static formattedDataProcess(data) {
    return data.Hosts.map((host) => {
      // Формируем данные портов
      const portData = {
        open: [],
        filtered: [],
        all: [],
      };

      if (host.Ports && host.Ports.length > 0) {
        host.Ports.forEach((port) => {
          const portInfo = {
            port: port.port,
            // state: port.type || "unknown",
            service: port.WellKnownPort ? port.WellKnownPort.name : null,
            protocol: port.protocol || "tcp",
            // created_at: port.created_at,
            // updated_at: port.updated_at,
          };

          if (port.type === "open") {
            portData.open.push(portInfo);
          } else if (port.type === "filtered") {
            portData.filtered.push(portInfo);
          }
          portData.all.push(portInfo);
        });
      }

      // Формируем данные WHOIS
      const whoisData = [];
      if (host.Whois && host.Whois.length > 0) {
        host.Whois.forEach((whois) => {
          if (whois.WhoisKey && whois.WhoisKey.key_name) {
            whoisData.push({
              key: whois.WhoisKey.key_name,
              value: whois.value,
              // created_at: whois.created_at,
            });
          }
        });
      }

      // Базовый объект хоста
      const hostData = {
        id: host.id,
        ip: host.ip,
        reachable: host.reachable !== undefined ? host.reachable : false,
        updated_at: host.updated_at,
        // last_checked: host.updated_at,
        ports: portData,
        priority_info: {
          priority: host.Priority
            ? {
                id: host.Priority.id,
                name: host.Priority.name,
                // created_at: host.Priority.created_at,
              }
            : null,
          grouping: host.Grouping
            ? {
                id: host.Grouping.id,
                name: host.Grouping.name,
                // created_at: host.Grouping.created_at,
              }
            : null,
          country: host.Country
            ? {
                id: host.Country.id,
                name: host.Country.name,
                // code: host.Country.code || null,
                // created_at: host.Country.created_at,
              }
            : null,
        },
        has_whois: whoisData.length > 0,
        whois_count: whoisData.length,
        port_count: {
          total: portData.all.length,
          open: portData.open.length,
          filtered: portData.filtered.length,
        },
      };

      // Добавляем WHOIS данные, если они есть
      if (whoisData.length > 0) {
        const whoisObject = {};
        whoisData.forEach((item) => {
          whoisObject[item.key] = item.value;
        });
        hostData.whois = whoisObject;
        // hostData.whois_details = whoisData; // Полная информация
      }

      return hostData;
    });
  }


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
        // Убедитесь, что scanVersionDetection импортирована!
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

      console.log(
        `Версионное сканирование для ${ip} завершено, найдено:`,
        versionScanResult.length,
        "сервисов"
      );

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

  // Метод для экспорта данных одного файла РАБОЧИЙ
  static async exportFileData(fileName) {
    try {
      console.log(`📊 Экспорт данных для файла: "${fileName}"`);
      // Декодируем имя файла если оно пришло в закодированном виде
      let searchName = fileName;
      let decodedName = fileName;
      try {
        decodedName = decodeURIComponent(fileName);
        if (decodedName !== fileName) {
          console.log(`🔍 Декодировано имя файла: "${decodedName}"`);
          // searchName = decodedName; // Потенциально использовать decodedName для поиска
        }
      } catch (e) {
        console.log(
          "⚠️ Не удалось декодировать имя файла, используем оригинал"
        );
      }

      // Ищем файл по точному имени (включая закодированное и декодированное)
      let fileSources = await FileSource.findAll({
        where: {
          [Op.or]: [
            { name: fileName }, // оригинальное имя
            { name: decodedName }, // декодированное имя
            { name: encodeURIComponent(decodedName) }, // закодированное декодированного
            { name: encodeURIComponent(fileName) }, // закодированное оригинального
          ],
        },
        order: [["uploaded_at", "DESC"]], // Сортируем по дате создания (новые первыми)
      });

      // Если не нашли, ищем по частичному совпадению
      if (fileSources.length === 0) {
        console.log(`🔍 Поиск частичного совпадения для: "${searchName}"`);
        fileSources = await FileSource.findAll({
          where: {
            name: {
              [Op.like]: `%${searchName
                .replace(/%/g, "\\%")
                .replace(/_/g, "\\_")}%`,
            },
          },
          order: [["uploaded_at", "DESC"]], // Сортируем по дате создания
        });
      }

      if (fileSources.length === 0) {
        console.log(`❌ Файл "${fileName}" не найден в FileSource`);
        // Дополнительная диагностика: покажем все доступные файлы
        const allFiles = await FileSource.findAll({
          attributes: ["id", "name", "uploaded_at"],
          limit: 10,
          order: [["uploaded_at", "DESC"]],
        });
        console.log(
          `📋 Доступные файлы:`,
          allFiles.map(
            (f) => `${f.name} (ID: ${f.id}, Created: ${f.uploaded_at})`
          )
        );
        return []; // Возвращаем пустой массив вместо null
      }

      // Берем первый файл из отсортированного списка (новейший)
      const fileSource = await FileService.normalizeAndFindFile(fileName);

      console.log(
        `✅ Найден файл: "${fileSource.name}" (ID: ${fileSource.id}), загружен: ${fileSource.uploaded_at}`
      );
      // Получаем данные хостов со всеми связями
      const hosts = await Host.findAll({
        where: { file_source_id: fileSource.id },
        include: [
          {
            model: Port,
            include: [
              {
                model: WellKnownPort,
                attributes: ["name"],
              },
            ],
            attributes: ["id", "port", "type"],
          },
          {
            model: Whois,
            include: [
              {
                model: WhoisKey,
                attributes: ["key_name"],
              },
            ],
            attributes: ["id", "value"],
          },
          {
            model: Country,
            attributes: ["id", "name"],
          },
        ],
        attributes: [
          "id",
          "ip",
          "reachable",
          "updated_at",
          "country_id",
          "file_source_id",
        ],
        order: [["ip", "ASC"]],
      });
      console.log(`📊 Найдено хостов для файла: ${hosts.length}`);
      // Форматируем данные для экспорта в требуемом формате
      const exportData = hosts.map((host) => {
        // Форматируем порты
        const openPorts = [];
        const filteredPorts = [];
        (host.Ports || []).forEach((port) => {
          const portInfo = {
            port: port.port,
            name: port.WellKnownPort ? port.WellKnownPort.name : null,
          };
          if (port.type === "open") {
            openPorts.push(portInfo);
          } else if (port.type === "filtered") {
            filteredPorts.push(portInfo);
          }
        });
        // Форматируем WHOIS данные и проверяем наличие
        const hasWhois = (host.Whois || []).length > 0;
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
          has_whois: hasWhois,
        };
      });
      console.log(
        `✅ Данные для файла "${fileName}" подготовлены: ${hosts.length} хостов`
      );
      return exportData;
    } catch (error) {
      console.error(
        `❌ Ошибка при экспорте данных файла "${fileName}":`,
        error
      );
      return []; // Возвращаем пустой массив при ошибке
    }
  }

  // Метод для экспорта всех файлов сессии
  static async exportAllFilesData(clientId) {
    try {
      console.log(`📊 Экспорт всех файлов для клиента: ${clientId}`);

      // Получаем список всех файлов
      const fileSources = await FileSource.findAll({
        attributes: ["id", "name", "uploaded_at", "encoding"],
      });

      if (!fileSources || fileSources.length === 0) {
        console.log(`❌ Файлы не найдены`);
        return [];
      }

      const allFilesData = [];

      // Для каждого файла получаем данные
      for (const fileSource of fileSources) {
        try {
          // Декодируем имя файла для корректного отображения
          let displayFileName = fileSource.name;
          try {
            const decodedName = decodeURIComponent(fileSource.name);
            if (decodedName !== fileSource.name) {
              displayFileName = decodedName;
            }
          } catch (e) {
            console.log(
              `⚠️ Не удалось декодировать имя файла "${fileSource.name}"`
            );
          }

          const fileData = await this.exportFileData(fileSource.name);
          if (fileData && fileData.length > 0) {
            allFilesData.push({
              file_name: displayFileName,
              original_file_name: fileSource.name,
              uploaded_at: fileSource.uploaded_at,
              encoding: fileSource.encoding,
              hosts_count: fileData.length,
              hosts: fileData,
            });
          }
        } catch (fileError) {
          console.error(
            `❌ Ошибка при экспорте файла "${fileSource.name}":`,
            fileError
          );
          // Продолжаем обработку других файлов
        }
      }

      console.log(`✅ Подготовлены данные для ${allFilesData.length} файлов`);
      return allFilesData;
    } catch (error) {
      console.error(`❌ Ошибка при экспорте всех файлов:`, error);
      throw error;
    }
  }

  static async normalizeFileNames() {
    try {
      const fileSources = await FileSource.findAll();
      let normalizedCount = 0;
      console.log("🔄 Нормализация имен файлов в базе данных...");
      for (const fileSource of fileSources) {
        const originalName = fileSource.name;
        let normalizedName = originalName;
        try {
          // Пробуем декодировать имя
          const decodedName = decodeURIComponent(originalName);
          if (decodedName !== originalName) {
            console.log(`   🔧 "${originalName}" -> "${decodedName}"`);
            fileSource.name = decodedName;
            await fileSource.save();
            normalizedCount++;
          }
          // Также проверяем на двойное кодирование
          const doubleDecoded = decodeURIComponent(
            decodeURIComponent(originalName)
          );
          if (doubleDecoded !== originalName && doubleDecoded !== decodedName) {
            console.log(
              `   🔧 Двойное декодирование: "${originalName}" -> "${doubleDecoded}"`
            );
            fileSource.name = doubleDecoded;
            await fileSource.save();
            normalizedCount++;
          }
        } catch (e) {
          console.log(`   ⚠️ Не удалось нормализовать: "${originalName}"`);
        }
      }
      console.log(`✅ Нормализовано ${normalizedCount} имен файлов`);
      return { normalized: normalizedCount, total: fileSources.length };
    } catch (error) {
      console.error("❌ Ошибка при нормализации имен файлов:", error);
      throw error;
    }
  }
}
