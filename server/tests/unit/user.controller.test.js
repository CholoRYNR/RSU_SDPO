'use strict';

// Verifies server/controllers/user.controller.js#updateProfile, focused on
// the branch added to fix a real bug: a Borrower-role account created via
// Google sign-in (config/passport.js#handleGoogleProfile) never gets a
// Borrower row, so firstName/lastName/collegeOrUnit/borrowerCategory had
// nowhere to be saved — the endpoint returned 200 "success" while silently
// dropping every one of those fields, forever. Covers: the existing-profile
// update path (unchanged behavior), the new first-time-creation path, and
// the new 400 guard when creation is attempted without all required fields.

jest.mock('../../models', () => ({
  User: { findByPk: jest.fn() },
  Borrower: { create: jest.fn() }
}));
jest.mock('../../controllers/auth.controller', () => ({ issueVerificationCode: jest.fn().mockResolvedValue() }));

const { User, Borrower } = require('../../models');
const { issueVerificationCode } = require('../../controllers/auth.controller');
const ctrl = require('../../controllers/user.controller');

function mockRes() {
  return { json: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('PUT /api/users/profile (updateProfile)', () => {
  test('updates an existing Borrower profile in place (unchanged behavior)', async () => {
    const borrowerProfile = {
      id: 12,
      firstName: 'Old',
      lastName: 'Name',
      collegeOrUnit: 'Old College',
      borrowerCategory: 'Student',
      save: jest.fn().mockResolvedValue()
    };
    const user = {
      id: 1,
      userRole: 'Borrower',
      emailAddress: 'old@example.com',
      contactNumber: null,
      borrowerProfile,
      save: jest.fn().mockResolvedValue()
    };
    User.findByPk.mockResolvedValueOnce(user).mockResolvedValueOnce(user);

    const req = {
      user: { id: 1 },
      body: { firstName: 'New', lastName: 'Name', collegeOrUnit: 'New College', contactNumber: '09171234567' }
    };
    await ctrl.updateProfile(req, mockRes());

    expect(borrowerProfile.firstName).toBe('New');
    expect(borrowerProfile.collegeOrUnit).toBe('New College');
    expect(borrowerProfile.save).toHaveBeenCalledTimes(1);
    expect(Borrower.create).not.toHaveBeenCalled();
    // borrowerCategory is never touched by the existing-profile path, even
    // if a caller sent one.
    expect(borrowerProfile.borrowerCategory).toBe('Student');
  });

  test('creates the missing Borrower row for a Google-signup account with all required fields', async () => {
    const user = {
      id: 2,
      userRole: 'Borrower',
      emailAddress: 'googleuser@example.com',
      contactNumber: null,
      borrowerProfile: null,
      save: jest.fn().mockResolvedValue()
    };
    const refreshed = {
      id: 2,
      userRole: 'Borrower',
      emailAddress: 'googleuser@example.com',
      contactNumber: null,
      accountStatus: 'Active',
      borrowerProfile: { id: 99, firstName: 'Juan', lastName: 'Dela Cruz', collegeOrUnit: 'CCS', borrowerCategory: 'Student' }
    };
    User.findByPk.mockResolvedValueOnce(user).mockResolvedValueOnce(refreshed);
    Borrower.create.mockResolvedValue({ id: 99 });

    const req = {
      user: { id: 2 },
      body: { firstName: 'Juan', lastName: 'Dela Cruz', collegeOrUnit: 'CCS', borrowerCategory: 'Student' }
    };
    const res = mockRes();
    await ctrl.updateProfile(req, res);

    expect(Borrower.create).toHaveBeenCalledWith({
      userId: 2,
      firstName: 'Juan',
      lastName: 'Dela Cruz',
      collegeOrUnit: 'CCS',
      borrowerCategory: 'Student'
    });
    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.borrowerProfile).toEqual(
      expect.objectContaining({ firstName: 'Juan', borrowerCategory: 'Student' })
    );
  });

  test('rejects with 400 instead of silently succeeding when creation is missing a required field', async () => {
    const user = {
      id: 3,
      userRole: 'Borrower',
      emailAddress: 'googleuser2@example.com',
      contactNumber: null,
      borrowerProfile: null,
      save: jest.fn().mockResolvedValue()
    };
    User.findByPk.mockResolvedValueOnce(user);

    // borrowerCategory omitted — this is exactly the bug's original
    // symptom: a caller submits name/college but the account has no
    // profile row yet, so those fields must not be silently dropped.
    const req = {
      user: { id: 3 },
      body: { firstName: 'Juan', lastName: 'Dela Cruz', collegeOrUnit: 'CCS' }
    };
    await expect(ctrl.updateProfile(req, mockRes())).rejects.toMatchObject({ statusCode: 400 });
    expect(user.save).not.toHaveBeenCalled();
    expect(Borrower.create).not.toHaveBeenCalled();
  });

  test('never creates a Borrower row for a non-Borrower (staff) account with no profile', async () => {
    const user = {
      id: 4,
      userRole: 'Admin',
      emailAddress: 'admin@example.com',
      contactNumber: '09170000000',
      borrowerProfile: null,
      save: jest.fn().mockResolvedValue()
    };
    User.findByPk.mockResolvedValueOnce(user).mockResolvedValueOnce(user);

    const req = { user: { id: 4 }, body: { contactNumber: '09171111111' } };
    await ctrl.updateProfile(req, mockRes());

    expect(user.save).toHaveBeenCalledTimes(1);
    expect(Borrower.create).not.toHaveBeenCalled();
  });

  // Regression coverage for a real reported bug: a borrower with a
  // single-word name (nothing after the first word) used to get that word
  // duplicated into lastName by the frontend just to satisfy a
  // then-required field, so "Laurie" was stored and shown everywhere as
  // "Laurie Laurie". lastName is no longer required, and this endpoint
  // must accept and store a genuinely empty one rather than rejecting it
  // or silently refusing to save it.
  test('creates the missing Borrower row with an empty lastName for a single-word name', async () => {
    const user = {
      id: 5,
      userRole: 'Borrower',
      emailAddress: 'oneword@example.com',
      contactNumber: null,
      borrowerProfile: null,
      save: jest.fn().mockResolvedValue()
    };
    const refreshed = {
      id: 5,
      userRole: 'Borrower',
      emailAddress: 'oneword@example.com',
      contactNumber: null,
      accountStatus: 'Active',
      borrowerProfile: { id: 100, firstName: 'Laurie', lastName: '', collegeOrUnit: 'CCS', borrowerCategory: 'Student' }
    };
    User.findByPk.mockResolvedValueOnce(user).mockResolvedValueOnce(refreshed);
    Borrower.create.mockResolvedValue({ id: 100 });

    // No lastName field submitted at all — mirrors what the fixed frontend
    // now sends for a one-word name (rest.join(' ') with nothing to join).
    const req = {
      user: { id: 5 },
      body: { firstName: 'Laurie', collegeOrUnit: 'CCS', borrowerCategory: 'Student' }
    };
    const res = mockRes();
    await ctrl.updateProfile(req, res);

    expect(Borrower.create).toHaveBeenCalledWith({
      userId: 5,
      firstName: 'Laurie',
      lastName: '',
      collegeOrUnit: 'CCS',
      borrowerCategory: 'Student'
    });
    const payload = res.json.mock.calls[0][0];
    expect(payload.data.borrowerProfile.lastName).toBe('');
    expect(payload.data.borrowerProfile.firstName).toBe('Laurie');
  });

  test('can update an existing profile to clear lastName back to empty', async () => {
    const borrowerProfile = {
      id: 12,
      firstName: 'Laurie',
      lastName: 'WronglyDuplicated',
      collegeOrUnit: 'CCS',
      borrowerCategory: 'Student',
      save: jest.fn().mockResolvedValue()
    };
    const user = {
      id: 6,
      userRole: 'Borrower',
      emailAddress: 'fix@example.com',
      contactNumber: null,
      borrowerProfile,
      save: jest.fn().mockResolvedValue()
    };
    User.findByPk.mockResolvedValueOnce(user).mockResolvedValueOnce(user);

    // Explicitly submitting an empty lastName — a plain `if (lastName)`
    // truthy check would silently ignore this and leave the stale
    // duplicated value in place.
    const req = {
      user: { id: 6 },
      body: { firstName: 'Laurie', lastName: '', collegeOrUnit: 'CCS' }
    };
    await ctrl.updateProfile(req, mockRes());

    expect(borrowerProfile.lastName).toBe('');
    expect(borrowerProfile.save).toHaveBeenCalledTimes(1);
  });

  // Medium #2 from the 2026-09-08 system audit: changing an account's email
  // never reset emailVerified, and login only ever checked the flag — not
  // whether the *currently saved* address was the one that flag was earned
  // for. An account could change its email to anything and stay "verified"
  // forever.
  describe('changing emailAddress resets emailVerified and sends a fresh code', () => {
    test('emailVerified is reset to false and a new code is issued when the email actually changes', async () => {
      const user = {
        id: 7,
        userRole: 'Admin',
        emailAddress: 'old@example.com',
        emailVerified: true,
        contactNumber: null,
        borrowerProfile: null,
        save: jest.fn().mockResolvedValue()
      };
      User.findByPk.mockResolvedValueOnce(user).mockResolvedValueOnce(user);

      const req = { user: { id: 7 }, body: { emailAddress: 'new@example.com' } };
      await ctrl.updateProfile(req, mockRes());

      expect(user.emailAddress).toBe('new@example.com');
      expect(user.emailVerified).toBe(false);
      expect(issueVerificationCode).toHaveBeenCalledWith(user);
    });

    test('emailVerified is left untouched when the submitted email is unchanged', async () => {
      const user = {
        id: 8,
        userRole: 'Admin',
        emailAddress: 'same@example.com',
        emailVerified: true,
        contactNumber: null,
        borrowerProfile: null,
        save: jest.fn().mockResolvedValue()
      };
      User.findByPk.mockResolvedValueOnce(user).mockResolvedValueOnce(user);

      const req = { user: { id: 8 }, body: { emailAddress: 'same@example.com', contactNumber: '09171234567' } };
      await ctrl.updateProfile(req, mockRes());

      expect(user.emailVerified).toBe(true);
      expect(issueVerificationCode).not.toHaveBeenCalled();
    });

    test('emailVerified is left untouched when no emailAddress is submitted at all', async () => {
      const user = {
        id: 9,
        userRole: 'Admin',
        emailAddress: 'unrelated@example.com',
        emailVerified: true,
        contactNumber: null,
        borrowerProfile: null,
        save: jest.fn().mockResolvedValue()
      };
      User.findByPk.mockResolvedValueOnce(user).mockResolvedValueOnce(user);

      const req = { user: { id: 9 }, body: { contactNumber: '09171234567' } };
      await ctrl.updateProfile(req, mockRes());

      expect(user.emailVerified).toBe(true);
      expect(issueVerificationCode).not.toHaveBeenCalled();
    });
  });
});
