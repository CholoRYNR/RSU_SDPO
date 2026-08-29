'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('transaction_logs', {
      log_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      transaction_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'transaction', key: 'transaction_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      changed_by: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'user', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      old_status: { type: Sequelize.STRING(50), allowNull: false },
      new_status: { type: Sequelize.STRING(50), allowNull: false },
      change_datetime: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.fn('now') },
      remarks: { type: Sequelize.TEXT, allowNull: true }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('transaction_logs');
  }
};
