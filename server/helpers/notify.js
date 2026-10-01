'use strict';

const { Notification, User } = require('../models');
const { sendEmail } = require('../services/notificationService/emailService');
const { sendSms } = require('../services/notificationService/smsService');

const STAFF_ROLES = ['Admin', 'Director', 'Staff'];

// One action produces exactly ONE notification row per recipient: the
// in-app ('System') row the bell and Notifications page show. Email/SMS are
// delivery channels for that same notification, not separate notifications
// — previously each channel wrote its own extra Notification row, so every
// event showed up three times (System + Email + SMS) in the recipient's list.
// Delivery failures are logged, never thrown, so they can't break the
// workflow action that triggered them.
async function deliverExternalChannels(user, message, type) {
  if (!user) return;
  try {
    if (user.emailAddress) {
      const result = await sendEmail(user.emailAddress, `RSU SDPO Notification: ${type}`, message);
      if (!result.success) console.error(`[notify] Email to user ${user.id} failed: ${result.error}`);
    }
    if (user.contactNumber) {
      const result = await sendSms(user.contactNumber, message);
      if (!result.success) console.error(`[notify] SMS to user ${user.id} failed: ${result.error}`);
    }
  } catch (err) {
    console.error(`[notify] External delivery failed for user ${user.id}:`, err.message || err);
  }
}

// Writes the in-app notification. With a dedupeKey, the (user_id,
// dedupe_key) unique index makes this idempotent: the same workflow event
// re-triggered (a double-click, a retried request, a sweep running twice)
// finds the existing row instead of inserting a duplicate. Returns
// { notification, created }.
async function createInApp(userId, message, type, dedupeKey) {
  const values = {
    userId,
    notificationType: type,
    message,
    deliveryChannel: 'System',
    deliveryStatus: 'Sent',
    sentAt: new Date(),
    isRead: false,
    dedupeKey: dedupeKey || null
  };
  if (!dedupeKey) {
    return { notification: await Notification.create(values), created: true };
  }
  const [notification, created] = await Notification.findOrCreate({
    where: { userId, dedupeKey },
    defaults: values
  });
  return { notification, created };
}

async function notifyUser(userId, message, type, dedupeKey) {
  const { notification, created } = await createInApp(userId, message, type, dedupeKey);
  if (created) {
    try {
      const user = await User.findByPk(userId);
      await deliverExternalChannels(user, message, type);
    } catch (err) {
      console.error(`[notify] Failed to look up user ${userId} for email/SMS delivery:`, err.message || err);
    }
  }
  return notification;
}

// Kept as the borrower-facing entry point used across the controllers.
function notifyBorrower(userId, message, type, dedupeKey) {
  return notifyUser(userId, message, type, dedupeKey);
}

// One notification per user holding any of the given roles. Never throws.
async function notifyRoles(roles, message, type, dedupeKey) {
  try {
    const recipients = await User.findAll({ where: { userRole: roles } });
    for (const user of recipients) {
      // eslint-disable-next-line no-await-in-loop
      const { created } = await createInApp(user.id, message, type, dedupeKey);
      // eslint-disable-next-line no-await-in-loop
      if (created) await deliverExternalChannels(user, message, type);
    }
  } catch (err) {
    console.error('[notify] Failed to notify staff:', err.message || err);
  }
}

// Every Admin/Director/Staff account.
function notifyStaff(message, type, dedupeKey) {
  return notifyRoles(STAFF_ROLES, message, type, dedupeKey);
}

module.exports = { notifyBorrower, notifyStaff, notifyRoles, notifyUser };
