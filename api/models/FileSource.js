import { DataTypes } from 'sequelize';
import sequelize from '../db.js';

const FileSource = sequelize.define('FileSource', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(255),
    allowNull: false,
    collate: 'utf8_general_ci', // Для поддержки русских букв
  },
  encoding: {
    type: DataTypes.STRING(50),
    defaultValue: 'UTF-8',
  },
  uploaded_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'file_sources',
  timestamps: false,
});

export default FileSource;