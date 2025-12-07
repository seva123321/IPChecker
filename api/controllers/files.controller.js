import fs from "fs";
import path from "path";
import archiver from "archiver"; // Добавлен импорт
import FileService from "../services/files.service.js";
import { Op } from 'sequelize';
import { Host, Port, Whois, WhoisKey, WellKnownPort, sequelize, FileSource, Country, Priority, Grouping } from "../models/index.js";

// Хранилище для SSE соединений
const sseConnections = new Map();

export default class FileController {
  // Метод для SSE соединений
  static setupSSE(req, res) {
      // Важно: не закрывать соединение сразу!
      res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          'Access-Control-Allow-Origin': '*',
      });

      const clientId = req.query.clientId;
      if (!clientId) {
          console.error('❌ clientId не предоставлен в SSE запросе');
          res.end();
          return;
      }

      console.log(`✅ SSE подключен клиент ${clientId}`);
      
      // Сохраняем соединение
      sseConnections.set(clientId, res);

      // Отправляем начальное сообщение
      const initialMessage = {
          type: 'connected',
          clientId: clientId,
          message: 'SSE соединение установлено',
          timestamp: new Date().toISOString()
      };
      
      res.write(`data: ${JSON.stringify(initialMessage)}\n\n`);

      // Функция для проверки "живости" соединения
      const keepAliveInterval = setInterval(() => {
          try {
              if (!res.writableEnded) {
                  res.write(`data: ${JSON.stringify({ type: 'keep-alive', timestamp: new Date().toISOString() })}\n\n`);
              } else {
                  clearInterval(keepAliveInterval);
              }
          } catch (error) {
              console.log(`❌ Ошибка отправки keep-alive клиенту ${clientId}`);
              clearInterval(keepAliveInterval);
          }
      }, 15000); // Каждые 15 секунд

      // Обработка отключения клиента
      req.on('close', () => {
          console.log(`❌ Клиент ${clientId} отключился от SSE`);
          clearInterval(keepAliveInterval);
          sseConnections.delete(clientId);
      });

      req.on('error', (error) => {
          console.error(`❌ Ошибка SSE соединения с клиентом ${clientId}:`, error);
          clearInterval(keepAliveInterval);
          sseConnections.delete(clientId);
      });
  }

  // Метод для отправки событий конкретному клиенту
  static sendProgressEvent(event) {
      if (!event.clientId) {
          console.error('❌ sendProgressEvent: clientId не указан', event);
          return;
      }

      const message = `data: ${JSON.stringify(event)}\n\n`;
      const clientId = event.clientId;
      
      console.log(`📤 Отправка события ${event.type} клиенту ${clientId}`);

      const res = sseConnections.get(clientId);
      if (res && !res.writableEnded) {
          try {
              res.write(message);
              console.log(`✅ Событие ${event.type} отправлено клиенту ${clientId}`);
          } catch (error) {
              console.error(`❌ Ошибка отправки события клиенту ${clientId}:`, error);
              sseConnections.delete(clientId);
          }
      } else {
          console.warn(`⚠️ Клиент ${clientId} не найден или соединение закрыто`);
      }
  }

  async handleFilesIP(req, res) {
    await this.handleFilesWithProgress(req, res, "txt", FileService.searchIP);
  }

  async handleFilesJSON(req, res) {
    await this.handleFilesWithProgress(req, res, "json", FileService.addedJSONfile);
  }

  async handleFilesWithProgress(req, res, extension, serviceFunction) {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "Файлы не переданы" });
      }

      const clientId = req.body.clientId || req.query.clientId || 'default';
      console.log(`🔄 Начало обработки файлов для клиента ${clientId}`);
      console.log(`📁 Количество файлов: ${req.files.length}`);

      // Отправляем событие начала обработки
      FileController.sendProgressEvent({
        type: 'processing_started',
        clientId,
        message: `Начата обработка ${req.files.length} файлов`,
        timestamp: new Date().toISOString()
      });

      const processedFiles = await Promise.all(
        req.files.map(async (file, fileIndex) => {
          const filePath = file.path;
          const fileName = file.originalname;
          console.log(`📄 Обработка файла: ${fileName}`);

          try {
            if (path.extname(fileName).toLowerCase() === `.${extension}`) {
              const fileContent = await fs.promises.readFile(filePath, "utf-8");
              
              // Отправляем событие начала обработки файла
              FileController.sendProgressEvent({
                type: 'file_start',
                clientId,
                fileIndex,
                fileName,
                totalFiles: req.files.length,
                timestamp: new Date().toISOString()
              });

              console.log(`📤 Вызов serviceFunction для ${fileName}`);
              
              // Создаем callback для прогресса
              const progressCallback = (progress) => {
                console.log(`📊 Прогресс для ${fileName}:`, progress);
                // Отправляем прогресс обработки IP
                FileController.sendProgressEvent({
                  ...progress,
                  clientId,
                  fileIndex,
                  fileName,
                  timestamp: new Date().toISOString()
                });
              };

              // Вызываем serviceFunction с fileName и callback
              let result;
              if (extension === 'txt') {
                // Для IP файлов передаем fileName как второй параметр
                result = await serviceFunction(fileContent, fileName, progressCallback);
              } else {
                // Для JSON файлов используем старый вызов
                result = await serviceFunction(fileContent, progressCallback);
              }

              try {
                await fs.promises.unlink(filePath);
                console.log(`✅ Файл удален: ${filePath}`);
              } catch (unlinkError) {
                console.error(`❌ Ошибка удаления файла ${filePath}:`, unlinkError);
              }

              // Отправляем событие завершения файла
              FileController.sendProgressEvent({
                type: 'file_complete',
                clientId,
                fileIndex,
                fileName,
                result,
                timestamp: new Date().toISOString()
              });

              console.log(`✅ Файл обработан: ${fileName}`);

              return {
                fileName,
                message: "Файл успешно обработан",
                result,
              };
            } else {
              throw new Error(`Неподдерживаемый формат. Ожидается .${extension}`);
            }
          } catch (readError) {
            console.error(`❌ Ошибка чтения файла ${fileName}:`, readError);
            try {
              await fs.promises.unlink(filePath);
              console.log(`🗑️ Файл удален после ошибки: ${filePath}`);
            } catch (unlinkError) {
              console.error(`❌ Ошибка удаления файла после ошибки:`, unlinkError);
            }
            
            // Отправляем событие ошибки
            FileController.sendProgressEvent({
              type: 'file_error',
              clientId,
              fileIndex,
              fileName,
              error: readError.message,
              timestamp: new Date().toISOString()
            });

            throw new Error(`Не удалось обработать файл: ${fileName} - ${readError.message}`);
          }
        })
      );

      // Финальное событие
      FileController.sendProgressEvent({
        type: 'all_complete',
        clientId,
        processedFiles,
        timestamp: new Date().toISOString()
      });

      console.log(`🎉 Все файлы обработаны для клиента ${clientId}`);

      res.status(200).json({ 
        message: "Файлы успешно загружены и обработаны", 
        files: processedFiles 
      });
    } catch (error) {
      console.error("❌ Ошибка при обработке загруженных файлов:", error);
      
      FileController.sendProgressEvent({
        type: 'processing_error',
        clientId: req.body.clientId || req.query.clientId || 'default',
        error: error.message,
        timestamp: new Date().toISOString()
      });

      res.status(500).json({ 
        error: "Ошибка сервера при обработке файлов",
        details: error.message 
      });
    }
  }

  // СТАРЫЙ метод (для обратной совместимости) - можно удалить если не используется
  async handleFiles(req, res, extension, serviceFunction) {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "Файлы не переданы" });
      }

      const processedFiles = await Promise.all(
        req.files.map(async (file) => {
          const filePath = file.path;
          const fileName = file.originalname;
          console.log(`Обработка файла: ${fileName} в пути: ${filePath}`);

          try {
            const fileExtension = path.extname(fileName).toLowerCase();
            if (fileExtension === `.${extension}`) {
              const fileContent = await fs.promises.readFile(filePath, "utf-8");
              const result = await serviceFunction(fileContent);

              try {
                await fs.promises.unlink(filePath);
                console.log(`Файл удален: ${filePath}`);
              } catch (unlinkError) {
                console.error(`Ошибка при удалении файла ${filePath}:`, unlinkError);
              }

              return {
                fileName,
                message: "Файл успешно обработан и данные добавлены в базу",
                result,
              };
            } else {
              throw new Error(
                `Неподдерживаемый формат файла. Ожидается .${extension}, получен ${fileExtension}`
              );
            }
          } catch (readError) {
            console.error(`Ошибка при чтении файла ${fileName}:`, readError);
            try {
              await fs.promises.unlink(filePath);
              console.log(`Файл удален после ошибки: ${filePath}`);
            } catch (unlinkError) {
              console.error(`Ошибка при удалении файла ${filePath} после ошибки:`, unlinkError);
            }
            throw new Error(`Не удалось обработать файл: ${fileName} - ${readError.message}`);
          }
        })
      );

      res.status(200).json({ 
        message: "Файлы успешно загружены и обработаны", 
        files: processedFiles 
      });
    } catch (error) {
      console.error("Ошибка при обработке загруженных файлов:", error);
      res.status(500).json({ 
        error: "Ошибка сервера при обработке файлов",
        details: error.message 
      });
    }
  }

  // Новый метод для сканирования версий сервисов по IP
  async scanVersionByIP(req, res) {
    try {
      const { ip } = req.body;

      if (!ip) {
        return res.status(400).json({ error: "IP адрес не предоставлен" });
      }

      console.log(`Запуск сканирования версий для IP: ${ip}`);

      const versionScanResult = await FileService.scanVersionDetection(ip);

      // Проверяем, есть ли ошибка в результате
      if (versionScanResult.error) {
        return res.status(400).json({ 
          error: `Ошибка при сканировании версий: ${versionScanResult.error}` 
        });
      }

      res.status(200).json({
        message: `Сканирование версий для IP ${ip} завершено`,
        ip: ip,
        data: versionScanResult.serviceVersions || [],
      });
    } catch (error) {
      console.error("Ошибка при сканировании версий:", error);
      res.status(500).json({ error: "Ошибка сервера при сканировании версий" });
    }
  }

  async getFileDb(req, res) {
    try {
      const result = await FileService.getFileDb();
      return res.json(result);
    } catch (error) {
      console.error("Ошибка в getFileDb:", error);
      return res.status(500).json({ error: error.message });
    }
  }

  async getFileDbRange(req, res) {
    try {
      const { startDate, endDate } = req.query;
      
      if (!startDate || !endDate) {
        return res.status(400).json({ 
          error: "Необходимо указать startDate и endDate" 
        });
      }

      // Валидация дат
      const start = new Date(startDate);
      const end = new Date(endDate);
      
      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({ 
          error: "Неверный формат даты. Используйте YYYY-MM-DD" 
        });
      }

      if (start > end) {
        return res.status(400).json({ 
          error: "startDate не может быть больше endDate" 
        });
      }

      const result = await FileService.getFileDbRange(startDate, endDate);
      return res.json(result);
    } catch (error) {
      console.error("Ошибка в getFileDbRange:", error);
      return res.status(500).json({ error: error.message });
    }
  }

static async exportSingleFile(req, res) {
  try {
    const { fileName } = req.params;
    const decodedFileName = decodeURIComponent(fileName);
    
    console.log(`📤 Экспорт файла по запросу: ${fileName}`);
    console.log(`🔍 Декодированное имя: ${decodedFileName}`);

    // 1. Попробуем найти точное совпадение (похоже на запрос из логов)
    const exactMatch = await FileSource.findOne({
      where: {
        name: decodedFileName
      },
      include: [{
        model: Host,
        include: [
          {
            model: Port,
            include: [{
              model: WellKnownPort,
              attributes: ['name']
            }]
          },
          {
            model: Whois,
            include: [{
              model: WhoisKey,
              attributes: ['key_name']
            }]
          },
          {
            model: Priority,
            attributes: ['id', 'name']
          },
          {
            model: Grouping,
            attributes: ['id', 'name']
          },
          {
            model: Country,
            attributes: ['id', 'name']
          }
        ]
      }]
    });

    if (exactMatch) {
      console.log(`✅ Найдено точное совпадение: "${exactMatch.name}" (ID: ${exactMatch.id})`);
      if (exactMatch.Hosts && exactMatch.Hosts.length > 0) {
        return FileController.processAndExportFile(exactMatch, decodedFileName, res);
      }
    }

    // 2. Если точного совпадения нет или у файла нет хостов, ищем среди файлов с хостами
    console.log(`🔍 Точного совпадения не найдено, ищем среди файлов с хостами...`);
    
    const allFilesWithHosts = await FileSource.findAll({
      attributes: ['id', 'name', 'uploaded_at'],
      order: [['uploaded_at', 'DESC']],
      include: [{
        model: Host,
        attributes: ['id'],
        required: true // Только файлы с хостами
      }]
    });

    console.log(`📋 Всего файлов с хостами: ${allFilesWithHosts.length}`);

    if (allFilesWithHosts.length === 0) {
      return res.status(404).json({
        success: false,
        error: 'В базе данных нет ни одного файла с хостами'
      });
    }

    // 3. Ищем наиболее подходящий файл по имени
    let bestMatch = null;
    let bestScore = -1;
    const requestedName = decodedFileName.toLowerCase();
    
    for (const file of allFilesWithHosts) {
      const fileName = file.name.toLowerCase();
      let score = 0;
      
      // Проверяем различные критерии совпадения
      
      // Точное совпадение (уже проверяли выше, но на всякий случай)
      if (fileName === requestedName) {
        score = 100;
      }
      
      // Полное совпадение после удаления спецсимволов
      const cleanFileName = fileName.replace(/[\[\]%\-—\s]/g, '');
      const cleanRequestedName = requestedName.replace(/[\[\]%\-—\s]/g, '');
      
      if (cleanFileName === cleanRequestedName) {
        score = Math.max(score, 90);
      }
      
      // Содержит запрошенное имя
      if (fileName.includes(requestedName)) {
        score = Math.max(score, 80);
      }
      
      // Запрошенное имя содержит имя файла
      if (requestedName.includes(fileName)) {
        score = Math.max(score, 70);
      }
      
      // Совпадение по ключевым частям
      const fileParts = fileName.split(/[\.\-_\s]/);
      const requestedParts = requestedName.split(/[\.\-_\s]/);
      
      let commonParts = 0;
      for (const part of requestedParts) {
        if (part.length > 2 && fileParts.some(fp => fp.includes(part))) {
          commonParts++;
        }
      }
      
      if (commonParts > 0) {
        score = Math.max(score, 60 + commonParts * 5);
      }
      
      // Отладочная информация
      if (score > 0) {
        console.log(`🔍 Файл "${file.name}": score=${score}`);
      }
      
      if (score > bestScore) {
        bestScore = score;
        bestMatch = file;
      }
    }

    // 4. Если нашли подходящий файл, экспортируем его
    if (bestMatch && bestScore > 0) {
      console.log(`🎯 Выбран файл: "${bestMatch.name}" (ID: ${bestMatch.id}), score: ${bestScore}`);
      
      const fileSource = await FileSource.findOne({
        where: { id: bestMatch.id },
        include: [{
          model: Host,
          include: [
            {
              model: Port,
              include: [{
                model: WellKnownPort,
                attributes: ['name']
              }]
            },
            {
              model: Whois,
              include: [{
                model: WhoisKey,
                attributes: ['key_name']
              }]
            },
            {
              model: Priority,
              attributes: ['id', 'name']
            },
            {
              model: Grouping,
              attributes: ['id', 'name']
            },
            {
              model: Country,
              attributes: ['id', 'name']
            }
          ]
        }]
      });
      
      if (fileSource.Hosts && fileSource.Hosts.length > 0) {
        return FileController.processAndExportFile(fileSource, decodedFileName, res);
      }
    }

    // 5. Если не нашли подходящего файла, покажем что есть в базе
    const availableFiles = await FileSource.findAll({
      attributes: ['id', 'name', 'uploaded_at'],
      limit: 20,
      order: [['uploaded_at', 'DESC']]
    });

    return res.status(404).json({
      success: false,
      error: `Файл "${decodedFileName}" не найден в базе данных`,
      requested_file: decodedFileName,
      similar_files_found: availableFiles.map(f => f.name),
      suggestion: 'Проверьте точное название файла или используйте экспорт всех файлов'
    });

  } catch (error) {
    console.error(`❌ Ошибка при экспорте файла:`, error);
    
    res.status(500).json({
      success: false,
      error: `Ошибка при экспорте файла: ${error.message}`,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
  }
}

// Вспомогательная функция для обработки и экспорта файла
   static async processAndExportFile(fileSource, requestedFileName, res) {
    try {
      console.log(`✅ Найден файл для экспорта: "${fileSource.name}", хостов: ${fileSource.Hosts.length}`);
      
      // Формируем структурированные данные
      const formattedData = fileSource.Hosts.map(host => {
        // Формируем данные портов
        const portData = {
          open: [],
          filtered: []
        };

        if (host.Ports && host.Ports.length > 0) {
          host.Ports.forEach(port => {
            const portInfo = {
              port: port.port,
              name: port.WellKnownPort ? port.WellKnownPort.name : null
            };

            if (port.type === 'open') {
              portData.open.push(portInfo);
            } else if (port.type === 'filtered') {
              portData.filtered.push(portInfo);
            }
          });
        }

        // Формируем данные WHOIS
        const whoisData = [];
        if (host.Whois && host.Whois.length > 0) {
          host.Whois.forEach(whois => {
            if (whois.WhoisKey && whois.WhoisKey.key_name) {
              whoisData.push({
                key: whois.WhoisKey.key_name,
                value: whois.value
              });
            }
          });
        }

        // Базовый объект хоста
        const hostData = {
          id: host.id,
          ip: host.ip,
          reachable: host.reachable,
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
            } : null
          },
          has_whois: host.Whois && host.Whois.length > 0
        };

        // Добавляем WHOIS данные, если они есть
        if (whoisData.length > 0) {
          // Преобразуем массив в объект для удобства
          const whoisObject = {};
          whoisData.forEach(item => {
            whoisObject[item.key] = item.value;
          });
          hostData.whois = whoisObject;
        }

        return hostData;
      });

      // Создаем имя файла для экспорта
      const exportFileName = `export_${fileSource.name.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_\-\.]/g, '_')}_${Date.now()}.json`;

      // Формируем полный ответ с метаданными
      const exportResult = {
        success: true,
        search_info: {
          requested_file: requestedFileName,
          found_file: fileSource.name,
          file_id: fileSource.id,
          match_type: fileSource.name === requestedFileName ? 'exact_match' : 'similar_match',
          uploaded_at: fileSource.uploaded_at
        },
        file_info: {
          file_id: fileSource.id,
          file_name: fileSource.name,
          file_name_decoded: decodeURIComponent(fileSource.name),
          export_file_name: exportFileName,
          uploaded_at: fileSource.uploaded_at,
          encoding: fileSource.encoding,
          exported_at: new Date().toISOString(),
          total_hosts: formattedData.length,
          reachable_hosts: formattedData.filter(h => h.reachable).length,
          unreachable_hosts: formattedData.filter(h => !h.reachable).length,
          hosts_with_whois: formattedData.filter(h => h.has_whois).length,
          hosts_with_open_ports: formattedData.filter(h => h.port_data.open.length > 0).length
        },
        data: formattedData
      };

      // Настройка заголовков для скачивания файла
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename="${exportFileName}"`);
      
      // Отправляем данные как файл для скачивания
      res.json(exportResult);

      console.log(`✅ Экспорт завершен: ${exportFileName}, хостов: ${formattedData.length}`);

    } catch (error) {
      console.error(`❌ Ошибка при обработке файла:`, error);
      throw error;
    }
  }

// Вспомогательная функция для расчета совпадения
 static calculateMatchScore(fileName, searchName) {
  let score = 0;
  const fileNameLower = fileName.toLowerCase();
  const searchNameLower = searchName.toLowerCase();
  
  // Точное совпадение
  if (fileNameLower === searchNameLower) {
    score += 100;
  }
  
  // Совпадение без учета кодирования
  if (fileNameLower.replace(/[\[\]%]/g, '') === searchNameLower.replace(/[\[\]%]/g, '')) {
    score += 50;
  }
  
  // Содержит искомое имя
  if (fileNameLower.includes(searchNameLower)) {
    score += 30;
  }
  
  // Искомое имя содержит имя файла
  if (searchNameLower.includes(fileNameLower)) {
    score += 20;
  }
  
  // Совпадение по ключевым словам
  const keywords = ['test', 'ip_dst', 'ip'];
  keywords.forEach(keyword => {
    if (fileNameLower.includes(keyword) && searchNameLower.includes(keyword)) {
      score += 10;
    }
  });
  
  return score;
}


  // В методе exportAllFiles исправьте вызов:
// В методе exportAllFiles исправьте вызов:
  static async exportAllFiles(req, res) {
    try {
      console.log(`📤 Начало экспорта всех файлов в архив`);
      
      // Получаем все файлы с хостами, отсортированные по дате
      const allFilesWithHosts = await FileSource.findAll({
        attributes: ['id', 'name', 'uploaded_at', 'encoding'],
        order: [['uploaded_at', 'DESC']],
        include: [{
          model: Host,
          attributes: ['id'],
          required: true // Только файлы с хостами
        }]
      });

      console.log(`📋 Всего файлов с хостами: ${allFilesWithHosts.length}`);

      if (allFilesWithHosts.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'В базе данных нет ни одного файла с хостами'
        });
      }

      // Создаем временную директорию для файлов
      const tempDir = path.join(process.cwd(), 'temp_exports');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const timestamp = Date.now();
      const exportDir = path.join(tempDir, `export_all_${timestamp}`);
      fs.mkdirSync(exportDir, { recursive: true });

      console.log(`📁 Создана временная директория: ${exportDir}`);

      // Массив для хранения информации об экспортированных файлах
      const exportSummary = [];

      // Обрабатываем каждый файл
      for (let i = 0; i < allFilesWithHosts.length; i++) {
        const fileSource = allFilesWithHosts[i];
        
        console.log(`📄 Экспорт файла ${i + 1}/${allFilesWithHosts.length}: "${fileSource.name}" (ID: ${fileSource.id})`);

        try {
          // Получаем полные данные файла
          const fullFileData = await FileSource.findOne({
            where: { id: fileSource.id },
            include: [{
              model: Host,
              include: [
                {
                  model: Port,
                  include: [{
                    model: WellKnownPort,
                    attributes: ['name']
                  }]
                },
                {
                  model: Whois,
                  include: [{
                    model: WhoisKey,
                    attributes: ['key_name']
                  }]
                },
                {
                  model: Priority,
                  attributes: ['id', 'name']
                },
                {
                  model: Grouping,
                  attributes: ['id', 'name']
                },
                {
                  model: Country,
                  attributes: ['id', 'name']
                }
              ]
            }]
          });

          if (!fullFileData.Hosts || fullFileData.Hosts.length === 0) {
            console.log(`⚠️ Файл "${fileSource.name}" не содержит хостов, пропускаем`);
            continue;
          }

          // Формируем структурированные данные
          const formattedData = fullFileData.Hosts.map(host => {
            // Формируем данные портов
            const portData = {
              open: [],
              filtered: []
            };

            if (host.Ports && host.Ports.length > 0) {
              host.Ports.forEach(port => {
                const portInfo = {
                  port: port.port,
                  name: port.WellKnownPort ? port.WellKnownPort.name : null
                };

                if (port.type === 'open') {
                  portData.open.push(portInfo);
                } else if (port.type === 'filtered') {
                  portData.filtered.push(portInfo);
                }
              });
            }

            // Формируем данные WHOIS
            const whoisData = [];
            if (host.Whois && host.Whois.length > 0) {
              host.Whois.forEach(whois => {
                if (whois.WhoisKey && whois.WhoisKey.key_name) {
                  whoisData.push({
                    key: whois.WhoisKey.key_name,
                    value: whois.value
                  });
                }
              });
            }

            // Базовый объект хоста
            const hostData = {
              id: host.id,
              ip: host.ip,
              reachable: host.reachable,
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
                } : null
              },
              has_whois: host.Whois && host.Whois.length > 0
            };

            // Добавляем WHOIS данные, если они есть
            if (whoisData.length > 0) {
              // Преобразуем массив в объект для удобства
              const whoisObject = {};
              whoisData.forEach(item => {
                whoisObject[item.key] = item.value;
              });
              hostData.whois = whoisObject;
            }

            return hostData;
          });

          // Создаем имя файла для экспорта (без запрещенных символов)
          const safeFileName = fileSource.name.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_\-\.]/g, '_');
          const exportFileName = `${safeFileName}_export_${timestamp}.json`;
          const exportFilePath = path.join(exportDir, exportFileName);

          // Формируем полный ответ с метаданными
          const exportResult = {
            success: true,
            file_info: {
              file_id: fullFileData.id,
              original_name: fullFileData.name,
              decoded_name: decodeURIComponent(fullFileData.name),
              export_file_name: exportFileName,
              uploaded_at: fullFileData.uploaded_at,
              encoding: fullFileData.encoding,
              exported_at: new Date().toISOString(),
              total_hosts: formattedData.length,
              reachable_hosts: formattedData.filter(h => h.reachable).length,
              unreachable_hosts: formattedData.filter(h => !h.reachable).length,
              hosts_with_whois: formattedData.filter(h => h.has_whois).length,
              hosts_with_open_ports: formattedData.filter(h => h.port_data.open.length > 0).length
            },
            data: formattedData
          };

          // Сохраняем JSON файл
          fs.writeFileSync(exportFilePath, JSON.stringify(exportResult, null, 2), 'utf8');

          // Добавляем информацию в summary
          exportSummary.push({
            file_id: fullFileData.id,
            file_name: fullFileData.name,
            export_file_name: exportFileName,
            hosts_count: formattedData.length,
            reachable_hosts: formattedData.filter(h => h.reachable).length,
            unreachable_hosts: formattedData.filter(h => !h.reachable).length,
            file_path: exportFilePath
          });

          console.log(`✅ Файл экспортирован: ${exportFileName}, хостов: ${formattedData.length}`);

        } catch (fileError) {
          console.error(`❌ Ошибка при экспорте файла "${fileSource.name}":`, fileError);
          // Продолжаем обработку остальных файлов
        }
      }

      if (exportSummary.length === 0) {
        // Очистка временной директории
        fs.rmSync(exportDir, { recursive: true, force: true });
        
        return res.status(404).json({
          success: false,
          error: 'Не удалось экспортировать ни одного файла'
        });
      }

      // Создаем summary файл
      const summaryData = {
        success: true,
        exported_at: new Date().toISOString(),
        total_files_exported: exportSummary.length,
        total_hosts: exportSummary.reduce((sum, file) => sum + file.hosts_count, 0),
        total_reachable_hosts: exportSummary.reduce((sum, file) => sum + file.reachable_hosts, 0),
        total_unreachable_hosts: exportSummary.reduce((sum, file) => sum + file.unreachable_hosts, 0),
        files: exportSummary.map(file => ({
          file_id: file.file_id,
          original_name: file.file_name,
          export_file_name: file.export_file_name,
          hosts_count: file.hosts_count,
          reachable_hosts: file.reachable_hosts,
          unreachable_hosts: file.unreachable_hosts
        }))
      };

      const summaryPath = path.join(exportDir, `export_summary_${timestamp}.json`);
      fs.writeFileSync(summaryPath, JSON.stringify(summaryData, null, 2), 'utf8');

      // Создаем ZIP архив
      const archiveFileName = `all_files_export_${timestamp}.zip`;
      const archivePath = path.join(tempDir, archiveFileName);

      return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(archivePath);
        const archive = archiver('zip', {
          zlib: { level: 9 } // Максимальное сжатие
        });

        output.on('close', () => {
          console.log(`✅ ZIP архив создан: ${archivePath}, размер: ${archive.pointer()} bytes`);
          
          // Настраиваем заголовки для скачивания
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="${archiveFileName}"`);
          res.setHeader('Content-Length', archive.pointer());

          // Отправляем архив
          const archiveStream = fs.createReadStream(archivePath);
          archiveStream.pipe(res);

          // Очистка после отправки
          archiveStream.on('end', () => {
            // Удаляем временные файлы
            try {
              fs.rmSync(exportDir, { recursive: true, force: true });
              fs.unlinkSync(archivePath);
              console.log(`🧹 Временные файлы удалены`);
            } catch (cleanupError) {
              console.error('⚠️ Ошибка при очистке временных файлов:', cleanupError);
            }
            resolve();
          });

          archiveStream.on('error', (error) => {
            console.error('❌ Ошибка при отправке архива:', error);
            reject(error);
          });
        });

        archive.on('warning', (err) => {
          if (err.code === 'ENOENT') {
            console.warn('⚠️ Предупреждение archiver:', err);
          } else {
            reject(err);
          }
        });

        archive.on('error', (err) => {
          console.error('❌ Ошибка archiver:', err);
          reject(err);
        });

        archive.pipe(output);

        // Добавляем все файлы из exportDir в архив
        archive.directory(exportDir, false);
        
        // Завершаем архивацию
        archive.finalize();
      });

    } catch (error) {
      console.error(`❌ Ошибка при экспорте всех файлов:`, error);
      
      // Отправляем JSON ошибки даже при ошибке
      res.status(500).json({
        success: false,
        error: `Ошибка при экспорте всех файлов: ${error.message}`,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }

    // Альтернативный метод для получения всех файлов как JSON (без архивации)
// Альтернативный метод для получения всех файлов как JSON (без архивации)
  static async exportAllFilesAsJSON(req, res) {
    try {
      console.log(`📤 Начало экспорта всех файлов как JSON`);
      
      // Получаем ВСЕ файлы, включая те, у которых нет хостов
      const allFiles = await FileSource.findAll({
        attributes: ['id', 'name', 'uploaded_at', 'encoding'],
        order: [['uploaded_at', 'DESC']],
        include: [{
          model: Host,
          attributes: ['id'],
          required: false // Включаем файлы даже без хостов
        }]
      });

      console.log(`📋 Всего файлов в базе: ${allFiles.length}`);

      if (allFiles.length === 0) {
        return res.status(404).json({
          success: false,
          error: 'В базе данных нет ни одного файла'
        });
      }

      // Массив для хранения экспортированных файлов
      const exportedFiles = [];

      // Обрабатываем каждый файл
      for (let i = 0; i < allFiles.length; i++) {
        const fileSource = allFiles[i];
        
        console.log(`📄 Обработка файла ${i + 1}/${allFiles.length}: "${fileSource.name}"`);

        try {
          // Получаем полные данные файла, включая ВСЕ хосты
          const fullFileData = await FileSource.findOne({
            where: { id: fileSource.id },
            include: [{
              model: Host,
              include: [
                {
                  model: Port,
                  include: [{
                    model: WellKnownPort,
                    attributes: ['name']
                  }]
                },
                {
                  model: Whois,
                  include: [{
                    model: WhoisKey,
                    attributes: ['key_name']
                  }]
                },
                {
                  model: Priority,
                  attributes: ['id', 'name']
                },
                {
                  model: Grouping,
                  attributes: ['id', 'name']
                },
                {
                  model: Country,
                  attributes: ['id', 'name']
                }
              ]
            }]
          });

          // Формируем структурированные данные для ВСЕХ хостов (даже если их нет)
          let formattedData = [];
          
          if (fullFileData.Hosts && fullFileData.Hosts.length > 0) {
            formattedData = fullFileData.Hosts.map(host => {
              // Формируем данные портов (всегда есть объект)
              const portData = {
                open: [],
                filtered: []
              };

              if (host.Ports && host.Ports.length > 0) {
                host.Ports.forEach(port => {
                  const portInfo = {
                    port: port.port,
                    name: port.WellKnownPort ? port.WellKnownPort.name : null
                  };

                  if (port.type === 'open') {
                    portData.open.push(portInfo);
                  } else if (port.type === 'filtered') {
                    portData.filtered.push(portInfo);
                  }
                });
              }

              // Формируем данные WHOIS (всегда есть объект)
              const whoisData = [];
              if (host.Whois && host.Whois.length > 0) {
                host.Whois.forEach(whois => {
                  if (whois.WhoisKey && whois.WhoisKey.key_name) {
                    whoisData.push({
                      key: whois.WhoisKey.key_name,
                      value: whois.value
                    });
                  }
                });
              }

              // Базовый объект хоста (все поля всегда присутствуют)
              const hostData = {
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
                  } : null
                },
                has_whois: host.Whois && host.Whois.length > 0,
                whois: {} // всегда есть объект
              };

              // Добавляем WHOIS данные, если они есть
              if (whoisData.length > 0) {
                const whoisObject = {};
                whoisData.forEach(item => {
                  whoisObject[item.key] = item.value;
                });
                hostData.whois = whoisObject;
              }

              return hostData;
            });
          }

          // Добавляем файл в результат (даже если хостов нет)
          exportedFiles.push({
            file_id: fullFileData.id,
            file_name: fullFileData.name,
            file_name_decoded: decodeURIComponent(fullFileData.name),
            uploaded_at: fullFileData.uploaded_at,
            encoding: fullFileData.encoding,
            hosts_count: formattedData.length,
            reachable_hosts: formattedData.filter(h => h.reachable).length,
            unreachable_hosts: formattedData.filter(h => !h.reachable).length,
            hosts_with_ports: formattedData.filter(h => h.port_data.open.length > 0 || h.port_data.filtered.length > 0).length,
            hosts_with_whois: formattedData.filter(h => Object.keys(h.whois).length > 0).length,
            data: formattedData // будет пустым массивом если хостов нет
          });

          console.log(`✅ Файл обработан: "${fileSource.name}", хостов: ${formattedData.length}`);

        } catch (fileError) {
          console.error(`❌ Ошибка при обработке файла "${fileSource.name}":`, fileError);
          
          // Добавляем файл с ошибкой (чтобы не терять информацию)
          exportedFiles.push({
            file_id: fileSource.id,
            file_name: fileSource.name,
            file_name_decoded: decodeURIComponent(fileSource.name),
            uploaded_at: fileSource.uploaded_at,
            encoding: fileSource.encoding,
            error: fileError.message,
            hosts_count: 0,
            reachable_hosts: 0,
            unreachable_hosts: 0,
            hosts_with_ports: 0,
            hosts_with_whois: 0,
            data: []
          });
        }
      }

      // Формируем финальный ответ
      const exportResult = {
        success: true,
        exported_at: new Date().toISOString(),
        total_files: exportedFiles.length,
        files_with_hosts: exportedFiles.filter(f => f.hosts_count > 0).length,
        files_without_hosts: exportedFiles.filter(f => f.hosts_count === 0).length,
        total_hosts: exportedFiles.reduce((sum, file) => sum + file.hosts_count, 0),
        total_reachable_hosts: exportedFiles.reduce((sum, file) => sum + file.reachable_hosts, 0),
        total_unreachable_hosts: exportedFiles.reduce((sum, file) => sum + file.unreachable_hosts, 0),
        files: exportedFiles
      };

      // Создаем временную директорию
      const tempDir = path.join(process.cwd(), 'temp_exports');
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const timestamp = Date.now();
      const exportFileName = `all_files_export_${timestamp}.json`;
      const jsonFilePath = path.join(tempDir, exportFileName);
      const zipFileName = `all_files_export_${timestamp}.zip`;
      const zipFilePath = path.join(tempDir, zipFileName);

      // Сохраняем JSON во временный файл
      console.log(`💾 Сохранение JSON во временный файл: ${jsonFilePath}`);
      fs.writeFileSync(jsonFilePath, JSON.stringify(exportResult, null, 2), 'utf8');

      // Создаем ZIP архив с JSON файлом
      console.log(`📦 Создание ZIP архива: ${zipFilePath}`);
      
      return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver('zip', {
          zlib: { level: 9 }
        });

        output.on('close', () => {
          console.log(`✅ ZIP архив создан: ${zipFilePath}, размер: ${archive.pointer()} bytes`);
          
          // Настраиваем заголовки для скачивания
          res.setHeader('Content-Type', 'application/zip');
          res.setHeader('Content-Disposition', `attachment; filename="${zipFileName}"`);
          res.setHeader('Content-Length', archive.pointer());

          // Отправляем архив
          const archiveStream = fs.createReadStream(zipFilePath);
          archiveStream.pipe(res);

          // Очистка после отправки
          archiveStream.on('end', () => {
            try {
              fs.unlinkSync(jsonFilePath);
              fs.unlinkSync(zipFilePath);
              console.log(`🧹 Временные файлы удалены`);
            } catch (cleanupError) {
              console.error('⚠️ Ошибка при очистке временных файлов:', cleanupError);
            }
            resolve();
          });

          archiveStream.on('error', (error) => {
            console.error('❌ Ошибка при отправке архива:', error);
            reject(error);
          });
        });

        archive.on('warning', (err) => {
          if (err.code === 'ENOENT') {
            console.warn('⚠️ Предупреждение archiver:', err);
          } else {
            reject(err);
          }
        });

        archive.on('error', (err) => {
          console.error('❌ Ошибка archiver:', err);
          reject(err);
        });

        archive.pipe(output);

        // Добавляем JSON файл в архив
        archive.file(jsonFilePath, { name: exportFileName });
        
        // Завершаем архивацию
        archive.finalize();
      });

    } catch (error) {
      console.error(`❌ Ошибка при экспорте всех файлов:`, error);
      
      // Отправляем JSON ошибки даже при ошибке
      res.status(500).json({
        success: false,
        error: `Ошибка при экспорте всех файлов: ${error.message}`,
        stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
      });
    }
  }
  
  // В методе getExportableFiles исправьте вызов:
  async getExportableFiles(req, res) {
    try {
      const { sessionId } = req.query;
      
      if (!sessionId) {
        return res.status(400).json({ error: "ID сессии не указан" });
      }

      // Используем статический метод из FileService
      const files = await FileService.getFilesList(sessionId);
      
      res.status(200).json({
        sessionId,
        files: files || []
      });

    } catch (error) {
      console.error("❌ Ошибка при получении списка файлов:", error);
      res.status(500).json({ 
        error: "Ошибка сервера при получении списка файлов",
        details: error.message 
      });
    }
  }

  static async normalizeFileNames(req, res) {
    try {
      const result = await FileService.normalizeFileNames();
      res.json({
        success: true,
        message: `Нормализовано ${result.normalized} из ${result.total} имен файлов`,
        ...result
      });
    } catch (error) {
      console.error('❌ Ошибка при нормализации имен файлов:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  static async fixFileAssociations(req, res) {
    try {
      const { fileName, ipList } = req.body;
      
      if (!fileName) {
        return res.status(400).json({ error: "Имя файла обязательно" });
      }

      const result = await FileService.fixFileAssociations(fileName, ipList);
      res.json(result);
    } catch (error) {
      console.error('❌ Ошибка при исправлении ассоциаций файлов:', error);
      res.status(500).json({ error: error.message });
    }
  }

}

// import fs from "fs";
// import path from "path";
// import FileService from "../services/files.service.js";

// export default class FileController {
//   async handleFilesIP(req, res) {
//     await this.handleFiles(req, res, "txt", FileService.searchIP);
//   }

//   async handleFilesJSON(req, res) {
//     await this.handleFiles(req, res, "json", FileService.addedJSONfile);
//   }

//   // Новый метод для сканирования версий сервисов по IP

//   /****
//   * 
//   * POST{
//   "ip": "100.103.104.59"
//   }
//   * 
//   */
//   // ОТВЕТ
//   // {
//   //   "message": "Сканирование версий для IP 100.103.104.59 завершено",
//   //   "ip": "100.103.104.59",
//   //   "data": [
//   //     {
//   //       "port": 22,
//   //       "protocol": "tcp",
//   //       "state": "open",
//   //       "serviceInfo": "ssh        OpenSSH 8.9p1 Ubuntu 3ubuntu0.1"
//   //     },
//   //     {
//   //       "port": 80,
//   //       "protocol": "tcp",
//   //       "state": "open",
//   //       "serviceInfo": "http       Apache httpd 2.4.41 ((Ubuntu))"
//   //     }
//   //   ]
//   // }

//   async scanVersionByIP(req, res) {
//     try {
//       const { ip } = req.body; // Получаем IP из тела запроса

//       if (!ip) {
//         return res.status(400).json({ error: "IP адрес не предоставлен" });
//       }

//       console.log(`Запуск сканирования версий для IP: ${ip}`);

//       // Вызываем функцию из FileService для сканирования версий
//       const versionScanResult = await FileService.scanVersionDetection(ip);

//       res.status(200).json({
//         message: `Сканирование версий для IP ${ip} завершено`,
//         ip: ip,
//         data: versionScanResult, // Возвращаем результат сканирования
//       });
//     } catch (error) {
//       console.error("Ошибка при сканировании версий:", error);
//       res.status(500).json({ error: "Ошибка сервера при сканировании версий" });
//     }
//   }

//   async handleFiles(req, res, extension, serviceFunction) {
//     try {
//       if (!req.files || req.files.length === 0) {
//         return res.status(400).json({ error: "Файлы не переданы" });
//       }

//       const processedFiles = await Promise.all(
//         req.files.map(async (file) => {
//           const filePath = file.path;
//           const fileName = file.originalname;
//           console.log(`Обработка файла: ${fileName} в пути: ${filePath}`);

//           try {
//             if (path.extname(fileName).toLowerCase() === `.${extension}`) {
//               const fileContent = await fs.promises.readFile(filePath, "utf-8");
//               const result = await serviceFunction(fileContent);

//               try {
//                 await fs.promises.unlink(filePath);
//                 console.log(`Файл удален: ${filePath}`);
//               } catch (unlinkError) {
//                 console.error(
//                   `Ошибка при удалении файла ${filePath}:`,
//                   unlinkError
//                 );
//               }

//               return {
//                 fileName,
//                 message: "IP проверены и добавлены в базу",
//                 result,
//               };
//             } else {
//               throw new Error(
//                 `Неподдерживаемый формат файла. Поддерживаются только .${extension}.`
//               );
//             }
//           } catch (readError) {
//             console.error(`Ошибка при чтении файла ${fileName}:`, readError);
//             try {
//               await fs.promises.unlink(filePath);
//               console.log(`Файл удален после ошибки: ${filePath}`);
//             } catch (unlinkError) {
//               console.error(
//                 `Ошибка при удалении файла ${filePath} после ошибки:`,
//                 unlinkError
//               );
//             }
//             throw new Error(`Не удалось прочитать файл: ${fileName}`);
//           }
//         })
//       );

//       res
//         .status(200)
//         .json({ message: "Файлы успешно загружены", files: processedFiles });
//     } catch (error) {
//       console.error("Ошибка при обработке загруженных файлов:", error);
//       res.status(500).json({ error: "Ошибка сервера" });
//     }
//   }

//  async getFileDb(req, res) {
//     try {
//       const result = await FileService.getFileDb();
//       return res.json(result);
//     } catch (error) {
//       console.error("Ошибка в getFileDb:", error);
//       return res.status(500).json({ error: error.message });
//     }
//   }

//   async getFileDbRange(req, res) {
//     try {
//       const { startDate, endDate } = req.query;
      
//       if (!startDate || !endDate) {
//         return res.status(400).json({ 
//           error: "Необходимо указать startDate и endDate" 
//         });
//       }

//       const result = await FileService.getFileDbRange(startDate, endDate);
//       return res.json(result);
//     } catch (error) {
//       console.error("Ошибка в getFileDbRange:", error);
//       return res.status(500).json({ error: error.message });
//     }
//   }
// }
