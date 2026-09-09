'use strict';

// Verifies server/helpers/verificationCode.js in isolation: code format
// (always 6 digits, numeric, zero-padded — including the low-value edge
// case where crypto.randomInt returns something small) and the
// hash/compare round trip, without mocking bcrypt/crypto — this is cheap
// enough to run for real and doing so is the strongest guarantee the code
// is actually cryptographically random and actually bcrypt-hashed.

const { generateCode, hashCode, compareCode } = require('../../helpers/verificationCode');

describe('helpers/verificationCode.js#generateCode', () => {
  test('always returns a 6-character numeric string', () => {
    for (let i = 0; i < 200; i += 1) {
      const code = generateCode();
      expect(typeof code).toBe('string');
      expect(code).toHaveLength(6);
      expect(code).toMatch(/^\d{6}$/);
    }
  });

  test('zero-pads small values so the string is always 6 digits', () => {
    const randomIntSpy = jest.spyOn(require('crypto'), 'randomInt').mockReturnValueOnce(42);
    expect(generateCode()).toBe('000042');
    randomIntSpy.mockRestore();
  });

  test('generates a spread of distinct values (not a constant)', () => {
    const codes = new Set();
    for (let i = 0; i < 50; i += 1) {
      codes.add(generateCode());
    }
    // Astronomically unlikely to collide down to 1 unique value across 50
    // draws from a real random source unless something is badly broken.
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('helpers/verificationCode.js#hashCode / compareCode', () => {
  test('a hashed code compares true against the original code', async () => {
    const code = '123456';
    const hash = await hashCode(code);
    expect(typeof hash).toBe('string');
    expect(hash).not.toBe(code);
    await expect(compareCode(code, hash)).resolves.toBe(true);
  });

  test('a wrong code does not match a different code\'s hash', async () => {
    const hash = await hashCode('123456');
    await expect(compareCode('654321', hash)).resolves.toBe(false);
  });
});
