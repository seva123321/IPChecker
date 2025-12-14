import express from "express";
import multer from "multer";
import FileController from "../controllers/files.controller.js";
import sessionManager from "../utils/sessionManager.js";

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
  (req, res) => {
    // Извлекаем clientId из запроса
    const clientId = req.query.clientId || req.body.clientId;
    
    if (!clientId) {
      return res.status(400).json({
        success: false,
        error: "clientId обязателен для отслеживания сессии"
      });
    }
    
    // Передаем clientId в контроллер через req
    req.clientId = clientId;
    
    fileController.handleFilesIP.bind(fileController)(req, res);
  }
);

router.get("/check-session/:sessionId", (req, res) => {
  try {
    const sessionId = req.params.sessionId;
    const sessionDir = sessionManager.getSessionDir(sessionId);
    const exists = sessionManager.sessionExists(sessionId);
    
    if (exists) {
      const files = sessionManager.listFiles(sessionId);
      
      res.json({
        success: true,
        sessionId: sessionId,
        exists: true,
        fileCount: files.length,
        files: files.map(f => ({
          name: f.name,
          size: f.stats.size,
          modified: f.stats.mtime
        }))
      });
    } else {
      res.json({
        success: false,
        sessionId: sessionId,
        exists: false,
        message: "Сессия не найдена"
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post(
  "/upload/json",
  upload.array("files"),
  fileController.handleFilesJSON.bind(fileController)
);


// В files.router.js добавьте
router.delete("/cleanup-session/:sessionId", (req, res) => {
  FileController.cleanupSession(req.params.sessionId)
    .then(result => res.json(result))
    .catch(error => res.status(500).json({ error: error.message }));
});

// Новый маршрут для сканирования json файла
// router.get("/", fileController.getFileDb);

router.get("/daterange", FileController.exportDataByDateRange);

// Экспортные маршруты - статические методы
router.get("/export/:fileName", FileController.exportSingleFile);
router.get("/export-all", FileController.exportAllFiles);
// Экспорт всех файлов из базы данных (полная копия БД)
router.get("/export-all-db", FileController.exportAllFilesFromDB);
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
