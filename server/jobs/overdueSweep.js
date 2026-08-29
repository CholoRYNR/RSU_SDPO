'use strict';

const { Transaction, Borrower, User } = require('../models');
const { Op } = require('sequelize');
const { notifyBorrower, notifyStaff } = require('../helpers/notify');
const { logStatusChange } = require('../helpers/transactionLog');

// Flips Released transactions whose expected return date has passed into
// Overdue. Only matches currently-Released rows, so re-running this on an
// interval never re-notifies a transaction that's already Overdue.
async function runOverdueSweep() {
  const now = new Date();
  const overdue = await Transaction.findAll({
    where: {
      transactionStatus: 'Released',
      expectedReturnDatetime: { [Op.lt]: now }
    },
    include: [{ model: Borrower, as: 'borrower', include: [{ model: User, as: 'user' }] }]
  });

  for (const txn of overdue) {
    txn.transactionStatus = 'Overdue';
    await txn.save();
    await logStatusChange(txn.id, null, 'Released', 'Overdue', 'Automatically flagged overdue by system sweep');

    if (txn.borrower && txn.borrower.user) {
      await notifyBorrower(
        txn.borrower.user.id,
        `Your borrowed equipment (Transaction #${txn.id}) is now overdue. Please return it to the SDPO office as soon as possible.`,
        'Overdue'
      );
    }
    await notifyStaff(`Transaction #${txn.id} is now overdue.`, 'Overdue');
  }

  if (overdue.length) {
    console.log(`Overdue sweep: flagged ${overdue.length} transaction(s) as Overdue.`);
  }
}

module.exports = { runOverdueSweep };
