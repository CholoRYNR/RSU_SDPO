'use strict';

// Adds self-service email verification and password reset to the user
// table. These are deliberately separate from the existing accountStatus
// ENUM (Active/Blocked/Restricted, which is reserved for the damage/loss
// borrower-restriction system) so "not yet verified" can never be confused
// with "restricted for owing damaged/lost equipment" in the login error
// message. Mirrors 015/018/019's plain addColumn/removeColumn style — no FK
// references needed since these are just flags, hashes, and timestamps on
// the user row itself.
//
// email_verified defaults to true so every existing row — including the
// hardcoded seeded admin accounts (003_seed_admin_accounts.js, which never
// sets this column) — is unaffected. Only the self-registration path in
// auth.controller.js explicitly sets it to false on the row it creates.
//
// The *_code_hash columns store only the bcrypt hash of a one-time 6-digit
// code (see server/helpers/verificationCode.js) — the plaintext code is
// never persisted anywhere, only emailed once. *_attempts counts wrong
// guesses so verifyRegistration/resetPassword can lock a code out after
// MAX_CODE_ATTEMPTS.
module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.addColumn('user', 'email_verified', {
      type: Sequelize.BOOLEAN,
      allowNull: false,
      defaultValue: true
    });
    await queryInterface.addColumn('user', 'verification_code_hash', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
    await queryInterface.addColumn('user', 'verification_code_expires_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('user', 'verification_code_attempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
    await queryInterface.addColumn('user', 'reset_code_hash', {
      type: Sequelize.STRING(255),
      allowNull: true
    });
    await queryInterface.addColumn('user', 'reset_code_expires_at', {
      type: Sequelize.DATE,
      allowNull: true
    });
    await queryInterface.addColumn('user', 'reset_code_attempts', {
      type: Sequelize.INTEGER,
      allowNull: false,
      defaultValue: 0
    });
  },

  async down(queryInterface) {
    await queryInterface.removeColumn('user', 'reset_code_attempts');
    await queryInterface.removeColumn('user', 'reset_code_expires_at');
    await queryInterface.removeColumn('user', 'reset_code_hash');
    await queryInterface.removeColumn('user', 'verification_code_attempts');
    await queryInterface.removeColumn('user', 'verification_code_expires_at');
    await queryInterface.removeColumn('user', 'verification_code_hash');
    await queryInterface.removeColumn('user', 'email_verified');
  }
};
