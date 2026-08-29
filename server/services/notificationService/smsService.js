'use strict';

// SMS delivery for the notification engine. Wraps config/semaphore.js and
// never throws: any failure (missing/invalid credentials, network error,
// provider rejection) is caught, logged, and reported back as
// { success: false, error } so the caller (helpers/notify.js) can record
// deliveryStatus: 'Failed' on the Notification row instead of the whole
// borrow/return/damage-loss request blowing up because an SMS didn't go
// out.

const { sendSingleSms } = require('../../config/semaphore');

// sendSms(toNumber, message) -> Promise<{ success, response?, error? }>
async function sendSms(toNumber, message) {
  if (!toNumber) {
    return { success: false, error: 'No recipient contact number provided' };
  }

  try {
    const response = await sendSingleSms(toNumber, message);
    return { success: true, response };
  } catch (err) {
    console.error(`[smsService] Failed to send SMS to ${toNumber}:`, err.message || 'Unknown error');
    return { success: false, error: err.message || String(err) };
  }
}

module.exports = { sendSms };
