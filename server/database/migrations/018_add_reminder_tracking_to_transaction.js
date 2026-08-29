'use strict';

// Adds reminder-sent tracking for the two new Notification Engine sweeps
// (dueDateReminderSweep, incompleteRequirementsSweep). Each is a plain
// nullable timestamp — null means "not yet sent" and is the guard each
// sweep queries on to avoid re-notifying the same transaction on every
// hourly run. Mirrors 015_add_review_fields_to_transaction.js's style:
// no FK references needed since these are just timestamps.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('transaction', 'due_reminder_sent_datetime', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('transaction', 'incomplete_req_reminder_sent_datetime', {
      type: Sequelize.DATE,
      allowNull: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('transaction', 'incomplete_req_reminder_sent_datetime');
    await queryInterface.removeColumn('transaction', 'due_reminder_sent_datetime');
  }
};
