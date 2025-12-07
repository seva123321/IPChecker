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
import { Op } from 'sequelize';
import { Host, Port, Whois, WhoisKey, WellKnownPort, sequelize, FileSource, Country, Priority, Grouping, PriorityComment } from "../models/index.js";

// Конфигурация масштабирования
const SCALING_CONFIG = {
  SMALL: {   // до 100 IP
    concurrentBatches: 1,
    batchSize: 25,
    ipConcurrency: 5,
    portScanTimeout: 15000,
    reachabilityTimeout: 2000
  },
  MEDIUM: {  // 100-500 IP
    concurrentBatches: 2,
    batchSize: 50,
    ipConcurrency: 8,
    portScanTimeout: 10000,
    reachabilityTimeout: 1500
  },
  LARGE: {   // 500+ IP
    concurrentBatches: 3,
    batchSize: 100,
    ipConcurrency: 12,
    portScanTimeout: 8000,
    reachabilityTimeout: 1000
  }
};

// Кеш для WHOIS запросов
const whoisCache = new Map();

export default class FileService {
  static async searchIP(fileContent, fileName = null, progressCallback = () => {}) {
    try {
        const ipRegex = /(\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b)/g;
        const ipMatches = fileContent.match(ipRegex) || [];
        
        const uniqueIPs = [...new Set(ipMatches)].filter(ip => {
            const parts = ip.split('.');
            if (parts.length !== 4) return false;
            return parts.every(part => {
                const num = parseInt(part, 10);
                return !isNaN(num) && num >= 0 && num <= 255;
            });
        });

        if (uniqueIPs.length === 0) {
            progressCallback({
                type: 'processing_started',
                totalIPs: 0,
                processedIPs: 0,
                progress: 100,
                fileName: fileName
            });
            return { message: "IP-адреса не найдены в файле." };
        }

        // Отправляем начальный прогресс
        progressCallback({
            type: 'processing_started',
            totalIPs: uniqueIPs.length,
            processedIPs: 0,
            progress: 0,
            fileName: fileName
        });

        const config = FileService.getScalingConfig(uniqueIPs.length);
        
        let result;
        if (uniqueIPs.length > 100) {
            // Передаем fileName в processLargeBatch
            result = await FileService.processLargeBatch(uniqueIPs, config, fileName, progressCallback);
        } else {
            // Передаем fileName в processStandardBatch
            result = await FileService.processStandardBatch(uniqueIPs, config, fileName, progressCallback);
        }

        // Финальный прогресс
        progressCallback({
            type: 'processing_completed',
            ...result,
            fileName: fileName
        });

        return result;
        
    } catch (error) {
        console.error("❌ Критическая ошибка в searchIP:", error);
        progressCallback({
            type: 'processing_error',
            error: error.message,
            fileName: fileName
        });
        throw new Error("Ошибка обработки IP-адресов: " + error.message);
    }
}


  static getScalingConfig(ipCount) { // Исправлено: убрал лишний пробел
    if (ipCount <= 100) {
      return { ...SCALING_CONFIG.SMALL, mode: 'SMALL' };
    } else if (ipCount <= 500) {
      return { ...SCALING_CONFIG.MEDIUM, mode: 'MEDIUM' };
    } else {
      return { ...SCALING_CONFIG.LARGE, mode: 'LARGE' };
    }
  }

  static async processLargeBatch(uniqueIPs, config, fileName = null, progressCallback = () => {}) {
    console.log(`🚀 Запуск оптимизированной обработки для ${uniqueIPs.length} IP, файл: ${fileName}`);
    
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
                console.log(`\n📦 Запуск батча ${batchIndex + 1}/${batches.length}, файл: ${fileName}`);

                // Прогресс начала батча
                progressCallback({
                    type: 'batch_start',
                    batchIndex: batchIndex + 1,
                    totalBatches: batches.length,
                    batchSize: batch.length,
                    fileName: fileName
                });

                // Передаем fileName в processOptimizedBatch
                const batchResults = await FileService.processOptimizedBatch(batch, batchIndex, config, fileName);
                
                globalSuccessCount += batchResults.successful;
                globalFailedCount += batchResults.failed;
                allResults.push(...batchResults.details);
                processedBatches++;

                // Прогресс завершения батча
                const processedIPs = globalSuccessCount + globalFailedCount;
                const progress = Math.round((processedIPs / uniqueIPs.length) * 100);
                
                progressCallback({
                    type: 'batch_complete',
                    batchIndex: batchIndex + 1,
                    totalBatches: batches.length,
                    successful: batchResults.successful,
                    failed: batchResults.failed,
                    processedIPs: processedIPs,
                    totalIPs: uniqueIPs.length,
                    progress: progress,
                    fileName: fileName
                });

                console.log(`📊 Прогресс батча ${batchIndex + 1}: ${processedIPs}/${uniqueIPs.length} IP (${progress}%), файл: ${fileName}`);

            } catch (batchError) {
                console.error(`❌ Ошибка обработки батча ${batchIndex + 1}:`, batchError);
                globalFailedCount += batch.length;
                
                progressCallback({
                    type: 'batch_error',
                    batchIndex: batchIndex + 1,
                    error: batchError.message,
                    fileName: fileName
                });
            }
        })
    );

    const batchResults = await Promise.allSettled(batchPromises);
    
    // Статистика по батчам
    const successfulBatches = batchResults.filter(r => r.status === 'fulfilled').length;
    console.log(`\n✅ Обработка завершена: ${successfulBatches}/${batches.length} батчей успешно, файл: ${fileName}`);
    console.log(`🎯 Итог: ${globalSuccessCount}/${uniqueIPs.length} IP обработано`);

    // Очистка кеша
    whoisCache.clear();

    return {
        message: `Обработано ${globalSuccessCount} из ${uniqueIPs.length} IP-адресов`,
        total: uniqueIPs.length,
        successful: globalSuccessCount,
        failed: globalFailedCount,
        statistics: {
            success_rate: ((globalSuccessCount / uniqueIPs.length) * 100).toFixed(1) + '%',
            batches_processed: `${successfulBatches}/${batches.length}`,
            whois_cache_size: whoisCache.size
        },
        details: {
            successful_ips: allResults
                .filter(r => r.success && !r.skipped)
                .map(r => r.ip),
            skipped_ips: allResults
                .filter(r => r.skipped)
                .map(r => r.ip),
            failed_ips: allResults
                .filter(r => r.error)
                .map(r => ({ ip: r.ip, error: r.error }))
        }
    };
}

  static async processOptimizedBatch(batch, batchIndex, config, fileName = null, progressCallback = () => {}) {
      const ipLimit = pLimit(config.ipConcurrency);
      let batchSuccessCount = 0;
      let batchFailedCount = 0;
      const batchResults = [];

      const batchPromises = batch.map(ip => 
          ipLimit(async () => {
              try {
                  // Добавляем проверку на существование IP
                  if (!ip || ip === 'unknown') {
                      return { ip: ip || 'unknown', error: "Invalid IP address" };
                  }

                  if (isLocalIp(ip)) {
                      return { ip, skipped: true, reason: "Local IP" };
                  }

                  // Передаем fileName в processIPOptimized
                  const result = await FileService.processIPOptimized(ip, batchIndex, config, fileName);
                  
                  if (result.success) {
                      batchSuccessCount++;
                  } else {
                      batchFailedCount++;
                  }
                  
                  return result;
                  
              } catch (error) {
                  batchFailedCount++;
                  console.error(`❌ Ошибка обработки IP ${ip}:`, error.message);
                  return { ip: ip || 'unknown', error: error.message };
              }
          })
      );

      const results = await Promise.allSettled(batchPromises);
      
      results.forEach(result => {
          if (result.status === 'fulfilled') {
              batchResults.push(result.value);
          } else {
              batchResults.push({ ip: 'unknown', error: result.reason?.message || 'Unknown error' });
          }
      });

      return {
          successful: batchSuccessCount,
          failed: batchFailedCount,
          details: batchResults
      };
  }

  static async processIPOptimized(ip, batchIndex, config, fileName = null) { // ← добавить fileName параметр
    const startTime = Date.now();
    
    try {
        // Добавляем проверку IP
        if (!ip) {
            throw new Error("IP address is undefined");
        }

        console.log(`🔍 Начало обработки IP: ${ip}, файл: ${fileName || 'unknown'}`);
        
        // 1. Быстрая проверка доступности
        const reachable = await checkReachability(ip, config.reachabilityTimeout);
        
        if (!reachable) {
            // Если хост недоступен, сохраняем только базовую информацию (быстро)
            const dbData = {
                ip: ip,
                reachable: false,
                port_data: { open: [], filtered: [] },
                whois: { note: "Host unreachable" },
            };
            
            await FileService.quickSaveToDB(dbData);
            const processingTime = Date.now() - startTime;
            console.log(`⚡ [Батч ${batchIndex}] ${ip} - недоступен (${processingTime}мс)`);
            return { ip, success: true, skipped: true };
        }

        // 2. Параллельное выполнение тяжелых операций
        const [portScanResult, whoisData] = await Promise.allSettled([
            // Сканирование портов с приоритетом
            Promise.race([
                scanPortsSimple(ip),
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error("Port scan timeout")), config.portScanTimeout)
                )
            ]).catch(error => {
                console.warn(`⚠️ Таймаут сканирования портов для ${ip}:`, error.message);
                return { open: [], filtered: [] };
            }),
            
            // WHOIS запрос с кешированием
            FileService.getCachedWhois(ip).catch(error => {
                console.warn(`⚠️ Ошибка WHOIS для ${ip}:`, error.message);
                return { error: "WHOIS failed" };
            })
        ]);

        const finalPortData = portScanResult.status === 'fulfilled' ? portScanResult.value : { open: [], filtered: [] };
        const finalWhoisData = whoisData.status === 'fulfilled' ? whoisData.value : { error: "WHOIS failed" };

        // 3. Сохранение в БД
        const dbData = {
            ip: ip,
            reachable: true,
            port_data: finalPortData,
            whois: finalWhoisData,
        };

        // Передаем fileName в addedJSONoneObj
        await FileService.addedJSONoneObj(dbData, null, fileName);
        
        const processingTime = Date.now() - startTime;
        const portInfo = finalPortData.open.length > 0 ? ` (${finalPortData.open.length} открытых портов)` : '';
        console.log(`✅ [Батч ${batchIndex}] ${ip} - обработан${portInfo} (${processingTime}мс)`);
        
        return { ip, success: true };
        
    } catch (error) {
        const processingTime = Date.now() - startTime;
        console.error(`❌ [Батч ${batchIndex}] ${ip} - ошибка за ${processingTime}мс:`, error.message);
        throw error;
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
      )
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

  static async quickSaveToDB(dbData) {
    // Упрощенное сохранение для недоступных хостов
    const transaction = await sequelize.transaction();
    
    try {
      let host = await Host.findOne({ 
        where: { ip: dbData.ip },
        transaction 
      });
      
      if (!host) {
        host = await Host.create({ 
          ip: dbData.ip, 
          reachable: dbData.reachable 
        }, { transaction });
      } else {
        host.reachable = dbData.reachable;
        host.updated_at = new Date();
        await host.save({ transaction });
      }

      // Для недоступных хостов не сохраняем порты и WHOIS
      await transaction.commit();
      
    } catch (error) {
      await transaction.rollback();
      console.warn(`⚠️ Ошибка быстрого сохранения для ${dbData.ip}:`, error.message);
    }
  }

  static async processStandardBatch(uniqueIPs, config, fileName = null, progressCallback = () => {}) {
      console.log(`🔧 Стандартная обработка для ${uniqueIPs.length} IP, файл: ${fileName}`);
      
      const limit = pLimit(config.ipConcurrency);
      const chunkSize = config.batchSize;
      const chunks = [];
      
      for (let i = 0; i < uniqueIPs.length; i += chunkSize) {
          chunks.push(uniqueIPs.slice(i, i + chunkSize));
      }

      let allResults = [];
      let successfulCount = 0;
      let failedCount = 0;

      for (let i = 0; i < chunks.length; i++) {
          const chunk = chunks[i];
          console.log(`Обрабатываем часть ${i + 1}/${chunks.length} (${chunk.length} IP), файл: ${fileName}`);

          // Отправляем событие начала батча
          progressCallback({
              type: 'batch_start',
              batchIndex: i + 1,
              totalBatches: chunks.length,
              batchSize: chunk.length,
              fileName: fileName
          });

          const chunkResults = await Promise.allSettled(
              chunk.map((ip) => {
                  if (isLocalIp(ip)) {
                      return Promise.resolve({ ip, error: "Local IP address skipped" });
                  }

                  return limit(async () => {
                      try {
                          const reachable = await checkReachability(ip, config.reachabilityTimeout);

                          let portScanResult = { open: [], filtered: [] };
                          try {
                              portScanResult = await Promise.race([
                                  scanPortsSimple(ip),
                                  new Promise((_, reject) => 
                                      setTimeout(() => reject(new Error("Timeout")), config.portScanTimeout)
                                  ),
                              ]);
                          } catch (timeoutError) {
                              console.warn(`Таймаут сканирования портов для ${ip}:`, timeoutError.message);
                          }

                          const whoisData = await FileService.getCachedWhois(ip).catch(() => ({}));

                          const dbData = {
                              ip: ip,
                              reachable: reachable,
                              port_data: portScanResult,
                              whois: whoisData,
                          };

                          // Передаем fileName в addedJSONoneObj
                          await FileService.addedJSONoneObj(dbData, null, fileName);
                          return { ip, success: true };
                      } catch (scanError) {
                          console.error(`Ошибка при обработке IP ${ip}:`, scanError);
                          return { ip, error: scanError.message };
                      }
                  });
              })
          );

          allResults = allResults.concat(chunkResults);
          
          // Обновляем счетчики
          const chunkSuccessful = chunkResults.filter(result => 
              result.status === "fulfilled" && !result.value.error
          ).length;
          const chunkFailed = chunkResults.length - chunkSuccessful;
          
          successfulCount += chunkSuccessful;
          failedCount += chunkFailed;

          // Отправляем прогресс после каждого батча
          const processedIPs = successfulCount + failedCount;
          const progress = Math.round((processedIPs / uniqueIPs.length) * 100);
          
          progressCallback({
              type: 'batch_complete',
              batchIndex: i + 1,
              totalBatches: chunks.length,
              processedIPs: processedIPs,
              totalIPs: uniqueIPs.length,
              progress: progress,
              successful: successfulCount,
              failed: failedCount,
              fileName: fileName
          });

          console.log(`📊 Прогресс: ${processedIPs}/${uniqueIPs.length} IP (${progress}%), файл: ${fileName}`);

          // Пауза между чанками
          if (i < chunks.length - 1) {
              await new Promise(resolve => setTimeout(resolve, 1000));
          }
      }

      console.log(`Обработка завершена. Всего: ${uniqueIPs.length}, Успешно: ${successfulCount}, Неудачно: ${failedCount}, файл: ${fileName}`);

      return {
          message: `Обработка завершена. Всего: ${uniqueIPs.length}, Успешно: ${successfulCount}, Неудачно: ${failedCount}`,
          total: uniqueIPs.length,
          successful: successfulCount,
          failed: failedCount,
          details: {
              successful_ips: allResults
                  .filter((r) => r.status === "fulfilled" && !r.value.error)
                  .map((r) => r.value.ip),
              failed_ips: allResults
                  .filter((r) => r.status === "rejected" || r.value.error)
                  .map((r) => ({
                      ip: r.status === "fulfilled" ? r.value.ip : "unknown",
                      error: r.status === "rejected" ? r.reason?.message : r.value.error
                  }))
          }
      };
  }

  static formatTime(seconds) {
    if (seconds < 60) return `${Math.ceil(seconds)} сек`;
    if (seconds < 3600) return `${Math.ceil(seconds / 60)} мин`;
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.ceil((seconds % 3600) / 60);
    return `${hours} ч ${minutes} мин`;
  }

  static async addedJSONfile(fileContentRes) {
    const transaction = await sequelize.transaction();
    
    try {
      const fileContent = JSON.parse(fileContentRes);

      if (!fileContent.items || !Array.isArray(fileContent.items)) {
        throw new Error("Неверный формат данных JSON. Ожидается объект с массивом 'items'.");
      }

      console.log(`Начало обработки ${fileContent.items.length} записей из JSON файла`);

      for (const item of fileContent.items) {
        const ip = item.ip;
        const reachable = item.reachable;
        const portData = item.port_data || {};
        
        // Преобразуем порты в правильный формат
        const openPorts = Array.isArray(portData.open) 
          ? portData.open.map(p => {
              if (typeof p === 'object' && p.port) return p.port;
              return parseInt(p) || p;
            }).filter(p => !isNaN(p) && p >= 1 && p <= 65535)
          : [];
          
        const filteredPorts = Array.isArray(portData.filtered)
          ? portData.filtered.map(p => {
              if (typeof p === 'object' && p.port) return p.port;
              return parseInt(p) || p;
            }).filter(p => !isNaN(p) && p >= 1 && p <= 65535)
          : [];
          
        const whoisData = item.whois || {};

        if (!ip) {
          throw new Error("IP адрес отсутствует в данных.");
        }

        await FileService.addedJSONoneObj({
          ip,
          reachable: Boolean(reachable),
          port_data: { open: openPorts, filtered: filteredPorts },
          whois: whoisData
        }, transaction);
      }

      await transaction.commit();
      console.log(`Данные для ${fileContent.items.length} IP успешно добавлены в БД.`);
      
      return {
        message: `Успешно обработано ${fileContent.items.length} записей`,
        processed: fileContent.items.length
      };
    } catch (error) {
      await transaction.rollback();
      console.error("Ошибка в addedJSONfile:", error);
      throw new Error("Ошибка при добавлении JSON данных в БД: " + error.message);
    }
  }

  static async addedJSONoneObj(fileContent, externalTransaction = null, fileName = null) {
  const shouldCommit = !externalTransaction;
  const transaction = externalTransaction || await sequelize.transaction();

  try {
    const ip = fileContent.ip;
    const reachable = fileContent.reachable;
    const portData = fileContent.port_data || {};
    const whoisData = fileContent.whois || {};

    if (!ip) {
      throw new Error("IP адрес отсутствует в данных.");
    }

    console.log(`🔧 Обработка IP ${ip}, файл: ${fileName || 'unknown'}`);

    // Определяем страну из WHOIS данных
    const countryName = whoisData.country || whoisData.Country;
    console.log(`🌍 Страна из WHOIS для ${ip}:`, countryName);

    // Обеспечиваем, что порты - это числа
    const openPorts = Array.isArray(portData.open) 
        ? portData.open.map(p => parseInt(p)).filter(p => !isNaN(p) && p >= 1 && p <= 65535)
        : [];
    const filteredPorts = Array.isArray(portData.filtered)
        ? portData.filtered.map(p => parseInt(p)).filter(p => !isNaN(p) && p >= 1 && p <= 65535)
        : [];

    // ВАЖНО: Находим или создаем источник файла
    let fileSource = null;
    if (fileName && typeof fileName === 'string') {
      try {
        // Пробуем найти файл по точному имени
        fileSource = await FileSource.findOne({
          where: { name: fileName },
          transaction
        });
        // Если не нашли, создаем новый
        if (!fileSource) {
          fileSource = await FileSource.create({
            name: fileName,
            encoding: 'UTF-8',
            uploaded_at: new Date()
          }, { transaction });
          console.log(`✅ Создан новый источник файла: "${fileName}"`);
        } else {
          console.log(`✅ Найден существующий источник файла: "${fileName}" (ID: ${fileSource.id})`);
        }
      } catch (fileError) {
        console.error(`❌ Ошибка при работе с источником файла "${fileName}":`, fileError);
        // Продолжаем без источника файла
      }
    }

    // ВАЖНО: Проверяем, что fileSource был найден/создан
    if (!fileSource) {
      console.warn(`⚠️ fileSource не был найден или создан для файла: ${fileName}. Продолжаем без него.`);
    } else {
      console.log(`🔍 fileSource ID: ${fileSource.id}, fileName: ${fileName}`);
    }

    // Находим или создаем страну
    let country = null;
    if (countryName) {
      const [countryInstance, created] = await Country.findOrCreate({
        where: { name: countryName },
        defaults: { name: countryName },
        transaction
      });
      country = countryInstance;
      console.log(`🌍 Страна: ${countryName}, ID: ${country.id}, создан: ${created}`);
    }

    // Подготавливаем данные для хоста
    const hostData = {
      ip: ip, 
      reachable: Boolean(reachable),
      file_source_id: fileSource ? fileSource.id : null, // <-- Исправлено: всегда проверяем fileSource
      country_id: country ? country.id : null,
      updated_at: new Date()
    };

    // Находим или создаем хост с транзакцией
    let host = await Host.findOne({ 
      where: { ip: ip },
      transaction 
    });
    
    if (!host) {
      host = await Host.create(hostData, { transaction });
      console.log(`✅ Создан новый хост: ${ip}, file_source_id: ${fileSource ? fileSource.id : 'null'}`);
    } else {
      // Обновляем существующий хост
      await host.update(hostData, { transaction });
      console.log(`🔄 Обновлен существующий хост: ${ip}, file_source_id: ${fileSource ? fileSource.id : 'null'}`);
    }

    // Удаляем старые порты для этого хоста
    await Port.destroy({ 
      where: { host_id: host.id }, 
      transaction 
    });

    // Создаем новые порты
    const portPromises = [];
    
    // Для открытых портов
    for (const port of openPorts) {
      portPromises.push(
        Port.create({
          host_id: host.id,
          port: port,
          type: 'open'
        }, { transaction })
      );
    }
    
    // Для filtered портов
    for (const port of filteredPorts) {
      portPromises.push(
        Port.create({
          host_id: host.id,
          port: port,
          type: 'filtered'
        }, { transaction })
      );
    }

    await Promise.all(portPromises);
    console.log(`🔌 Порты обновлены для ${ip}: ${openPorts.length} открытых, ${filteredPorts.length} фильтрованных`);

    // Обработка WHOIS данных
    const allowedKeys = await WhoisKey.findAll({
      attributes: ['key_name'],
      transaction
    });
    
    const allowedKeyNames = new Set(allowedKeys.map(k => k.key_name));

    // Удаляем старые WHOIS записи
    await Whois.destroy({ 
      where: { host_id: host.id }, 
      transaction 
    });

    const whoisPromises = Object.entries(whoisData)
      .filter(([key]) => allowedKeyNames.has(key))
      .filter(([key, value]) => value !== null && value !== undefined && value !== "")
      .map(async ([key, value]) => {
        const [whoisKey, created] = await WhoisKey.findOrCreate({
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

    await Promise.all(whoisPromises);
    console.log(`📝 WHOIS данные обновлены для ${ip}: ${whoisPromises.length} записей`);

    // Коммитим только если это внутренняя транзакция
    if (shouldCommit) {
      await transaction.commit();
    }

    console.log(`✅ Данные для IP ${ip} успешно добавлены/обновлены в БД. Страна: ${countryName}, Файл: ${fileName}`);
    return { success: true, ip: ip, country: countryName, fileSourceId: fileSource ? fileSource.id : null };
    
  } catch (error) {
    // Откатываем только если это внутренняя транзакция
    if (shouldCommit) {
      await transaction.rollback();
    }
    console.error(`❌ Ошибка в addedJSONoneObj для IP ${fileContent.ip}:`, error);
    throw new Error(`Ошибка при добавлении данных для IP ${fileContent.ip}: ` + error.message);
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
          id: host.id,
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
          id: host.id,
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
        console.warn(`Таймаут версионного сканирования для ${ip}:`, timeoutError.message);
        return { ip, error: "Version scan timeout" };
      }
      
      console.log(`Версионное сканирование для ${ip} завершено, найдено:`, versionScanResult.length, 'сервисов');

      return {
        ip: ip,
        serviceVersions: versionScanResult || [],
        message: `Version scan completed for ${ip}`
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
        console.log('⚠️ Не удалось декодировать имя файла, используем оригинал');
      }

      // Ищем файл по точному имени (включая закодированное и декодированное)
      let fileSources = await FileSource.findAll({
        where: {
          [Op.or]: [
            { name: fileName }, // оригинальное имя
            { name: decodedName }, // декодированное имя
            { name: encodeURIComponent(decodedName) }, // закодированное декодированного
            { name: encodeURIComponent(fileName) } // закодированное оригинального
          ]
        },
        order: [['uploaded_at', 'DESC']] // Сортируем по дате создания (новые первыми)
      });

      // Если не нашли, ищем по частичному совпадению
      if (fileSources.length === 0) {
        console.log(`🔍 Поиск частичного совпадения для: "${searchName}"`);
        fileSources = await FileSource.findAll({
          where: {
            name: {
              [Op.like]: `%${searchName.replace(/%/g, '\\%').replace(/_/g, '\\_')}%`
            }
          },
          order: [['uploaded_at', 'DESC']] // Сортируем по дате создания
        });
      }

      if (fileSources.length === 0) {
        console.log(`❌ Файл "${fileName}" не найден в FileSource`);
        // Дополнительная диагностика: покажем все доступные файлы
        const allFiles = await FileSource.findAll({
          attributes: ['id', 'name', 'uploaded_at'],
          limit: 10,
          order: [['uploaded_at', 'DESC']]
        });
        console.log(`📋 Доступные файлы:`, allFiles.map(f => `${f.name} (ID: ${f.id}, Created: ${f.uploaded_at})`));
        return []; // Возвращаем пустой массив вместо null
      }

      // Берем первый файл из отсортированного списка (новейший)
      const fileSource = fileSources[0];

      console.log(`✅ Найден файл: "${fileSource.name}" (ID: ${fileSource.id}), загружен: ${fileSource.uploaded_at}`);
      // Получаем данные хостов со всеми связями
      const hosts = await Host.findAll({
        where: { file_source_id: fileSource.id },
        include: [
          {
            model: Port,
            include: [{
              model: WellKnownPort,
              attributes: ['name']
            }],
            attributes: ['id', 'port', 'type']
          },
          {
            model: Whois,
            include: [{
              model: WhoisKey,
              attributes: ['key_name']
            }],
            attributes: ['id', 'value']
          },
          {
            model: Country,
            attributes: ['id', 'name']
          }
        ],
        attributes: [
          'id', 
          'ip', 
          'reachable', 
          'updated_at',
          'country_id',
          'file_source_id'
        ],
        order: [['ip', 'ASC']]
      });
      console.log(`📊 Найдено хостов для файла: ${hosts.length}`);
      // Форматируем данные для экспорта в требуемом формате
      const exportData = hosts.map(host => {
        // Форматируем порты
        const openPorts = [];
        const filteredPorts = [];
        (host.Ports || []).forEach(port => {
          const portInfo = {
            port: port.port,
            name: port.WellKnownPort ? port.WellKnownPort.name : null
          };
          if (port.type === 'open') {
            openPorts.push(portInfo);
          } else if (port.type === 'filtered') {
            filteredPorts.push(portInfo);
          }
        });
        // Форматируем WHOIS данные и проверяем наличие
        const hasWhois = (host.Whois || []).length > 0;
        return {
          id: host.id,
          ip: host.ip,
          reachable: host.reachable,
          updated_at: host.updated_at ? 
            host.updated_at.toISOString().replace('T', ' ').substring(0, 19) : 
            null,
          port_data: {
            open: openPorts,
            filtered: filteredPorts
          },
          has_whois: hasWhois
        };
      });
      console.log(`✅ Данные для файла "${fileName}" подготовлены: ${hosts.length} хостов`);
      return exportData;
    } catch (error) {
      console.error(`❌ Ошибка при экспорте данных файла "${fileName}":`, error);
      return []; // Возвращаем пустой массив при ошибке
    }
  }

  //! // Метод для экспорта данных одного файла
  // static async exportFileData(fileName) {
  //   try {
  //     console.log(`📊 Экспорт данных для файла: "${fileName}"`);
  //     // Декодируем имя файла если оно пришло в закодированном виде
  //     let searchName = fileName;
  //     try {
  //       const decodedName = decodeURIComponent(fileName);
  //       if (decodedName !== fileName) {
  //         console.log(`🔍 Декодировано имя файла: "${decodedName}"`);
  //         searchName = decodedName;
  //       }
  //     } catch (e) {
  //       console.log('⚠️ Не удалось декодировать имя файла, используем оригинал');
  //     }

  //     // Ищем файл по точному имени, сортируем по дате создания (новые первыми)
  //     let fileSource = await FileSource.findOne({
  //       where: { name: searchName },
  //       order: [['uploaded_at', 'DESC']]
  //     });

  //     // Если не нашли, ищем по закодированному имени
  //     if (!fileSource) {
  //       const encodedName = encodeURIComponent(searchName);
  //       console.log(`🔍 Поиск по закодированному имени: "${encodedName}"`);
  //       fileSource = await FileSource.findOne({
  //         where: { name: encodedName },
  //         order: [['uploaded_at', 'DESC']]
  //       });
  //     }

  //     // Если все еще не нашли, ищем частичное совпадение
  //     if (!fileSource) {
  //       console.log(`🔍 Поиск частичного совпадения для: "${searchName}"`);
  //       fileSource = await FileSource.findOne({
  //         where: {
  //           name: {
  //             [Op.like]: `%${searchName}%`
  //           }
  //         },
  //         order: [['uploaded_at', 'DESC']]
  //       });
  //     }

  //     if (!fileSource) {
  //       console.log(`❌ Файл "${fileName}" не найден в FileSource`);
  //       // Дополнительная диагностика: покажем все доступные файлы
  //       const allFiles = await FileSource.findAll({
  //         attributes: ['id', 'name', 'uploaded_at'],
  //         limit: 10,
  //         order: [['uploaded_at', 'DESC']]
  //       });
  //       console.log(`📋 Доступные файлы:`, allFiles.map(f => `${f.name} (ID: ${f.id}, Created: ${f.uploaded_at})`));
  //       return []; // Возвращаем пустой массив вместо null
  //     }

  //     console.log(`✅ Найден файл: "${fileSource.name}" (ID: ${fileSource.id}), загружен: ${fileSource.uploaded_at}`);
      
  //     // Получаем данные хостов со всеми связями
  //     const hosts = await Host.findAll({
  //       where: { file_source_id: fileSource.id },
  //       include: [
  //         {
  //           model: Port,
  //           include: [{
  //             model: WellKnownPort,
  //             attributes: ['name']
  //           }],
  //           attributes: ['id', 'port', 'type']
  //         },
  //         {
  //           model: Whois,
  //           include: [{
  //             model: WhoisKey,
  //             attributes: ['key_name']
  //           }],
  //           attributes: ['id', 'value']
  //         },
  //         {
  //           model: Country,
  //           attributes: ['id', 'name']
  //         },
  //         {
  //           model: Priority,
  //           attributes: ['id', 'name']
  //         },
  //         {
  //           model: Grouping,
  //           attributes: ['id', 'name']
  //         },
  //         {
  //           model: PriorityComment,
  //           attributes: ['comment']
  //         }
  //       ],
  //       attributes: [
  //         'id', 
  //         'ip', 
  //         'reachable', 
  //         'updated_at',
  //         'country_id',
  //         'file_source_id',
  //         'priority_id',
  //         'grouping_id'
  //       ],
  //       order: [['ip', 'ASC']]
  //     });
      
  //     console.log(`📊 Найдено хостов для файла: ${hosts.length}`);
      
  //     // Форматируем данные для экспорта в требуемом формате
  //     const exportData = hosts.map(host => {
  //       // Форматируем порты
  //       const openPorts = [];
  //       const filteredPorts = [];
  //       (host.Ports || []).forEach(port => {
  //         const portInfo = {
  //           port: port.port,
  //           name: port.WellKnownPort ? port.WellKnownPort.name : null
  //         };
  //         if (port.type === 'open') {
  //           openPorts.push(portInfo);
  //         } else if (port.type === 'filtered') {
  //           filteredPorts.push(portInfo);
  //         }
  //       });
        
  //       // Форматируем WHOIS данные
  //       const whoisEntries = (host.Whois || []).filter(w => w.value && w.WhoisKey?.key_name);
  //       const hasWhois = whoisEntries.length > 0;
        
  //       // Формируем информацию о приоритете и группировке
  //       const priorityInfo = {
  //         priority: host.Priority ? {
  //           id: host.Priority.id,
  //           name: host.Priority.name
  //         } : null,
  //         grouping: host.Grouping ? {
  //           id: host.Grouping.id,
  //           name: host.Grouping.name
  //         } : null
  //       };
        
  //       // Получаем комментарий, если он есть
  //       const comment = host.PriorityComment ? host.PriorityComment.comment : null;
        
  //       // Создаем объект для экспорта
  //       const result = {
  //         id: host.id,
  //         ip: host.ip,
  //         reachable: host.reachable,
  //         updated_at: host.updated_at ? 
  //           host.updated_at.toISOString().replace('T', ' ').substring(0, 19) : 
  //           null,
  //         port_data: {
  //           open: openPorts,
  //           filtered: filteredPorts
  //         },
  //         priority_info: priorityInfo,
  //         has_whois: hasWhois
  //       };
        
  //       // Добавляем комментарий, если он есть
  //       if (comment) {
  //         result.comment = comment;
  //       }
        
  //       return result;
  //     });
      
  //     console.log(`✅ Данные для файла "${fileName}" подготовлены: ${hosts.length} хостов`);
  //     return exportData;
  //   } catch (error) {
  //     console.error(`❌ Ошибка при экспорте данных файла "${fileName}":`, error);
  //     return []; // Возвращаем пустой массив при ошибке
  //   }
  // }


  // Метод для экспорта всех файлов сессии
  static async exportAllFilesData(clientId) {
    try {
      console.log(`📊 Экспорт всех файлов для клиента: ${clientId}`);
      
      // Получаем список всех файлов
      const fileSources = await FileSource.findAll({
        attributes: ['id', 'name', 'uploaded_at', 'encoding']
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
            console.log(`⚠️ Не удалось декодировать имя файла "${fileSource.name}"`);
          }

          const fileData = await this.exportFileData(fileSource.name);
          if (fileData && fileData.length > 0) {
            allFilesData.push({
              file_name: displayFileName,
              original_file_name: fileSource.name,
              uploaded_at: fileSource.uploaded_at,
              encoding: fileSource.encoding,
              hosts_count: fileData.length,
              hosts: fileData
            });
          }
        } catch (fileError) {
          console.error(`❌ Ошибка при экспорте файла "${fileSource.name}":`, fileError);
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

  // Альтернативный метод для экспорта одного файла с дополнительной информацией
  static async exportFileDataWithStats(fileName) {
    try {
      const fileData = await this.exportFileData(fileName);
      
      if (!fileData) {
        return null;
      }

      // Собираем статистику
      const stats = {
        total_hosts: fileData.length,
        reachable_hosts: fileData.filter(h => h.reachable).length,
        unreachable_hosts: fileData.filter(h => !h.reachable).length,
        hosts_with_whois: fileData.filter(h => h.has_whois).length,
        hosts_with_priority: fileData.filter(h => h.priority_info && h.priority_info.priority).length,
        hosts_with_grouping: fileData.filter(h => h.priority_info && h.priority_info.grouping).length,
        hosts_with_comments: fileData.filter(h => h.comment).length,
        open_ports_count: fileData.reduce((sum, host) => sum + host.port_data.open.length, 0),
        filtered_ports_count: fileData.reduce((sum, host) => sum + host.port_data.filtered.length, 0),
        unique_ports: [...new Set(fileData.flatMap(host => 
          [...host.port_data.open, ...host.port_data.filtered].map(p => p.port)
        ))].length
      };

      // Группировка по приоритетам
      const priorityStats = {};
      fileData.forEach(host => {
        const priorityName = host.priority_info && host.priority_info.priority ? 
          host.priority_info.priority.name : 'Не указан';
        
        if (!priorityStats[priorityName]) {
          priorityStats[priorityName] = {
            count: 0,
            reachable: 0,
            unreachable: 0
          };
        }
        
        priorityStats[priorityName].count++;
        if (host.reachable) {
          priorityStats[priorityName].reachable++;
        } else {
          priorityStats[priorityName].unreachable++;
        }
      });

      // Группировка по группировкам
      const groupingStats = {};
      fileData.forEach(host => {
        const groupingName = host.priority_info && host.priority_info.grouping ? 
          host.priority_info.grouping.name : 'Не указана';
        
        if (!groupingStats[groupingName]) {
          groupingStats[groupingName] = {
            count: 0,
            reachable: 0,
            unreachable: 0
          };
        }
        
        groupingStats[groupingName].count++;
        if (host.reachable) {
          groupingStats[groupingName].reachable++;
        } else {
          groupingStats[groupingName].unreachable++;
        }
      });

      return {
        file_info: {
          name: fileName,
          exported_at: new Date().toISOString().replace('T', ' ').substring(0, 19),
          total_hosts: stats.total_hosts
        },
        statistics: {
          general: stats,
          by_priority: priorityStats,
          by_grouping: groupingStats
        },
        hosts: fileData
      };

    } catch (error) {
      console.error(`❌ Ошибка при экспорте данных файла "${fileName}" со статистикой:`, error);
      throw error;
    }
  }

  // Метод для получения списка файлов с базовой статистикой
  static async getFilesListWithStats(clientId) {
    try {
      console.log(`📋 Получение списка файлов со статистикой`);
      
      const fileSources = await FileSource.findAll({
        include: [
          {
            model: Host,
            attributes: ['id', 'reachable', 'priority_id', 'grouping_id'],
            required: false,
            include: [
              {
                model: Priority,
                attributes: ['id', 'name']
              },
              {
                model: Grouping,
                attributes: ['id', 'name']
              }
            ]
          }
        ],
        attributes: [
          'id',
          'name',
          'uploaded_at',
          'encoding'
        ],
        order: [['uploaded_at', 'DESC']]
      });

      const filesList = fileSources.map(fileSource => {
        const hosts = fileSource.Hosts || [];
        const reachableCount = hosts.filter(h => h.reachable).length;
        const unreachableCount = hosts.filter(h => !h.reachable).length;
        
        // Статистика по приоритетам
        const priorityStats = {};
        hosts.forEach(host => {
          const priorityName = host.Priority ? host.Priority.name : 'Не указан';
          if (!priorityStats[priorityName]) {
            priorityStats[priorityName] = 0;
          }
          priorityStats[priorityName]++;
        });

        // Статистика по группировкам
        const groupingStats = {};
        hosts.forEach(host => {
          const groupingName = host.Grouping ? host.Grouping.name : 'Не указана';
          if (!groupingStats[groupingName]) {
            groupingStats[groupingName] = 0;
          }
          groupingStats[groupingName]++;
        });

        // Декодируем имя файла для отображения
        let displayName = fileSource.name;
        try {
          const decodedName = decodeURIComponent(fileSource.name);
          if (decodedName !== fileSource.name) {
            displayName = decodedName;
          }
        } catch (e) {
          // Оставляем оригинальное имя если декодирование не удалось
        }
        
        return {
          id: fileSource.id,
          fileName: displayName,
          originalFileName: fileSource.name,
          uploadedAt: fileSource.uploaded_at,
          encoding: fileSource.encoding,
          statistics: {
            totalHosts: hosts.length,
            reachable: reachableCount,
            unreachable: unreachableCount,
            reachabilityPercentage: hosts.length > 0 ? 
              Math.round((reachableCount / hosts.length) * 100) : 0,
            byPriority: priorityStats,
            byGrouping: groupingStats
          }
        };
      });

      console.log(`✅ Найдено ${filesList.length} файлов со статистикой`);
      return filesList;

    } catch (error) {
      console.error(`❌ Ошибка при получении списка файлов со статистикой:`, error);
      throw error;
    }
  }

  static async getFilesList(clientId) {
    try {
      console.log(`📋 Получение списка файлов`);
      
      const fileSources = await FileSource.findAll({
        include: [
          {
            model: Host,
            attributes: ['id', 'reachable'],
            required: false
          }
        ],
        attributes: [
          'id',
          'name',
          'uploaded_at',
          'encoding'
        ],
        order: [['uploaded_at', 'DESC']]
      });

      const filesList = fileSources.map(fileSource => {
        const hosts = fileSource.Hosts || [];
        const reachableCount = hosts.filter(h => h.reachable).length;
        const unreachableCount = hosts.filter(h => !h.reachable).length;
        
        // Декодируем имя файла для отображения
        let displayName = fileSource.name;
        try {
          const decodedName = decodeURIComponent(fileSource.name);
          if (decodedName !== fileSource.name) {
            displayName = decodedName;
          }
        } catch (e) {
          // Оставляем оригинальное имя если декодирование не удалось
        }
        
        return {
          id: fileSource.id,
          fileName: displayName, // Декодированное имя
          originalFileName: fileSource.name, // Оригинальное имя из базы
          uploadedAt: fileSource.uploaded_at,
          encoding: fileSource.encoding,
          hostCount: hosts.length,
          statistics: {
            totalHosts: hosts.length,
            reachable: reachableCount,
            unreachable: unreachableCount,
            reachabilityPercentage: hosts.length > 0 ? 
              Math.round((reachableCount / hosts.length) * 100) : 0
          }
        };
      });

      console.log(`✅ Найдено ${filesList.length} файлов`);
      return filesList;

    } catch (error) {
      console.error(`❌ Ошибка при получении списка файлов:`, error);
      throw error;
    }
  }

  // Вспомогательный метод для форматирования хоста
  static _formatHostForExport(host) {
  return {
    id: host.id,
    ip: host.ip,
    reachable: host.reachable,
    updated_at: host.updated_at,
    
    // Порты
    ports: (host.Ports || []).map(port => ({
      id: port.id,
      port: port.port,
      type: port.type,
      well_known_name: port.WellKnownPort ? port.WellKnownPort.name : null
    })),
    
    // WHOIS информация
    whois: (host.Whois || []).map(whois => ({
      id: whois.id,
      key: whois.WhoisKey ? whois.WhoisKey.key_name : null,
      value: whois.value
    })),
    
    // Страна
    country: host.Country ? {
      id: host.Country.id,
      name: host.Country.name
    } : null
  };
}

// В files.service.js добавьте этот метод
  // В файле FileService.js добавьте метод:
static async normalizeFileNames() {
  try {
    const fileSources = await FileSource.findAll();
    let normalizedCount = 0;
    console.log('🔄 Нормализация имен файлов в базе данных...');
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
        const doubleDecoded = decodeURIComponent(decodeURIComponent(originalName));
        if (doubleDecoded !== originalName && doubleDecoded !== decodedName) {
          console.log(`   🔧 Двойное декодирование: "${originalName}" -> "${doubleDecoded}"`);
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
    console.error('❌ Ошибка при нормализации имен файлов:', error);
    throw error;
  }
}

  // Вспомогательные методы для статистики
  // static _groupByPriority(hosts) {
  //   const groups = {};
  //   hosts.forEach(host => {
  //     const priorityName = host.Priority ? host.Priority.name : 'Не указан';
  //     if (!groups[priorityName]) {
  //       groups[priorityName] = { total: 0, reachable: 0, unreachable: 0 };
  //     }
  //     groups[priorityName].total++;
  //     if (host.reachable) {
  //       groups[priorityName].reachable++;
  //     } else {
  //       groups[priorityName].unreachable++;
  //     }
  //   });
  //   return groups;
  // }

  static _groupByCountry(hosts) {
    const groups = {};
    hosts.forEach(host => {
      const countryName = host.Country ? host.Country.name : 'Не указана';
      if (!groups[countryName]) {
        groups[countryName] = { total: 0, reachable: 0, unreachable: 0 };
      }
      groups[countryName].total++;
      if (host.reachable) {
        groups[countryName].reachable++;
      } else {
        groups[countryName].unreachable++;
      }
    });
    return groups;
  }

  // static _groupByGrouping(hosts) {
  //   const groups = {};
  //   hosts.forEach(host => {
  //     const groupingName = host.Grouping ? host.Grouping.name : 'Не указана';
  //     if (!groups[groupingName]) {
  //       groups[groupingName] = { total: 0, reachable: 0, unreachable: 0 };
  //     }
  //     groups[groupingName].total++;
  //     if (host.reachable) {
  //       groups[groupingName].reachable++;
  //     } else {
  //       groups[groupingName].unreachable++;
  //     }
  //   });
  //   return groups;
  // }

  static _groupByReachability(hosts) {
    return {
      reachable: hosts.filter(h => h.reachable).length,
      unreachable: hosts.filter(h => !h.reachable).length,
      total: hosts.length
    };
  }

  static _getPortsSummary(hosts) {
    const portSummary = {
      totalPorts: 0,
      openPorts: 0,
      filteredPorts: 0,
      uniquePorts: new Set(),
      wellKnownPorts: 0,
      byType: {}
    };

    hosts.forEach(host => {
      (host.Ports || []).forEach(port => {
        portSummary.totalPorts++;
        portSummary.uniquePorts.add(port.port);
        
        if (port.type === 'open') {
          portSummary.openPorts++;
        } else if (port.type === 'filtered') {
          portSummary.filteredPorts++;
        }
        
        if (port.WellKnownPort) {
          portSummary.wellKnownPorts++;
        }
        
        // Группировка по типам портов
        if (!portSummary.byType[port.type]) {
          portSummary.byType[port.type] = 0;
        }
        portSummary.byType[port.type]++;
      });
    });

    portSummary.uniquePortsCount = portSummary.uniquePorts.size;
    delete portSummary.uniquePorts;

    return portSummary;
  }

  static _getWhoisSummary(hosts) {
    const whoisSummary = {
      totalEntries: 0,
      uniqueKeys: new Set(),
      byKey: {}
    };

    hosts.forEach(host => {
      (host.Whois || []).forEach(whois => {
        whoisSummary.totalEntries++;
        
        const keyName = whois.WhoisKey ? whois.WhoisKey.key_name : 'unknown';
        whoisSummary.uniqueKeys.add(keyName);
        
        if (!whoisSummary.byKey[keyName]) {
          whoisSummary.byKey[keyName] = 0;
        }
        whoisSummary.byKey[keyName]++;
      });
    });

    whoisSummary.uniqueKeysCount = whoisSummary.uniqueKeys.size;
    delete whoisSummary.uniqueKeys;

    return whoisSummary;
  }
}

// РАБОЧИЙ НО НЕ ДЛЯ БОЛЬШИХ ОБЪЕМОВ
// import fs from "fs";
// import path from "path";
// import pLimit from "p-limit";
// import {
//   isLocalIp,
//   scanPortsSimple,
//   scanVersionDetection, 
//   checkReachability,
//   WhoisClient,
// } from "../utils/index.js";
// import { Op } from 'sequelize';
// import { Host, Port, Whois, WhoisKey, WellKnownPort, sequelize } from "../models/index.js";

// export default class FileService {
//   static async searchIP(fileContent) {
//     try {
//       // Улучшенный regex для извлечения IP из формата "10.200.32.57 (Unknown)			182133"
//       const ipRegex = /(\b(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\b)/g;
      
//       const ipMatches = fileContent.match(ipRegex) || [];
      
//       // Валидация IP-адресов
//       const isValidIP = (ip) => {
//         const parts = ip.split('.');
//         if (parts.length !== 4) return false;
//         return parts.every(part => {
//           const num = parseInt(part, 10);
//           return !isNaN(num) && num >= 0 && num <= 255;
//         });
//       };

//       const uniqueIPs = [...new Set(ipMatches)].filter(ip => isValidIP(ip));

//       if (uniqueIPs.length === 0) {
//         console.warn("В файле не найдено валидных IP-адресов.");
//         return { message: "IP-адреса не найдены в файле." };
//       }

//       console.log(`Найдено валидных уникальных IP-адресов: ${uniqueIPs.length}`);
//       console.log("IP-адреса для обработки:", uniqueIPs);

//       const limit = pLimit(3);
//       const chunkSize = 100;
//       const chunks = [];
      
//       for (let i = 0; i < uniqueIPs.length; i += chunkSize) {
//         chunks.push(uniqueIPs.slice(i, i + chunkSize));
//       }

//       let allResults = [];
//       let successfulCount = 0;
//       let failedCount = 0;

//       for (let i = 0; i < chunks.length; i++) {
//         const chunk = chunks[i];
//         console.log(`Обрабатываем часть ${i + 1}/${chunks.length} (${chunk.length} IP)`);

//         const chunkResults = await Promise.allSettled(
//           chunk.map((ip) => {
//             if (isLocalIp(ip)) {
//               return Promise.resolve({ ip, error: "Local IP address skipped" });
//             }

//             return limit(async () => {
//               try {
//                 const reachable = await checkReachability(ip, 1000);

//                 let portScanResult = { open: [], filtered: [] };
//                 try {
//                   portScanResult = await Promise.race([
//                     scanPortsSimple(ip),
//                     new Promise((_, reject) => 
//                       setTimeout(() => reject(new Error("Timeout")), 15000)
//                     ),
//                   ]);
//                 } catch (timeoutError) {
//                   console.warn(`Таймаут сканирования портов для ${ip}:`, timeoutError.message);
//                 }

//                 // Преобразуем порты в правильный формат
//                 const formattedPortData = {
//                   open: portScanResult.open.map(p => {
//                     if (typeof p === 'object' && p.port) return p.port;
//                     return parseInt(p) || p;
//                   }).filter(p => !isNaN(p) && p >= 1 && p <= 65535),
//                   filtered: portScanResult.filtered.map(p => {
//                     if (typeof p === 'object' && p.port) return p.port;
//                     return parseInt(p) || p;
//                   }).filter(p => !isNaN(p) && p >= 1 && p <= 65535)
//                 };

//                 const whoisClient = new WhoisClient();
//                 const whoisData = await whoisClient.getWhois(ip);

//                 const dbData = {
//                   ip: ip,
//                   reachable: reachable,
//                   port_data: formattedPortData,
//                   whois: whoisData || {},
//                 };

//                 await FileService.addedJSONoneObj(dbData);

//                 return { ip, success: true };
//               } catch (scanError) {
//                 console.error(`Ошибка при обработке IP ${ip}:`, scanError);
//                 return { ip, error: scanError.message };
//               }
//             });
//           })
//         );

//         allResults = allResults.concat(chunkResults);
        
//         for (const result of chunkResults) {
//           if (result.status === "fulfilled" && !result.value.error) {
//             successfulCount++;
//           } else {
//             failedCount++;
//           }
//         }
//       }

//       console.log(`Обработка завершена. Всего: ${uniqueIPs.length}, Успешно: ${successfulCount}, Неудачно: ${failedCount}`);

//       return {
//         message: `Обработка завершена. Всего: ${uniqueIPs.length}, Успешно: ${successfulCount}, Неудачно: ${failedCount}`,
//         total: uniqueIPs.length,
//         successful: successfulCount,
//         failed: failedCount,
//         details: {
//           successful_ips: allResults
//             .filter((r) => r.status === "fulfilled" && !r.value.error)
//             .map((r) => r.value.ip),
//           failed_ips: allResults
//             .filter((r) => r.status === "rejected" || r.value.error)
//             .map((r) => ({
//               ip: r.status === "fulfilled" ? r.value.ip : "unknown",
//               error: r.status === "rejected" ? r.reason?.message : r.value.error
//             }))
//         }
//       };
//     } catch (error) {
//       console.error("Ошибка в searchIP:", error);
//       throw new Error("Ошибка при поиске и обработке IP-адресов: " + error.message);
//     }
//   }

//   static async addedJSONfile(fileContentRes) {
//     const transaction = await sequelize.transaction();
    
//     try {
//       const fileContent = JSON.parse(fileContentRes);

//       if (!fileContent.items || !Array.isArray(fileContent.items)) {
//         throw new Error("Неверный формат данных JSON. Ожидается объект с массивом 'items'.");
//       }

//       console.log(`Начало обработки ${fileContent.items.length} записей из JSON файла`);

//       for (const item of fileContent.items) {
//         const ip = item.ip;
//         const reachable = item.reachable;
//         const portData = item.port_data || {};
        
//         // Преобразуем порты в правильный формат
//         const openPorts = Array.isArray(portData.open) 
//           ? portData.open.map(p => {
//               if (typeof p === 'object' && p.port) return p.port;
//               return parseInt(p) || p;
//             }).filter(p => !isNaN(p) && p >= 1 && p <= 65535)
//           : [];
          
//         const filteredPorts = Array.isArray(portData.filtered)
//           ? portData.filtered.map(p => {
//               if (typeof p === 'object' && p.port) return p.port;
//               return parseInt(p) || p;
//             }).filter(p => !isNaN(p) && p >= 1 && p <= 65535)
//           : [];
          
//         const whoisData = item.whois || {};

//         if (!ip) {
//           throw new Error("IP адрес отсутствует в данных.");
//         }

//         await FileService.addedJSONoneObj({
//           ip,
//           reachable: Boolean(reachable),
//           port_data: { open: openPorts, filtered: filteredPorts },
//           whois: whoisData
//         }, transaction);
//       }

//       await transaction.commit();
//       console.log(`Данные для ${fileContent.items.length} IP успешно добавлены в БД.`);
      
//       return {
//         message: `Успешно обработано ${fileContent.items.length} записей`,
//         processed: fileContent.items.length
//       };
//     } catch (error) {
//       await transaction.rollback();
//       console.error("Ошибка в addedJSONfile:", error);
//       throw new Error("Ошибка при добавлении JSON данных в БД: " + error.message);
//     }
//   }

//   static async addedJSONoneObj(fileContent, externalTransaction = null) {
//     const shouldCommit = !externalTransaction;
//     const transaction = externalTransaction || await sequelize.transaction();
    
//     try {
//       const ip = fileContent.ip;
//       const reachable = fileContent.reachable;
//       const portData = fileContent.port_data || {};
      
//       // Обеспечиваем, что порты - это числа
//       const openPorts = Array.isArray(portData.open) 
//         ? portData.open.map(p => parseInt(p)).filter(p => !isNaN(p) && p >= 1 && p <= 65535)
//         : [];
//       const filteredPorts = Array.isArray(portData.filtered)
//         ? portData.filtered.map(p => parseInt(p)).filter(p => !isNaN(p) && p >= 1 && p <= 65535)
//         : [];
//       const whoisData = fileContent.whois || {};

//       if (!ip) {
//         throw new Error("IP адрес отсутствует в данных.");
//       }

//       // Находим или создаем хост с транзакцией
//       let host = await Host.findOne({ 
//         where: { ip: ip },
//         transaction 
//       });
      
//       if (!host) {
//         host = await Host.create({ 
//           ip: ip, 
//           reachable: Boolean(reachable) 
//         }, { transaction });
//       } else {
//         // Обновляем существующий хост
//         host.reachable = Boolean(reachable);
//         host.updated_at = new Date();
//         await host.save({ transaction });
//       }

//       // Удаляем старые порты для этого хоста
//       await Port.destroy({ 
//         where: { host_id: host.id }, 
//         transaction 
//       });

//       // Создаем новые порты
//       const portPromises = [];
      
//       // Для открытых портов
//       for (const port of openPorts) {
//         portPromises.push(
//           Port.create({
//             host_id: host.id,
//             port: port,
//             type: 'open'
//           }, { transaction })
//         );
//       }
      
//       // Для filtered портов
//       for (const port of filteredPorts) {
//         portPromises.push(
//           Port.create({
//             host_id: host.id,
//             port: port,
//             type: 'filtered'
//           }, { transaction })
//         );
//       }

//       await Promise.all(portPromises);

//       // Обработка WHOIS данных
//       const allowedKeys = await WhoisKey.findAll({
//         attributes: ['key_name'],
//         transaction
//       });
      
//       const allowedKeyNames = new Set(allowedKeys.map(k => k.key_name));

//       // Удаляем старые WHOIS записи
//       await Whois.destroy({ 
//         where: { host_id: host.id }, 
//         transaction 
//       });

//       const whoisPromises = Object.entries(whoisData)
//         .filter(([key]) => allowedKeyNames.has(key))
//         .filter(([key, value]) => value !== null && value !== undefined && value !== "")
//         .map(async ([key, value]) => {
//           const [whoisKey, created] = await WhoisKey.findOrCreate({
//             where: { key_name: key },
//             defaults: { key_name: key },
//             transaction
//           });

//           return Whois.create({
//             host_id: host.id,
//             key_id: whoisKey.id,
//             value: String(value)
//           }, { transaction });
//         });

//       await Promise.all(whoisPromises);

//       // Коммитим только если это внутренняя транзакция
//       if (shouldCommit) {
//         await transaction.commit();
//       }

//       console.log(`Данные для IP ${ip} успешно добавлены/обновлены в БД.`);
//       return { success: true, ip: ip };
//     } catch (error) {
//       // Откатываем только если это внутренняя транзакция
//       if (shouldCommit) {
//         await transaction.rollback();
//       }
//       console.error("Ошибка в addedJSONoneObj для IP", ip, ":", error);
//       throw new Error(`Ошибка при добавлении данных для IP ${ip}: ` + error.message);
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
//           id: host.id,
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
//           id: host.id,
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


//   static async scanVersionDetection(ip) {
//     try {
//       console.log(`Запуск сканирования версий для IP: ${ip}`);
      
//       if (isLocalIp(ip)) {
//         console.log(`IP ${ip} является локальным, пропускаем сканирование.`);
//         return { ip, error: "Local IP address skipped for version scan" };
//       }

//       const reachable = await checkReachability(ip, 1000);
//       if (!reachable) {
//         console.log(`Хост ${ip} недоступен, пропускаем сканирование версий.`);
//         return { ip, error: "Host is not reachable for version scan" };
//       }

//       let versionScanResult = [];
//       try {
//         // Убедитесь, что scanVersionDetection импортирована!
//         versionScanResult = await Promise.race([
//           scanVersionDetection(ip),
//           new Promise((_, reject) => 
//             setTimeout(() => reject(new Error("Timeout")), 20000)
//           ),
//         ]);
//       } catch (timeoutError) {
//         console.warn(`Таймаут версионного сканирования для ${ip}:`, timeoutError.message);
//         return { ip, error: "Version scan timeout" };
//       }
      
//       console.log(`Версионное сканирование для ${ip} завершено, найдено:`, versionScanResult.length, 'сервисов');

//       return {
//         ip: ip,
//         serviceVersions: versionScanResult || [],
//         message: `Version scan completed for ${ip}`
//       };
//     } catch (error) {
//       console.error(`Ошибка при версионном сканировании IP ${ip}:`, error);
//       return { ip, error: error.message };
//     }
//   }
// }
