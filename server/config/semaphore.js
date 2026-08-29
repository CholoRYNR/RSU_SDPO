'use strict';

// Axios-based client for the Semaphore SMS API
// (https://semaphore.co/docs), used for SMS delivery of borrowing
// notifications. Credentials (SEMAPHORE_API_KEY / SEMAPHORE_SENDER_NAME) are
// read from process.env only at call time, never captured at module-load
// time, so requiring this file never throws even when no .env is present.

const axios = require('axios');

const SEMAPHORE_ENDPOINT = 'https://api.semaphore.co/api/v4/messages';

// Sends a single SMS via Semaphore. Resolves with Semaphore's raw response
// payload on success; rejects (throws) on any HTTP or network failure —
// callers (smsService.js) are responsible for catching and translating that
// into the project's non-throwing success/failure result shape.
async function sendSingleSms(toNumber, message) {
  const apiKey = process.env.SEMAPHORE_API_KEY;
  const senderName = process.env.SEMAPHORE_SENDER_NAME;

  if (!apiKey) {
    throw new Error('SEMAPHORE_API_KEY is not set');
  }

  const payload = {
    apikey: apiKey,
    number: toNumber,
    message
  };
  if (senderName) {
    payload.sendername = senderName;
  }

  const response = await axios.post(SEMAPHORE_ENDPOINT, payload, {
    timeout: 10000
  });

  return response.data;
}

module.exports = { sendSingleSms };
