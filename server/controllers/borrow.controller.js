'use strict';

const { Transaction, TransactionDetail, Borrower, User, Item, Equipment, Category, MaintenanceFee, sequelize } = require('../models');
const { notifyBorrower, notifyStaff } = require('../helpers/notify');
const { logStatusChange } = require('../helpers/transactionLog');

const INCLUDE = [
  { model: Borrower, as: 'borrower', include: [{ model: User, as: 'user' }] },
  { model: User, as: 'reviewer' },
  { model: User, as: 'approver' },
  {
    model: TransactionDetail,
    as: 'details',
    include: [{ model: Item, as: 'item', include: [{ model: Equipment, as: 'equipment', include: [{ model: Category, as: 'category' }] }] }]
  },
  { model: MaintenanceFee, as: 'maintenanceFees' }
];

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}
function fmtTime(d) {
  return d ? new Date(d).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) : '';
}

function serialize(t) {
  const b = t.borrower;
  const firstItem = (t.details || [])[0];
  return {
    dbId: t.id,
    borrowerId: t.borrowerId,
    id: `TXN-${new Date(t.requestDatetime || t.createdAt).getFullYear()}-${String(t.id).padStart(4, '0')}`,
    date: fmtDate(t.requestDatetime),
    time: fmtTime(t.requestDatetime),
    name: b ? `${b.firstName} ${b.lastName}` : 'Unknown Borrower',
    email: b && b.user ? b.user.emailAddress : '—',
    bsf: `BSF-${String(t.id).padStart(4, '0')}`,
    type: b ? b.borrowerCategory : '—',
    college: b ? b.collegeOrUnit : '—',
    purpose: t.purpose || '—',
    due: fmtDate(t.expectedReturnDatetime),
    returned: t.returnDatetime ? fmtDate(t.returnDatetime) : null,
    status: t.transactionStatus,
    review: t.reviewer ? t.reviewer.username : '—',
    approve: t.approver ? t.approver.username : '—',
    category: firstItem && firstItem.item && firstItem.item.equipment && firstItem.item.equipment.category ? firstItem.item.equipment.category.categoryName : '—',
    items: (t.details || []).map((d) => ({
      code: d.item.itemCode,
      name: d.item.equipment.equipmentName,
      returnedCondition: d.returnedCondition,
      conditionNotes: d.conditionNotes
    })),
    fees: (t.maintenanceFees || []).map((f) => ({
      id: f.id,
      feeType: f.feeType,
      feeAmount: f.feeAmount,
      feeStatus: f.feeStatus
    }))
  };
}

exports.list = async (req, res) => {
  const rows = await Transaction.findAll({ include: INCLUDE, order: [['requestDatetime', 'DESC']] });
  res.json({ success: true, data: rows.map(serialize) });
};

// Borrower-scoped equivalent of list() — used by the self-service pages
// (My Requests / My Borrowings / History) so a borrower only ever sees
// their own transactions, never the full staff-facing list.
exports.mine = async (req, res) => {
  const borrower = await Borrower.findOne({ where: { userId: req.user.id } });
  if (!borrower) {
    return res.json({ success: true, data: [] });
  }
  const rows = await Transaction.findAll({
    where: { borrowerId: borrower.id },
    include: INCLUDE,
    order: [['requestDatetime', 'DESC']]
  });
  res.json({ success: true, data: rows.map(serialize) });
};

exports.create = async (req, res) => {
  const { borrowerId, itemIds, purpose, expectedReturnDatetime } = req.body;
  if (!borrowerId || !Array.isArray(itemIds) || itemIds.length === 0) {
    const err = new Error('borrowerId and a non-empty itemIds array are required');
    err.statusCode = 400;
    throw err;
  }

  const borrower = await Borrower.findByPk(borrowerId);
  if (!borrower) {
    const err = new Error('Borrower not found');
    err.statusCode = 404;
    throw err;
  }

  const items = await Item.findAll({ where: { id: itemIds } });
  if (items.length !== itemIds.length) {
    const err = new Error('One or more selected items were not found');
    err.statusCode = 404;
    throw err;
  }
  const notAvailable = items.filter((i) => i.availabilityStatus !== 'Available');
  if (notAvailable.length > 0) {
    const err = new Error(`These items are not available: ${notAvailable.map((i) => i.itemCode).join(', ')}`);
    err.statusCode = 409;
    throw err;
  }

  const created = await sequelize.transaction(async (t) => {
    // Staff creating this on a borrower's behalf implies the ID/requirements
    // were just verified in person, so it starts Acknowledged just like a
    // self-request — there's no separate "Pending" gate to sit behind.
    const txn = await Transaction.create(
      {
        borrowerId,
        purpose: purpose || null,
        expectedReturnDatetime: expectedReturnDatetime || null,
        transactionStatus: 'Acknowledged',
        borrowerAcknowledged: true,
        acknowledgementTimestamp: new Date()
      },
      { transaction: t }
    );
    await TransactionDetail.bulkCreate(
      items.map((i) => ({ transactionId: txn.id, itemId: i.id })),
      { transaction: t }
    );
    return txn;
  });

  const withIncludes = await Transaction.findByPk(created.id, { include: INCLUDE });
  res.status(201).json({ success: true, data: serialize(withIncludes) });
};

// Self-service equivalent of create(): a borrower doesn't know specific item
// codes, only which equipment + how many units they want, so the server
// auto-assigns that many currently-available units of each requested
// equipment. borrowerId is derived from the token, never trusted from the body.
exports.createSelfRequest = async (req, res) => {
  const { items, purpose, expectedReturnDatetime } = req.body;
  if (!Array.isArray(items) || items.length === 0) {
    const err = new Error('items (equipmentId + quantity) is required');
    err.statusCode = 400;
    throw err;
  }

  const borrower = await Borrower.findOne({ where: { userId: req.user.id } });
  if (!borrower) {
    const err = new Error('Only borrower accounts can submit a borrowing request');
    err.statusCode = 403;
    throw err;
  }

  const selectedItems = [];
  for (const line of items) {
    const equipmentId = Number(line.equipmentId);
    const quantity = Number(line.quantity) || 1;
    if (!equipmentId || quantity < 1) {
      const err = new Error('Each item needs a valid equipmentId and quantity');
      err.statusCode = 400;
      throw err;
    }
    const available = await Item.findAll({
      where: { equipmentId, availabilityStatus: 'Available' },
      limit: quantity
    });
    if (available.length < quantity) {
      const equipment = await Equipment.findByPk(equipmentId);
      const err = new Error(
        `Not enough stock for "${equipment ? equipment.equipmentName : 'equipment #' + equipmentId}" — ${available.length} available, ${quantity} requested`
      );
      err.statusCode = 409;
      throw err;
    }
    selectedItems.push(...available);
  }

  const created = await sequelize.transaction(async (t) => {
    // The wizard's Acknowledge checkbox already gates submission client-side
    // (equipment-showroom-figma.html), so a self-request reaching here has
    // always been acknowledged — record that explicitly rather than sitting
    // in a separate unacknowledged "Pending" state first.
    const txn = await Transaction.create(
      {
        borrowerId: borrower.id,
        purpose: purpose || null,
        expectedReturnDatetime: expectedReturnDatetime || null,
        transactionStatus: 'Acknowledged',
        borrowerAcknowledged: true,
        acknowledgementTimestamp: new Date()
      },
      { transaction: t }
    );
    await TransactionDetail.bulkCreate(
      selectedItems.map((i) => ({ transactionId: txn.id, itemId: i.id })),
      { transaction: t }
    );
    return txn;
  });

  await notifyBorrower(
    req.user.id,
    `Your borrow request (Transaction #${created.id}) was submitted and is pending staff review.`,
    'Request Submitted'
  );
  await notifyStaff(
    `New borrow request from ${borrower.firstName} ${borrower.lastName} (Transaction #${created.id}) — pending review.`,
    'New Request'
  );

  const withIncludes = await Transaction.findByPk(created.id, { include: INCLUDE });
  res.status(201).json({ success: true, data: serialize(withIncludes) });
};

async function loadTransactionOr404(id) {
  const txn = await Transaction.findByPk(id, { include: INCLUDE });
  if (!txn) {
    const err = new Error('Transaction not found');
    err.statusCode = 404;
    throw err;
  }
  return txn;
}

function assertStatus(txn, expected) {
  assertStatusIn(txn, [expected]);
}

function assertStatusIn(txn, expectedList) {
  if (!expectedList.includes(txn.transactionStatus)) {
    const err = new Error(
      `This action requires the transaction to be ${expectedList.map((s) => `"${s}"`).join(' or ')} (it is currently "${txn.transactionStatus}")`
    );
    err.statusCode = 409;
    throw err;
  }
}

// Lets a borrower withdraw their own request while it's still awaiting
// staff review — mirrors review/approve but scoped to the requester.
exports.cancelSelfRequest = async (req, res) => {
  const borrower = await Borrower.findOne({ where: { userId: req.user.id } });
  const txn = await loadTransactionOr404(req.params.id);
  if (!borrower || txn.borrowerId !== borrower.id) {
    const err = new Error('You do not have permission to cancel this request');
    err.statusCode = 403;
    throw err;
  }
  assertStatusIn(txn, ['Pending', 'Acknowledged']);
  const oldStatus = txn.transactionStatus;
  txn.transactionStatus = 'Cancelled';
  await txn.save();
  await logStatusChange(txn.id, req.user.id, oldStatus, 'Cancelled', 'Cancelled by borrower');
  res.json({ success: true, data: serialize(await loadTransactionOr404(txn.id)) });
};

// Step 2 — Review (Property Custodian / Administrative Aide). Distinct from
// Approve: this is staff checking the borrower/requirements are in order
// before it ever reaches a Director. action: 'accept' | 'correction' | 'reject'.
exports.review = async (req, res) => {
  const { action, remarks } = req.body;
  if (!['accept', 'correction', 'reject'].includes(action)) {
    const err = new Error('action must be one of accept, correction, or reject');
    err.statusCode = 400;
    throw err;
  }

  const txn = await loadTransactionOr404(req.params.id);
  assertStatusIn(txn, ['Pending', 'Acknowledged']);
  const oldStatus = txn.transactionStatus;

  const nextStatus = action === 'accept' ? 'For Approval' : action === 'reject' ? 'Rejected' : 'Acknowledged';
  txn.transactionStatus = nextStatus;
  txn.reviewedBy = req.user.id;
  txn.reviewDatetime = new Date();
  await txn.save();
  await logStatusChange(txn.id, req.user.id, oldStatus, nextStatus, remarks || null);

  if (txn.borrower && txn.borrower.user) {
    const message =
      action === 'accept'
        ? `Your borrow request (Transaction #${txn.id}) passed review and is now awaiting Director approval.`
        : action === 'reject'
          ? `Your borrow request (Transaction #${txn.id}) was rejected during review.${remarks ? ' Reason: ' + remarks : ''}`
          : `Your borrow request (Transaction #${txn.id}) needs correction before it can proceed.${remarks ? ' ' + remarks : ''}`;
    await notifyBorrower(txn.borrower.user.id, message, 'Review');
  }
  res.json({ success: true, data: serialize(await loadTransactionOr404(txn.id)) });
};

// Step 3 — Approve (Director only, enforced by roleMiddleware on the route).
exports.approve = async (req, res) => {
  const txn = await loadTransactionOr404(req.params.id);
  assertStatus(txn, 'For Approval');
  txn.transactionStatus = 'Approved';
  txn.approvedBy = req.user.id;
  txn.approvalDatetime = new Date();
  await txn.save();
  await logStatusChange(txn.id, req.user.id, 'For Approval', 'Approved');
  if (txn.borrower && txn.borrower.user) {
    await notifyBorrower(txn.borrower.user.id, `Your borrow request (Transaction #${txn.id}) has been approved by the Director.`, 'Approval');
  }
  res.json({ success: true, data: serialize(await loadTransactionOr404(txn.id)) });
};

exports.reject = async (req, res) => {
  const txn = await loadTransactionOr404(req.params.id);
  assertStatusIn(txn, ['Pending', 'Acknowledged', 'For Approval']);
  const oldStatus = txn.transactionStatus;
  txn.transactionStatus = 'Rejected';
  await txn.save();
  await logStatusChange(txn.id, req.user.id, oldStatus, 'Rejected');
  if (txn.borrower && txn.borrower.user) {
    await notifyBorrower(txn.borrower.user.id, `Your borrow request (Transaction #${txn.id}) was rejected.`, 'Rejection');
  }
  res.json({ success: true, data: serialize(await loadTransactionOr404(txn.id)) });
};

exports.release = async (req, res) => {
  const { itemCodes } = req.body;
  if (!Array.isArray(itemCodes) || itemCodes.length === 0) {
    const err = new Error('itemCodes (the scanned item codes) is required');
    err.statusCode = 400;
    throw err;
  }

  const txn = await loadTransactionOr404(req.params.id);
  assertStatus(txn, 'Approved');

  const expectedCodes = txn.details.map((d) => d.item.itemCode).sort();
  const scannedCodes = [...itemCodes].sort();
  const matches = expectedCodes.length === scannedCodes.length && expectedCodes.every((c, i) => c === scannedCodes[i]);
  if (!matches) {
    const err = new Error(`Scanned items don't match this transaction. Expected: ${expectedCodes.join(', ')}`);
    err.statusCode = 409;
    throw err;
  }

  await sequelize.transaction(async (t) => {
    for (const detail of txn.details) {
      await detail.item.update(
        { availabilityStatus: 'Borrowed', currentBorrowerId: txn.borrowerId },
        { transaction: t }
      );
      await Equipment.decrement('availableQuantity', { by: 1, where: { id: detail.item.equipmentId }, transaction: t });
    }
    txn.transactionStatus = 'Released';
    txn.releasedBy = req.user.id;
    txn.releaseDatetime = new Date();
    await txn.save({ transaction: t });
  });

  await logStatusChange(txn.id, req.user.id, 'Approved', 'Released');
  if (txn.borrower && txn.borrower.user) {
    await notifyBorrower(txn.borrower.user.id, `Equipment for your request (Transaction #${txn.id}) has been released to you.`, 'Release');
  }
  res.json({ success: true, data: serialize(await loadTransactionOr404(txn.id)) });
};

// Step 7 — Complete. The all-good return path completes automatically
// inside return.controller.js; this is only reached via the damage/loss
// branch, once damageLoss.controller.js#resolve has moved the transaction
// to Resolved after a verified replacement.
exports.complete = async (req, res) => {
  const txn = await loadTransactionOr404(req.params.id);
  assertStatus(txn, 'Resolved');
  txn.transactionStatus = 'Completed';
  await txn.save();
  await logStatusChange(txn.id, req.user.id, 'Resolved', 'Completed');
  if (txn.borrower && txn.borrower.user) {
    await notifyBorrower(txn.borrower.user.id, `Transaction #${txn.id} has been marked Completed.`, 'Completed');
  }
  res.json({ success: true, data: serialize(await loadTransactionOr404(txn.id)) });
};

// Shared with return.controller.js and damageLoss.controller.js so every
// endpoint serializes/validates transactions identically.
exports.INCLUDE = INCLUDE;
exports.serialize = serialize;
exports.loadTransactionOr404 = loadTransactionOr404;
exports.assertStatus = assertStatus;
exports.assertStatusIn = assertStatusIn;
