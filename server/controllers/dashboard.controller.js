'use strict';

const { Equipment, Category, Transaction } = require('../models');

const DAY_MS = 24 * 60 * 60 * 1000;

function niceMax(value) {
  if (value <= 0) return 10;
  const step = value <= 20 ? 5 : value <= 100 ? 10 : Math.ceil(value / 50) * 10;
  return Math.ceil(value / step) * step;
}

function lastNDays(n) {
  const days = [];
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = n - 1; i >= 0; i--) {
    days.push(new Date(today.getTime() - i * DAY_MS));
  }
  return days;
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

exports.summary = async (req, res) => {
  const [equipment, transactions] = await Promise.all([
    Equipment.findAll({ include: [{ model: Category, as: 'category' }] }),
    Transaction.findAll()
  ]);

  const totalEquipment = equipment.reduce((n, e) => n + e.totalQuantity, 0);
  const availableEquipment = equipment.reduce((n, e) => n + e.availableQuantity, 0);
  const borrowedEquipment = Math.max(totalEquipment - availableEquipment, 0);
  const availablePercent = totalEquipment > 0 ? Math.round((availableEquipment / totalEquipment) * 100) : 0;

  const thirtyDaysAgo = new Date(Date.now() - 30 * DAY_MS);
  const recentlyAdded = equipment.filter((e) => e.createdAt && new Date(e.createdAt) >= thirtyDaysAgo).length;

  const now = new Date();
  const overdueCount = transactions.filter(
    (t) => t.transactionStatus === 'Released' && t.expectedReturnDatetime && new Date(t.expectedReturnDatetime) < now
  ).length;

  // Usage trend — borrowed (released) vs returned counts per day, last 7 calendar days.
  const days = lastNDays(7);
  const borrowedByDay = days.map((day) => transactions.filter((t) => t.releaseDatetime && sameDay(new Date(t.releaseDatetime), day)).length);
  const returnedByDay = days.map((day) => transactions.filter((t) => t.returnDatetime && sameDay(new Date(t.returnDatetime), day)).length);
  const trendMax = niceMax(Math.max(...borrowedByDay, ...returnedByDay, 1));

  // Category distribution — share of total equipment units per category, top 5 + "Other".
  const byCategory = new Map();
  equipment.forEach((e) => {
    const name = e.category ? e.category.categoryName : 'Uncategorized';
    byCategory.set(name, (byCategory.get(name) || 0) + e.totalQuantity);
  });
  const sortedCategories = Array.from(byCategory.entries()).sort((a, b) => b[1] - a[1]);
  const top = sortedCategories.slice(0, 5);
  const restTotal = sortedCategories.slice(5).reduce((n, [, qty]) => n + qty, 0);
  if (restTotal > 0) top.push(['Other', restTotal]);
  const categoryDistribution = top.map(([categoryName, qty]) => ({
    categoryName,
    quantity: qty,
    percent: totalEquipment > 0 ? Math.round((qty / totalEquipment) * 100) : 0
  }));

  res.json({
    success: true,
    data: {
      totalEquipment,
      recentlyAdded,
      availableEquipment,
      availablePercent,
      borrowedEquipment,
      overdueCount,
      usageTrend: {
        labels: days.map((d) => d.toLocaleDateString([], { weekday: 'short' })),
        borrowed: borrowedByDay,
        returned: returnedByDay,
        max: trendMax
      },
      categoryDistribution
    }
  });
};
