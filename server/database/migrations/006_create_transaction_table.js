'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('transaction', {
      transaction_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      request_datetime: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.fn('now') },
      approval_datetime: { type: Sequelize.DATE, allowNull: true },
      approved_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'user', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      release_datetime: { type: Sequelize.DATE, allowNull: true },
      released_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'user', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      received_by_borrower_datetime: { type: Sequelize.DATE, allowNull: true },
      return_datetime: { type: Sequelize.DATE, allowNull: true },
      returned_by: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'user', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      received_by_staff: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'user', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      received_by_staff_datetime: { type: Sequelize.DATE, allowNull: true },
      transaction_status: {
        type: Sequelize.ENUM(
          'Pending',
          'Approved',
          'Rejected',
          'Cancelled',
          'Released',
          'Returned',
          'Overdue',
          'Completed'
        ),
        allowNull: true,
        defaultValue: 'Pending'
      },
      borrower_acknowledged: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false },
      acknowledgement_timestamp: { type: Sequelize.DATE, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.fn('now') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('transaction');
  }
};
