'use strict';

// Unit tests for server/middlewares/errorHandler.js.
// Covers the `code` passthrough added alongside authMiddleware.js's
// AUTH_EXPIRED (Low finding, 2026-09-08 system audit) — it must appear
// only when the thrown error actually set one, and every existing
// {success,message} consumer must stay unaffected.

const errorHandler = require('../../middlewares/errorHandler');

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.headersSent = false;
  return res;
}

describe('middlewares/errorHandler.js', () => {
  let errorSpy;
  beforeEach(() => {
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });
  afterEach(() => {
    errorSpy.mockRestore();
  });

  test('responds with the error\'s statusCode and message, no code field, when none was set', () => {
    const err = new Error('Current password is incorrect');
    err.statusCode = 401;
    const res = mockRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(401);
    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual({ success: false, message: 'Current password is incorrect' });
    expect(payload).not.toHaveProperty('code');
  });

  test('includes code in the payload when the error set one (e.g. AUTH_EXPIRED)', () => {
    const err = new Error('Authentication required');
    err.statusCode = 401;
    err.code = 'AUTH_EXPIRED';
    const res = mockRes();

    errorHandler(err, {}, res, jest.fn());

    const payload = res.json.mock.calls[0][0];
    expect(payload).toEqual({ success: false, message: 'Authentication required', code: 'AUTH_EXPIRED' });
  });

  test('defaults to 500 and a generic message when the error has neither', () => {
    const err = new Error();
    const res = mockRes();

    errorHandler(err, {}, res, jest.fn());

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json.mock.calls[0][0]).toEqual({ success: false, message: 'Internal Server Error' });
  });

  test('delegates to next(err) instead of writing a response when headers were already sent', () => {
    const err = new Error('boom');
    const res = mockRes();
    res.headersSent = true;
    const next = jest.fn();

    errorHandler(err, {}, res, next);

    expect(next).toHaveBeenCalledWith(err);
    expect(res.json).not.toHaveBeenCalled();
  });
});
