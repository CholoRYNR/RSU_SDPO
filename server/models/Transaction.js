'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Transaction extends Model {
    static associate(models) {
      Transaction.belongsTo(models.Borrower, { foreignKey: 'borrowerId', as: 'borrower' });
      Transaction.belongsTo(models.User, { foreignKey: 'reviewedBy', as: 'reviewer' });
      Transaction.belongsTo(models.User, { foreignKey: 'approvedBy', as: 'approver' });
      Transaction.belongsTo(models.User, { foreignKey: 'releasedBy', as: 'releaser' });
      Transaction.belongsTo(models.User, { foreignKey: 'returnedBy', as: 'returner' });
      Transaction.belongsTo(models.User, { foreignKey: 'receivedByStaff', as: 'receivingStaff' });
      Transaction.hasMany(models.TransactionDetail, { foreignKey: 'transactionId', as: 'details' });
      Transaction.hasMany(models.TransactionLog, { foreignKey: 'transactionId', as: 'logs' });
      Transaction.hasMany(models.MaintenanceFee, { foreignKey: 'transactionId', as: 'maintenanceFees' });
      Transaction.hasMany(models.DamageLossRecord, { foreignKey: 'transactionId', as: 'damageLossRecords' });
    }
  }

  Transaction.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: 'transaction_id' },
      borrowerId: { type: DataTypes.INTEGER, allowNull: false },
      purpose: { type: DataTypes.TEXT, allowNull: true },
      expectedReturnDatetime: { type: DataTypes.DATE, allowNull: true },
      requestDatetime: { type: DataTypes.DATE, allowNull: true, defaultValue: DataTypes.NOW },
      reviewedBy: { type: DataTypes.INTEGER, allowNull: true },
      reviewDatetime: { type: DataTypes.DATE, allowNull: true },
      approvalDatetime: { type: DataTypes.DATE, allowNull: true },
      approvedBy: { type: DataTypes.INTEGER, allowNull: true },
      releaseDatetime: { type: DataTypes.DATE, allowNull: true },
      releasedBy: { type: DataTypes.INTEGER, allowNull: true },
      receivedByBorrowerDatetime: { type: DataTypes.DATE, allowNull: true },
      returnDatetime: { type: DataTypes.DATE, allowNull: true },
      returnedBy: { type: DataTypes.INTEGER, allowNull: true },
      receivedByStaff: { type: DataTypes.INTEGER, allowNull: true },
      receivedByStaffDatetime: { type: DataTypes.DATE, allowNull: true },
      transactionStatus: {
        type: DataTypes.ENUM(
          'Pending',
          'Acknowledged',
          'For Review',
          'For Approval',
          'Approved',
          'Rejected',
          'Cancelled',
          'Released',
          'Returned',
          'Overdue',
          'For Resolution',
          'Replacement',
          'Resolved',
          'Completed'
        ),
        allowNull: true,
        defaultValue: 'Pending'
      },
      borrowerAcknowledged: { type: DataTypes.BOOLEAN, allowNull: true, defaultValue: false },
      acknowledgementTimestamp: { type: DataTypes.DATE, allowNull: true },
      dueReminderSentDatetime: { type: DataTypes.DATE, allowNull: true },
      incompleteReqReminderSentDatetime: { type: DataTypes.DATE, allowNull: true }
    },
    {
      sequelize,
      modelName: 'Transaction',
      tableName: 'transaction',
      underscored: true,
      timestamps: true
    }
  );

  return Transaction;
};
