import express from "express";
import multer from "multer";
import FileController from "../controllers/files.controller.js";
import FileSource from "../models/FileSource.js";

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
router.get("/", fileController.getFileDb);

router.get("/daterange", fileController.getFileDbRange);

// Экспортные маршруты - статические методы
router.get('/export/:fileName', FileController.exportSingleFile);
router.get('/export-all', FileController.exportAllFiles);
router.get('/export-all/json', FileController.exportAllFilesAsJSON);

// Этот метод должен быть экземплярным, так как он объявлен без static
router.get('/exportable-files', (req, res) => fileController.getExportableFiles(req, res));


// Добавьте этот маршрут для отладки
router.get('/normalize-filenames', FileController.normalizeFileNames);
router.post('/fix-associations', FileController.fixFileAssociations);
router.get('/debug/files', async (req, res) => {
  try {
    const fileSources = await FileSource.findAll({
      attributes: ['id', 'name', 'uploaded_at'],
      order: [['uploaded_at', 'DESC']]
    });
    
    res.json({
      totalFiles: fileSources.length,
      files: fileSources.map(f => ({
        id: f.id,
        name: f.name,
        uploadedAt: f.uploaded_at,
        nameEncoded: encodeURIComponent(f.name)
      }))
    });
  } catch (error) {
    console.error('Ошибка при получении списка файлов:', error);
    res.status(500).json({ error: error.message });
  }
});

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
