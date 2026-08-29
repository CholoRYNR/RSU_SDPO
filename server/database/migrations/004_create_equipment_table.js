'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('equipment', {
      equipment_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      equipment_name: { type: Sequelize.STRING(200), allowNull: false },
      category_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'categories', key: 'category_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      total_quantity: { type: Sequelize.INTEGER, allowNull: false },
      available_quantity: { type: Sequelize.INTEGER, allowNull: false },
      description: { type: Sequelize.TEXT, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.fn('now') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('equipment');
  }
};
