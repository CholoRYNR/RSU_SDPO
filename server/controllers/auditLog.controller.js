'use strict';

const { TransactionLog, User } = require('../models');

function serialize(log) {
  return {
    id: log.id,
    transactionId: log.transactionId,
    changedBy: log.changedByUser ? log.changedByUser.username : log.changedBy ? `User #${log.changedBy}` : 'System',
    oldStatus: log.oldStatus,
    newStatus: log.newStatus,
    remarks: log.remarks,
    changeDatetime: log.changeDatetime
  };
}

exports.list = async (req, res) => {
  const transactionId = req.query.transactionId ? Number(req.query.transactionId) : null;
  const rows = await TransactionLog.findAll({
    where: transactionId ? { transactionId } : undefined,
    include: [{ model: User, as: 'changedByUser' }],
    order: [['changeDatetime', 'DESC']],
    limit: transactionId ? undefined : 200
  });
  res.json({ success: true, data: rows.map(serialize) });
};
