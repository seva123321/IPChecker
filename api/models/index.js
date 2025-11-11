// models/index.js
import Host from './Host.js';
import Port from './Port.js';
import WellKnownPort from './WellKnownPort.js';
import WhoisKey from './WhoisKey.js';
import Whois from './Whois.js';
import sequelize from '../db.js';

// Связи
Host.hasMany(Port, { foreignKey: 'host_id', onDelete: 'CASCADE' });
Port.belongsTo(Host, { foreignKey: 'host_id' });

Host.hasMany(Whois, { foreignKey: 'host_id', onDelete: 'CASCADE' });
Whois.belongsTo(Host, { foreignKey: 'host_id' });

Whois.belongsTo(WhoisKey, { foreignKey: 'key_id', onDelete: 'CASCADE' });
WhoisKey.hasMany(Whois, { foreignKey: 'key_id' });

// Экспорт
const models = {
  Host,
  Port,
  WellKnownPort,
  WhoisKey,
  Whois,
};

export {
  Host,
  Port,
  WellKnownPort,
  WhoisKey,
  Whois,
  sequelize,
  models,
};

