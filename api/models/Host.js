// Host.js
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
  priority_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'host_priorities',
      key: 'id'
    }
  },
  grouping_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'host_groupings',
      key: 'id'
    }
  },
  country_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'countries',
      key: 'id'
    }
  },
}, {
  tableName: 'hosts',
  timestamps: false,
  hooks: {
    beforeCreate: async (instance) => {
      await ensureDefaultRecords();
    },
    beforeUpdate(instance) {
      instance.updated_at = new Date();
    },
  },
});

// Функция для создания записей "Неопределено" если они не существуют
async function ensureDefaultRecords() {
  try {
    // Находим или создаем запись "Неопределено" в host_groupings
    const Grouping = sequelize.models.Grouping || (await import('./Grouping.js')).default;
    const [grouping] = await Grouping.findOrCreate({
      where: { name: 'Неопределено' },
      defaults: { name: 'Неопределено' }
    });

    // Находим или создаем запись "Неопределено" в countries
    const Country = sequelize.models.Country || (await import('./Country.js')).default;
    const [country] = await Country.findOrCreate({
      where: { name: 'Неопределено' },
      defaults: { name: 'Неопределено' }
    });

    console.log(`✅ Записи по умолчанию: Grouping ID=${grouping.id}, Country ID=${country.id}`);
  } catch (error) {
    console.error('❌ Ошибка при создании записей по умолчанию:', error);
  }
}

export default Host;

// import { DataTypes } from 'sequelize';
// import sequelize from '../db.js';

// const Host = sequelize.define('Host', {
//   id: {
//     type: DataTypes.INTEGER,
//     primaryKey: true,
//     autoIncrement: true,
//   },
//   ip: {
//     type: DataTypes.INET,
//     allowNull: false,
//     unique: true,
//   },
//   reachable: {
//     type: DataTypes.BOOLEAN,
//     allowNull: false,
//     defaultValue: true,
//   },
//   updated_at: {
//     type: DataTypes.DATE,
//     defaultValue: DataTypes.NOW,
//   },
//   priority_id: {
//     type: DataTypes.INTEGER,
//     allowNull: true,
//     references: {
//       model: 'host_priorities',
//       key: 'id'
//     }
//   },
//   grouping_id: {
//     type: DataTypes.INTEGER,
//     allowNull: true,
//     references: {
//       model: 'host_groupings',
//       key: 'id'
//     }
//   },
//   country_id: {
//     type: DataTypes.INTEGER,
//     allowNull: true,
//     references: {
//       model: 'countries',
//       key: 'id'
//     }
//   },
// }, {
//   tableName: 'hosts',
//   timestamps: false,
//   hooks: {
//     beforeUpdate(instance) {
//       instance.updated_at = new Date();
//     },
//   },
// });

// export default Host;
