'use strict';

const { Category } = require('../models');

exports.list = async (req, res) => {
  const rows = await Category.findAll({ order: [['categoryName', 'ASC']] });
  res.json({
    success: true,
    data: rows.map((c) => ({ id: c.id, categoryName: c.categoryName, description: c.description }))
  });
};
