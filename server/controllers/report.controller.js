'use strict';

const { Op } = require('sequelize');
const { Transaction, TransactionDetail, Equipment, Category, Item, Borrower, User } = require('../models');
const { INCLUDE, serialize } = require('./borrow.controller');

function fmtDate(d) {
  return d ? new Date(d).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
}

// Every report is filtered to a quarter+year window over requestDatetime,
// same convention as the existing transactionLog calendar report below.
function quarterRange(req) {
  const now = new Date();
  const year = parseInt(req.query.year, 10) || now.getFullYear();
  const quarter = parseInt(req.query.quarter, 10) || Math.floor(now.getMonth() / 3) + 1;
  const startMonth = (quarter - 1) * 3;
  const start = new Date(year, startMonth, 1);
  const end = new Date(year, startMonth + 3, 1);
  return { year, quarter, start, end };
}

const TXN_INCLUDE_FOR_REPORTS = [
  { model: Borrower, as: 'borrower' },
  {
    model: TransactionDetail,
    as: 'details',
    include: [{ model: Item, as: 'item', include: [{ model: Equipment, as: 'equipment', include: [{ model: Category, as: 'category' }] }] }]
  }
];

function txnCode(t) {
  return `TXN-${new Date(t.requestDatetime || t.createdAt).getFullYear()}-${String(t.id).padStart(4, '0')}`;
}

exports.borrowing = async (req, res) => {
  const { start, end } = quarterRange(req);
  const txns = await Transaction.findAll({
    where: { requestDatetime: { [Op.gte]: start, [Op.lt]: end } },
    include: TXN_INCLUDE_FOR_REPORTS,
    order: [['requestDatetime', 'ASC']]
  });

  const data = [];
  txns.forEach((t) => {
    const byEquipment = new Map();
    (t.details || []).forEach((d) => {
      const name = d.item && d.item.equipment ? d.item.equipment.equipmentName : 'Unknown';
      byEquipment.set(name, (byEquipment.get(name) || 0) + 1);
    });
    const borrowerName = t.borrower ? `${t.borrower.firstName} ${t.borrower.lastName}` : 'Unknown Borrower';
    byEquipment.forEach((qty, name) => {
      data.push([txnCode(t), borrowerName, name, String(qty), fmtDate(t.requestDatetime), fmtDate(t.expectedReturnDatetime), t.transactionStatus]);
    });
  });

  const approved = txns.filter((t) => t.transactionStatus !== 'Pending').length;
  const completed = txns.filter((t) => ['Returned', 'Completed'].includes(t.transactionStatus)).length;

  res.json({
    success: true,
    data: {
      title: 'BORROWING REPORT',
      heads: ['Transaction No.', 'Borrower', 'Equipment', 'Qty', 'Borrow Date', 'Expected Return', 'Status'],
      data,
      stats: [
        ['Total Borrowing Requests', String(txns.length)],
        ['Approved Requests', String(approved)],
        ['Completed Transactions', String(completed)]
      ]
    }
  });
};

exports.overdue = async (req, res) => {
  const { start, end } = quarterRange(req);
  const now = new Date();
  const txns = await Transaction.findAll({
    where: {
      requestDatetime: { [Op.gte]: start, [Op.lt]: end },
      [Op.or]: [
        { transactionStatus: 'Overdue' },
        { transactionStatus: 'Released', expectedReturnDatetime: { [Op.lt]: now } }
      ]
    },
    include: TXN_INCLUDE_FOR_REPORTS,
    order: [['expectedReturnDatetime', 'ASC']]
  });

  const data = [];
  txns.forEach((t) => {
    const borrowerName = t.borrower ? `${t.borrower.firstName} ${t.borrower.lastName}` : 'Unknown Borrower';
    const byEquipment = new Map();
    (t.details || []).forEach((d) => {
      const name = d.item && d.item.equipment ? d.item.equipment.equipmentName : 'Unknown';
      byEquipment.set(name, (byEquipment.get(name) || 0) + 1);
    });
    const daysOverdue = t.expectedReturnDatetime ? Math.max(Math.floor((now - new Date(t.expectedReturnDatetime)) / 86400000), 0) : 0;
    byEquipment.forEach((qty, name) => {
      data.push([borrowerName, name, String(qty), fmtDate(t.expectedReturnDatetime), String(daysOverdue)]);
    });
  });

  const restrictedBorrowers = await User.count({ where: { accountStatus: 'Restricted' } });

  res.json({
    success: true,
    data: {
      title: 'OVERDUE REPORT',
      heads: ['Borrower', 'Equipment', 'Qty', 'Due Date', 'Days Overdue'],
      data,
      stats: [
        ['Total Overdue Transactions', String(txns.length)],
        ['Restricted Borrowers', String(restrictedBorrowers)]
      ]
    }
  });
};

exports.utilization = async (req, res) => {
  const { start, end } = quarterRange(req);
  const [equipment, details] = await Promise.all([
    Equipment.findAll({ include: [{ model: Category, as: 'category' }] }),
    TransactionDetail.findAll({
      include: [
        { model: Transaction, as: 'transaction', attributes: ['requestDatetime'], where: { requestDatetime: { [Op.gte]: start, [Op.lt]: end } } },
        { model: Item, as: 'item', attributes: ['equipmentId'] }
      ]
    })
  ]);

  const countByEquipment = new Map();
  details.forEach((d) => {
    const id = d.item ? d.item.equipmentId : null;
    if (id == null) return;
    countByEquipment.set(id, (countByEquipment.get(id) || 0) + 1);
  });

  const data = equipment.map((e) => [
    e.equipmentName,
    e.category ? e.category.categoryName : '—',
    String(countByEquipment.get(e.id) || 0),
    String(e.availableQuantity)
  ]);

  res.json({
    success: true,
    data: {
      title: 'EQUIPMENT UTILIZATION REPORT',
      heads: ['Equipment', 'Category', 'Times Borrowed', 'Available Quantity'],
      data,
      stats: [
        ['Total Equipment', String(equipment.length)],
        ['Total Borrowing Transactions', String(details.length)]
      ]
    }
  });
};

exports.history = async (req, res) => {
  const { start, end } = quarterRange(req);
  const txns = await Transaction.findAll({
    where: { requestDatetime: { [Op.gte]: start, [Op.lt]: end } },
    include: TXN_INCLUDE_FOR_REPORTS,
    order: [['requestDatetime', 'ASC']]
  });

  const data = [];
  txns.forEach((t) => {
    const borrowerName = t.borrower ? `${t.borrower.firstName} ${t.borrower.lastName}` : 'Unknown Borrower';
    const byEquipment = new Map();
    (t.details || []).forEach((d) => {
      const name = d.item && d.item.equipment ? d.item.equipment.equipmentName : 'Unknown';
      byEquipment.set(name, (byEquipment.get(name) || 0) + 1);
    });
    byEquipment.forEach((qty, name) => {
      data.push([fmtDate(t.requestDatetime), txnCode(t), borrowerName, `${name} (${qty})`, 'Borrowed', t.transactionStatus]);
      if (t.returnDatetime && new Date(t.returnDatetime) >= start && new Date(t.returnDatetime) < end) {
        data.push([fmtDate(t.returnDatetime), txnCode(t), borrowerName, `${name} (${qty})`, 'Returned', t.transactionStatus]);
      }
    });
  });

  res.json({
    success: true,
    data: {
      title: 'TRANSACTION HISTORY REPORT',
      heads: ['Date', 'Transaction No.', 'Borrower', 'Equipment', 'Action', 'Status'],
      data,
      stats: [['Total Transactions', String(txns.length)]]
    }
  });
};

exports.inventory = async (req, res) => {
  const equipment = await Equipment.findAll({
    include: [
      { model: Category, as: 'category' },
      { model: Item, as: 'items' }
    ],
    order: [['equipmentName', 'ASC']]
  });

  let missingItems = 0;
  const data = equipment.map((e) => {
    const registered = (e.items || []).length;
    // Borrowed = registered items currently checked out, not totalQuantity
    // minus available — that would count never-registered capacity as
    // "borrowed" when it's really just missing QR items (see missingItems).
    const borrowed = Math.max(registered - e.availableQuantity, 0);
    if (registered === 0 && e.totalQuantity > 0) missingItems += 1;
    return [
      e.equipmentName,
      e.category ? e.category.categoryName : '—',
      String(e.totalQuantity),
      String(e.availableQuantity),
      String(borrowed),
      String(registered)
    ];
  });

  const totalUnits = equipment.reduce((n, e) => n + e.totalQuantity, 0);
  const totalAvailable = equipment.reduce((n, e) => n + e.availableQuantity, 0);

  res.json({
    success: true,
    data: {
      title: 'EQUIPMENT INVENTORY REPORT',
      heads: ['Equipment', 'Category', 'Total Qty', 'Available', 'Borrowed', 'Items Registered (QR)'],
      data,
      stats: [
        ['Total Equipment Types', String(equipment.length)],
        ['Total Units', String(totalUnits)],
        ['Total Units Available', String(totalAvailable)],
        ['Equipment Missing QR/Items', String(missingItems)]
      ]
    }
  });
};

exports.condition = async (req, res) => {
  const equipment = await Equipment.findAll({
    include: [
      { model: Category, as: 'category' },
      { model: Item, as: 'items' }
    ]
  });

  let goodUnits = 0;
  let damagedUnits = 0;
  let lostUnits = 0;

  const data = equipment.map((e) => {
    const items = e.items || [];
    const counts = { Good: 0, Damaged: 0, 'Under Repair': 0, Lost: 0 };
    items.forEach((i) => { counts[i.itemCondition] = (counts[i.itemCondition] || 0) + 1; });
    goodUnits += counts.Good;
    damagedUnits += counts.Damaged;
    lostUnits += counts.Lost;

    const worst = counts.Lost ? 'Lost' : counts.Damaged ? 'Damaged' : counts['Under Repair'] ? 'Under Repair' : 'Good';
    const remarks =
      worst === 'Good'
        ? 'All units serviceable'
        : `${counts[worst]} unit${counts[worst] === 1 ? '' : 's'} ${worst.toLowerCase()}`;

    return [e.equipmentName, e.category ? e.category.categoryName : '—', String(items.length), worst, remarks];
  });

  res.json({
    success: true,
    data: {
      title: 'EQUIPMENT CONDITION REPORT',
      heads: ['Equipment', 'Category', 'Quantity', 'Condition', 'Remarks'],
      data,
      stats: [
        ['Good Units', String(goodUnits)],
        ['Damaged Units', String(damagedUnits)],
        ['Lost Units', String(lostUnits)]
      ]
    }
  });
};

// Groups every transaction requested during the given month by the day of
// month it was requested on, for the Transaction Log Report calendar.
exports.transactionLog = async (req, res) => {
  const now = new Date();
  const year = parseInt(req.query.year, 10) || now.getFullYear();
  const month = parseInt(req.query.month, 10) || now.getMonth() + 1; // 1-12

  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 1); // exclusive

  const rows = await Transaction.findAll({
    where: { requestDatetime: { [Op.gte]: start, [Op.lt]: end } },
    include: INCLUDE,
    order: [['requestDatetime', 'ASC']]
  });

  const byDay = {};
  rows.forEach((t) => {
    const day = new Date(t.requestDatetime).getDate();
    if (!byDay[day]) byDay[day] = [];
    byDay[day].push(serialize(t));
  });

  res.json({ success: true, data: { year, month, byDay } });
};
