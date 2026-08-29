'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class MaintenanceFee extends Model {
    static associate(models) {
      MaintenanceFee.belongsTo(models.Transaction, { foreignKey: 'transactionId', as: 'transaction' });
      MaintenanceFee.belongsTo(models.Borrower, { foreignKey: 'borrowerId', as: 'borrower' });
    }
  }

  MaintenanceFee.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: 'fee_id' },
      transactionId: { type: DataTypes.INTEGER, allowNull: false },
      borrowerId: { type: DataTypes.INTEGER, allowNull: false },
      feeType: { type: DataTypes.ENUM('Overdue', 'Damage', 'Loss'), allowNull: false },
      feeAmount: { type: DataTypes.DECIMAL(10, 2), allowNull: false },
      daysOverdue: { type: DataTypes.INTEGER, allowNull: true },
      feeStatus: {
        type: DataTypes.ENUM('Unpaid', 'Paid', 'Waived'),
        allowNull: true,
        defaultValue: 'Unpaid'
      },
      paymentDate: { type: DataTypes.DATEONLY, allowNull: true }
    },
    {
      sequelize,
      modelName: 'MaintenanceFee',
      tableName: 'maintenance_fee',
      underscored: true,
      timestamps: false
    }
  );

  return MaintenanceFee;
};
