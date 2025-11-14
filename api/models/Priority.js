// models/Priority.js
import { DataTypes } from 'sequelize';
import sequelize from '../db.js';

const Priority = sequelize.define('Priority', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(50),
    allowNull: false,
    unique: true
  },
}, {
  tableName: 'host_priorities',
  timestamps: false,
});

export default Priority;