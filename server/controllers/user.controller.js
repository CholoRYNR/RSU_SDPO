'use strict';

const bcrypt = require('bcrypt');
const { User, Borrower } = require('../models');
const { issueVerificationCode, serializeUser } = require('./auth.controller');
const { BORROWER_CATEGORIES } = require('../constants/borrowerCategories');

exports.updateProfile = async (req, res) => {
  const { contactNumber, emailAddress, firstName, lastName, collegeOrUnit, borrowerCategory } = req.body;

  const user = await User.findByPk(req.user.id, { include: [{ model: Borrower, as: 'borrowerProfile' }] });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  // A Borrower-role account created via Google sign-in never gets a
  // Borrower row (config/passport.js#handleGoogleProfile deliberately
  // skips it — Google's basic profile scope can't supply
  // collegeOrUnit/borrowerCategory). Without this branch, the block below
  // ("if (user.borrowerProfile) { ... }") would silently do nothing for
  // that account forever: the request would still return 200/success, but
  // firstName/lastName/collegeOrUnit would never actually be saved,
  // permanently blocking that borrower from ever completing their profile
  // (and, in turn, from ever borrowing — createSelfRequest already
  // requires a completed Borrower row). Require all four fields up front
  // and create the row now instead of silently dropping them.
  // lastName is deliberately not required — see auth.controller.js#register
  // for why a single-word name should never be forced into duplicating
  // itself as a fake last name.
  if (borrowerCategory !== undefined && borrowerCategory !== null && borrowerCategory !== '' && !BORROWER_CATEGORIES.includes(borrowerCategory)) {
    const err = new Error(`Borrower Type must be one of: ${BORROWER_CATEGORIES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  if (!user.borrowerProfile && user.userRole === 'Borrower') {
    if (!firstName || !collegeOrUnit || !borrowerCategory) {
      const err = new Error(
        'Your borrower profile is not set up yet — please provide your full name, college/unit, and borrower type to continue.'
      );
      err.statusCode = 400;
      throw err;
    }
  }

  if (contactNumber !== undefined) user.contactNumber = contactNumber || null;
  // Changing the email address means the *new* address has never actually
  // been verified — login only ever checked the emailVerified flag, not
  // whether the currently-saved address was the one that flag was earned
  // for, so an account could change its email to anything (including a
  // typo or someone else's inbox) and stay marked verified forever. Reset
  // the flag and send a fresh code to the new address, same as first-time
  // registration.
  const emailChanged = emailAddress && emailAddress !== user.emailAddress;
  if (emailAddress) user.emailAddress = emailAddress;
  if (emailChanged) user.emailVerified = false;

  try {
    await user.save();
  } catch (e) {
    if (e.name === 'SequelizeUniqueConstraintError') {
      const err = new Error('That email address is already in use');
      err.statusCode = 409;
      throw err;
    }
    throw e;
  }

  if (emailChanged) {
    await issueVerificationCode(user, { force: true });
  }

  if (user.borrowerProfile) {
    if (firstName) user.borrowerProfile.firstName = firstName;
    // `!== undefined` rather than truthy — lastName needs to be settable
    // to an actual empty string (a borrower whose name is just one word),
    // which a plain `if (lastName)` check would silently refuse to save.
    if (lastName !== undefined) user.borrowerProfile.lastName = lastName || '';
    if (collegeOrUnit) user.borrowerProfile.collegeOrUnit = collegeOrUnit;
    // Borrower Type is editable. Transactions, reports and the staff views
    // read it live through the borrower relation (never a copied value), so
    // a change here is reflected everywhere on the next load.
    if (borrowerCategory) user.borrowerProfile.borrowerCategory = borrowerCategory;
    await user.borrowerProfile.save();
  } else if (user.userRole === 'Borrower') {
    // Validated above: firstName/collegeOrUnit/borrowerCategory are all
    // present; lastName is optional (see the check above) and normalized
    // to '' rather than left undefined/null, since the column is NOT NULL.
    await Borrower.create({ userId: user.id, firstName, lastName: lastName || '', collegeOrUnit, borrowerCategory });
  }

  const refreshed = await User.findByPk(user.id, { include: [{ model: Borrower, as: 'borrowerProfile' }] });
  res.json({ success: true, data: serializeUser(refreshed) });
};

exports.changePassword = async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    const err = new Error('currentPassword and newPassword are required');
    err.statusCode = 400;
    throw err;
  }
  if (newPassword.length < 8) {
    const err = new Error('New password must be at least 8 characters long');
    err.statusCode = 400;
    throw err;
  }

  const user = await User.findByPk(req.user.id);
  if (!user || !(await bcrypt.compare(currentPassword, user.password))) {
    const err = new Error('Current password is incorrect');
    err.statusCode = 401;
    throw err;
  }

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();
  res.json({ success: true, data: { message: 'Password updated successfully.' } });
};

