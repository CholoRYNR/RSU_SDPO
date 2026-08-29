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
        ? { name: `${item.currentBorrower.firstName} ${item.currentBorrower.lastName}`, collegeOrUnit: item.currentBorrower.collegeOrUnit }
        : null,
      lastTransaction:
        latestDetail && latestDetail.transaction
          ? {
              status: latestDetail.transaction.transactionStatus,
              releaseDatetime: latestDetail.transaction.releaseDatetime,
              returnDatetime: latestDetail.transaction.returnDatetime
            }
          : null
    }
  });
};
