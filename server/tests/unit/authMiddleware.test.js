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

const jwt = require('jsonwebtoken');
const authMiddleware = require('../../middlewares/authMiddleware');

function mockRes() {
  return {};
}

describe('middlewares/authMiddleware.js', () => {
  test('calls next() with req.user set from a valid Bearer token', () => {
    const token = jwt.sign({ id: 1, userRole: 'Admin' }, process.env.JWT_SECRET);
    const req = { headers: { authorization: `Bearer ${token}` } };
    const next = jest.fn();

    authMiddleware(req, mockRes(), next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // no error argument
    expect(req.user).toMatchObject({ id: 1, userRole: 'Admin' });
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
