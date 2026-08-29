'use strict';

// Adds the Review step (Property Custodian / Administrative Aide) as its own
// tracked gate, distinct from Approval (Director) — mirrors the existing
// approved_by/approval_datetime columns.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('transaction', 'reviewed_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'user', key: 'user_id' },
      onUpdate: 'CASCADE',
      onDelete: 'SET NULL'
    });
    await queryInterface.addColumn('transaction', 'review_datetime', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('transaction', 'review_datetime');
    await queryInterface.removeColumn('transaction', 'reviewed_by');
  }
};
