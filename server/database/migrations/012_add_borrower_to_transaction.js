'use strict';

// The transaction table shipped with three gaps that block a real borrow/return
// workflow: (1) no way to identify who the borrower was — the only path was
// transaction_details -> item -> current_borrower_id, which reflects the item's
// *current* holder, not who it was borrowed by at the time of this specific
// transaction; (2) no purpose field; (3) no expected-return-date field. All
// three are added here together since they're needed by the same feature.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('transaction', 'borrower_id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'borrower', key: 'borrower_id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });
    await queryInterface.addColumn('transaction', 'purpose', {
      type: Sequelize.TEXT,
      allowNull: true
    });
    await queryInterface.addColumn('transaction', 'expected_return_datetime', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('transaction', 'expected_return_datetime');
    await queryInterface.removeColumn('transaction', 'purpose');
    await queryInterface.removeColumn('transaction', 'borrower_id');
  }
};
