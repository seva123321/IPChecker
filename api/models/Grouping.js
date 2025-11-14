// models/Grouping.js
import { DataTypes } from 'sequelize';
import sequelize from '../db.js';

const Grouping = sequelize.define('Grouping', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  name: {
    type: DataTypes.STRING(100),
    allowNull: false,
    unique: true
  },
}, {
  tableName: 'host_groupings',
  timestamps: false,
});

export default Grouping;