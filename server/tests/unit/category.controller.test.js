'use strict';

// Verifies server/controllers/category.controller.js — previously zero
// test coverage (High #3, 2026-09-08 system audit). Small file, small
// test file to match: one endpoint, listing categories alphabetically.

jest.mock('../../models', () => ({
  Category: { findAll: jest.fn() }
}));

const { Category } = require('../../models');
const ctrl = require('../../controllers/category.controller');

function mockRes() {
  return { json: jest.fn() };
}

describe('GET /api/categories', () => {
  test('orders by categoryName ascending and serializes id/categoryName/description', async () => {
    Category.findAll.mockResolvedValue([
      { id: 2, categoryName: 'Track & Field', description: 'Running/jumping gear', extraInternalField: 'ignored' },
      { id: 1, categoryName: 'Ball Sports', description: null }
    ]);

    const res = mockRes();
    await ctrl.list({}, res);

    expect(Category.findAll).toHaveBeenCalledWith({ order: [['categoryName', 'ASC']] });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: [
        { id: 2, categoryName: 'Track & Field', description: 'Running/jumping gear' },
        { id: 1, categoryName: 'Ball Sports', description: null }
      ]
    });
    // Confirms serialize() doesn't leak arbitrary model fields through.
    expect(res.json.mock.calls[0][0].data[0]).not.toHaveProperty('extraInternalField');
  });

  test('returns an empty list without error when there are no categories', async () => {
    Category.findAll.mockResolvedValue([]);

    const res = mockRes();
    await ctrl.list({}, res);

    expect(res.json).toHaveBeenCalledWith({ success: true, data: [] });
  });
});
