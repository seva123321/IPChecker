import fs from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';

class SessionManager {
  constructor() {
    this.baseDir = path.join(process.cwd(), 'temp_exports');
    this.ensureBaseDir();
  }

  ensureBaseDir() {
    if (!fs.existsSync(this.baseDir)) {
      fs.mkdirSync(this.baseDir, { recursive: true });
    }
  }

  createSession(sessionId = null) {
    const id = sessionId || `session_${Date.now()}_${uuidv4().substr(0, 8)}`;
    const sessionDir = path.join(this.baseDir, id);
    
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }
    
    return {
      id,
      dir: sessionDir,
      created: new Date().toISOString()
    };
  }

  getSessionDir(sessionId) {
    return path.join(this.baseDir, sessionId);
  }

  sessionExists(sessionId) {
    const sessionDir = this.getSessionDir(sessionId);
    return fs.existsSync(sessionDir);
  }

  listFiles(sessionId) {
    const sessionDir = this.getSessionDir(sessionId);
    
    if (!this.sessionExists(sessionId)) {
      return [];
    }
    
    try {
      return fs.readdirSync(sessionDir)
        .filter(file => file.endsWith('.json'))
        .map(file => ({
          name: file,
          path: path.join(sessionDir, file),
          stats: fs.statSync(path.join(sessionDir, file))
        }));
    } catch (error) {
      console.error(`❌ Ошибка при чтении файлов сессии ${sessionId}:`, error);
      return [];
    }
  }

  cleanupSession(sessionId) {
    const sessionDir = this.getSessionDir(sessionId);
    
    if (fs.existsSync(sessionDir)) {
      try {
        fs.rmSync(sessionDir, { recursive: true, force: true });
        console.log(`🧹 Сессия ${sessionId} удалена`);
        return true;
      } catch (error) {
        console.error(`❌ Ошибка при удалении сессии ${sessionId}:`, error);
        return false;
      }
    }
    
    return false;
  }

  cleanupOldSessions(maxAgeHours = 24) {
    if (!fs.existsSync(this.baseDir)) {
      return;
    }
    
    const sessions = fs.readdirSync(this.baseDir);
    const now = Date.now();
    const maxAgeMs = maxAgeHours * 60 * 60 * 1000;
    let cleaned = 0;
    
    sessions.forEach(session => {
      const sessionPath = path.join(this.baseDir, session);
      
      try {
        const stats = fs.statSync(sessionPath);
        const age = now - stats.mtimeMs;
        
        if (age > maxAgeMs) {
          this.cleanupSession(session);
          cleaned++;
        }
      } catch (error) {
        console.error(`❌ Ошибка при проверке сессии ${session}:`, error);
      }
    });
    
    console.log(`🧹 Удалено ${cleaned} старых сессий`);
    return cleaned;
  }
 
  // Метод для получения всех файлов сессии в правильном формате
  getAllSessionFiles(sessionId) {
    try {
      const sessionDir = this.getSessionDir(sessionId);
      
      if (!this.sessionExists(sessionId)) {
        return { success: false, files: [] };
      }
      
      const files = this.listFiles(sessionId);
      const formattedFiles = [];
      
      files.forEach(file => {
        try {
          const fileContent = fs.readFileSync(file.path, 'utf8');
          const parsed = JSON.parse(fileContent);
          
          // Проверяем, что файл в правильном формате
          if (parsed.data && Array.isArray(parsed.data)) {
            formattedFiles.push({
              name: file.name,
              path: file.path,
              stats: file.stats,
              data: parsed.data,
              meta: parsed.meta || {}
            });
          }
        } catch (error) {
          console.error(`❌ Ошибка чтения файла ${file.name}:`, error);
        }
      });
      
      return {
        success: true,
        sessionId: sessionId,
        fileCount: formattedFiles.length,
        files: formattedFiles
      };
    } catch (error) {
      console.error(`❌ Ошибка получения файлов сессии ${sessionId}:`, error);
      throw error;
    }
  }

   // Метод для минификации JSON
  minifyJSON(data) {
    try {
      return JSON.stringify(data);
    } catch (error) {
      console.error('❌ Ошибка минификации JSON:', error);
      throw error;
    }
  }

  // Метод для форматирования JSON (читаемый вид)
  formatJSON(data) {
    try {
      return JSON.stringify(data, null, 2);
    } catch (error) {
      console.error('❌ Ошибка форматирования JSON:', error);
      throw error;
    }
  }

  saveFormattedFile(sessionId, fileName, formattedData, fileInfo, minify = true) {
    try {
      const session = this.createSession(sessionId);
      const safeFileName = fileName.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_\-\.\s]/g, "_");
      const exportFileName = `${safeFileName}_${Date.now()}.json`;
      const exportFilePath = path.join(session.dir, exportFileName);

      // Формируем данные в формате formattedDataProcess
      const exportResult = {
        success: true,
        meta: {
          export_info: {
            exported_at: new Date().toISOString(),
            export_file_name: exportFileName,
            format_version: "1.0",
            minified: minify,
          },
          file_info: {
            file_id: fileInfo?.id || null,
            file_name: fileName,
            uploaded_at: fileInfo?.uploaded_at || new Date().toISOString(),
            updated_at: fileInfo?.updated_at || new Date().toISOString(),
            encoding: fileInfo?.encoding || "UTF-8",
          },
          statistics: {
            total: formattedData.length,
            reachable: formattedData.filter((h) => h.reachable).length,
            unreachable: formattedData.filter((h) => !h.reachable).length,
            with_whois: formattedData.filter((h) => h.has_whois).length,
            with_ports: formattedData.filter(
              (h) => h.ports && h.ports.all && h.ports.all.length > 0
            ).length,
            with_open_ports: formattedData.filter(
              (h) => h.ports && h.ports.open && h.ports.open.length > 0
            ).length,
          },
        },
        data: formattedData,
      };

      // Сохраняем файл в минифицированном или форматированном виде
      const jsonContent = minify 
        ? this.minifyJSON(exportResult)
        : this.formatJSON(exportResult);

      fs.writeFileSync(exportFilePath, jsonContent, "utf8");

      const fileStats = fs.statSync(exportFilePath);
      console.log(`💾 Файл сохранен в сессию ${sessionId}: ${exportFileName} (${fileStats.size} bytes, minified: ${minify})`);
      
      return {
        success: true,
        filePath: exportFilePath,
        exportFileName: exportFileName,
        sessionDir: session.dir,
        formattedData: formattedData,
        fileSize: fileStats.size,
        minified: minify,
      };
    } catch (error) {
      console.error(`❌ Ошибка сохранения форматированного файла:`, error);
      throw error;
    }
  }

  // Метод для сохранения файла с минификацией по умолчанию
  saveFileToSession(sessionId, fileName, data, minify = true) {
    try {
      const session = this.createSession(sessionId);
      const safeFileName = fileName.replace(/[^a-zA-Z0-9а-яА-ЯёЁ_\-\.\s]/g, "_");
      const exportFileName = `${safeFileName}_${Date.now()}.json`;
      const exportFilePath = path.join(session.dir, exportFileName);

      // Формируем данные
      const exportData = {
        success: true,
        meta: {
          exported_at: new Date().toISOString(),
          original_file_name: fileName,
          safe_file_name: safeFileName,
          export_file_name: exportFileName,
          format_version: "1.0",
          minified: minify,
          client_id: sessionId,
        },
        statistics: data.statistics || {},
        data: data.details || data,
        processed_at: new Date().toISOString(),
      };

      // Сохраняем в минифицированном или форматированном виде
      const jsonContent = minify 
        ? this.minifyJSON(exportData)
        : this.formatJSON(exportData);

      fs.writeFileSync(exportFilePath, jsonContent, "utf8");

      const fileStats = fs.statSync(exportFilePath);
      console.log(`💾 Файл сохранен в сессию ${sessionId}: ${exportFileName} (${fileStats.size} bytes, minified: ${minify})`);
      
      return {
        success: true,
        filePath: exportFilePath,
        exportFileName: exportFileName,
        sessionDir: session.dir,
        fileSize: fileStats.size,
        minified: minify,
      };
    } catch (error) {
      console.error(`❌ Ошибка сохранения файла для сессии ${sessionId}:`, error);
      throw error;
    }
  }
}

export default new SessionManager();