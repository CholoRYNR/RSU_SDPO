'use strict';

const jwt = require('jsonwebtoken');

// `code: 'AUTH_EXPIRED'` lets the client tell "you were never/no-longer
// authenticated" apart from every other business-logic 401 (wrong login
// password, wrong current password) — see client/js/shared/api.js#apiFetch,
// which auto-signs-out only for this code.
function authError(message) {
  const err = new Error(message);
  err.statusCode = 401;
  err.code = 'AUTH_EXPIRED';
  return err;
}

// A valid signature alone isn't enough: the account is re-read on every
// request so a token can never outlive what it vouches for — a deleted or
// blocked account, an email that is no longer verified (e.g. changed and
// not yet re-confirmed), or a role that has since changed. This is the
// server-side guarantee behind "no bypass via direct API calls, refresh,
// back button or alternate routes": every protected endpoint goes through
// here, and req.user.userRole always reflects the database.
module.exports = async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    return next(authError('Authentication required'));
  }

  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (e) {
    return next(authError('Invalid or expired token'));
  }

  try {
    // Required lazily so this module stays loadable without a database
    // connection (route modules require it at import time).
    const { User } = require('../models');
    const user = await User.findByPk(payload.id, { attributes: ['id', 'userRole', 'accountStatus', 'emailVerified'] });
    if (!user) {
      return next(authError('This account no longer exists'));
    }
    if (!user.emailVerified) {
      // AUTH_EXPIRED (not a separate code) so every client signs the
      // session out and returns to the login page, where verification runs.
      return next(authError('Please verify your email before signing in.'));
    }
    if (user.accountStatus === 'Blocked') {
      return next(authError('This account is blocked. Please contact the SDPO office.'));
    }
    req.user = { ...payload, id: user.id, userRole: user.userRole, accountStatus: user.accountStatus };
    return next();
  } catch (err) {
    return next(err);
  }
};
