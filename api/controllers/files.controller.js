import fs from "fs";
import path from "path";
import FileService from "../services/files.service.js";

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
  // Улучшите метод sendProgressEvent:
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
          console.log(`📊 Активные соединения:`, Array.from(sseConnections.keys()));
      }
  }

  async handleFilesIP(req, res) {
    await this.handleFilesWithProgress(req, res, "txt", FileService.searchIP);
  }

  async handleFilesJSON(req, res) {
    await this.handleFilesWithProgress(req, res, "json", FileService.addedJSONfile);
  }

  // НОВЫЙ метод с поддержкой прогресса
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
              
              // Вызываем serviceFunction с callback для прогресса
              const result = await serviceFunction(fileContent, (progress) => {
                console.log(`📊 Прогресс для ${fileName}:`, progress);
                // Отправляем прогресс обработки IP
                FileController.sendProgressEvent({
                  ...progress,
                  clientId,
                  fileIndex,
                  fileName,
                  timestamp: new Date().toISOString()
                });
              });

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

  // СТАРЫЙ метод (для обратной совместимости)
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
