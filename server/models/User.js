'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class User extends Model {
    static associate(models) {
      User.hasOne(models.Borrower, { foreignKey: 'userId', as: 'borrowerProfile' });
      User.hasMany(models.Transaction, { foreignKey: 'approvedBy', as: 'approvedTransactions' });
      User.hasMany(models.Transaction, { foreignKey: 'releasedBy', as: 'releasedTransactions' });
      User.hasMany(models.Transaction, { foreignKey: 'returnedBy', as: 'returnedTransactions' });
      User.hasMany(models.Transaction, { foreignKey: 'receivedByStaff', as: 'receivedTransactions' });
      User.hasMany(models.TransactionLog, { foreignKey: 'changedBy', as: 'transactionLogs' });
      User.hasMany(models.Notification, { foreignKey: 'userId', as: 'notifications' });
    }
  }

  User.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: 'user_id' },
      username: { type: DataTypes.STRING(100), allowNull: false, unique: true },
      password: { type: DataTypes.STRING(255), allowNull: false },
      userRole: {
        type: DataTypes.ENUM('Admin', 'Director', 'Staff', 'Borrower'),
        allowNull: false
      },
      emailAddress: { type: DataTypes.STRING(150), allowNull: false, unique: true, validate: { isEmail: true } },
      contactNumber: { type: DataTypes.STRING(15), allowNull: true },
      accountStatus: {
        type: DataTypes.ENUM('Active', 'Blocked', 'Restricted'),
        allowNull: true,
        defaultValue: 'Active'
      }
    },
    {
      sequelize,
      modelName: 'User',
      tableName: 'user',
      underscored: true,
      timestamps: true
    }
  );

  return User;
};
