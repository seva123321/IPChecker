import fs from "fs";
import path from "path";
import FileService from "../services/files.service.js";

export default class FileController {
  async handleFilesIP(req, res) {
    await this.handleFiles(req, res, "txt", FileService.searchIP);
  }

  async handleFilesJSON(req, res) {
    await this.handleFiles(req, res, "json", FileService.addedJSONfile);
  }

  // Новый метод для сканирования версий сервисов по IP

  /****
  * 
  * POST{
  "ip": "100.103.104.59"
  }
  * 
  */
  // ОТВЕТ
  // {
  //   "message": "Сканирование версий для IP 100.103.104.59 завершено",
  //   "ip": "100.103.104.59",
  //   "data": [
  //     {
  //       "port": 22,
  //       "protocol": "tcp",
  //       "state": "open",
  //       "serviceInfo": "ssh        OpenSSH 8.9p1 Ubuntu 3ubuntu0.1"
  //     },
  //     {
  //       "port": 80,
  //       "protocol": "tcp",
  //       "state": "open",
  //       "serviceInfo": "http       Apache httpd 2.4.41 ((Ubuntu))"
  //     }
  //   ]
  // }

  async scanVersionByIP(req, res) {
    try {
      const { ip } = req.body; // Получаем IP из тела запроса

      if (!ip) {
        return res.status(400).json({ error: "IP адрес не предоставлен" });
      }

      console.log(`Запуск сканирования версий для IP: ${ip}`);

      // Вызываем функцию из FileService для сканирования версий
      const versionScanResult = await FileService.scanVersionDetection(ip);

      res.status(200).json({
        message: `Сканирование версий для IP ${ip} завершено`,
        ip: ip,
        data: versionScanResult, // Возвращаем результат сканирования
      });
    } catch (error) {
      console.error("Ошибка при сканировании версий:", error);
      res.status(500).json({ error: "Ошибка сервера при сканировании версий" });
    }
  }

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
            if (path.extname(fileName).toLowerCase() === `.${extension}`) {
              const fileContent = await fs.promises.readFile(filePath, "utf-8");
              const result = await serviceFunction(fileContent);

              try {
                await fs.promises.unlink(filePath);
                console.log(`Файл удален: ${filePath}`);
              } catch (unlinkError) {
                console.error(
                  `Ошибка при удалении файла ${filePath}:`,
                  unlinkError
                );
              }

              return {
                fileName,
                message: "IP проверены и добавлены в базу",
                result,
              };
            } else {
              throw new Error(
                `Неподдерживаемый формат файла. Поддерживаются только .${extension}.`
              );
            }
          } catch (readError) {
            console.error(`Ошибка при чтении файла ${fileName}:`, readError);
            try {
              await fs.promises.unlink(filePath);
              console.log(`Файл удален после ошибки: ${filePath}`);
            } catch (unlinkError) {
              console.error(
                `Ошибка при удалении файла ${filePath} после ошибки:`,
                unlinkError
              );
            }
            throw new Error(`Не удалось прочитать файл: ${fileName}`);
          }
        })
      );

      res
        .status(200)
        .json({ message: "Файлы успешно загружены", files: processedFiles });
    } catch (error) {
      console.error("Ошибка при обработке загруженных файлов:", error);
      res.status(500).json({ error: "Ошибка сервера" });
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

      const result = await FileService.getFileDbRange(startDate, endDate);
      return res.json(result);
    } catch (error) {
      console.error("Ошибка в getFileDbRange:", error);
      return res.status(500).json({ error: error.message });
    }
  }
}
