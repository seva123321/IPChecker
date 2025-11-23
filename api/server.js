import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { exec } from "child_process";
import { isIPv4 } from "net";
import FileRouter from "./routers/files.router.js";
import CommonRouter from "./routers/common.router.js";
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
app.use("/data", CommonRouter);


app.use((req, res) => {
  res.status(404).json({ error: "Маршрут не найден" });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер успешно запущен на порту ${PORT}`);
});
