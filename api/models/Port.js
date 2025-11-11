// import { DataTypes } from 'sequelize';
// import sequelize from '../db.js'; // Предполагается, что ваше подключение к базе данных находится в этом файле

// const Port = sequelize.define('Port', {
//   id: {
//     type: DataTypes.INTEGER,
//     autoIncrement: true,
//     primaryKey: true
//   },
//   host_id: {
//     type: DataTypes.INTEGER,
//     allowNull: false,
//     references: {
//       model: 'hosts',
//       key: 'id'
//     }
//   },
//   port: {
//     type: DataTypes.SMALLINT,
//     allowNull: false,
//     validate: {
//       min: 1,
//       max: 65535
//     }
//   },
//   type: {
//     type: DataTypes.ENUM('open', 'filtered'),
//     allowNull: false
//   }
// }, {
//   timestamps: false, // Убедитесь, что временные метки не создаются автоматически
//   tableName: 'ports'
// });

// // Определяем связь с таблицей hosts
// Port.belongsTo(sequelize.models.Host, {
//   foreignKey: 'host_id',
//   as: 'host'
// });

// // Определяем связь с таблицей well_known_ports, если нужно
// Port.hasOne(sequelize.models.WellKnownPort, {
//   foreignKey: 'port',
//   sourceKey: 'port',
//   as: 'wellKnownPort'
// });

// export default Port;



// models/Port.js
import { DataTypes } from 'sequelize';
import sequelize from '../db.js';
import WellKnownPort from './WellKnownPort.js'; // ← добавьте импорт

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