'use strict';

const bcrypt = require('bcrypt');
const { User, Borrower } = require('../models');

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

exports.updateProfile = async (req, res) => {
  const { contactNumber, emailAddress, firstName, lastName, collegeOrUnit } = req.body;

  const user = await User.findByPk(req.user.id, { include: [{ model: Borrower, as: 'borrowerProfile' }] });
  if (!user) {
    const err = new Error('User not found');
    err.statusCode = 404;
    throw err;
  }

  if (contactNumber !== undefined) user.contactNumber = contactNumber || null;
  if (emailAddress) user.emailAddress = emailAddress;

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

  if (user.borrowerProfile) {
    if (firstName) user.borrowerProfile.firstName = firstName;
    if (lastName) user.borrowerProfile.lastName = lastName;
    if (collegeOrUnit) user.borrowerProfile.collegeOrUnit = collegeOrUnit;
    await user.borrowerProfile.save();
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

exports.serializeUser = serializeUser;
