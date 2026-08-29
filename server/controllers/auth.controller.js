'use strict';

const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Op } = require('sequelize');
const { User, Borrower, sequelize } = require('../models');

function signToken(user) {
  return jwt.sign({ id: user.id, userRole: user.userRole }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRES_IN || '1d'
  });
}

function serializeUser(user) {
  return {
    id: user.id,
    username: user.username,
    userRole: user.userRole,
    emailAddress: user.emailAddress,
    contactNumber: user.contactNumber,
    accountStatus: user.accountStatus,
    borrowerProfile: user.borrowerProfile
      ? {
          id: user.borrowerProfile.id,
          firstName: user.borrowerProfile.firstName,
          lastName: user.borrowerProfile.lastName,
          collegeOrUnit: user.borrowerProfile.collegeOrUnit,
          borrowerCategory: user.borrowerProfile.borrowerCategory
        }
      : null
  };
}

// Exported so server/routes/auth.routes.js's Google OAuth callback can
// issue tokens/serialize the user identically to the password-login path —
// a Google-authenticated session must be indistinguishable from a
// password-authenticated one to the rest of the app.
exports.signToken = signToken;
exports.serializeUser = serializeUser;

exports.register = async (req, res) => {
  const { username, emailAddress, password, firstName, lastName, collegeOrUnit, borrowerCategory } = req.body;
  if (!username || !emailAddress || !password) {
    const err = new Error('username, emailAddress, and password are required');
    err.statusCode = 400;
    throw err;
  }
  // Self-registration always creates a Borrower account. Staff/admin roles
  // (Director, Admin, Staff) must never be assignable from the public
  // registration endpoint to prevent privilege escalation.
  const role = 'Borrower';
  if (role === 'Borrower' && (!firstName || !lastName || !collegeOrUnit || !borrowerCategory)) {
    const err = new Error('firstName, lastName, collegeOrUnit, and borrowerCategory are required to register as a borrower');
    err.statusCode = 400;
    throw err;
  }

  const existing = await User.findOne({ where: { username } });
  if (existing) {
    const err = new Error('That username is already taken');
    err.statusCode = 409;
    throw err;
  }

  const passwordHash = await bcrypt.hash(password, 10);

  const user = await sequelize.transaction(async (t) => {
    const created = await User.create(
      { username, emailAddress, password: passwordHash, userRole: role },
      { transaction: t }
    );
    if (role === 'Borrower') {
      await Borrower.create(
        { userId: created.id, firstName, lastName, collegeOrUnit, borrowerCategory },
        { transaction: t }
      );
    }
    return created;
  });

  const withBorrower = await User.findByPk(user.id, { include: [{ model: Borrower, as: 'borrowerProfile' }] });
  res.status(201).json({ success: true, data: { user: serializeUser(withBorrower), token: signToken(user) } });
};

exports.login = async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    const err = new Error('username and password are required');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findOne({
    where: { [Op.or]: [{ username }, { emailAddress: username }] },
    include: [{ model: Borrower, as: 'borrowerProfile' }]
  });
  if (!user || !(await bcrypt.compare(password, user.password))) {
    const err = new Error('Incorrect username or password');
    err.statusCode = 401;
    throw err;
  }
  if (user.accountStatus !== 'Active') {
    const err = new Error(`This account is ${user.accountStatus.toLowerCase()}`);
    err.statusCode = 403;
    throw err;
  }

  res.json({ success: true, data: { user: serializeUser(user), token: signToken(user) } });
};

exports.me = async (req, res) => {
  const user = await User.findByPk(req.user.id, { include: [{ model: Borrower, as: 'borrowerProfile' }] });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }
  res.json({ success: true, data: serializeUser(user) });
};
