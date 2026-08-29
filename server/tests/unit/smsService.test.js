'use strict';

// Verifies server/services/notificationService/smsService.js's contract:
// sendSms(toNumber, message) must NEVER throw/reject, and must always
// resolve to { success: true, response } on success or
// { success: false, error } on failure. config/semaphore.js's
// sendSingleSms (and, transitively, axios) is mocked so no real network
// call to Semaphore ever happens.

jest.mock('../../config/semaphore');

const { sendSingleSms } = require('../../config/semaphore');
const { sendSms } = require('../../services/notificationService/smsService');

describe('smsService.sendSms', () => {
  let errorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  test('resolves { success: true, response } when Semaphore succeeds', async () => {
    sendSingleSms.mockResolvedValue([{ message_id: 999, status: 'Queued' }]);

    const result = await sendSms('09171234567', 'Your request was approved.');

    expect(result).toEqual({ success: true, response: [{ message_id: 999, status: 'Queued' }] });
    expect(sendSingleSms).toHaveBeenCalledWith('09171234567', 'Your request was approved.');
  });

  test('resolves { success: false, error } instead of throwing when the axios call rejects', async () => {
    sendSingleSms.mockRejectedValue(new Error('Network Error'));

    await expect(sendSms('09171234567', 'msg')).resolves.toEqual({
      success: false,
      error: 'Network Error'
    });
  });

  test('resolves { success: false, error } instead of throwing when Semaphore rejects with an HTTP-style error object', async () => {
    const axiosLikeError = new Error('Request failed with status code 401');
    axiosLikeError.response = { status: 401, data: { message: 'Invalid API key' } };
    sendSingleSms.mockRejectedValue(axiosLikeError);

    const result = await sendSms('09171234567', 'msg');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Request failed with status code 401');
  });

  test('resolves { success: false } without calling Semaphore when no recipient number is given', async () => {
    const result = await sendSms(null, 'msg');

    expect(result.success).toBe(false);
    expect(result.error).toEqual(expect.any(String));
    expect(sendSingleSms).not.toHaveBeenCalled();
  });

  // Security note (see verification report step 5): smsService now logs
  // `err.message || 'Unknown error'`, so a rejection with an empty/falsy
  // `.message` never causes the raw error object to be logged. This matters
  // because Semaphore's request payload carries `apikey` in the JSON body
  // (config/semaphore.js), so a raw axios error object for that request
  // would carry `.config.data` containing the key. This test confirms the
  // API key never reaches the log output even when `.message` is falsy.
  test('logs a safe fallback string (never the raw error object) when err.message is falsy, so credentials are never logged', async () => {
    const credentialBearingError = new Error('');
    credentialBearingError.config = { data: JSON.stringify({ apikey: 'SECRET_SEMAPHORE_KEY' }) };
    sendSingleSms.mockRejectedValue(credentialBearingError);

    await sendSms('09171234567', 'msg');

    expect(errorSpy).toHaveBeenCalledWith(expect.any(String), 'Unknown error');
    expect(errorSpy).not.toHaveBeenCalledWith(expect.any(String), credentialBearingError);
  });
});
