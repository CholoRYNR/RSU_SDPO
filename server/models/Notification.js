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
      isRead: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false }
    },
    {
      sequelize,
      modelName: 'Notification',
      tableName: 'notification',
      underscored: true,
      timestamps: false
    }
  );

  return Notification;
};
