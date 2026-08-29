'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('damage_loss_records', {
      record_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      transaction_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'transaction', key: 'transaction_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      borrower_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'borrower', key: 'borrower_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      item_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'item', key: 'item_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      incident_type: { type: Sequelize.ENUM('Damaged', 'Lost'), allowNull: false },
      date_reported: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      condition_details: { type: Sequelize.TEXT, allowNull: true },
      recorded_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'user', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      replacement_equipment: { type: Sequelize.TEXT, allowNull: true },
      replacement_date: { type: Sequelize.DATEONLY, allowNull: true },
      replacement_verified_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'user', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      resolution_status: {
        type: Sequelize.ENUM('Pending Replacement', 'Replacement Submitted', 'Replacement Verified', 'Resolved'),
        allowNull: false,
        defaultValue: 'Pending Replacement'
      },
      resolution_date: { type: Sequelize.DATEONLY, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: false, defaultValue: Sequelize.fn('now') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('damage_loss_records');
  }
};
