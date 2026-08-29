'use strict';

// Verifies server/config/passport.js's verify-callback logic
// (handleGoogleProfile) directly, against a mocked User model — no real
// GoogleStrategy/OAuth2 machinery is exercised (that part is thin passport
// wiring, not logic worth testing here). Covers the four branches the
// callback distinguishes:
//   1. an existing user already linked by googleId
//   2. an existing Borrower account matched by email -> gets linked
//   3. an existing non-Borrower (staff) account matched by email -> rejected
//   4. no match at all -> a brand-new Borrower-role account is created
// plus the username-collision case within branch 4.

jest.mock('../../models', () => ({
  User: {
    findOne: jest.fn(),
    create: jest.fn()
  }
}));
jest.mock('bcrypt', () => ({
  hash: jest.fn()
}));

const { User } = require('../../models');
const bcrypt = require('bcrypt');
const { handleGoogleProfile, generateUniqueUsername } = require('../../config/passport');

function makeProfile(overrides = {}) {
  return {
    id: 'google-123',
    displayName: 'Someone Person',
    emails: [{ value: 'someone@example.com' }],
    ...overrides
  };
}

describe('config/passport.js#handleGoogleProfile', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    bcrypt.hash.mockResolvedValue('hashed-random-password');
  });

  test('branch 1: returns the existing user immediately when googleId already matches', async () => {
    const existing = { id: 1, googleId: 'google-123', userRole: 'Borrower' };
    User.findOne.mockResolvedValueOnce(existing);

    const result = await handleGoogleProfile(makeProfile());

    expect(result).toBe(existing);
    expect(User.findOne).toHaveBeenCalledTimes(1);
    expect(User.findOne).toHaveBeenCalledWith({ where: { googleId: 'google-123' } });
    expect(User.create).not.toHaveBeenCalled();
  });

  test('branch 2: links an existing Borrower account found by email (sets googleId and saves)', async () => {
    const existing = {
      id: 2,
      userRole: 'Borrower',
      googleId: null,
      save: jest.fn().mockResolvedValue(undefined)
    };
    User.findOne
      .mockResolvedValueOnce(null) // googleId lookup misses
      .mockResolvedValueOnce(existing); // email lookup hits

    const result = await handleGoogleProfile(makeProfile());

    expect(result).toBe(existing);
    expect(existing.googleId).toBe('google-123');
    expect(existing.save).toHaveBeenCalledTimes(1);
    expect(User.findOne).toHaveBeenCalledWith({ where: { emailAddress: 'someone@example.com' } });
    expect(User.create).not.toHaveBeenCalled();
  });

  test('branch 3: rejects (never links, never creates) when the matched email belongs to a non-Borrower account', async () => {
    const existing = { id: 3, userRole: 'Admin', save: jest.fn() };
    User.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);

    await expect(handleGoogleProfile(makeProfile())).rejects.toThrow(
      /email belongs to a staff account/i
    );
    expect(existing.save).not.toHaveBeenCalled();
    expect(User.create).not.toHaveBeenCalled();
  });

  test('branch 3b: rejects for every non-Borrower role, not just Admin', async () => {
    for (const userRole of ['Director', 'Staff']) {
      jest.clearAllMocks();
      const existing = { id: 3, userRole, save: jest.fn() };
      User.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(existing);

      await expect(handleGoogleProfile(makeProfile())).rejects.toThrow(/staff account/i);
      expect(existing.save).not.toHaveBeenCalled();
    }
  });

  test('branch 4: creates a brand-new Borrower-role User when neither googleId nor email match anything', async () => {
    User.findOne
      .mockResolvedValueOnce(null) // googleId lookup
      .mockResolvedValueOnce(null) // email lookup
      .mockResolvedValueOnce(null); // username uniqueness check: free on first try
    const created = { id: 4, userRole: 'Borrower' };
    User.create.mockResolvedValueOnce(created);

    const result = await handleGoogleProfile(
      makeProfile({ id: 'google-999', emails: [{ value: 'newperson@example.com' }] })
    );

    expect(result).toBe(created);
    expect(bcrypt.hash).toHaveBeenCalledWith(expect.any(String), 10);
    expect(User.create).toHaveBeenCalledWith(
      expect.objectContaining({
        emailAddress: 'newperson@example.com',
        username: 'newperson',
        userRole: 'Borrower',
        googleId: 'google-999',
        accountStatus: 'Active',
        password: 'hashed-random-password'
      })
    );
  });

  test('branch 4 never creates a Borrower row alongside the User (profile completion is deferred)', async () => {
    User.findOne.mockResolvedValueOnce(null).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    User.create.mockResolvedValueOnce({ id: 4, userRole: 'Borrower' });

    await handleGoogleProfile(makeProfile({ emails: [{ value: 'newperson2@example.com' }] }));

    // Only User.create should ever be invoked by this path — no separate
    // Borrower.create call exists anywhere in handleGoogleProfile.
    expect(User.create).toHaveBeenCalledTimes(1);
  });

  test('rejects with a clear message when the Google profile has no email at all', async () => {
    User.findOne.mockResolvedValueOnce(null);

    await expect(handleGoogleProfile(makeProfile({ emails: [] }))).rejects.toThrow(/email/i);
    expect(User.create).not.toHaveBeenCalled();
  });
});

describe('config/passport.js#generateUniqueUsername', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('uses the email local part unchanged when it is free', async () => {
    User.findOne.mockResolvedValueOnce(null);
    const username = await generateUniqueUsername('freshuser@example.com');
    expect(username).toBe('freshuser');
  });

  test('appends an incrementing digit until a free username is found', async () => {
    User.findOne
      .mockResolvedValueOnce({ id: 1 }) // 'taken' exists
      .mockResolvedValueOnce({ id: 2 }) // 'taken1' exists
      .mockResolvedValueOnce(null); // 'taken2' is free
    const username = await generateUniqueUsername('taken@example.com');
    expect(username).toBe('taken2');
  });

  test('falls back to "googleuser" when the email is missing', async () => {
    User.findOne.mockResolvedValueOnce(null);
    const username = await generateUniqueUsername(undefined);
    expect(username).toBe('googleuser');
  });
});
