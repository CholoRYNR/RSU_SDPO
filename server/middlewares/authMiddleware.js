'use strict';

const jwt = require('jsonwebtoken');

module.exports = function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    return next(err);
  }
  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch (e) {
    const err = new Error('Invalid or expired token');
    err.statusCode = 401;
    next(err);
  }
};
