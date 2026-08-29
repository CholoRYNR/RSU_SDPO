'use strict';

// The automated overdue sweep (server/jobs/overdueSweep.js) writes
// TransactionLog rows for a system-initiated status change with no
// authenticated user behind it, so changed_by needs to allow NULL.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.changeColumn('transaction_logs', 'changed_by', {
      type: Sequelize.INTEGER,
      allowNull: true,
      references: { model: 'user', key: 'user_id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });
  },

  async down(queryInterface, Sequelize) {
    await queryInterface.changeColumn('transaction_logs', 'changed_by', {
      type: Sequelize.INTEGER,
      allowNull: false,
      references: { model: 'user', key: 'user_id' },
      onUpdate: 'CASCADE',
      onDelete: 'RESTRICT'
    });
  }
};
