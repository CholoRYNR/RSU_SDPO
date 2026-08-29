'use strict';

const { Notification, User } = require('../models');
const { sendEmail } = require('../services/notificationService/emailService');
const { sendSms } = require('../services/notificationService/smsService');

// Attempts Email and SMS delivery for one user and writes one additional
// Notification row per channel actually attempted (deliveryStatus 'Sent' or
// 'Failed' — never left 'Pending'). A channel is skipped entirely, with no
// Notification row, when the user has no address/number for it (contactNumber
// is nullable; emailAddress is required by the schema but is still checked
// defensively). Never throws: emailService/smsService already report
// failure instead of rejecting, and this function's own try/catch catches
// anything else (e.g. a DB error writing the extra row) so a delivery
// problem can never take down the in-app notification flow that has
// already completed by the time this runs.
async function deliverExternalChannels(user, message, type) {
  if (!user) return;

  const rows = [];

  try {
    if (user.emailAddress) {
      const result = await sendEmail(user.emailAddress, `RSU SDPO Notification: ${type}`, message);
      rows.push({
        userId: user.id,
        notificationType: type,
        message,
        deliveryChannel: 'Email',
        deliveryStatus: result.success ? 'Sent' : 'Failed',
        sentAt: new Date(),
        isRead: false
      });
    }

    if (user.contactNumber) {
      const result = await sendSms(user.contactNumber, message);
      rows.push({
        userId: user.id,
        notificationType: type,
        message,
        deliveryChannel: 'SMS',
        deliveryStatus: result.success ? 'Sent' : 'Failed',
        sentAt: new Date(),
        isRead: false
      });
    }

    if (rows.length) {
      await Notification.bulkCreate(rows);
    }
  } catch (err) {
    console.error(`[notify] Failed to record external delivery for user ${user.id}:`, err.message || err);
  }
}

async function notifyBorrower(userId, message, type) {
  // In-app notification first, exactly as before — this write must succeed
  // (or reject) independently of anything email/SMS related.
  const created = await Notification.create({
    userId,
    notificationType: type,
    message,
    deliveryChannel: 'System',
    deliveryStatus: 'Sent',
    sentAt: new Date(),
    isRead: false
  });

  try {
    const user = await User.findByPk(userId);
    await deliverExternalChannels(user, message, type);
  } catch (err) {
    console.error(`[notify] Failed to look up user ${userId} for email/SMS delivery:`, err.message || err);
  }

  return created;
}

// Fans a notification out to every Admin/Director/Staff account — there's no
// "staff team" grouping in the schema, so every notification-worthy admin
// event just gets written once per staff user.
async function notifyStaff(message, type) {
  try {
    const staff = await User.findAll({ where: { userRole: ['Admin', 'Director', 'Staff'] } });
    if (!staff.length) return;

    // In-app notifications first, exactly as before.
    await Notification.bulkCreate(
      staff.map((u) => ({
        userId: u.id,
        notificationType: type,
        message,
        deliveryChannel: 'System',
        deliveryStatus: 'Sent',
        sentAt: new Date(),
        isRead: false
      }))
    );

    await Promise.all(staff.map((u) => deliverExternalChannels(u, message, type)));
  } catch (err) {
    console.error('[notify] Failed to notify staff:', err.message || err);
  }
}

module.exports = { notifyBorrower, notifyStaff };
