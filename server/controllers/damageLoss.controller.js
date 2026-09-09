'use strict';

const { Op } = require('sequelize');
const { DamageLossRecord, Transaction, Borrower, User, Item, Equipment, Category, MaintenanceFee, sequelize } = require('../models');
const { notifyBorrower } = require('../helpers/notify');
const { logStatusChange } = require('../helpers/transactionLog');

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

const INCLUDE = [
  { model: Transaction, as: 'transaction' },
  { model: Borrower, as: 'borrower', include: [{ model: User, as: 'user' }] },
  { model: Item, as: 'item', include: [{ model: Equipment, as: 'equipment', include: [{ model: Category, as: 'category' }] }] },
  { model: User, as: 'recordedByUser' },
  { model: User, as: 'verifiedByUser' }
];

function serialize(record) {
  const txn = record.transaction;
  const borrower = record.borrower;
  return {
    id: record.id,
    transactionId: txn ? txn.id : record.transactionId,
    transactionCode: txn ? `TXN-${new Date(txn.requestDatetime || txn.createdAt).getFullYear()}-${String(txn.id).padStart(4, '0')}` : '—',
    borrowerName: borrower ? `${borrower.firstName} ${borrower.lastName}` : 'Unknown Borrower',
    borrowerMeta: borrower ? `${borrower.borrowerCategory} • ${borrower.collegeOrUnit}` : '—',
    equipmentName: record.item && record.item.equipment ? record.item.equipment.equipmentName : '—',
    categoryName: record.item && record.item.equipment && record.item.equipment.category ? record.item.equipment.category.categoryName : '—',
    itemCode: record.item ? record.item.itemCode : '—',
    incidentType: record.incidentType,
    dateReported: fmtDate(record.dateReported),
    conditionDetails: record.conditionDetails || (record.incidentType === 'Lost' ? 'N/A' : '—'),
    recordedBy: record.recordedByUser ? record.recordedByUser.username : '—',
    flagged: !!borrower && !!borrower.user && borrower.user.accountStatus === 'Restricted',
    replacementEquipment: record.replacementEquipment,
    replacementDate: record.replacementDate,
    replacementVerifiedBy: record.verifiedByUser ? record.verifiedByUser.username : null,
    resolutionStatus: record.resolutionStatus,
    resolutionDate: record.resolutionDate
  };
}

// MaintenanceFee has no direct foreign key back to a specific
// DamageLossRecord — it's keyed by (transactionId, borrowerId, feeType)
// only, set by flag() below. That's the closest unambiguous match back to
// "the fee for this incident" the current schema supports; if the same
// borrower ever has two records of the same incident type on the same
// transaction, this intentionally can't tell them apart (a real schema gap,
// flagged separately — not something this lookup can paper over).
async function findFeeForRecord(record) {
  return MaintenanceFee.findOne({
    where: {
      transactionId: record.transactionId,
      borrowerId: record.borrowerId,
      feeType: record.incidentType === 'Lost' ? 'Loss' : 'Damage'
    },
    order: [['id', 'DESC']]
  });
}

async function serializeWithFee(record) {
  const fee = await findFeeForRecord(record);
  return {
    ...serialize(record),
    fee: fee ? { id: fee.id, amount: fee.feeAmount, status: fee.feeStatus, paymentDate: fee.paymentDate } : null
  };
}

exports.list = async (req, res) => {
  const rows = await DamageLossRecord.findAll({ include: INCLUDE, order: [['id', 'DESC']] });
  res.json({ success: true, data: await Promise.all(rows.map(serializeWithFee)) });
};

// Lets staff mark a previously-assessed fee as settled (paid in person at
// the SDPO office, per the notification text already sent when the fee was
// assessed) or waived — previously feeStatus was set once at creation and
// never touched again anywhere in the codebase, so an assessed fee had no
// way to ever be recorded as resolved.
exports.updateFeeStatus = async (req, res) => {
  const fee = await MaintenanceFee.findByPk(req.params.feeId);
  if (!fee) {
    const err = new Error('Fee record not found');
    err.statusCode = 404;
    throw err;
  }
  const { status } = req.body;
  if (!['Paid', 'Waived', 'Unpaid'].includes(status)) {
    const err = new Error('status must be one of: Paid, Waived, Unpaid');
    err.statusCode = 400;
    throw err;
  }
  fee.feeStatus = status;
  fee.paymentDate = status === 'Paid' ? new Date() : null;
  await fee.save();
  res.json({ success: true, data: { id: fee.id, status: fee.feeStatus, paymentDate: fee.paymentDate } });
};

async function loadRecordOr404(id) {
  const record = await DamageLossRecord.findByPk(id, { include: INCLUDE });
  if (!record) {
    const err = new Error('Damage/loss record not found');
    err.statusCode = 404;
    throw err;
  }
  return record;
}

// --- Replacement resolution workflow (the primary, required path) ---

exports.submitReplacement = async (req, res) => {
  const { replacementEquipment, replacementDate } = req.body;
  if (!replacementEquipment || !replacementDate) {
    const err = new Error('replacementEquipment and replacementDate are required');
    err.statusCode = 400;
    throw err;
  }
  const record = await loadRecordOr404(req.params.id);
  if (record.resolutionStatus === 'Resolved') {
    const err = new Error('This record is already resolved');
    err.statusCode = 409;
    throw err;
  }

  record.replacementEquipment = replacementEquipment;
  record.replacementDate = replacementDate;
  record.resolutionStatus = 'Replacement Submitted';
  await record.save();

  const txn = record.transaction;
  if (txn && txn.transactionStatus !== 'Replacement') {
    const oldStatus = txn.transactionStatus;
    txn.transactionStatus = 'Replacement';
    await txn.save();
    await logStatusChange(txn.id, req.user.id, oldStatus, 'Replacement', `Replacement submitted for item #${record.itemId}`);
  }

  res.json({ success: true, data: await serializeWithFee(await loadRecordOr404(record.id)) });
};

exports.verifyReplacement = async (req, res) => {
  const record = await loadRecordOr404(req.params.id);
  if (record.resolutionStatus !== 'Replacement Submitted') {
    const err = new Error('A replacement must be submitted before it can be verified');
    err.statusCode = 409;
    throw err;
  }

  record.replacementVerifiedBy = req.user.id;
  record.resolutionStatus = 'Replacement Verified';
  await record.save();

  res.json({ success: true, data: await serializeWithFee(await loadRecordOr404(record.id)) });
};

// The key rule: a record cannot become Resolved until its replacement has
// been submitted AND verified — this is the only path that clears it.
exports.resolve = async (req, res) => {
  const record = await loadRecordOr404(req.params.id);
  if (record.resolutionStatus !== 'Replacement Verified') {
    const err = new Error('This record cannot be resolved until its replacement has been submitted and verified');
    err.statusCode = 409;
    throw err;
  }

  record.resolutionStatus = 'Resolved';
  record.resolutionDate = new Date();

  // A verified replacement means the affected item is physically back in
  // SDPO's hands in good condition — restore it to the lending pool and give
  // the equipment's available count back the unit that return.controller.js
  // deliberately withheld when the damage/loss was first reported.
  await sequelize.transaction(async (t) => {
    await record.save({ transaction: t });

    const item = await Item.findByPk(record.itemId, { transaction: t });
    if (item) {
      await item.update(
        { itemCondition: 'Good', availabilityStatus: 'Available', currentBorrowerId: null },
        { transaction: t }
      );
      await Equipment.increment('availableQuantity', { by: 1, where: { id: item.equipmentId }, transaction: t });
    }
  });

  // The parent transaction only moves to Resolved once every one of its
  // Damage/Loss Records is Resolved — a transaction can have more than one
  // affected item.
  const outstandingForTxn = await DamageLossRecord.count({
    where: { transactionId: record.transactionId, resolutionStatus: { [Op.ne]: 'Resolved' } }
  });
  const txn = await Transaction.findByPk(record.transactionId);
  if (outstandingForTxn === 0 && txn && txn.transactionStatus !== 'Completed') {
    const oldStatus = txn.transactionStatus;
    txn.transactionStatus = 'Resolved';
    await txn.save();
    await logStatusChange(txn.id, req.user.id, oldStatus, 'Resolved', 'All damage/loss records resolved');
  }

  // Likewise only lift the account restriction once the borrower has no
  // other unresolved records outstanding across any transaction.
  const outstandingForBorrower = await DamageLossRecord.count({
    where: { borrowerId: record.borrowerId, resolutionStatus: { [Op.ne]: 'Resolved' } }
  });
  if (outstandingForBorrower === 0) {
    const borrower = await Borrower.findByPk(record.borrowerId, { include: [{ model: User, as: 'user' }] });
    if (borrower && borrower.user) {
      borrower.user.accountStatus = 'Active';
      await borrower.user.save();
      await notifyBorrower(
        borrower.user.id,
        `Your replacement for Transaction #${record.transactionId} has been verified and the incident is resolved. Your account restriction has been lifted.`,
        'Account Restored'
      );
    }
  }

  res.json({ success: true, data: await serializeWithFee(await loadRecordOr404(record.id)) });
};

// --- Manual override (independent of the replacement workflow above) ---

exports.flag = async (req, res) => {
  const record = await loadRecordOr404(req.params.id);
  if (!record.borrower || !record.borrower.user) {
    const err = new Error('Borrower account not found for this record');
    err.statusCode = 404;
    throw err;
  }
  const user = record.borrower.user;
  user.accountStatus = 'Restricted';
  await user.save();

  const feeAmount = Number(req.body.feeAmount);
  let fee = null;
  if (feeAmount > 0) {
    fee = await MaintenanceFee.create({
      transactionId: record.transactionId,
      borrowerId: record.borrowerId,
      feeType: record.incidentType === 'Lost' ? 'Loss' : 'Damage',
      feeAmount,
      feeStatus: 'Unpaid'
    });
  }

  await notifyBorrower(
    user.id,
    fee
      ? `Your account has been restricted due to a ${record.incidentType.toLowerCase()} item report on Transaction #${record.transactionId}. A fee of ₱${feeAmount.toFixed(2)} has been assessed. Please visit the SDPO office to resolve this.`
      : `Your account has been restricted due to a ${record.incidentType.toLowerCase()} item report on Transaction #${record.transactionId}. Please visit the SDPO office to resolve this.`,
    'Account Restricted'
  );

  res.json({ success: true, data: await serializeWithFee(await loadRecordOr404(record.id)) });
};

exports.unflag = async (req, res) => {
  const record = await loadRecordOr404(req.params.id);
  if (!record.borrower || !record.borrower.user) {
    const err = new Error('Borrower account not found for this record');
    err.statusCode = 404;
    throw err;
  }
  const user = record.borrower.user;
  user.accountStatus = 'Active';
  await user.save();

  await notifyBorrower(
    user.id,
    `Your account restriction related to Transaction #${record.transactionId} has been lifted. You may now log in and borrow equipment again.`,
    'Account Restored'
  );

  res.json({ success: true, data: await serializeWithFee(await loadRecordOr404(record.id)) });
};
