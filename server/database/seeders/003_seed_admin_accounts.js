'use strict';

const bcrypt = require('bcrypt');

// Placeholder credentials for local development only — change this password
// (and re-seed, or update it directly) before any real deployment.
// NOTE: check rsusdpo_db's `user` table first — the team may have already
// seeded an admin/staff account there. This is for a FRESH, empty database.
const DEFAULT_ADMIN_PASSWORD = 'ChangeMe123!';

module.exports = {
  async up(queryInterface) {
    const now = new Date();
    const passwordHash = await bcrypt.hash(DEFAULT_ADMIN_PASSWORD, 10);

    await queryInterface.bulkInsert(
      'user',
      [
        {
          username: 'sdpo.staff',
          password: passwordHash,
          user_role: 'Admin',
          email_address: 'sdpo.staff@rsu.edu.ph',
          contact_number: '+63 912 345 6789',
          account_status: 'Active',
          created_at: now,
          updated_at: now
        }
      ],
      {}
    );
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('user', { email_address: 'sdpo.staff@rsu.edu.ph' }, {});
  }
};
