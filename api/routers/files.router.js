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

// Маршруты для обработки файлов 
router.post("/upload/ip", upload.array("files"), (req, res) => {
  // Извлекаем clientId из запроса
  const clientId = req.query.clientId || req.body.clientId;

  if (!clientId) {
    return res.status(400).json({
      success: false,
      error: "clientId обязателен для отслеживания сессии",
    });
  }

  // Передаем clientId в контроллер через req
  req.clientId = clientId;

  fileController.handleFilesIP.bind(fileController)(req, res);
});

router.post(
  "/upload/json",
  upload.array("files"),
  fileController.handleFilesJSON.bind(fileController)
);

router.get("/daterange", FileController.exportDataByDateRange);

// Экспортные маршруты - статические методы
router.get("/export/:fileName", FileController.exportSingleFile);
router.get("/export-all", FileController.exportAllFiles);
// Экспорт всех файлов из базы данных (полная копия БД)
router.get("/export-all-db", FileController.exportAllFilesFromDB);
router.get("/export-all/json", FileController.exportAllFilesAsSingleJSON);

// маршруты для отладки
// router.get('/normalize-filenames', FileController.normalizeFileNames);
router.post("/clean-database", FileController.cleanDatabase); // POST http://localhost:5000/files/clean-database

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
        files: files.map((f) => ({
          name: f.name,
          size: f.stats.size,
          modified: f.stats.mtime,
        })),
      });
    } else {
      res.json({
        success: false,
        sessionId: sessionId,
        exists: false,
        message: "Сессия не найдена",
      });
    }
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.delete("/cleanup-session/:sessionId", (req, res) => {
  FileController.cleanupSession(req.params.sessionId)
    .then((result) => res.json(result))
    .catch((error) => res.status(500).json({ error: error.message }));
});

export default router;
