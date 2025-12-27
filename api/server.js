import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import FileRouter from "./routers/files.router.js";
import CommonRouter from "./routers/common.router.js";
import IpRouter from "./routers/ip.router.js";
import PortsRouter from "./routers/ports.router.js";
import WordsRouter from "./routers/words.router.js";
import multer from "multer";
import sessionManager from './utils/sessionManager.js';
import { getCountryDetails, getGroupDetails, getPriorityDetails } from "./controllers/universalGroup.controller.js";
// import { getCountriesGrouping, getGroupsGrouping, getPrioritiesGrouping } from "./controllers/universalGroup.controller.js";

// const upload = multer({ dest: "uploads/" }); // временная папка

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


// const router = express.Router();
// app.get('/groups/group', getGroupsGrouping);
// app.get('/countrys/group', getCountriesGrouping);
// app.get('/prioritys/group', getPrioritiesGrouping);


app.get('/groups/group', getGroupDetails);
app.get('/countrys/group', getCountryDetails);
app.get('/prioritys/group', getPriorityDetails);

app.use((req, res) => {
  res.status(404).json({ error: "Маршрут не найден" });
});

// Запуск сервера
app.listen(PORT, () => {
  console.log(`Сервер успешно запущен на порту ${PORT}`);
});


// Очищаем старые сессии при старте
sessionManager.cleanupOldSessions(24); // Удалить сессии старше 24 часов

// Запускаем периодическую очистку
setInterval(() => {
  sessionManager.cleanupOldSessions(24);
}, 60 * 60 * 1000); // Каждый час