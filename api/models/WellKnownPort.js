import { DataTypes } from 'sequelize';
import sequelize from '../db.js';

const WellKnownPort = sequelize.define('WellKnownPort', {
  port: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    validate: {
      min: 1,
      max: 65535,
    },
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
}, {
  tableName: 'well_known_ports',
  timestamps: false,
});

export default WellKnownPort;