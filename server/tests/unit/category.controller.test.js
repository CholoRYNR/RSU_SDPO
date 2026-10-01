'use strict';

// Verifies server/controllers/category.controller.js — previously zero
// test coverage (High #3, 2026-09-08 system audit). Small file, small
// test file to match: one endpoint, listing categories alphabetically.
//
// 2026-09-30: added POST /api/categories (exports.create), for the
// Equipment Showroom's new "+ Add New" category flow — see
// claude/RSU_SDPO_Add_Category_2026-09-30.md.

jest.mock('../../models', () => ({
  Category: { findAll: jest.fn(), findOne: jest.fn(), create: jest.fn() }
}));

const { Op } = require('sequelize');
const { Category } = require('../../models');
const ctrl = require('../../controllers/category.controller');

function mockRes() {
  return { json: jest.fn(), status: jest.fn().mockReturnThis() };
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

describe('POST /api/categories (create)', () => {
  beforeEach(() => jest.clearAllMocks());

  test('trims the name, defaults a blank description to null, and returns 201', async () => {
    Category.findOne.mockResolvedValue(null); // no case-insensitive duplicate
    Category.create.mockResolvedValue({ id: 15, categoryName: 'Track & Field', description: null });

    const req = { body: { categoryName: '  Track & Field  ', description: '   ' } };
    const res = mockRes();
    await ctrl.create(req, res);

    expect(Category.create).toHaveBeenCalledWith({ categoryName: 'Track & Field', description: null });
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { id: 15, categoryName: 'Track & Field', description: null }
    });
  });

  test('keeps a real, trimmed description', async () => {
    Category.findOne.mockResolvedValue(null);
    Category.create.mockResolvedValue({ id: 16, categoryName: 'Chess', description: 'Boards, clocks, pieces' });

    const req = { body: { categoryName: 'Chess', description: '  Boards, clocks, pieces  ' } };
    const res = mockRes();
    await ctrl.create(req, res);

    expect(Category.create).toHaveBeenCalledWith({ categoryName: 'Chess', description: 'Boards, clocks, pieces' });
  });

  test('rejects a missing/blank category name with 400, without querying the database', async () => {
    const res = mockRes();
    await expect(ctrl.create({ body: { categoryName: '   ' } }, res)).rejects.toMatchObject({
      statusCode: 400,
      message: 'Category name is required'
    });
    expect(Category.findOne).not.toHaveBeenCalled();
    expect(Category.create).not.toHaveBeenCalled();
  });

  test('rejects a category name over 150 characters with 400', async () => {
    const res = mockRes();
    const tooLong = 'A'.repeat(151);
    await expect(ctrl.create({ body: { categoryName: tooLong } }, res)).rejects.toMatchObject({
      statusCode: 400
    });
    expect(Category.create).not.toHaveBeenCalled();
  });

  test('rejects a case-insensitive duplicate with 409, naming the existing category as stored', async () => {
    Category.findOne.mockResolvedValue({ id: 3, categoryName: 'Basketball', description: null });

    const req = { body: { categoryName: 'basketball' } }; // different casing
    const res = mockRes();
    await expect(ctrl.create(req, res)).rejects.toMatchObject({
      statusCode: 409,
      message: 'A category named "Basketball" already exists'
    });
    expect(Category.create).not.toHaveBeenCalled();
  });

  test('the duplicate check is case-insensitive via Op.iLike, scoped to categoryName', async () => {
    Category.findOne.mockResolvedValue(null);
    Category.create.mockResolvedValue({ id: 17, categoryName: 'Archery', description: null });

    await ctrl.create({ body: { categoryName: 'Archery' } }, mockRes());

    const whereArg = Category.findOne.mock.calls[0][0].where;
    expect(Object.keys(whereArg)).toEqual(['categoryName']);
    // Op.iLike is a Symbol key, invisible to Object.values/Object.keys —
    // read it directly to confirm this is an exact (non-wildcard)
    // case-insensitive match on the trimmed name, not e.g. a substring
    // search that could false-positive against an unrelated category.
    expect(whereArg.categoryName[Op.iLike]).toBe('Archery');
  });
});
