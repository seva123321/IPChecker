import fs from "fs";
import path from "path";
import archiver from "archiver"; // Добавлен импорт
import FileService from "../services/files.service.js";
import sessionManager from "../utils/sessionManager.js";
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
} from "../models/index.js";

// Хранилище для SSE соединений
const sseConnections = new Map();

export default class FileController {
  // Метод для SSE соединений
  static setupSSE(req, res) {
    // Важно: не закрывать соединение сразу!
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    });

    const clientId = req.query.clientId;
    if (!clientId) {
      console.error("❌ clientId не предоставлен в SSE запросе");
      res.end();
      return;
    }

    console.log(`✅ SSE подключен клиент ${clientId}`);

    // Сохраняем соединение
    sseConnections.set(clientId, res);

    // Отправляем начальное сообщение
    const initialMessage = {
      type: "connected",
      clientId: clientId,
      message: "SSE соединение установлено",
      timestamp: new Date().toISOString(),
    };

    res.write(`data: ${JSON.stringify(initialMessage)}\n\n`);

    // Функция для проверки "живости" соединения
    const keepAliveInterval = setInterval(() => {
      try {
        if (!res.writableEnded) {
          res.write(
            `data: ${JSON.stringify({
              type: "keep-alive",
              timestamp: new Date().toISOString(),
            })}\n\n`
          );
        } else {
          clearInterval(keepAliveInterval);
        }
      } catch (error) {
        console.log(`❌ Ошибка отправки keep-alive клиенту ${clientId}`);
        clearInterval(keepAliveInterval);
      }
    }, 15000); // Каждые 15 секунд

    // Обработка отключения клиента
    req.on("close", () => {
      console.log(`❌ Клиент ${clientId} отключился от SSE`);
      clearInterval(keepAliveInterval);
      sseConnections.delete(clientId);
    });

    req.on("error", (error) => {
      console.error(`❌ Ошибка SSE соединения с клиентом ${clientId}:`, error);
      clearInterval(keepAliveInterval);
      sseConnections.delete(clientId);
    });
  }

  // Метод для отправки событий конкретному клиенту
  static sendProgressEvent(event) {
    if (!event.clientId) {
      console.error("❌ sendProgressEvent: clientId не указан", event);
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

  // async handleFilesIP(req, res) {
  //   await this.handleFilesWithProgress(req, res, "txt", FileService.searchIP);
  // }
  async handleFilesIP(req, res) {
    try {
      // Получаем clientId из запроса
      const clientId = req.query.clientId || req.body.clientId;

      if (!clientId) {
        return res.status(400).json({
          success: false,
          error: "clientId не указан",
        });
      }

      console.log(`🔄 Обработка файлов для сессии: ${clientId}`);

      await this.handleFilesWithProgress(
        req,
        res,
        "txt",
        async (content, fileName, progressCallback) => {
          return await FileService.searchIP(
            content,
            fileName,
            progressCallback,
            clientId // Передаем clientId
          );
        }
      );
    } catch (error) {
      console.error("❌ Ошибка в handleFilesIP:", error);
      res.status(500).json({ error: error.message });
    }
  }

  static async cleanupSession(sessionId) {
    try {
      const sessionDir = path.join(process.cwd(), "temp_exports", sessionId);

      if (fs.existsSync(sessionDir)) {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`🧹 Сессия ${sessionId} удалена`);
        return { success: true, message: `Сессия ${sessionId} удалена` };
      }

      return { success: false, message: `Сессия ${sessionId} не найдена` };
    } catch (error) {
      console.error(`❌ Ошибка при удалении сессии ${sessionId}:`, error);
      throw error;
    }
  }

  async handleFilesJSON(req, res) {
    await this.handleFilesWithProgress(
      req,
      res,
      "json",
      FileService.addedJSONfile.bind(FileService)
    );
  }

  async handleFilesWithProgress(req, res, extension, serviceFunction) {
    try {
      if (!req.files || req.files.length === 0) {
        return res.status(400).json({ error: "Файлы не переданы" });
      }

      const clientId = req.body.clientId || req.query.clientId || "default";
      console.log(`🔄 Начало обработки файлов для клиента ${clientId}`);
      console.log(`📁 Количество файлов: ${req.files.length}`);

      // Отправляем событие начала обработки
      FileController.sendProgressEvent({
        type: "processing_started",
        clientId,
        message: `Начата обработка ${req.files.length} файлов`,
        totalFiles: req.files.length,
        timestamp: new Date().toISOString(),
      });

      const processedFiles = await Promise.all(
        req.files.map(async (file, fileIndex) => {
          const filePath = file.path;
          const fileName = file.originalname;
          console.log(`📄 Обработка файла: ${fileName}`);

          try {
            if (path.extname(fileName).toLowerCase() === `.${extension}`) {
              const fileContent = await fs.promises.readFile(filePath, "utf-8");

              // const data = JSON.parse(fileContent);

              // let totalHosts = 0;
              // totalHosts += data.meta.statistics.total_hosts;

              // Отправляем событие начала обработки файла
              FileController.sendProgressEvent({
                type: "file_start",
                clientId,
                fileIndex,
                fileName,
                // total_hosts: totalHosts,
                // totalFiles: req.files.length,
                timestamp: new Date().toISOString(),
              });

              // console.log(`📤 Вызов serviceFunction для ${fileName}`);

              // Создаем callback для прогресса
              const progressCallback = (progress) => {
                // console.log(`📊 Прогресс для ${fileName}:`); //, progress);
                // Отправляем прогресс обработки IP
                FileController.sendProgressEvent({
                  ...progress,
                  clientId,
                  fileIndex,
                  fileName,
                  timestamp: new Date().toISOString(),
                });
              };

              // Вызываем serviceFunction с fileName и callback
              let result;
              if (extension === "txt") {
                // Для IP файлов передаем fileName как второй параметр
                result = await serviceFunction(
                  fileContent,
                  fileName,
                  progressCallback
                );
              } else {
                // Для JSON файлов используем старый вызов
                result = await serviceFunction(fileContent, progressCallback);
              }

              try {
                await fs.promises.unlink(filePath);
                console.log(`✅ Файл удален: ${filePath}`);
              } catch (unlinkError) {
                console.error(
                  `❌ Ошибка удаления файла ${filePath}:`,
                  unlinkError
                );
              }

              // Отправляем событие завершения файла
              FileController.sendProgressEvent({
                type: "file_complete",
                clientId,
                fileIndex,
                fileName,
                result,
                timestamp: new Date().toISOString(),
              });

              console.log(`✅ Файл обработан: ${fileName}`);

              return {
                fileName,
                message: "Файл успешно обработан",
                result,
              };
            } else {
              throw new Error(
                `Неподдерживаемый формат. Ожидается .${extension}`
              );
            }
          } catch (readError) {
            console.error(`❌ Ошибка чтения файла ${fileName}:`, readError);
            try {
              await fs.promises.unlink(filePath);
              console.log(`🗑️ Файл удален после ошибки: ${filePath}`);
            } catch (unlinkError) {
              console.error(
                `❌ Ошибка удаления файла после ошибки:`,
                unlinkError
              );
            }

            // Отправляем событие ошибки
            FileController.sendProgressEvent({
              type: "file_error",
              clientId,
              fileIndex,
              fileName,
              error: readError.message,
              timestamp: new Date().toISOString(),
            });

            // После обработки в handleFilesWithProgress добавьте:
            console.log(`🔍 Проверка связей для файла ${fileName}...`);
            const fileSourceCheck = await FileSource.findOne({
              where: { name: fileName },
              include: [
                {
                  model: Host,
                  through: { attributes: [] },
                },
              ],
            });

            if (fileSourceCheck) {
              console.log(
                `📊 Файл "${fileName}" имеет ${fileSourceCheck.Hosts.length} связанных хостов`
              );
            } else {
              console.warn(
                `⚠️ Файл "${fileName}" не найден в базе после обработки`
              );
            }

            throw new Error(
              `Не удалось обработать файл: ${fileName} - ${readError.message}`
            );
          }
        })
      );

      // Финальное событие
      FileController.sendProgressEvent({
        type: "all_complete",
        clientId,
        processedFiles,
        timestamp: new Date().toISOString(),
      });

      console.log(`🎉 Все файлы обработаны для клиента ${clientId}`);

      res.status(200).json({
        message: "Файлы успешно загружены и обработаны",
        files: processedFiles,
      });
    } catch (error) {
      console.error("❌ Ошибка при обработке загруженных файлов:", error);

      FileController.sendProgressEvent({
        type: "processing_error",
        clientId: req.body.clientId || req.query.clientId || "default",
        error: error.message,
        timestamp: new Date().toISOString(),
      });

      res.status(500).json({
        error: "Ошибка сервера при обработке файлов",
        details: error.message,
      });
    }
  }

  static async exportSingleFile(req, res) {
    try {
      const { fileName } = req.params;

      console.log(`📤 Экспорт файла по запросу: "${fileName}"`);
      console.log(`🔍 Длина имени файла: ${fileName.length} символов`);

      // Преобразуем имя файла к тому формату, как оно сохраняется в базе
      const searchFileName = fileName
        .replace(/\[/g, "%5B")
        .replace(/\]/g, "%5D")
        .replace(/ /g, "%20")
        .replace(/—/g, "%E2%80%94");

      console.log(`🔍 Преобразованное имя для поиска: "${searchFileName}"`);

      // 1. Пробуем найти файл по преобразованному имени
      let fileSource = await FileSource.findOne({
        where: { name: searchFileName },
        include: [
          {
            model: Host,
            through: { attributes: [] },
            required: false,
            include: [
              {
                model: Port,
                include: [{ model: WellKnownPort, attributes: ["name"] }],
              },
              {
                model: Whois,
                include: [{ model: WhoisKey, attributes: ["key_name"] }],
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

      // 2. Если не нашли, пробуем найти по оригинальному имени
      if (!fileSource) {
        console.log(`🔍 Пробуем найти по оригинальному имени: "${fileName}"`);

        fileSource = await FileSource.findOne({
          where: { name: fileName },
          include: [
            {
              model: Host,
              through: { attributes: [] },
              required: false,
              include: [
                {
                  model: Port,
                  include: [{ model: WellKnownPort, attributes: ["name"] }],
                },
                {
                  model: Whois,
                  include: [{ model: WhoisKey, attributes: ["key_name"] }],
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
      }

      if (!fileSource) {
        console.log(`❌ Файл не найден`);

        // Покажем все файлы для отладки
        const allFiles = await FileSource.findAll({
          attributes: ["id", "name"],
          order: [["uploaded_at", "DESC"]],
        });

        return res.status(404).json({
          success: false,
          error: `Файл не найден`,
          requested_name: fileName,
          search_attempt: searchFileName,
          available_files: allFiles.map((f) => f.name),
        });
      }

      console.log(
        `✅ Найден файл: "${fileSource.name}" (ID: ${fileSource.id})`
      );
      console.log(
        `📊 Количество связанных хостов: ${
          fileSource.Hosts ? fileSource.Hosts.length : 0
        }`
      );

      // Форматируем данные
      let formattedData = [];

      if (fileSource.Hosts && fileSource.Hosts.length > 0) {
        formattedData = FileService.formattedDataProcess(fileSource);

        console.log(
          `✅ Данные отформатированы для ${formattedData.length} хостов`
        );
      } else {
        console.log(
          `ℹ️ У файла нет связанных хостов, data будет пустым массивом`
        );
      }

      // Создаем имя файла для экспорта
      const exportFileName = `export_${fileSource.name.replace(
        /[^a-zA-Z0-9а-яА-ЯёЁ_\-\.\s]/g,
        "_"
      )}_${Date.now()}.json`;

      // Формируем полный ответ
      const exportResult = {
        success: true,
        meta: {
          export_info: {
            exported_at: new Date().toISOString(),
            export_file_name: exportFileName,
            format_version: "1.0",
          },
          file_info: {
            file_id: fileSource.id,
            file_name: fileSource.name,
            uploaded_at: fileSource.uploaded_at,
            encoding: fileSource.encoding,
            created_at: fileSource.created_at,
            updated_at: fileSource.updated_at,
          },
          search_info: {
            requested_file: fileName,
            found_file: fileSource.name,
            match_type:
              fileName === fileSource.name ? "exact_match" : "converted_match",
            search_timestamp: new Date().toISOString(),
          },
          statistics: {
            total_hosts: formattedData.length,
            reachable_hosts: formattedData.filter((h) => h.reachable).length,
            unreachable_hosts: formattedData.filter((h) => !h.reachable).length,
            with_whois: formattedData.filter((h) => h.has_whois).length,
            with_ports: formattedData.filter((h) => h.port_count.total > 0)
              .length,
            with_open_ports: formattedData.filter((h) => h.port_count.open > 0)
              .length,
          },
        },
        data: formattedData,
      };

      // Настройка заголовков для скачивания файла
      res.setHeader("Content-Type", "application/json");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${exportFileName}"`
      );
      res.setHeader("X-Export-File-Name", exportFileName);
      res.setHeader("X-Total-Hosts", formattedData.length);
      res.setHeader("X-Export-Date", new Date().toISOString());

      // Отправляем данные как файл для скачивания
      console.log(
        `📤 Отправка файла ${exportFileName} с ${formattedData.length} хостами`
      );
      res.json(exportResult);
    } catch (error) {
      console.error(`❌ Ошибка при экспорте файла:`, error);

      res.status(500).json({
        success: false,
        error: `Ошибка при экспорте файла: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // @TODO вынести логику files.service
  static async exportAllFilesAsSingleJSON(req, res) {
    try {
      console.log(`📤 Начало экспорта всех файлов как единый JSON`);

      // Получаем все файлы с хостами
      const allFilesWithHosts = await FileSource.findAll({
        attributes: ["id", "name", "uploaded_at", "encoding", "updated_at"],
        order: [["uploaded_at", "DESC"]],
        include: [
          {
            model: Host,
            attributes: ["id"],
            required: true,
          },
        ],
      });

      console.log(`📋 Всего файлов с хостами: ${allFilesWithHosts.length}`);

      if (allFilesWithHosts.length === 0) {
        return res.status(404).json({
          success: false,
          error: "В базе данных нет ни одного файла с хостами",
        });
      }

      // Массив для хранения всех экспортированных файлов
      const allFilesData = [];

      // Обрабатываем каждый файл
      for (let i = 0; i < allFilesWithHosts.length; i++) {
        const fileSource = allFilesWithHosts[i];

        console.log(
          `📄 Обработка файла ${i + 1}/${allFilesWithHosts.length}: "${
            fileSource.name
          }"`
        );

        try {
          // Получаем полные данные файла
          const fullFileData = await FileSource.findOne({
            where: { id: fileSource.id },
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
                  {
                    model: FileSource, // ДОБАВИТЬ эту связь
                    attributes: ["id"], // Только ID файлов
                    through: { attributes: [] }, // Не включать атрибуты промежуточной таблицы
                  },
                ],
              },
            ],
          });

          if (!fullFileData.Hosts || fullFileData.Hosts.length === 0) {
            continue;
          }

          // Форматируем данные
          const formattedData = FileService.formattedDataProcess(fullFileData);

          // Статистика для файла
          const hostStats = {
            total: formattedData.length,
            reachable: formattedData.filter((h) => h.reachable).length,
            unreachable: formattedData.filter((h) => !h.reachable).length,
            with_whois: formattedData.filter((h) => h.has_whois).length,
            with_ports: formattedData.filter((h) => h.port_count.total > 0)
              .length,
            with_open_ports: formattedData.filter((h) => h.port_count.open > 0)
              .length,
          };

          // Добавляем файл в общий массив
          allFilesData.push({
            file_info: {
              file_id: fullFileData.id,
              file_name: fullFileData.name,
              uploaded_at: fullFileData.uploaded_at,
              encoding: fullFileData.encoding,
              updated_at: fullFileData.updated_at || fullFileData.uploaded_at,
            },
            statistics: hostStats,
            data: formattedData,
          });

          console.log(
            `✅ Файл обработан: "${fileSource.name}", хостов: ${formattedData.length}`
          );
        } catch (fileError) {
          console.error(
            `❌ Ошибка при обработке файла "${fileSource.name}":`,
            fileError
          );
          // Добавляем файл с ошибкой
          allFilesData.push({
            file_info: {
              file_id: fileSource.id,
              file_name: fileSource.name,
              uploaded_at: fileSource.uploaded_at,
            },
            error: fileError.message,
            data: [],
          });
        }
      }

      // Общая статистика
      const successfulFiles = allFilesData.filter((f) => !f.error);
      const totalStats = {
        total_files: allFilesData.length,
        successful_files: successfulFiles.length,
        failed_files: allFilesData.filter((f) => f.error).length,
        total_hosts: successfulFiles.reduce(
          (sum, file) => sum + (file.statistics?.total || 0),
          0
        ),
        total_reachable_hosts: successfulFiles.reduce(
          (sum, file) => sum + (file.statistics?.reachable || 0),
          0
        ),
        total_unreachable_hosts: successfulFiles.reduce(
          (sum, file) => sum + (file.statistics?.unreachable || 0),
          0
        ),
      };

      // Формируем финальный JSON
      const exportResult = {
        success: true,
        meta: {
          export_info: {
            //@TODO убрать везде
            exported_at: new Date().toISOString(),
            export_format: "single_json",
            format_version: "1.0",
          },
          statistics: totalStats,
        },
        files: allFilesData,
      };

      // Создаем временную директорию
      const tempDir = path.join(process.cwd(), "temp_exports");
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
      fs.writeFileSync(
        jsonFilePath,
        JSON.stringify(exportResult, null, 2),
        "utf8"
      );

      // Создаем ZIP архив с JSON файлом
      console.log(`📦 Создание ZIP архива: ${zipFilePath}`);

      return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver("zip", {
          zlib: { level: 9 },
        });

        output.on("close", () => {
          console.log(
            `✅ ZIP архив создан: ${zipFilePath}, размер: ${archive.pointer()} bytes`
          );

          // Настраиваем заголовки для скачивания
          res.setHeader("Content-Type", "application/zip");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${zipFileName}"`
          );
          res.setHeader("Content-Length", archive.pointer());

          // Отправляем архив
          const archiveStream = fs.createReadStream(zipFilePath);
          archiveStream.pipe(res);

          // Очистка после отправки
          archiveStream.on("end", () => {
            try {
              fs.unlinkSync(jsonFilePath);
              fs.unlinkSync(zipFilePath);
              console.log(`🧹 Временные файлы удалены`);
            } catch (cleanupError) {
              console.error(
                "⚠️ Ошибка при очистке временных файлов:",
                cleanupError
              );
            }
            resolve();
          });

          archiveStream.on("error", (error) => {
            console.error("❌ Ошибка при отправке архива:", error);
            reject(error);
          });
        });

        archive.on("warning", (err) => {
          if (err.code === "ENOENT") {
            console.warn("⚠️ Предупреждение archiver:", err);
          } else {
            reject(err);
          }
        });

        archive.on("error", (err) => {
          console.error("❌ Ошибка archiver:", err);
          reject(err);
        });

        archive.pipe(output);

        // Добавляем JSON файл в архив
        archive.file(jsonFilePath, { name: exportFileName });

        // Завершаем архивацию
        archive.finalize();
      });
    } catch (error) {
      console.error(`❌ Ошибка при экспорте всех файлов как JSON:`, error);

      res.status(500).json({
        success: false,
        error: `Ошибка при экспорте всех файлов: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  // Экспорт данных по диапазону дат @TODO вынести логику в files.service
  static async exportDataByDateRange(req, res) {
    try {
      const { startDate, endDate } = req.query;

      // Валидация параметров
      if (!startDate || !endDate) {
        return res.status(400).json({
          success: false,
          error: "Необходимо указать startDate и endDate параметры",
        });
      }

      // Преобразуем строки в объекты Date
      const start = new Date(startDate);
      const end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          success: false,
          error: "Неверный формат даты. Используйте YYYY-MM-DD",
        });
      }

      // Корректируем endDate на конец дня
      end.setHours(23, 59, 59, 999);

      console.log(`📅 Экспорт данных за период: ${startDate} - ${endDate}`);

      // Получаем файлы за указанный период
      const filesInRange = await FileSource.findAll({
        where: {
          uploaded_at: {
            [Op.between]: [start, end],
          },
        },
        attributes: ["id", "name", "uploaded_at", "encoding", "updated_at"],
        order: [["uploaded_at", "DESC"]],
        include: [
          {
            model: Host,
            attributes: ["id"],
            required: true,
          },
        ],
      });

      console.log(`📋 Файлов за период: ${filesInRange.length}`);

      if (filesInRange.length === 0) {
        return res.status(404).json({
          success: false,
          error: `Нет файлов за указанный период (${startDate} - ${endDate})`,
        });
      }

      // Массив для хранения всех экспортированных файлов
      const allFilesData = [];

      // Обрабатываем каждый файл
      for (let i = 0; i < filesInRange.length; i++) {
        const fileSource = filesInRange[i];

        console.log(
          `📄 Обработка файла ${i + 1}/${filesInRange.length}: "${
            fileSource.name
          }"`
        );

        try {
          // Получаем полные данные файла (используем тот же запрос что и в exportAllFilesAsSingleJSON)
          const fullFileData = await FileSource.findOne({
            where: { id: fileSource.id },
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

          if (!fullFileData.Hosts || fullFileData.Hosts.length === 0) {
            continue;
          }

          // Форматируем данные
          const formattedData = FileService.formattedDataProcess(fullFileData);

          // Статистика для файла
          const hostStats = {
            total: formattedData.length,
            reachable: formattedData.filter((h) => h.reachable).length,
            unreachable: formattedData.filter((h) => !h.reachable).length,
            with_whois: formattedData.filter((h) => h.has_whois).length,
            with_ports: formattedData.filter((h) => h.port_count.total > 0)
              .length,
            with_open_ports: formattedData.filter((h) => h.port_count.open > 0)
              .length,
          };

          // Добавляем файл в общий массив
          allFilesData.push({
            file_info: {
              file_id: fullFileData.id,
              file_name: fullFileData.name,
              uploaded_at: fullFileData.uploaded_at,
              encoding: fullFileData.encoding,
              updated_at: fullFileData.updated_at || fullFileData.uploaded_at,
            },
            statistics: hostStats,
            data: formattedData,
          });

          console.log(
            `✅ Файл обработан: "${fileSource.name}", хостов: ${formattedData.length}`
          );
        } catch (fileError) {
          console.error(
            `❌ Ошибка при обработке файла "${fileSource.name}":`,
            fileError
          );
          // Добавляем файл с ошибкой
          allFilesData.push({
            file_info: {
              file_id: fileSource.id,
              file_name: fileSource.name,
              uploaded_at: fileSource.uploaded_at,
            },
            error: fileError.message,
            data: [],
          });
        }
      }

      // Общая статистика
      const successfulFiles = allFilesData.filter((f) => !f.error);
      const totalStats = {
        total_files: allFilesData.length,
        successful_files: successfulFiles.length,
        failed_files: allFilesData.filter((f) => f.error).length,
        total_hosts: successfulFiles.reduce(
          (sum, file) => sum + (file.statistics?.total || 0),
          0
        ),
        total_reachable_hosts: successfulFiles.reduce(
          (sum, file) => sum + (file.statistics?.reachable || 0),
          0
        ),
        total_unreachable_hosts: successfulFiles.reduce(
          (sum, file) => sum + (file.statistics?.unreachable || 0),
          0
        ),
      };

      // Формируем финальный JSON
      const exportResult = {
        success: true,
        meta: {
          export_info: {
            exported_at: new Date().toISOString(),
            export_format: "single_json",
            format_version: "1.0",
            date_range: {
              start_date: startDate,
              end_date: endDate,
              start_iso: start.toISOString(),
              end_iso: end.toISOString(),
            },
          },
          statistics: totalStats,
        },
        files: allFilesData,
      };

      // Создаем временную директорию
      const tempDir = path.join(process.cwd(), "temp_exports");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const timestamp = Date.now();
      const exportFileName = `export_${startDate}_to_${endDate}_${timestamp}.json`;
      const jsonFilePath = path.join(tempDir, exportFileName);
      const zipFileName = `export_${startDate}_to_${endDate}_${timestamp}.zip`;
      const zipFilePath = path.join(tempDir, zipFileName);

      // Сохраняем JSON во временный файл
      console.log(`💾 Сохранение JSON во временный файл: ${jsonFilePath}`);
      fs.writeFileSync(
        jsonFilePath,
        JSON.stringify(exportResult, null, 2),
        "utf8"
      );

      // Создаем ZIP архив с JSON файлом
      console.log(`📦 Создание ZIP архива: ${zipFilePath}`);

      return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(zipFilePath);
        const archive = archiver("zip", {
          zlib: { level: 9 },
        });

        output.on("close", () => {
          console.log(
            `✅ ZIP архив создан: ${zipFilePath}, размер: ${archive.pointer()} bytes`
          );

          // Настраиваем заголовки для скачивания
          res.setHeader("Content-Type", "application/zip");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${zipFileName}"`
          );
          res.setHeader("Content-Length", archive.pointer());

          // Отправляем архив
          const archiveStream = fs.createReadStream(zipFilePath);
          archiveStream.pipe(res);

          // Очистка после отправки
          archiveStream.on("end", () => {
            try {
              fs.unlinkSync(jsonFilePath);
              fs.unlinkSync(zipFilePath);
              console.log(`🧹 Временные файлы удалены`);
            } catch (cleanupError) {
              console.error(
                "⚠️ Ошибка при очистке временных файлов:",
                cleanupError
              );
            }
            resolve();
          });

          archiveStream.on("error", (error) => {
            console.error("❌ Ошибка при отправке архива:", error);
            reject(error);
          });
        });

        archive.on("warning", (err) => {
          if (err.code === "ENOENT") {
            console.warn("⚠️ Предупреждение archiver:", err);
          } else {
            reject(err);
          }
        });

        archive.on("error", (err) => {
          console.error("❌ Ошибка archiver:", err);
          reject(err);
        });

        archive.pipe(output);

        // Добавляем JSON файл в архив
        archive.file(jsonFilePath, { name: exportFileName });

        // Завершаем архивацию
        archive.finalize();
      });
    } catch (error) {
      console.error(`❌ Ошибка при экспорте данных по диапазону дат:`, error);

      res.status(500).json({
        success: false,
        error: `Ошибка при экспорте данных: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  static async exportAllFiles(req, res) {
    try {
      const { sessionId } = req.query;

      if (!sessionId) {
        return res.status(400).json({
          success: false,
          error: "Не указан sessionId",
        });
      }

      console.log(`📤 Начало экспорта всех файлов для сессии: ${sessionId}`);

      // Используем SessionManager для проверки и получения файлов
      if (!sessionManager.sessionExists(sessionId)) {
        return res.status(404).json({
          success: false,
          error: "Сессия не найдена или файлы уже удалены",
        });
      }

      const sessionFiles = sessionManager.getAllSessionFiles(sessionId);

      if (!sessionFiles.success || sessionFiles.fileCount === 0) {
        return res.status(404).json({
          success: false,
          error: "В сессии нет файлов для экспорта",
        });
      }

      // Создаем временную директорию
      const tempDir = path.join(process.cwd(), "temp_exports");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const timestamp = Date.now();
      const exportDir = path.join(
        tempDir,
        `export_session_${sessionId}_${timestamp}`
      );
      fs.mkdirSync(exportDir, { recursive: true });

      console.log(`📁 Создана временная директория: ${exportDir}`);

      // Массив для хранения информации об экспортированных файлах
      const exportSummary = [];

      // Сохраняем каждый файл в экспортную директорию
      sessionFiles.files.forEach((file, index) => {
        try {
          const exportFileName = file.name;
          const exportFilePath = path.join(exportDir, exportFileName);

          // Если файл уже минифицирован, просто копируем
          // Если нет - читаем и пересохраняем минифицированным
          let fileContent;
          try {
            fileContent = fs.readFileSync(file.path, "utf8");
            const parsed = JSON.parse(fileContent);

            // Минифицируем заново (на случай если файл был не минифицирован)
            const minified = JSON.stringify(parsed);
            fs.writeFileSync(exportFilePath, minified, "utf8");
          } catch (parseError) {
            // Если не удалось распарсить, просто копируем
            fs.copyFileSync(file.path, exportFilePath);
          }

          const fileStats = fs.statSync(exportFilePath);

          // Добавляем в summary
          exportSummary.push({
            file_name: file.name,
            export_file_name: exportFileName,
            hosts_count: file.data ? file.data.length : 0,
            reachable_hosts: file.data
              ? file.data.filter((h) => h.reachable).length
              : 0,
            unreachable_hosts: file.data
              ? file.data.filter((h) => !h.reachable).length
              : 0,
            last_updated: file.stats.mtime,
            statistics: file.meta.statistics || {},
            file_size: fileStats.size,
          });

          console.log(
            `✅ Файл сохранен (минифицирован): ${exportFileName}, размер: ${fileStats.size} bytes`
          );
        } catch (fileError) {
          console.error(
            `❌ Ошибка при сохранении файла ${file.name}:`,
            fileError.message
          );
          exportSummary.push({
            file_name: file.name,
            export_file_name: null,
            error: fileError.message,
            hosts_count: 0,
            reachable_hosts: 0,
            unreachable_hosts: 0,
            file_size: 0,
          });
        }
      });

      if (exportSummary.length === 0) {
        // Очистка временной директории
        fs.rmSync(exportDir, { recursive: true, force: true });

        return res.status(404).json({
          success: false,
          error: "Не удалось экспортировать ни одного файла",
        });
      }

      // Создаем summary файл с общей статистикой
      const successfulExports = exportSummary.filter((f) => !f.error);

      const summaryData = {
        success: true,
        meta: {
          export_info: {
            exported_at: new Date().toISOString(),
            export_archive_name: `export_session_${sessionId}_${timestamp}.zip`,
            format_version: "1.0",
            total_files_processed: exportSummary.length,
            successfully_exported: successfulExports.length,
            failed_exports: exportSummary.filter((f) => f.error).length,
            total_size_bytes: successfulExports.reduce(
              (sum, file) => sum + file.file_size,
              0
            ),
            session_id: sessionId,
          },
          statistics: {
            total_files: successfulExports.length,
            total_hosts: successfulExports.reduce(
              (sum, file) => sum + file.hosts_count,
              0
            ),
            total_reachable_hosts: successfulExports.reduce(
              (sum, file) => sum + file.reachable_hosts,
              0
            ),
            total_unreachable_hosts: successfulExports.reduce(
              (sum, file) => sum + file.unreachable_hosts,
              0
            ),
            total_with_whois: successfulExports.reduce(
              (sum, file) => sum + (file.statistics?.with_whois || 0),
              0
            ),
            total_with_ports: successfulExports.reduce(
              (sum, file) => sum + (file.statistics?.with_ports || 0),
              0
            ),
          },
        },
        files: exportSummary.map((file) => ({
          original_name: file.file_name,
          export_file_name: file.export_file_name,
          success: !file.error,
          error: file.error,
          hosts_count: file.hosts_count,
          reachable_hosts: file.reachable_hosts,
          unreachable_hosts: file.unreachable_hosts,
          last_updated: file.last_updated,
          statistics: file.statistics,
          file_size: file.file_size,
        })),
      };

      const summaryPath = path.join(
        exportDir,
        `export_summary_${sessionId}_${timestamp}.json`
      );

      // Summary файл минифицируем
      const minifiedSummary = JSON.stringify(summaryData);
      fs.writeFileSync(summaryPath, minifiedSummary, "utf8");

      // Создаем ZIP архив
      const archiveFileName = `export_session_${sessionId}_${timestamp}.zip`;
      const archivePath = path.join(tempDir, archiveFileName);

      return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(archivePath);
        const archive = archiver("zip", {
          zlib: { level: 9 },
        });

        output.on("close", () => {
          console.log(
            `✅ ZIP архив создан: ${archivePath}, размер: ${archive.pointer()} bytes`
          );

          // Настраиваем заголовки для скачивания
          res.setHeader("Content-Type", "application/zip");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${archiveFileName}"`
          );
          res.setHeader("Content-Length", archive.pointer());

          // Отправляем архив
          const archiveStream = fs.createReadStream(archivePath);
          archiveStream.pipe(res);

          // Очистка после отправки
          archiveStream.on("end", () => {
            try {
              // Удаляем временные файлы
              fs.rmSync(exportDir, { recursive: true, force: true });
              fs.unlinkSync(archivePath);

              // Удаляем оригинальную сессию после успешного экспорта
              sessionManager.cleanupSession(sessionId);

              console.log(`🧹 Временные файлы и сессия ${sessionId} удалены`);
            } catch (cleanupError) {
              console.error(
                "⚠️ Ошибка при очистке временных файлов:",
                cleanupError
              );
            }
            resolve();
          });

          archiveStream.on("error", (error) => {
            console.error("❌ Ошибка при отправке архива:", error);
            reject(error);
          });
        });

        archive.on("warning", (err) => {
          if (err.code === "ENOENT") {
            console.warn("⚠️ Предупреждение archiver:", err);
          } else {
            reject(err);
          }
        });

        archive.on("error", (err) => {
          console.error("❌ Ошибка archiver:", err);
          reject(err);
        });

        archive.pipe(output);

        // Добавляем все файлы из exportDir в архив
        archive.directory(exportDir, false);

        // Завершаем архивацию
        archive.finalize();
      });
    } catch (error) {
      console.error(`❌ Ошибка при экспорте всех файлов сессии:`, error);

      res.status(500).json({
        success: false,
        error: `Ошибка при экспорте всех файлов: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  static async exportAllFilesFromDB(req, res) {
    try {
      console.log(`📤 Начало экспорта всех файлов из базы данных в архив`);

      // Получаем все файлы с хостами, отсортированные по дате
      const allFilesWithHosts = await FileSource.findAll({
        attributes: ["id", "name", "uploaded_at", "encoding", "updated_at"],
        order: [["updated_at", "DESC"]],
        include: [
          {
            model: Host,
            attributes: ["id"],
            required: true,
          },
        ],
      });

      console.log(`📋 Всего файлов с хостами: ${allFilesWithHosts.length}`);

      if (allFilesWithHosts.length === 0) {
        return res.status(404).json({
          success: false,
          error: "В базе данных нет ни одного файла с хостами",
        });
      }

      // Создаем временную директорию для файлов
      const tempDir = path.join(process.cwd(), "temp_exports");
      if (!fs.existsSync(tempDir)) {
        fs.mkdirSync(tempDir, { recursive: true });
      }

      const timestamp = Date.now();
      const exportDir = path.join(tempDir, `export_all_db_${timestamp}`);
      fs.mkdirSync(exportDir, { recursive: true });

      console.log(`📁 Создана временная директория: ${exportDir}`);

      // Массив для хранения информации об экспортированных файлах
      const exportSummary = [];

      // Обрабатываем каждый файл
      for (let i = 0; i < allFilesWithHosts.length; i++) {
        const fileSource = allFilesWithHosts[i];

        console.log(
          `📄 Экспорт файла ${i + 1}/${allFilesWithHosts.length}: "${
            fileSource.name
          }" (ID: ${fileSource.id}), обновлен: ${fileSource.updated_at}`
        );

        try {
          // Получаем полные данные файла
          const fullFileData = await FileSource.findOne({
            where: { id: fileSource.id },
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

          if (
            !fullFileData ||
            !fullFileData.Hosts ||
            fullFileData.Hosts.length === 0
          ) {
            console.log(
              `⚠️ Файл "${fileSource.name}" не содержит хостов, пропускаем`
            );
            continue;
          }

          // Форматируем структурированные данные
          const formattedData = FileService.formattedDataProcess(fullFileData);

          // Статистика для файла
          const hostStats = {
            total: formattedData.length,
            reachable: formattedData.filter((h) => h.reachable).length,
            unreachable: formattedData.filter((h) => !h.reachable).length,
            with_whois: formattedData.filter((h) => h.has_whois).length,
            with_ports: formattedData.filter(
              (h) => h.ports && h.ports.all && h.ports.all.length > 0
            ).length,
            with_open_ports: formattedData.filter(
              (h) => h.ports && h.ports.open && h.ports.open.length > 0
            ).length,
          };

          // Создаем имя файла для экспорта
          const safeFileName = fileSource.name.replace(
            /[^a-zA-Z0-9а-яА-ЯёЁ_\-\.\s]/g,
            "_"
          );
          const exportFileName = `${safeFileName}_export_${timestamp}.json`;
          const exportFilePath = path.join(exportDir, exportFileName);

          // Формируем полный ответ с метаданными
          const exportResult = {
            success: true,
            meta: {
              export_info: {
                exported_at: new Date().toISOString(),
                export_file_name: exportFileName,
                format_version: "1.0",
              },
              file_info: {
                file_id: fullFileData.id,
                file_name: fullFileData.name,
                uploaded_at: fullFileData.uploaded_at,
                updated_at: fullFileData.updated_at,
                encoding: fullFileData.encoding || "UTF-8",
              },
              statistics: hostStats,
            },
            data: formattedData,
          };

          // Сохраняем JSON файл в МИНИФИЦИРОВАННОМ виде (как при скачивании по одному)
          const minifiedJSON = JSON.stringify(exportResult);
          fs.writeFileSync(exportFilePath, minifiedJSON, "utf8");

          const fileStats = fs.statSync(exportFilePath);

          // Добавляем информацию в summary
          exportSummary.push({
            file_id: fullFileData.id,
            file_name: fullFileData.name,
            export_file_name: exportFileName,
            hosts_count: formattedData.length,
            reachable_hosts: formattedData.filter((h) => h.reachable).length,
            unreachable_hosts: formattedData.filter((h) => !h.reachable).length,
            last_updated: fullFileData.updated_at,
            statistics: hostStats,
            file_size: fileStats.size,
            minified: true,
          });

          console.log(
            `✅ Файл экспортирован (минифицирован): ${exportFileName}, хостов: ${formattedData.length}, размер: ${fileStats.size} bytes`
          );
        } catch (fileError) {
          console.error(
            `❌ Ошибка при экспорте файла "${fileSource.name}":`,
            fileError.message
          );
          exportSummary.push({
            file_id: fileSource.id,
            file_name: fileSource.name,
            export_file_name: null,
            error: fileError.message,
            hosts_count: 0,
            reachable_hosts: 0,
            unreachable_hosts: 0,
            file_size: 0,
            minified: false,
          });
        }
      }

      if (exportSummary.length === 0) {
        // Очистка временной директории
        fs.rmSync(exportDir, { recursive: true, force: true });

        return res.status(404).json({
          success: false,
          error: "Не удалось экспортировать ни одного файла",
        });
      }

      // Создаем summary файл с общей статистикой
      const successfulExports = exportSummary.filter((f) => !f.error);

      const summaryData = {
        success: true,
        meta: {
          export_info: {
            exported_at: new Date().toISOString(),
            export_archive_name: `all_files_export_db_${timestamp}.zip`,
            format_version: "1.0",
            total_files_processed: exportSummary.length,
            successfully_exported: successfulExports.length,
            failed_exports: exportSummary.filter((f) => f.error).length,
            total_size_bytes: successfulExports.reduce(
              (sum, file) => sum + file.file_size,
              0
            ),
            minified_files: successfulExports.filter((f) => f.minified).length,
          },
          statistics: {
            total_files: successfulExports.length,
            total_hosts: successfulExports.reduce(
              (sum, file) => sum + file.hosts_count,
              0
            ),
            total_reachable_hosts: successfulExports.reduce(
              (sum, file) => sum + file.reachable_hosts,
              0
            ),
            total_unreachable_hosts: successfulExports.reduce(
              (sum, file) => sum + file.unreachable_hosts,
              0
            ),
            total_with_whois: successfulExports.reduce(
              (sum, file) => sum + (file.statistics?.with_whois || 0),
              0
            ),
            total_with_ports: successfulExports.reduce(
              (sum, file) => sum + (file.statistics?.with_ports || 0),
              0
            ),
          },
        },
        files: exportSummary.map((file) => ({
          file_id: file.file_id,
          original_name: file.file_name,
          export_file_name: file.export_file_name,
          success: !file.error,
          error: file.error,
          hosts_count: file.hosts_count,
          reachable_hosts: file.reachable_hosts,
          unreachable_hosts: file.unreachable_hosts,
          last_updated: file.last_updated,
          statistics: file.statistics,
          file_size: file.file_size,
          minified: file.minified,
        })),
      };

      const summaryPath = path.join(
        exportDir,
        `export_summary_db_${timestamp}.json`
      );

      // Summary файл тоже минифицируем
      const minifiedSummary = JSON.stringify(summaryData);
      fs.writeFileSync(summaryPath, minifiedSummary, "utf8");

      // Создаем ZIP архив
      const archiveFileName = `all_files_export_db_${timestamp}.zip`;
      const archivePath = path.join(tempDir, archiveFileName);

      return new Promise((resolve, reject) => {
        const output = fs.createWriteStream(archivePath);
        const archive = archiver("zip", {
          zlib: { level: 9 },
        });

        output.on("close", () => {
          console.log(
            `✅ ZIP архив создан: ${archivePath}, размер: ${archive.pointer()} bytes`
          );

          // Настраиваем заголовки для скачивания
          res.setHeader("Content-Type", "application/zip");
          res.setHeader(
            "Content-Disposition",
            `attachment; filename="${archiveFileName}"`
          );
          res.setHeader("Content-Length", archive.pointer());

          // Отправляем архив
          const archiveStream = fs.createReadStream(archivePath);
          archiveStream.pipe(res);

          // Очистка после отправки
          archiveStream.on("end", () => {
            try {
              fs.rmSync(exportDir, { recursive: true, force: true });
              fs.unlinkSync(archivePath);
              console.log(`🧹 Временные файлы удалены`);
            } catch (cleanupError) {
              console.error(
                "⚠️ Ошибка при очистке временных файлов:",
                cleanupError
              );
            }
            resolve();
          });

          archiveStream.on("error", (error) => {
            console.error("❌ Ошибка при отправке архива:", error);
            reject(error);
          });
        });

        archive.on("warning", (err) => {
          if (err.code === "ENOENT") {
            console.warn("⚠️ Предупреждение archiver:", err);
          } else {
            reject(err);
          }
        });

        archive.on("error", (err) => {
          console.error("❌ Ошибка archiver:", err);
          reject(err);
        });

        archive.pipe(output);

        // Добавляем все файлы из exportDir в архив
        archive.directory(exportDir, false);

        // Завершаем архивацию
        archive.finalize();
      });
    } catch (error) {
      console.error(`❌ Ошибка при экспорте всех файлов из БД:`, error);

      res.status(500).json({
        success: false,
        error: `Ошибка при экспорте всех файлов: ${error.message}`,
        timestamp: new Date().toISOString(),
      });
    }
  }

  static async normalizeFileNames(req, res) {
    try {
      const result = await FileService.normalizeFileNames();
      res.json({
        success: true,
        message: `Нормализовано ${result.normalized} из ${result.total} имен файлов`,
        ...result,
      });
    } catch (error) {
      console.error("❌ Ошибка при нормализации имен файлов:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }

  static async cleanDatabase(req, res) {
    try {
      console.log("🧹 Начало очистки базы данных...");

      // Удаляем в правильном порядке из-за foreign keys
      await sequelize.query("DELETE FROM host_file_sources");
      await sequelize.query("DELETE FROM ports");
      await sequelize.query("DELETE FROM whois");
      await sequelize.query("DELETE FROM hosts");
      await sequelize.query("DELETE FROM file_sources");

      // Сбрасываем sequence для PostgreSQL
      await sequelize.query("SELECT setval('hosts_id_seq', 1, false)");
      await sequelize.query("SELECT setval('file_sources_id_seq', 1, false)");
      await sequelize.query(
        "SELECT setval('host_file_sources_id_seq', 1, false)"
      );
      await sequelize.query("SELECT setval('ports_id_seq', 1, false)");

      console.log("✅ База данных очищена");

      res.json({
        success: true,
        message: "База данных очищена",
      });
    } catch (error) {
      console.error("❌ Ошибка при очистке базы данных:", error);
      res.status(500).json({
        success: false,
        error: error.message,
      });
    }
  }
}
