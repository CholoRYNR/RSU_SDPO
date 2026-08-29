'use strict';

const { Equipment, User, DamageLossRecord, sequelize } = require('../models');
const { serialize, loadTransactionOr404, assertStatusIn } = require('./borrow.controller');
const { notifyBorrower } = require('../helpers/notify');
const { logStatusChange } = require('../helpers/transactionLog');

// Step 5 — Return. Each item is assigned its own condition (Good / Damaged /
// Lost) rather than one condition for the whole transaction, so a mixed
// return (e.g. one ball Good, one net Damaged) produces an accurate
// Damage/Loss Record for only the affected item(s).
exports.returnTransaction = async (req, res) => {
  const { items } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('items (itemCode + condition for each returned item) is required');
    err.statusCode = 400;
    throw err;
  }
  for (const line of items) {
    if (!line.itemCode || !['Good', 'Damaged', 'Lost'].includes(line.condition)) {
      const err = new Error('Each item needs an itemCode and a condition of Good, Damaged, or Lost');
      err.statusCode = 400;
      throw err;
    }
  }

  const txn = await loadTransactionOr404(req.params.id);
  // Overdue transactions previously could never be returned — assertStatus
  // only accepted 'Released', which is a real bug: a late transaction is
  // still Released equipment sitting with the borrower.
  assertStatusIn(txn, ['Released', 'Overdue']);

  const byCode = new Map(items.map((line) => [line.itemCode, line]));
  const missing = txn.details.filter((d) => !byCode.has(d.item.itemCode));
  if (missing.length) {
    const err = new Error(`Missing condition for: ${missing.map((d) => d.item.itemCode).join(', ')}`);
    err.statusCode = 400;
    throw err;
  }

  const createdRecords = [];
  await sequelize.transaction(async (t) => {
    for (const detail of txn.details) {
      const line = byCode.get(detail.item.itemCode);
      await detail.update({ returnedCondition: line.condition, conditionNotes: line.notes || null }, { transaction: t });

      if (line.condition === 'Good') {
        await detail.item.update(
          { availabilityStatus: 'Available', itemCondition: 'Good', currentBorrowerId: null },
          { transaction: t }
        );
        await Equipment.increment('availableQuantity', { by: 1, where: { id: detail.item.equipmentId }, transaction: t });
      } else {
        // Damaged/Lost items stay out of the lending pool (availabilityStatus
        // stays 'Borrowed' — there's no dedicated "written off" status on Item)
        // until the replacement is verified; availableQuantity is deliberately
        // not restored so inventory counts stay accurate.
        await detail.item.update({ itemCondition: line.condition }, { transaction: t });
        const record = await DamageLossRecord.create(
          {
            transactionId: txn.id,
            borrowerId: txn.borrowerId,
            itemId: detail.item.id,
            incidentType: line.condition,
            dateReported: new Date(),
            conditionDetails: line.notes || null,
            recordedBy: req.user.id
          },
          { transaction: t }
        );
        createdRecords.push(record);
      }
    }

    const anyBad = createdRecords.length > 0;
    const worst = createdRecords.some((r) => r.incidentType === 'Lost') ? 'Lost' : 'Damaged';
    txn.transactionStatus = anyBad ? 'For Resolution' : 'Completed';
    txn.returnedBy = req.user.id;
    txn.returnDatetime = new Date();
    txn.receivedByStaff = req.user.id;
    txn.receivedByStaffDatetime = new Date();
    await txn.save({ transaction: t });

    if (anyBad) {
      // The borrower is auto-flagged the moment any item comes back bad —
      // they stay Restricted (blocked from logging in) until every affected
      // item's replacement is verified (damageLoss.controller.js#resolve).
      const user = await User.findByPk(txn.borrower.user.id, { transaction: t });
      if (user) {
        user.accountStatus = 'Restricted';
        await user.save({ transaction: t });
      }
      await logStatusChange(
        txn.id,
        req.user.id,
        'Released',
        'For Resolution',
        `Returned with ${createdRecords.length} item(s) reported ${worst === 'Lost' ? 'Lost/Damaged' : 'Damaged'} — replacement required`
      );
    } else {
      await logStatusChange(txn.id, req.user.id, 'Released', 'Completed', 'Returned in good condition');
    }
  });

  if (txn.borrower && txn.borrower.user) {
    await notifyBorrower(
      txn.borrower.user.id,
      createdRecords.length
        ? `Your returned equipment for Transaction #${txn.id} included ${createdRecords.length} item(s) reported Damaged or Lost. Your account has been restricted and a replacement is required — please visit the SDPO office.`
        : `Your returned equipment for Transaction #${txn.id} has been received in good condition and the transaction is complete. Thank you!`,
      'Return'
    );
  }

  res.json({ success: true, data: serialize(await loadTransactionOr404(txn.id)) });
};
