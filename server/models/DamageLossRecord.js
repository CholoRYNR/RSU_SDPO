'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class DamageLossRecord extends Model {
    static associate(models) {
      DamageLossRecord.belongsTo(models.Transaction, { foreignKey: 'transactionId', as: 'transaction' });
      DamageLossRecord.belongsTo(models.Borrower, { foreignKey: 'borrowerId', as: 'borrower' });
      DamageLossRecord.belongsTo(models.Item, { foreignKey: 'itemId', as: 'item' });
      DamageLossRecord.belongsTo(models.User, { foreignKey: 'recordedBy', as: 'recordedByUser' });
      DamageLossRecord.belongsTo(models.User, { foreignKey: 'replacementVerifiedBy', as: 'verifiedByUser' });
    }
  }

  DamageLossRecord.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: 'record_id' },
      transactionId: { type: DataTypes.INTEGER, allowNull: false },
      borrowerId: { type: DataTypes.INTEGER, allowNull: false },
      itemId: { type: DataTypes.INTEGER, allowNull: false },
      incidentType: { type: DataTypes.ENUM('Damaged', 'Lost'), allowNull: false },
      dateReported: { type: DataTypes.DATE, allowNull: false, defaultValue: DataTypes.NOW },
      conditionDetails: { type: DataTypes.TEXT, allowNull: true },
      recordedBy: { type: DataTypes.INTEGER, allowNull: true },
      replacementEquipment: { type: DataTypes.TEXT, allowNull: true },
      replacementDate: { type: DataTypes.DATEONLY, allowNull: true },
      replacementVerifiedBy: { type: DataTypes.INTEGER, allowNull: true },
      resolutionStatus: {
        type: DataTypes.ENUM('Pending Replacement', 'Replacement Submitted', 'Replacement Verified', 'Resolved'),
        allowNull: false,
        defaultValue: 'Pending Replacement'
      },
      resolutionDate: { type: DataTypes.DATEONLY, allowNull: true }
    },
    {
      sequelize,
      modelName: 'DamageLossRecord',
      tableName: 'damage_loss_records',
      underscored: true,
      timestamps: true
    }
  );

  return DamageLossRecord;
};
