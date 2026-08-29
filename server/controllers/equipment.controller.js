'use strict';

const { Equipment, Category, Item } = require('../models');

function serialize(equipment) {
  return {
    id: equipment.id,
    equipmentName: equipment.equipmentName,
    categoryId: equipment.categoryId,
    category: equipment.category ? { id: equipment.category.id, categoryName: equipment.category.categoryName } : null,
    totalQuantity: equipment.totalQuantity,
    availableQuantity: equipment.availableQuantity,
    description: equipment.description
  };
}

exports.list = async (req, res) => {
  const rows = await Equipment.findAll({
    include: [{ model: Category, as: 'category' }],
    order: [['equipmentName', 'ASC']]
  });
  res.json({ success: true, data: rows.map(serialize) });
};

exports.getOne = async (req, res) => {
  const equipment = await Equipment.findByPk(req.params.id, { include: [{ model: Category, as: 'category' }] });
  if (!equipment) {
    const err = new Error('Equipment not found');
    err.statusCode = 404;
    throw err;
  }
  res.json({ success: true, data: serialize(equipment) });
};

exports.create = async (req, res) => {
  const { equipmentName, categoryId, totalQuantity, description } = req.body;
  if (!equipmentName || !categoryId || !totalQuantity || Number(totalQuantity) < 1) {
    const err = new Error('equipmentName, categoryId, and a totalQuantity of at least 1 are required');
    err.statusCode = 400;
    throw err;
  }
  // availableQuantity starts at 0, not totalQuantity — no physical items exist
  // for this equipment until they're actually QR-registered via QR Management
  // (see qr.controller.js#generate, which increments this as items are created).
  const created = await Equipment.create({
    equipmentName,
    categoryId,
    totalQuantity,
    availableQuantity: 0,
    description: description || null
  });
  const withCategory = await Equipment.findByPk(created.id, { include: [{ model: Category, as: 'category' }] });
  res.status(201).json({ success: true, data: serialize(withCategory) });
};

exports.update = async (req, res) => {
  const equipment = await Equipment.findByPk(req.params.id);
  if (!equipment) {
    const err = new Error('Equipment not found');
    err.statusCode = 404;
    throw err;
  }
  const { equipmentName, categoryId, totalQuantity, description } = req.body;

  if (totalQuantity !== undefined) {
    const issued = equipment.totalQuantity - equipment.availableQuantity;
    if (Number(totalQuantity) < issued) {
      const err = new Error(`Total quantity cannot be less than ${issued} — that many items are already issued`);
      err.statusCode = 400;
      throw err;
    }
    // Raising totalQuantity only raises the ceiling — the new capacity isn't
    // actually available until items are QR-registered for it (same reason
    // create() no longer pre-fills availableQuantity). Lowering it does
    // reduce availableQuantity, since that capacity is being removed outright.
    const delta = Number(totalQuantity) - equipment.totalQuantity;
    if (delta < 0) equipment.availableQuantity = Math.max(equipment.availableQuantity + delta, 0);
    equipment.totalQuantity = totalQuantity;
  }
  if (equipmentName !== undefined) equipment.equipmentName = equipmentName;
  if (categoryId !== undefined) equipment.categoryId = categoryId;
  if (description !== undefined) equipment.description = description;

  await equipment.save();
  const withCategory = await Equipment.findByPk(equipment.id, { include: [{ model: Category, as: 'category' }] });
  res.json({ success: true, data: serialize(withCategory) });
};

exports.remove = async (req, res) => {
  const equipment = await Equipment.findByPk(req.params.id);
  if (!equipment) {
    const err = new Error('Equipment not found');
    err.statusCode = 404;
    throw err;
  }
  const itemCount = await Item.count({ where: { equipmentId: equipment.id } });
  if (itemCount > 0) {
    const err = new Error(`Cannot delete — ${itemCount} item(s)/QR code(s) already exist for this equipment`);
    err.statusCode = 409;
    throw err;
  }
  await equipment.destroy();
  res.json({ success: true, data: { id: Number(req.params.id) } });
};
