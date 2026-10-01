'use strict';

// Unit tests for server/middlewares/authMiddleware.js.
//
// Low finding, 2026-09-08 system audit: added while fixing "no 401/expired-
// token handling anywhere in api.js/app-shell.js" — the client-side fix
// depends on `err.code === 'AUTH_EXPIRED'` being set on exactly these two
// paths (no token at all, and an invalid/expired token) so it can tell a
// real expired/missing session apart from an ordinary business-logic 401
// elsewhere in the app. These tests pin that contract.

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-for-authMiddleware-spec';

jest.mock('../../models', () => ({ User: { findByPk: jest.fn() } }));

const jwt = require('jsonwebtoken');
const { User } = require('../../models');
const authMiddleware = require('../../middlewares/authMiddleware');

function mockRes() {
  return {};
}

function bearer(payload) {
  return { headers: { authorization: `Bearer ${jwt.sign(payload, process.env.JWT_SECRET)}` } };
}

describe('middlewares/authMiddleware.js', () => {
  beforeEach(() => jest.clearAllMocks());

  test('calls next() with req.user set from a valid Bearer token and the current account', async () => {
    User.findByPk.mockResolvedValue({ id: 1, userRole: 'Admin', accountStatus: 'Active', emailVerified: true });
    const req = bearer({ id: 1, userRole: 'Admin' });
    const next = jest.fn();

    await authMiddleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // no error argument
    expect(req.user).toMatchObject({ id: 1, userRole: 'Admin' });
  });

  test('the role always comes from the database, not the (possibly stale) token', async () => {
    User.findByPk.mockResolvedValue({ id: 1, userRole: 'Borrower', accountStatus: 'Active', emailVerified: true });
    const req = bearer({ id: 1, userRole: 'Admin' });
    const next = jest.fn();
    await authMiddleware(req, mockRes(), next);
    expect(req.user.userRole).toBe('Borrower');
  });

  test.each([
    ['the account no longer exists', null],
    ['the email is not verified', { id: 1, userRole: 'Borrower', accountStatus: 'Active', emailVerified: false }],
    ['the account is blocked', { id: 1, userRole: 'Borrower', accountStatus: 'Blocked', emailVerified: true }]
  ])('rejects a validly-signed token with AUTH_EXPIRED when %s', async (_label, dbUser) => {
    User.findByPk.mockResolvedValue(dbUser);
    const req = bearer({ id: 1, userRole: 'Borrower' });
    const next = jest.fn();
    await authMiddleware(req, mockRes(), next);
    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTH_EXPIRED');
    expect(req.user).toBeUndefined();
  });

  test('a flagged (Restricted) borrower keeps their session', async () => {
    User.findByPk.mockResolvedValue({ id: 1, userRole: 'Borrower', accountStatus: 'Restricted', emailVerified: true });
    const req = bearer({ id: 1, userRole: 'Borrower' });
    const next = jest.fn();
    await authMiddleware(req, mockRes(), next);
    expect(next).toHaveBeenCalledWith();
    expect(req.user.accountStatus).toBe('Restricted');
  });

  test('rejects with 401 + code AUTH_EXPIRED when no Authorization header is present at all', () => {
    const req = { headers: {} };
    const next = jest.fn();

    authMiddleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    const err = next.mock.calls[0][0];
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTH_EXPIRED');
  });

  test('rejects with 401 + code AUTH_EXPIRED when the Authorization header is not a Bearer token', () => {
    const req = { headers: { authorization: 'Basic somecreds' } };
    const next = jest.fn();

    authMiddleware(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTH_EXPIRED');
  });

  test('rejects with 401 + code AUTH_EXPIRED for a malformed token', () => {
    const req = { headers: { authorization: 'Bearer not-a-real-jwt' } };
    const next = jest.fn();

    authMiddleware(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTH_EXPIRED');
  });

  test('rejects with 401 + code AUTH_EXPIRED for a token signed with a different secret', () => {
    const token = jwt.sign({ id: 1 }, 'a-different-secret');
    const req = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();

    authMiddleware(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTH_EXPIRED');
  });

  test('rejects with 401 + code AUTH_EXPIRED for an actually-expired token', () => {
    const token = jwt.sign({ id: 1 }, process.env.JWT_SECRET, { expiresIn: -10 }); // already expired
    const req = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();

    authMiddleware(req, mockRes(), next);

    const err = next.mock.calls[0][0];
    expect(err.statusCode).toBe(401);
    expect(err.code).toBe('AUTH_EXPIRED');
  });
});
