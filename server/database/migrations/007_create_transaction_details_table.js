'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('transaction_details', {
      detail_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      transaction_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'transaction', key: 'transaction_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'item', key: 'item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      returned_condition: { type: Sequelize.ENUM('Good', 'Damaged', 'Lost'), allowNull: true },
      condition_notes: { type: Sequelize.TEXT, allowNull: true }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('transaction_details');
  }
};
