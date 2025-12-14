// models/HostFileSource.js (создайте новый файл)
import { DataTypes } from 'sequelize';
import sequelize from '../db.js';

const HostFileSource = sequelize.define('HostFileSource', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  host_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'hosts',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  file_source_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'file_sources',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'host_file_sources',
  timestamps: false,
  indexes: [
    {
      unique: true,
      fields: ['host_id', 'file_source_id']
    }
  ]
});

export default HostFileSource;