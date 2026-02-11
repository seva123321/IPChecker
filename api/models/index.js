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
import HostFileSource from './HostFileSource.js'; 
import WebContent from './WebContent.js';  
import sequelize from '../db.js';

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
  HostFileSource,
};

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

// Новые связи для стран
Host.belongsTo(Country, { foreignKey: 'country_id' });
Country.hasMany(Host, { foreignKey: 'country_id' });

// Связь многие-ко-многим между Host и FileSource
Host.belongsToMany(FileSource, {
  through: HostFileSource,
  foreignKey: 'host_id',
  otherKey: 'file_source_id',
  onDelete: 'CASCADE'
});

FileSource.belongsToMany(Host, {
  through: HostFileSource,
  foreignKey: 'file_source_id',
  otherKey: 'host_id',
  onDelete: 'CASCADE'
});

// Связи для HostFileSource (ВАЖНО! ДОБАВЬТЕ ЭТО)
HostFileSource.belongsTo(Host, { foreignKey: 'host_id' , onDelete: 'CASCADE'});
HostFileSource.belongsTo(FileSource, { foreignKey: 'file_source_id' , onDelete: 'CASCADE'});
Host.hasMany(HostFileSource, { foreignKey: 'host_id' , onDelete: 'CASCADE'});
FileSource.hasMany(HostFileSource, { foreignKey: 'file_source_id' , onDelete: 'CASCADE'});


// Связь Host ↔ WebContent
Host.hasMany(WebContent, {
  foreignKey: 'host_id',
  as: 'WebContents',
  onDelete: 'CASCADE'
});

WebContent.belongsTo(Host, {
  foreignKey: 'host_id',
  as: 'Host'
});


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
  HostFileSource,
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
