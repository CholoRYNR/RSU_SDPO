'use strict';

const { Notification } = require('../models');

function serialize(n) {
  return {
    id: n.id,
    type: n.notificationType,
    message: n.message,
    deliveryChannel: n.deliveryChannel,
    isRead: !!n.isRead,
    sentAt: n.sentAt
  };
}

exports.list = async (req, res) => {
  const rows = await Notification.findAll({
    where: { userId: req.user.id },
    order: [['id', 'DESC']]
  });
  res.json({ success: true, data: rows.map(serialize) });
};

exports.markRead = async (req, res) => {
  const notif = await Notification.findOne({ where: { id: req.params.id, userId: req.user.id } });
  if (!notif) {
    const err = new Error('Notification not found');
    err.statusCode = 404;
    throw err;
  }
  notif.isRead = true;
  await notif.save();
  res.json({ success: true, data: serialize(notif) });
};

exports.markAllRead = async (req, res) => {
  await Notification.update({ isRead: true }, { where: { userId: req.user.id, isRead: false } });
  res.json({ success: true, data: { message: 'All notifications marked as read.' } });
};

exports.serialize = serialize;
