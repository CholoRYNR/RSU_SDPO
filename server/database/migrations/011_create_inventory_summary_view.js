'use strict';

// MySQL-specific: recreates the `inventory_summary` view from rsusdpo_db.
// This is raw SQL (not queryInterface.createTable) because Sequelize has no
// dialect-agnostic "create view" helper. If/when this project moves to
// Postgres, this view's CREATE VIEW syntax carries over almost as-is, but
// this migration will need a postgres-flavored twin (or to be run manually).
module.exports = {
  async up(queryInterface) {
    await queryInterface.sequelize.query(`
      CREATE OR REPLACE VIEW inventory_summary AS
      SELECT
        c.category_name AS category_name,
        e.equipment_name AS equipment_name,
        e.total_quantity AS total_quantity,
        e.available_quantity AS available_quantity,
        e.total_quantity - e.available_quantity AS borrowed_quantity,
        e.description AS description,
        e.created_at AS created_at,
        e.updated_at AS updated_at
      FROM equipment e
      JOIN categories c ON e.category_id = c.category_id
      ORDER BY c.category_name ASC, e.equipment_name ASC
    `);
  },

  async down(queryInterface) {
    await queryInterface.sequelize.query('DROP VIEW IF EXISTS inventory_summary');
  }
};
