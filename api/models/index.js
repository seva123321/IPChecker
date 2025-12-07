import Host from './Host.js';
import Port from './Port.js';
import WellKnownPort from './WellKnownPort.js';
import WhoisKey from './WhoisKey.js';
import Whois from './Whois.js';
import Priority from './Priority.js';
import PriorityComment from './PriorityComment.js';
import Grouping from './Grouping.js';
import Country from './Country.js';
import FileSource from './FileSource.js';
import sequelize from '../db.js';

// Связи
Host.hasMany(Port, { foreignKey: 'host_id', onDelete: 'CASCADE' });
Port.belongsTo(Host, { foreignKey: 'host_id' });

Host.hasMany(Whois, { foreignKey: 'host_id', onDelete: 'CASCADE' });
Whois.belongsTo(Host, { foreignKey: 'host_id' });

Whois.belongsTo(WhoisKey, { foreignKey: 'key_id', onDelete: 'CASCADE' });
WhoisKey.hasMany(Whois, { foreignKey: 'key_id' });

// Связи для приоритетов
Host.belongsTo(Priority, { foreignKey: 'priority_id' });
Priority.hasMany(Host, { foreignKey: 'priority_id' });

// Связи для комментариев приоритетов
PriorityComment.belongsTo(Host, { foreignKey: 'host_id' });
Host.hasOne(PriorityComment, { foreignKey: 'host_id' });
PriorityComment.belongsTo(Priority, { foreignKey: 'priority_id' });
Priority.hasMany(PriorityComment, { foreignKey: 'priority_id' });

// Связи для группировки
Host.belongsTo(Grouping, { foreignKey: 'grouping_id' });
Grouping.hasMany(Host, { foreignKey: 'grouping_id' });

// Новые связи для стран и файлов
Host.belongsTo(Country, { foreignKey: 'country_id' });
Country.hasMany(Host, { foreignKey: 'country_id' });

Host.belongsTo(FileSource, { foreignKey: 'file_source_id' });
FileSource.hasMany(Host, { foreignKey: 'file_source_id' });

// Экспорт
const models = {
  Host,
  Port,
  WellKnownPort,
  WhoisKey,
  Whois,
  Priority,
  PriorityComment,
  Grouping,
  Country,
  FileSource,
};

export {
  Host,
  Port,
  WellKnownPort,
  WhoisKey,
  Whois,
  Priority,
  PriorityComment,
  Grouping,
  Country,
  FileSource,
  sequelize,
  models,
};


// import Host from './Host.js';
// import Port from './Port.js';
// import WellKnownPort from './WellKnownPort.js';
// import WhoisKey from './WhoisKey.js';
// import Whois from './Whois.js';
// import Priority from './Priority.js';
// import PriorityComment from './PriorityComment.js';
// import Grouping from './Grouping.js';
// import sequelize from '../db.js';

// // Связи
// Host.hasMany(Port, { foreignKey: 'host_id', onDelete: 'CASCADE' });
// Port.belongsTo(Host, { foreignKey: 'host_id' });

// Host.hasMany(Whois, { foreignKey: 'host_id', onDelete: 'CASCADE' });
// Whois.belongsTo(Host, { foreignKey: 'host_id' });

// Whois.belongsTo(WhoisKey, { foreignKey: 'key_id', onDelete: 'CASCADE' });
// WhoisKey.hasMany(Whois, { foreignKey: 'key_id' });

// // Связи для приоритетов
// Host.belongsTo(Priority, { foreignKey: 'priority_id' });
// Priority.hasMany(Host, { foreignKey: 'priority_id' });

// // Связи для комментариев приоритетов
// PriorityComment.belongsTo(Host, { foreignKey: 'host_id' });
// Host.hasOne(PriorityComment, { foreignKey: 'host_id' });
// PriorityComment.belongsTo(Priority, { foreignKey: 'priority_id' });
// Priority.hasMany(PriorityComment, { foreignKey: 'priority_id' });

// // Связи для группировки
// Host.belongsTo(Grouping, { foreignKey: 'grouping_id' });
// Grouping.hasMany(Host, { foreignKey: 'grouping_id' });

// // Экспорт
// const models = {
//   Host,
//   Port,
//   WellKnownPort,
//   WhoisKey,
//   Whois,
//   Priority,
//   PriorityComment,
//   Grouping,
// };

// export {
//   Host,
//   Port,
//   WellKnownPort,
//   WhoisKey,
//   Whois,
//   Priority,
//   PriorityComment,
//   Grouping,
//   sequelize,
//   models,
// };
