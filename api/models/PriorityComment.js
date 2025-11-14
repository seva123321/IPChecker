// models/PriorityComment.js
import { DataTypes } from 'sequelize';
import sequelize from '../db.js';

const PriorityComment = sequelize.define('PriorityComment', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  host_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'hosts',
      key: 'id'
    }
  },
  priority_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'host_priorities',
      key: 'id'
    }
  },
  comment: {
    type: DataTypes.TEXT,
    allowNull: false
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'priority_comments',
  timestamps: false,
});

export default PriorityComment;