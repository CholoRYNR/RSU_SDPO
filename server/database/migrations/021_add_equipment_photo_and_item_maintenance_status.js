'use strict';

// Two independent additions from the S7 Phase 3 Admin Portal redesign,
// approved by the user after being flagged as schema-level changes:
//   1. Maintenance/Decommissioned as new per-unit Item statuses, alongside
//      the existing Available/Borrowed/Reserved — lets staff pull a single
//      physical unit out of the lending pool (for repair, or permanently)
//      without touching every other unit of the same Equipment type.
//   2. A photoPath column on Equipment — a real uploaded photo per
//      equipment type/listing, replacing the category-level stock icon
//      that's the only visual the Equipment Showroom has today.
// Same Postgres-ENUM-extension pattern as migration 014
// (extend_transaction_status_enum): each ADD VALUE runs as its own
// autocommit statement.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.query(
      "ALTER TYPE enum_item_availability_status ADD VALUE IF NOT EXISTS 'Maintenance'"
    );
    await queryInterface.sequelize.query(
      "ALTER TYPE enum_item_availability_status ADD VALUE IF NOT EXISTS 'Decommissioned'"
    );
    await queryInterface.addColumn('equipment', 'photo_path', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
  },

  async down(queryInterface) {
    // Postgres has no ALTER TYPE ... DROP VALUE — removing an enum value
    // requires rebuilding the whole type. Not needed for this project; down
    // deliberately leaves the two new enum values in place, matching how
    // migration 014 handled the same limitation. The added column is safe
    // to drop normally.
    await queryInterface.removeColumn('equipment', 'photo_path');
  }
};
