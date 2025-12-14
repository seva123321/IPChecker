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
    beforeUpdate(instance) {
      instance.updated_at = new Date();
    },
  },
});

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
//     onUpdate: DataTypes.NOW // для автоматического обновления
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
// });

// export default Host;


// без FileSource and Country
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
// }, {
//   tableName: 'hosts',
//   timestamps: false,
// });

// export default Host;
