import { DataTypes } from 'sequelize';
import sequelize from '../db.js';

const Host = sequelize.define('Host', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  ip: {
    type: DataTypes.INET,
    allowNull: false,
    unique: true,
  },
  reachable: {
    type: DataTypes.BOOLEAN,
    allowNull: false,
    defaultValue: true,
  },
  updated_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW,
  },
}, {
  tableName: 'hosts',
  timestamps: false,
});

export default Host;