'use strict';

// Adds Google OAuth 2.0 linkage to the user table. Nullable because most
// accounts (password-registered Borrowers, and every Admin/Director/Staff
// account) never sign in with Google; unique because a Google account can
// only ever be linked to one RSU SDPO user. Mirrors 015/018's plain
// addColumn/removeColumn style — no FK reference needed since this is just
// an opaque identifier string from Google, not a link to another table.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('user', 'google_id', {
      type: Sequelize.STRING(255),
      allowNull: true,
      unique: true
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('user', 'google_id');
  }
};
