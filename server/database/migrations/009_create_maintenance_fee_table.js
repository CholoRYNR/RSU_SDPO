'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('maintenance_fee', {
      fee_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      transaction_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'transaction', key: 'transaction_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      borrower_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'borrower', key: 'borrower_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      fee_type: { type: Sequelize.ENUM('Overdue', 'Damage', 'Loss'), allowNull: false },
      fee_amount: { type: Sequelize.DECIMAL(10, 2), allowNull: false },
      days_overdue: { type: Sequelize.INTEGER, allowNull: true },
      fee_status: {
        type: Sequelize.ENUM('Unpaid', 'Paid', 'Waived'),
        allowNull: true,
        defaultValue: 'Unpaid'
      },
      payment_date: { type: Sequelize.DATEONLY, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.fn('now') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('maintenance_fee');
  }
};
