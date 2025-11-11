import { DataTypes } from 'sequelize';
import sequelize from '../db.js';

const Whois = sequelize.define('Whois', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  value: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
}, {
  tableName: 'whois',
  timestamps: false,
});

export default Whois;