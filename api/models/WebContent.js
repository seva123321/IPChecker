// models/WebContent.js
import { DataTypes } from 'sequelize';
import sequelize from '../db.js';

const WebContent = sequelize.define('WebContent', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  host_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'Hosts',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  port: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  data: {  // JSON поле со всей информацией
    type: DataTypes.JSON,
    allowNull: false,
    defaultValue: {}
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  sequelize,
  modelName: 'WebContent',
  tableName: 'web_contents',
  timestamps: false,
  indexes: [
    {
      fields: ['host_id', 'port'],
      unique: true
    },
    {
      fields: ['host_id']
    }
  ]
});

export default WebContent;


// -- Создание таблицы web_contents
// CREATE TABLE IF NOT EXISTS web_contents (
//     id SERIAL PRIMARY KEY,
//     host_id INTEGER NOT NULL,
//     port INTEGER NOT NULL,
//     data JSONB NOT NULL DEFAULT '{}'::jsonb,
//     created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
//     updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    
//     -- Внешний ключ на таблицу Hosts
//     CONSTRAINT fk_web_content_host
//         FOREIGN KEY (host_id)
//         REFERENCES hosts(id)
//         ON DELETE CASCADE
//         ON UPDATE CASCADE,
    
//     -- Уникальный индекс для host_id + port
//     CONSTRAINT unique_host_port UNIQUE (host_id, port)
// );

// -- Создание индексов для производительности
// CREATE INDEX IF NOT EXISTS idx_web_contents_host_id ON web_contents(host_id);
// CREATE INDEX IF NOT EXISTS idx_web_contents_port ON web_contents(port);
// CREATE INDEX IF NOT EXISTS idx_web_contents_created_at ON web_contents(created_at);
// CREATE INDEX IF NOT EXISTS idx_web_contents_updated_at ON web_contents(updated_at);

// -- Индекс для поиска по JSON полю (если нужно)
// CREATE INDEX IF NOT EXISTS idx_web_contents_data_gin ON web_contents USING GIN (data);

// -- Триггер для автоматического обновления updated_at
// CREATE OR REPLACE FUNCTION update_web_content_updated_at()
// RETURNS TRIGGER AS $$
// BEGIN
//     NEW.updated_at = CURRENT_TIMESTAMP;
//     RETURN NEW;
// END;
// $$ LANGUAGE plpgsql;

// CREATE TRIGGER trigger_update_web_content_timestamp
//     BEFORE UPDATE ON web_contents
//     FOR EACH ROW
//     EXECUTE FUNCTION update_web_content_updated_at();

// -- Добавление комментариев к таблице и полям
// COMMENT ON TABLE web_contents IS 'Таблица для хранения веб-контента хостов';
// COMMENT ON COLUMN web_contents.id IS 'Уникальный идентификатор записи';
// COMMENT ON COLUMN web_contents.host_id IS 'ID хоста из таблицы hosts';
// COMMENT ON COLUMN web_contents.port IS 'Порт веб-сервера (80, 443, 8080 и т.д.)';
// COMMENT ON COLUMN web_contents.data IS 'JSON данные с информацией о веб-странице';
// COMMENT ON COLUMN web_contents.created_at IS 'Дата создания записи';
// COMMENT ON COLUMN web_contents.updated_at IS 'Дата последнего обновления записи';