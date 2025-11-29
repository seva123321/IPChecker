import { DataTypes } from 'sequelize';
import sequelize from '../db.js';

const Country = sequelize.define('Country', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true,
    collate: 'utf8_general_ci', // Для поддержки русских букв
  },
}, {
  tableName: 'countries',
  timestamps: false,
});

export default Country;