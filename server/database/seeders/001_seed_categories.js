'use strict';

// NOTE: rsusdpo_db already has 14 real categories seeded by the team.
// This seeder is for spinning up a FRESH, empty database elsewhere
// (a teammate's machine, CI, or Postgres/Supabase at deployment) — do not
// run this against rsusdpo_db, it would insert duplicates.
const CATEGORIES = [
  'Ball Games',
  'Racket Sports',
  'Gym Equipment',
  'Combat Sports',
  'Track & Field',
  'Swimming',
  'Outdoor Recreation'
];

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    await queryInterface.bulkInsert(
      'categories',
      CATEGORIES.map((category_name) => ({ category_name, description: null, created_at: now })),
      {}
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('categories', null, {});
  }
};
