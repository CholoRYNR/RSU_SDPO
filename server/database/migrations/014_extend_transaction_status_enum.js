'use strict';

// Adds the new formal-workflow statuses to the existing transaction_status
// ENUM. Postgres requires each ADD VALUE to run as its own statement,
// outside any transaction block that also tries to use the new value —
// migration 013 earlier this session showed queryInterface.changeColumn can
// silently no-op on this DB, so these run as plain autocommit queries and
// get verified against information_schema right after.
const NEW_VALUES = ['Acknowledged', 'For Review', 'For Approval', 'For Resolution', 'Replacement', 'Resolved'];

module.exports = {
  async up(queryInterface) {
    for (const value of NEW_VALUES) {
      await queryInterface.sequelize.query(
        `ALTER TYPE enum_transaction_transaction_status ADD VALUE IF NOT EXISTS '${value}'`
      );
    }
  },

  async down() {
    // Postgres has no ALTER TYPE ... DROP VALUE — removing an enum value
    // requires rebuilding the type. Not needed for this project; down is a
    // deliberate no-op (matches how migration 013 handled the same limit).
  }
};
