'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class TransactionLog extends Model {
    static associate(models) {
      TransactionLog.belongsTo(models.Transaction, { foreignKey: 'transactionId', as: 'transaction' });
      TransactionLog.belongsTo(models.User, { foreignKey: 'changedBy', as: 'changedByUser' });
    }
  }

  TransactionLog.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: 'log_id' },
      transactionId: { type: DataTypes.INTEGER, allowNull: false },
      changedBy: { type: DataTypes.INTEGER, allowNull: true },
      oldStatus: { type: DataTypes.STRING(50), allowNull: false },
      newStatus: { type: DataTypes.STRING(50), allowNull: false },
      changeDatetime: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
      remarks: { type: DataTypes.TEXT, allowNull: true }
    },
    {
      sequelize,
      modelName: 'TransactionLog',
      tableName: 'transaction_logs',
      underscored: true,
      timestamps: false
    }
  );

  return TransactionLog;
};
