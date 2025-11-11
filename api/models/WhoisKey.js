import { DataTypes } from 'sequelize';
import sequelize from '../db.js';

const WhoisKey = sequelize.define('WhoisKey', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  key_name: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
  },
}, {
  tableName: 'whois_keys',
  timestamps: false,
});

export default WhoisKey;