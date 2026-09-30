'use strict';

const { Op } = require('sequelize');
const { Category } = require('../models');

exports.list = async (req, res) => {
  const rows = await Category.findAll({ order: [['categoryName', 'ASC']] });
  res.json({
    success: true,
    data: rows.map((c) => ({ id: c.id, categoryName: c.categoryName, description: c.description }))
  });
};

// Lets Admin/Director/Staff add a new equipment category from the Equipment
// Showroom's Add/Edit form, instead of being limited to the 14 categories
// seeded when this system launched (server/database/seeders/001_seed_categories.js).
// No abbreviation needs to be registered anywhere for the new category to
// work end to end: item-code generation (qr.controller.js#generate) already
// falls back to the category name's first 3 letters, uppercased, for any
// name not in server/constants/categoryAbbreviations.js, and the Equipment
// Showroom's product-photo lookup (client/js/equipment/equipment.js#categoryImage)
// already falls back to a generic icon for any category without a photo —
// both were designed for exactly this.
exports.create = async (req, res) => {
  const categoryName = String(req.body.categoryName || '').trim();
  const description = String(req.body.description || '').trim() || null;

  if (!categoryName) {
    const err = new Error('Category name is required');
    err.statusCode = 400;
    throw err;
  }
  if (categoryName.length > 150) {
    const err = new Error('Category name must be 150 characters or fewer');
    err.statusCode = 400;
    throw err;
  }

  // Case-insensitive check, not just the model's own case-sensitive unique
  // constraint — "basketball" and "Basketball" would otherwise both save
  // successfully as two distinct categories that only differ by casing,
  // splitting one equipment type's inventory across both in every filter,
  // report, and stat that groups by category.
  const existing = await Category.findOne({ where: { categoryName: { [Op.iLike]: categoryName } } });
  if (existing) {
    const err = new Error(`A category named "${existing.categoryName}" already exists`);
    err.statusCode = 409;
    throw err;
  }

  const created = await Category.create({ categoryName, description });
  res.status(201).json({
    success: true,
    data: { id: created.id, categoryName: created.categoryName, description: created.description }
  });
};
