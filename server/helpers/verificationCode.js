'use strict';

// Shared one-time-code generation/hashing for email verification and
// password reset (server/controllers/auth.controller.js). Codes are always
// stored as a bcrypt hash (see hashCode) — the plaintext code is only ever
// held in memory long enough to email it once, never persisted.

const crypto = require('crypto');
const bcrypt = require('bcrypt');

const CODE_EXPIRY_MINUTES = 10;
const MAX_CODE_ATTEMPTS = 5;

// Matches the bcrypt salt-round count used everywhere else in this codebase
// for password hashing (auth.controller.js, user.controller.js,
// config/passport.js, database/seeders/003_seed_admin_accounts.js all use
// bcrypt.hash(x, 10)) so this new code path is consistent with existing
// hashing cost.
const SALT_ROUNDS = 10;

// Cryptographically secure 6-digit numeric code, zero-padded (e.g. "004213").
// crypto.randomInt is used instead of Math.random, which is not
// cryptographically secure and must never back a security-sensitive code.
function generateCode() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

async function hashCode(code) {
  return bcrypt.hash(code, SALT_ROUNDS);
}

async function compareCode(code, hash) {
  return bcrypt.compare(code, hash);
}

module.exports = {
  CODE_EXPIRY_MINUTES,
  MAX_CODE_ATTEMPTS,
  generateCode,
  hashCode,
  compareCode
};
