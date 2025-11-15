import { DataTypes } from 'sequelize';
import sequelize from '../db.js';
import WellKnownPort from './WellKnownPort.js'; 

const Port = sequelize.define('Port', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  port: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1,
      max: 65535,
    },
  },
  type: {
    type: DataTypes.ENUM('open', 'filtered'),
    allowNull: false,
  },
}, {
  tableName: 'ports',
  timestamps: false,
});

// Связь с well_known_ports
Port.belongsTo(WellKnownPort, { foreignKey: 'port', targetKey: 'port' });

export default Port;