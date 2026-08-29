'use strict';

// Nodemailer transport factory for the RSU SDPO notification engine.
//
// Two environments, two delivery paths:
//   - Development (NODE_ENV !== 'production'): Gmail SMTP via GMAIL_SMTP_USER /
//     GMAIL_SMTP_PASS (a Gmail App Password, not the account password).
//   - Production: Brevo. Brevo's SMTP relay needs a separate SMTP login/key
//     pair (distinct from a transactional-API key), which this project's
//     approved env vars don't provision — only BREVO_API_KEY is defined. So
//     production sends through Brevo's transactional email HTTP API
//     (POST https://api.brevo.com/v3/smtp/email, authenticated with just the
//     API key) instead of SMTP. To keep emailService.js agnostic to which
//     path is active, the Brevo path is wrapped in a nodemailer-shaped object
//     exposing the same sendMail(mailOptions) -> Promise<info> contract that
//     a real nodemailer transport provides.
//
// Credentials are read from process.env only at call time (inside
// getTransport()), never captured at module-load time — so requiring this
// file never throws even when no .env is present, and each call reflects
// whatever environment is current.

const nodemailer = require('nodemailer');
const axios = require('axios');

const DEFAULT_FROM_NAME = 'RSU SDPO';

// Short, explicit timeouts (nodemailer's SMTP defaults run into minutes) so
// that an unreachable/misconfigured SMTP server fails emailService.js's
// sendMail() quickly instead of stalling the borrow/return/damage-loss
// request that triggered the notification.
const SMTP_TIMEOUT_MS = 10000;

function buildGmailTransport() {
  return nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: process.env.GMAIL_SMTP_USER,
      pass: process.env.GMAIL_SMTP_PASS
    },
    connectionTimeout: SMTP_TIMEOUT_MS,
    greetingTimeout: SMTP_TIMEOUT_MS,
    socketTimeout: SMTP_TIMEOUT_MS
  });
}

// A minimal nodemailer-compatible transport backed by Brevo's transactional
// email API. Only implements what emailService.js needs: sendMail(options)
// returning a promise that resolves with a nodemailer-shaped info object
// ({ messageId }) on success and rejects on failure, mirroring how a real
// nodemailer transport behaves so callers don't need to branch on env.
function buildBrevoTransport() {
  return {
    async sendMail(mailOptions) {
      const apiKey = process.env.BREVO_API_KEY;
      if (!apiKey) {
        throw new Error('BREVO_API_KEY is not set');
      }

      const fromEmail = mailOptions.from || process.env.GMAIL_SMTP_USER || 'no-reply@rsu-sdpo.local';

      const response = await axios.post(
        'https://api.brevo.com/v3/smtp/email',
        {
          sender: { name: DEFAULT_FROM_NAME, email: fromEmail },
          to: [{ email: mailOptions.to }],
          subject: mailOptions.subject,
          textContent: mailOptions.text,
          htmlContent: mailOptions.html || undefined
        },
        {
          headers: {
            'api-key': apiKey,
            'Content-Type': 'application/json',
            Accept: 'application/json'
          },
          timeout: 10000
        }
      );

      return { messageId: response.data && response.data.messageId };
    }
  };
}

// Returns the nodemailer(-compatible) transport appropriate for the current
// NODE_ENV. Re-evaluated on every call so it always reflects the live
// environment rather than whatever NODE_ENV was set at process start.
function getTransport() {
  if (process.env.NODE_ENV === 'production') {
    return buildBrevoTransport();
  }
  return buildGmailTransport();
}

module.exports = { getTransport };
