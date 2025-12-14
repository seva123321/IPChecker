import express from "express";
import multer from "multer";
import FileController from "../controllers/files.controller.js";

const router = express.Router();
const fileController = new FileController();

// Настройка multer для обработки массива файлов
const upload = multer({ dest: "uploads/" });

// SSE endpoint - статический метод
router.get("/progress", (req, res) => {
  FileController.setupSSE(req, res);
});

// Маршруты для обработки файлов - экземплярные методы
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
// router.get("/", fileController.getFileDb);

router.get("/daterange", FileController.exportDataByDateRange);

// Экспортные маршруты - статические методы
router.get("/export/:fileName", FileController.exportSingleFile);
router.get("/export-all", FileController.exportAllFiles);
router.get("/export-all/json", FileController.exportAllFilesAsSingleJSON);

router.get("/exportable-files", (req, res) =>
  fileController.getExportableFiles(req, res)
);

// Добавьте этот маршрут для отладки
// router.get('/normalize-filenames', FileController.normalizeFileNames);
// router.post('/fix-associations', FileController.fixFileAssociations);
router.post("/clean-database", FileController.cleanDatabase); // POST http://localhost:5000/files/clean-database

export default router;

// import express from "express";
// import multer from "multer";
// import FileController from "../controllers/files.controller.js";
// import FileSource from "../models/FileSource.js";

// const router = express.Router();
// const fileController = new FileController();

// // Настройка multer для обработки массива файлов
// const upload = multer({ dest: "uploads/" });

// // SSE endpoint
// router.get("/progress", (req, res) => {
//   FileController.setupSSE(req, res);
// });

// // Маршруты для обработки файлов
// router.post(
//   "/upload/ip",
//   upload.array("files"),
//   fileController.handleFilesIP.bind(fileController)
// );

// router.post(
//   "/upload/json",
//   upload.array("files"),
//   fileController.handleFilesJSON.bind(fileController)
// );

// // Новый маршрут для сканирования json файла
// router.get("/", fileController.getFileDb);

// router.get("/daterange", fileController.getFileDbRange);

// // Экспортные маршруты
// router.get('/export/:fileName', (req, res) => fileController.exportSingleFile(req, res));
// router.get('/export-all', (req, res) => fileController.exportAllFiles(req, res));
// router.get('/exportable-files', (req, res) => fileController.getExportableFiles(req, res));

// export default router;
