import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { exec } from "child_process";
import { isIPv4 } from "net";
import FileRouter from "./routers/files.router.js";
import IpRouter from "./routers/ip.router.js";
import PortsRouter from "./routers/ports.router.js";
import WordsRouter from "./routers/words.router.js";
import multer from "multer";
const upload = multer({ dest: "uploads/" }); // временная папка

dotenv.config();

const PORT = process.env.PORT || 5000;
const app = express();

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors({ credentials: true, origin: process.env.CLIENT_URL }));
// Роуты

app.use("/ip", IpRouter);
app.use("/ports", PortsRouter);
app.use("/keywords", WordsRouter);
app.use("/files", FileRouter);

// import multer from 'multer';
// const upload = multer({ dest: 'uploads/' }); // временная папка

// POST /api/upload/ip — принимает файлы .txt
app.post("/api/upload/ip", upload.array("files"), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "Файлы не загружены" });
  }
  console.log("tut");
  try {
    let allIps = [];
    for (const file of req.files) {
      // Проверяем расширение
      if (!file.originalname.endsWith(".txt")) {
        return res
          .status(400)
          .json({ message: `Неверный формат: ${file.originalname}` });
      }

      const text = fs.readFileSync(file.path, "utf8");
      const ips = text
        .split(/\s+/)
        .map((ip) => ip.trim())
        .filter((ip) => ip.length > 0);

      // Валидация IP
      const invalid = ips.filter((ip) => !net.isIPv4(ip));
      if (invalid.length > 0) {
        return res
          .status(400)
          .json({ message: "Некорректные IP-адреса", invalid });
      }

      allIps = [...allIps, ...ips];
    }

    // Удаляем дубликаты
    const uniqueIps = [...new Set(allIps)];

    // Обрабатываем
    await processIpList(uniqueIps);

    // Удаляем временные файлы
    req.files.forEach((file) => fs.unlinkSync(file.path));
    console.log("tut", uniqueIps);
    res.json({ success: true, processed: uniqueIps.length });
  } catch (error) {
    console.error("Ошибка обработки IP-файлов:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
});

// POST /api/upload/json — принимает файлы .json
app.post("/api/upload/json", upload.array("files"), async (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ message: "Файлы не загружены" });
  }

  try {
    for (const file of req.files) {
      if (!file.originalname.endsWith(".json")) {
        return res
          .status(400)
          .json({ message: `Неверный формат: ${file.originalname}` });
      }

      const rawData = fs.readFileSync(file.path, "utf8");
      const json = JSON.parse(rawData);

      if (!Array.isArray(json.items)) {
        return res
          .status(400)
          .json({ message: 'Ожидается { "items": [...] }' });
      }

      // Импорт в БД через upsert_host_with_data
      for (const item of json.items) {
        await client.query("SELECT upsert_host_with_data($1, $2, $3, $4, $5)", [
          item.ip,
          item.reachable,
          item.port_?.open || [],
          item.port_?.filtered || [],
          item.whois && !item.whois.error ? JSON.stringify(item.whois) : null,
        ]);
      }

      fs.unlinkSync(file.path); // удаляем временный файл
    }

    res.json({ success: true });
  } catch (error) {
    console.error("Ошибка обработки JSON-файлов:", error);
    res.status(500).json({ message: "Ошибка сервера" });
  }
});

// POST /api/upload/ip
// app.post('/api/upload/ip', async (req, res) => {
//   const { ipList } = req.body; // массив строк
//   if (!Array.isArray(ipList)) {
//     return res.status(400).json({ message: 'Ожидается массив IP-адресов' });
//   }
//   // Запустить сканирование или сохранить в очередь
//   await processIpList(ipList);
//   res.json({ success: true });
// });

// POST /api/upload/json
// app.post('/api/upload/json', async (req, res) => {
// const { items } = req.body; // массив объектов как в вашем файле
// if (!Array.isArray(items)) {
//   return res.status(400).json({ message: 'Ожидается массив items' });
// }
// // Импортировать в БД через upsert_host_with_data
// for (const item of items) {
//   await client.query('SELECT upsert_host_with_data($1, $2, $3, $4, $5)', [
//     item.ip,
//     item.reachable,
//     item.port_data.open,
//     item.port_data.filtered,
//     item.whois && !item.whois.error ? JSON.stringify(item.whois) : null
//   ]);
// }
// res.json({ success: true });
// });

app.use((req, res) => {
  res.status(404).json({ error: "Маршрут не найден" });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер успешно запущен на порту ${PORT}`);
});

// import Database from 'better-sqlite3';

// // Подключение к БД (файл создаётся автоматически)
// const db = new Database('scan_results.db');

// // Создание таблицы
// db.exec(`
//   CREATE TABLE IF NOT EXISTS hosts (
//     id INTEGER PRIMARY KEY AUTOINCREMENT,
//     ip TEXT UNIQUE NOT NULL,
//     reachable BOOLEAN NOT NULL,
//     open_ports TEXT,
//     filtered_ports TEXT,
//     whois_raw TEXT,
//     updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
//   )
// `);

// // Вставка данных
// const insert = db.prepare(`
//   INSERT OR REPLACE INTO hosts (ip, reachable, open_ports, filtered_ports, whois_raw)
//   VALUES (?, ?, ?, ?, ?)
// `);

// insert.run(
//   '192.168.1.1',
//   true,
//   JSON.stringify([80, 443]),
//   JSON.stringify([22, 23]),
//   JSON.stringify({ country: 'US', netname: 'EXAMPLE' })
// );

// // Чтение данных
// const rows = db.prepare('SELECT * FROM hosts WHERE ip LIKE ?').all('192%');
// console.log(rows);

// // Закрытие соединения (опционально при завершении)
// db.close();

// // main.js
// import { IPSecurityScanner } from './scanner.js';
// import { initDb, loadAllHosts } from './database.js';

// const inputPath = process.argv[2];
// if (!inputPath) {
//   console.error('Usage: node main.js <input_file.txt>');
//   process.exit(1);
// }

// const db = initDb(); // ваша инициализация pg
// const scanner = new IPSecurityScanner(inputPath, db);

// process.on('SIGINT', () => {
//   console.log('\nInterrupted by user. Saving...');
//   scanner.stopRequested = true;
//   process.exit(0);
// });

// await scanner.run();
// console.log('Scan completed');
