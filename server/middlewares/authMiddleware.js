'use strict';

const jwt = require('jsonwebtoken');

// `code: 'AUTH_EXPIRED'` on both branches below lets the client tell "you
// were never/no-longer authenticated for this" apart from every other
// business-logic 401 in the app (wrong login password, wrong current
// password on change-password) without fragile string-matching against
// err.message — see client/js/shared/api.js#apiFetch, which uses this to
// auto-sign-out and redirect only for a real expired/missing session
// (Low finding, 2026-09-08 system audit).
module.exports = function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    err.code = 'AUTH_EXPIRED';
    return next(err);
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    const err = new Error('Invalid or expired token');
    err.statusCode = 401;
    err.code = 'AUTH_EXPIRED';
    next(err);
  }
};
