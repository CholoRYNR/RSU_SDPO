'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Notification extends Model {
    static associate(models) {
      Notification.belongsTo(models.User, { foreignKey: 'userId', as: 'user' });
    }
  }

  Notification.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: 'notification_id' },
      userId: { type: DataTypes.INTEGER, allowNull: false },
      notificationType: { type: DataTypes.STRING(100), allowNull: false },
      message: { type: DataTypes.TEXT, allowNull: false },
      deliveryChannel: { type: DataTypes.ENUM('SMS', 'Email', 'System'), allowNull: false },
      deliveryStatus: {
        type: DataTypes.ENUM('Pending', 'Sent', 'Failed'),
        allowNull: true,
        defaultValue: 'Pending'
      },
      sentAt: { type: DataTypes.DATE, allowNull: true },
      isRead: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
      // Identifies the workflow event this notification is for (e.g.
      // "txn-12-approved"); unique per user (migration 023) so the same
      // event can never notify the same person twice.
      dedupeKey: { type: DataTypes.STRING(120), allowNull: true }
    },
    {
      sequelize,
      modelName: 'Notification',
      tableName: 'notification',
      underscored: true,
      timestamps: false,
      indexes: [{ unique: true, fields: ['user_id', 'dedupe_key'] }]
    }
  );

  return Notification;
};
