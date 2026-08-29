'use strict';

const { Transaction, Borrower, User } = require('../models');
const { Op } = require('sequelize');
const { notifyBorrower } = require('../helpers/notify');

// Reminds a borrower with an active, not-yet-approved request that a
// required document is missing, so the request doesn't silently stall at
// Review/Approval. Matches transactions still in flight (submitted but not
// yet Approved/Rejected/Released/etc.) that haven't already gotten this
// reminder.
//
// Every matching transaction is marked incompleteReqReminderSentDatetime
// once checked — regardless of whether a document was actually missing —
// so a transaction is only ever evaluated once by this sweep. This keeps a
// borrower with complete documents from being re-checked every hour, but
// also means a borrower who uploads the missing document *after* being
// reminded will not get a follow-up "all clear" message; that is out of
// scope here per the task spec.
async function runIncompleteRequirementsSweep() {
  const active = await Transaction.findAll({
    where: {
      transactionStatus: { [Op.in]: ['Acknowledged', 'For Review', 'For Approval'] },
      incompleteReqReminderSentDatetime: null
    },
    include: [{ model: Borrower, as: 'borrower', include: [{ model: User, as: 'user' }] }]
  });

  let sentCount = 0;

  for (const txn of active) {
    try {
      const borrower = txn.borrower;

      if (borrower && borrower.user) {
        const missingId = !borrower.validIdPath;
        const missingAuth = !borrower.authorizationDocumentPath;

        if (missingId || missingAuth) {
          let missingText;
          if (missingId && missingAuth) {
            missingText = 'your Valid ID and your Authorization Document';
          } else if (missingId) {
            missingText = 'your Valid ID';
          } else {
            missingText = 'your Authorization Document';
          }

          await notifyBorrower(
            borrower.user.id,
            `Your borrowing request (Transaction #${txn.id}) is missing ${missingText}. Please upload it as soon as possible so your request isn't delayed.`,
            'Incomplete Requirements'
          );
          sentCount += 1;
        }
      }

      // Mark checked either way so this transaction is never re-evaluated.
      txn.incompleteReqReminderSentDatetime = new Date();
      await txn.save();
    } catch (err) {
      console.error(`Incomplete requirements sweep: failed to process transaction #${txn.id}:`, err.message);
    }
  }

  if (sentCount) {
    console.log(`Incomplete requirements sweep: sent ${sentCount} reminder(s) for missing requirements.`);
  }
}

module.exports = { runIncompleteRequirementsSweep };
