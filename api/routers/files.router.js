import express from "express";
import multer from "multer";
import FileController from "../controllers/files.controller.js";

const router = express.Router();
const fileController = new FileController();

// Настройка multer для обработки массива файлов
const upload = multer({ dest: "uploads/" });

// Маршруты для обработки файлов
router.post(
  "/upload/ip",
  upload.array("files"),
  fileController.handleFilesIP.bind(fileController)
);

router.post(
  "/upload/json",
  upload.array("files"),
  fileController.handleFilesJSON.bind(fileController)
);

// Новый маршрут для сканирования json файла
router.get("/", fileController.getFileDb);

router.get("/daterange", fileController.getFileDbRange);

export default router;
