'use strict';
const { Model } = require('sequelize');

module.exports = (sequelize, DataTypes) => {
  class Equipment extends Model {
    static associate(models) {
      Equipment.belongsTo(models.Category, { foreignKey: 'categoryId', as: 'category' });
      Equipment.hasMany(models.Item, { foreignKey: 'equipmentId', as: 'items' });
    }
  }

  Equipment.init(
    {
      id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true, field: 'equipment_id' },
      equipmentName: { type: DataTypes.STRING(200), allowNull: false },
      categoryId: { type: DataTypes.INTEGER, allowNull: false },
      totalQuantity: { type: DataTypes.INTEGER, allowNull: false },
      availableQuantity: { type: DataTypes.INTEGER, allowNull: false },
      description: { type: DataTypes.TEXT, allowNull: true },
      photoPath: { type: DataTypes.STRING(255), allowNull: true }
    },
    {
      sequelize,
      modelName: 'Equipment',
      tableName: 'equipment',
      underscored: true,
      timestamps: true
    }
  );

  return Equipment;
};
