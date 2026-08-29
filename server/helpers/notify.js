'use strict';

const { Notification, User } = require('../models');

function notifyBorrower(userId, message, type) {
  return Notification.create({
    userId,
    notificationType: type,
    message,
    deliveryChannel: 'System',
    deliveryStatus: 'Sent',
    sentAt: new Date(),
    isRead: false
  });
}

// Fans a notification out to every Admin/Director/Staff account — there's no
// "staff team" grouping in the schema, so every notification-worthy admin
// event just gets written once per staff user.
async function notifyStaff(message, type) {
  const staff = await User.findAll({ where: { userRole: ['Admin', 'Director', 'Staff'] } });
  if (!staff.length) return;
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
}

module.exports = { notifyBorrower, notifyStaff };
