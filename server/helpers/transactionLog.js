'use strict';

const { TransactionLog } = require('../models');

function logStatusChange(transactionId, changedBy, oldStatus, newStatus, remarks) {
  return TransactionLog.create({
    transactionId,
    changedBy,
    oldStatus,
    newStatus,
    changeDatetime: new Date(),
    remarks: remarks || null
  });
}

module.exports = { logStatusChange };
