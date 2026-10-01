'use strict';

// Damage and loss fees were removed from the system (SDPO requirement,
// 2026-10): a damaged/lost item is resolved only through the replacement
// workflow. The maintenance_fee table only ever held Damage/Loss fees
// (Overdue fees were never generated), and no code reads or writes it any
// more, so it's dropped here along with its two enum types so no old fee
// value can ever feed a total again.
//
// NOTE: this permanently deletes any fee rows recorded so far. Export the
// table first if those historical amounts need to be kept for records.
module.exports = {
  async up(queryInterface) {
    await queryInterface.dropTable('maintenance_fee');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_maintenance_fee_fee_type"');
    await queryInterface.sequelize.query('DROP TYPE IF EXISTS "enum_maintenance_fee_fee_status"');
  },

  async down(queryInterface, Sequelize) {
    // Schema only — dropped rows are not recoverable.
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
      fee_status: { type: Sequelize.ENUM('Unpaid', 'Paid', 'Waived'), allowNull: true, defaultValue: 'Unpaid' },
      payment_date: { type: Sequelize.DATEONLY, allowNull: true },
      created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.fn('now') }
    });
  }
};
