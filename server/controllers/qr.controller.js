'use strict';

const { Item, Equipment, Category, Borrower, TransactionDetail, Transaction, sequelize } = require('../models');
const categoryAbbreviations = require('../constants/categoryAbbreviations');

function serializeItem(item) {
  return {
    id: item.id,
    code: item.itemCode,
    condition: item.itemCondition,
    status: item.availabilityStatus,
    engravingStatus: item.engravingStatus,
    createdAt: item.createdAt,
    equipmentId: item.equipmentId,
    equipmentName: item.equipment ? item.equipment.equipmentName : null,
    category: item.equipment && item.equipment.category ? item.equipment.category.categoryName : null
  };
}

exports.listItems = async (req, res) => {
  const rows = await Item.findAll({
    include: [{ model: Equipment, as: 'equipment', include: [{ model: Category, as: 'category' }] }],
    order: [['createdAt', 'DESC']]
  });
  res.json({ success: true, data: rows.map(serializeItem) });
};

exports.generate = async (req, res) => {
  const { equipmentId, quantity } = req.body;
  const qty = Number(quantity);
  if (!equipmentId || !Number.isInteger(qty) || qty < 1) {
    const err = new Error('equipmentId and a whole-number quantity of at least 1 are required');
    err.statusCode = 400;
    throw err;
  }

  const equipment = await Equipment.findByPk(equipmentId, { include: [{ model: Category, as: 'category' }] });
  if (!equipment) {
    const err = new Error('Equipment not found');
    err.statusCode = 404;
    throw err;
  }

  const createdIds = await sequelize.transaction(async (t) => {
    const existingCount = await Item.count({ where: { equipmentId }, transaction: t });
    const remaining = equipment.totalQuantity - existingCount;
    if (qty > remaining) {
      const err = new Error(
        `Only ${remaining} more item(s) can be generated for "${equipment.equipmentName}" ` +
          `(total quantity is ${equipment.totalQuantity}, ${existingCount} already exist)`
      );
      err.statusCode = 400;
      throw err;
    }

    const abbr =
      categoryAbbreviations[equipment.category.categoryName] || equipment.category.categoryName.slice(0, 3).toUpperCase();
    const rows = [];
    for (let i = 1; i <= qty; i += 1) {
      const sequence = String(existingCount + i).padStart(3, '0');
      rows.push({
        equipmentId,
        itemCode: `${abbr}-${equipmentId}-${sequence}`,
        itemCondition: 'Good',
        availabilityStatus: 'Available',
        engravingStatus: 'Not Engraved'
      });
    }
    const created = await Item.bulkCreate(rows, { transaction: t });
    // These items are created as 'Available', so they need to actually count
    // toward the equipment's available stock — otherwise the Showroom shows
    // stock that no borrow request can ever actually claim.
    await Equipment.increment('availableQuantity', { by: qty, where: { id: equipmentId }, transaction: t });
    return created.map((i) => i.id);
  });

  const withEquipment = await Item.findAll({
    where: { id: createdIds },
    include: [{ model: Equipment, as: 'equipment', include: [{ model: Category, as: 'category' }] }]
  });
  res.status(201).json({ success: true, data: withEquipment.map(serializeItem) });
};

// Lets staff manually pull a single physical unit out of (or back into) the
// lending pool — for repair, or to permanently retire it — independently of
// every other unit of the same Equipment type. Deliberately separate from
// the Borrowed/Reserved statuses, which are only ever set by the actual
// borrow/return workflow (borrow.controller.js / return.controller.js) —
// this endpoint refuses to touch a currently-Borrowed item at all, and
// never sets a status other than the three below.
const MANUAL_STATUSES = ['Available', 'Maintenance', 'Decommissioned'];

exports.updateItemStatus = async (req, res) => {
  const item = await Item.findByPk(req.params.id);
  if (!item) {
    const err = new Error('Item not found');
    err.statusCode = 404;
    throw err;
  }

  const { status } = req.body;
  if (!MANUAL_STATUSES.includes(status)) {
    const err = new Error(`status must be one of: ${MANUAL_STATUSES.join(', ')}`);
    err.statusCode = 400;
    throw err;
  }
  if (item.availabilityStatus === 'Borrowed') {
    const err = new Error('This item is currently borrowed — it must be returned before its status can be changed here.');
    err.statusCode = 409;
    throw err;
  }
  if (item.availabilityStatus === 'Reserved') {
    // The comment above already documented this intent (Borrowed/Reserved
    // are only ever set by the actual borrow/return workflow) but the check
    // itself only ever excluded Borrowed — Reserved items could slip
    // through. Forcing a Reserved item to Available/Maintenance/
    // Decommissioned here would both corrupt availableQuantity (it was
    // already decremented for this item when it was reserved, and this path
    // doesn't know to account for that) and silently pull equipment out from
    // under a pending borrow request without ever cancelling it.
    const err = new Error('This item is reserved for a pending borrow request — it must be released, returned, or that request cancelled/rejected before its status can be changed here.');
    err.statusCode = 409;
    throw err;
  }

  if (item.availabilityStatus !== status) {
    // availableQuantity only ever counts units actually sitting in the
    // lending pool (see borrow.controller.js/return.controller.js/
    // damageLoss.controller.js, which all increment/decrement it in lockstep
    // with an Item's own availabilityStatus) — moving in or out of
    // 'Available' has to keep that count in sync the same way.
    const wasAvailable = item.availabilityStatus === 'Available';
    const willBeAvailable = status === 'Available';

    await sequelize.transaction(async (t) => {
      item.availabilityStatus = status;
      await item.save({ transaction: t });
      if (wasAvailable && !willBeAvailable) {
        await Equipment.decrement('availableQuantity', { by: 1, where: { id: item.equipmentId }, transaction: t });
      } else if (!wasAvailable && willBeAvailable) {
        await Equipment.increment('availableQuantity', { by: 1, where: { id: item.equipmentId }, transaction: t });
      }
    });
  }

  const withEquipment = await Item.findByPk(item.id, {
    include: [{ model: Equipment, as: 'equipment', include: [{ model: Category, as: 'category' }] }]
  });
  res.json({ success: true, data: serializeItem(withEquipment) });
};

// This lookup route is intentionally public (no auth) so a QR sticker
// scanned by any phone camera, default QR app, or USB scanner resolves —
// but Item Codes are low-entropy and predictable (e.g. "BB-5-001"), so
// they're easy to enumerate. Returning a borrower's full name here would let
// anyone who just photographs a sticker learn exactly who has that item
// checked out, with no login at all. Masked to first name + last initial —
// enough for SDPO staff who already know their borrowers to recognize who
// has an item, without exposing a full name to an unauthenticated scan.
function maskBorrowerName(firstName, lastName) {
  const first = String(firstName || '').trim();
  const lastInitial = String(lastName || '').trim().charAt(0);
  return [first, lastInitial ? lastInitial + '.' : ''].filter(Boolean).join(' ') || 'Borrower';
}

exports.lookup = async (req, res) => {
  const item = await Item.findOne({
    where: { itemCode: req.params.itemCode },
    include: [
      { model: Equipment, as: 'equipment', include: [{ model: Category, as: 'category' }] },
      { model: Borrower, as: 'currentBorrower' },
      { model: TransactionDetail, as: 'transactionDetails', include: [{ model: Transaction, as: 'transaction' }] }
    ]
  });

  if (!item) {
    const err = new Error('Item Code not recognized');
    err.statusCode = 404;
    throw err;
  }

  const latestDetail = (item.transactionDetails || []).reduce((latest, d) => {
    const dTime = d.transaction ? new Date(d.transaction.requestDatetime || 0).getTime() : 0;
    const latestTime = latest && latest.transaction ? new Date(latest.transaction.requestDatetime || 0).getTime() : -1;
    return dTime > latestTime ? d : latest;
  }, null);

  res.json({
    success: true,
    data: {
      code: item.itemCode,
      name: item.equipment.equipmentName,
      category: item.equipment.category ? item.equipment.category.categoryName : null,
      condition: item.itemCondition,
      status: item.availabilityStatus,
      borrower: item.currentBorrower
        ? { name: maskBorrowerName(item.currentBorrower.firstName, item.currentBorrower.lastName), collegeOrUnit: item.currentBorrower.collegeOrUnit }
        : null,
      lastTransaction:
        latestDetail && latestDetail.transaction
          ? {
              status: latestDetail.transaction.transactionStatus,
              releaseDatetime: latestDetail.transaction.releaseDatetime,
              returnDatetime: latestDetail.transaction.returnDatetime,
              expectedReturnDatetime: latestDetail.transaction.expectedReturnDatetime
            }
          : null
    }
  });
};
