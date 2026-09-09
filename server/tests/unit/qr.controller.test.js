'use strict';

// Verifies server/controllers/qr.controller.js#lookup, focused on a real gap
// found during the S7 Phase 3 QR/scan audit: the scan-result overlay
// (client/pages/scan.html) is supposed to show Due Date alongside Checkout
// Timestamp for a borrowed item, but the API response backing it never
// included the transaction's expectedReturnDatetime at all — only
// releaseDatetime/returnDatetime. Also covers the existing not-found path.

jest.mock('../../models', () => ({
  Item: { findOne: jest.fn(), findByPk: jest.fn() },
  Equipment: { increment: jest.fn(), decrement: jest.fn() },
  Category: {},
  Borrower: {},
  TransactionDetail: {},
  Transaction: {},
  sequelize: { transaction: jest.fn((cb) => cb({})) }
}));

const { Item, Equipment, sequelize } = require('../../models');
const ctrl = require('../../controllers/qr.controller');

function mockRes() {
  return { json: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/qr/lookup/:itemCode (lookup)', () => {
  test('includes expectedReturnDatetime (Due Date) on the last transaction for a borrowed item', async () => {
    const item = {
      itemCode: 'BB-1-001',
      itemCondition: 'Good',
      availabilityStatus: 'Borrowed',
      equipment: { equipmentName: 'Basketball', category: { categoryName: 'Basketball' } },
      currentBorrower: { firstName: 'Juan', lastName: 'Dela Cruz', collegeOrUnit: 'CCS' },
      transactionDetails: [
        {
          transaction: {
            requestDatetime: '2026-08-20T00:00:00.000Z',
            transactionStatus: 'Released',
            releaseDatetime: '2026-08-21T09:00:00.000Z',
            returnDatetime: null,
            expectedReturnDatetime: '2026-08-28T17:00:00.000Z'
          }
        }
      ]
    };
    Item.findOne.mockResolvedValueOnce(item);

    const req = { params: { itemCode: 'BB-1-001' } };
    const res = mockRes();
    await ctrl.lookup(req, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.lastTransaction).toEqual(
      expect.objectContaining({ expectedReturnDatetime: '2026-08-28T17:00:00.000Z' })
    );
  });

  test('picks the most recent transaction by requestDatetime when an item has more than one', async () => {
    const item = {
      itemCode: 'BB-1-002',
      itemCondition: 'Good',
      availabilityStatus: 'Borrowed',
      equipment: { equipmentName: 'Basketball', category: null },
      currentBorrower: null,
      transactionDetails: [
        { transaction: { requestDatetime: '2026-01-01T00:00:00.000Z', transactionStatus: 'Completed', expectedReturnDatetime: '2026-01-05T00:00:00.000Z' } },
        { transaction: { requestDatetime: '2026-08-20T00:00:00.000Z', transactionStatus: 'Released', expectedReturnDatetime: '2026-08-28T00:00:00.000Z' } }
      ]
    };
    Item.findOne.mockResolvedValueOnce(item);

    const res = mockRes();
    await ctrl.lookup({ params: { itemCode: 'BB-1-002' } }, res);

    const payload = res.json.mock.calls[0][0];
    expect(payload.data.lastTransaction.expectedReturnDatetime).toBe('2026-08-28T00:00:00.000Z');
  });

  test('rejects with 404 when the Item Code is not recognized', async () => {
    Item.findOne.mockResolvedValueOnce(null);
    await expect(ctrl.lookup({ params: { itemCode: 'NOPE-000' } }, mockRes())).rejects.toMatchObject({
      statusCode: 404
    });
  });

  test('lastTransaction is null when the item has no transaction history', async () => {
    const item = {
      itemCode: 'BB-1-003',
      itemCondition: 'Good',
      availabilityStatus: 'Available',
      equipment: { equipmentName: 'Basketball', category: null },
      currentBorrower: null,
      transactionDetails: []
    };
    Item.findOne.mockResolvedValueOnce(item);

    const res = mockRes();
    await ctrl.lookup({ params: { itemCode: 'BB-1-003' } }, res);

    expect(res.json.mock.calls[0][0].data.lastTransaction).toBeNull();
  });

  // High #4 from the 2026-09-08 system audit: this route is intentionally
  // public/unauthenticated (any phone's default QR app or a USB scanner
  // needs it to work with no login), but Item Codes are low-entropy and
  // predictable — returning a borrower's full name let anyone who
  // photographed a sticker learn exactly who had it checked out.
  test('masks the current borrower to first name + last initial instead of a full name', async () => {
    const item = {
      itemCode: 'BB-1-004',
      itemCondition: 'Good',
      availabilityStatus: 'Borrowed',
      equipment: { equipmentName: 'Basketball', category: null },
      currentBorrower: { firstName: 'Juan', lastName: 'Dela Cruz', collegeOrUnit: 'CCS' },
      transactionDetails: []
    };
    Item.findOne.mockResolvedValueOnce(item);

    const res = mockRes();
    await ctrl.lookup({ params: { itemCode: 'BB-1-004' } }, res);

    const payload = res.json.mock.calls[0][0].data;
    expect(payload.borrower.name).toBe('Juan D.');
    expect(payload.borrower.name).not.toContain('Dela Cruz');
    // collegeOrUnit is low-sensitivity/aggregate — left as-is, still useful
    // context for staff without identifying the individual.
    expect(payload.borrower.collegeOrUnit).toBe('CCS');
  });

  test('borrower is null (not masked-empty) when the item currently has no borrower', async () => {
    const item = {
      itemCode: 'BB-1-005',
      itemCondition: 'Good',
      availabilityStatus: 'Available',
      equipment: { equipmentName: 'Basketball', category: null },
      currentBorrower: null,
      transactionDetails: []
    };
    Item.findOne.mockResolvedValueOnce(item);

    const res = mockRes();
    await ctrl.lookup({ params: { itemCode: 'BB-1-005' } }, res);

    expect(res.json.mock.calls[0][0].data.borrower).toBeNull();
  });
});

describe('PATCH /api/qr/items/:id/status (updateItemStatus)', () => {
  function mockItem(overrides = {}) {
    return {
      id: 1,
      equipmentId: 5,
      itemCode: 'BB-1-001',
      itemCondition: 'Good',
      availabilityStatus: 'Available',
      engravingStatus: 'Engraved',
      createdAt: '2026-01-01',
      save: jest.fn().mockResolvedValue(),
      ...overrides
    };
  }
  function mockWithEquipment(status) {
    return {
      itemCode: 'BB-1-001',
      itemCondition: 'Good',
      availabilityStatus: status,
      engravingStatus: 'Engraved',
      createdAt: '2026-01-01',
      equipmentId: 5,
      equipment: { equipmentName: 'Basketball', category: { categoryName: 'Basketball' } }
    };
  }

  test('moving Available -> Maintenance decrements availableQuantity', async () => {
    const item = mockItem({ availabilityStatus: 'Available' });
    Item.findByPk.mockResolvedValueOnce(item).mockResolvedValueOnce(mockWithEquipment('Maintenance'));

    const res = mockRes();
    await ctrl.updateItemStatus({ params: { id: '1' }, body: { status: 'Maintenance' } }, res);

    expect(item.availabilityStatus).toBe('Maintenance');
    expect(item.save).toHaveBeenCalledTimes(1);
    expect(Equipment.decrement).toHaveBeenCalledWith('availableQuantity', expect.objectContaining({ by: 1, where: { id: 5 } }));
    expect(Equipment.increment).not.toHaveBeenCalled();
    expect(res.json.mock.calls[0][0].data.status).toBe('Maintenance');
  });

  test('moving Maintenance -> Available increments availableQuantity', async () => {
    const item = mockItem({ availabilityStatus: 'Maintenance' });
    Item.findByPk.mockResolvedValueOnce(item).mockResolvedValueOnce(mockWithEquipment('Available'));

    await ctrl.updateItemStatus({ params: { id: '1' }, body: { status: 'Available' } }, mockRes());

    expect(Equipment.increment).toHaveBeenCalledWith('availableQuantity', expect.objectContaining({ by: 1, where: { id: 5 } }));
    expect(Equipment.decrement).not.toHaveBeenCalled();
  });

  test('moving Maintenance -> Decommissioned touches neither counter (was never counted available)', async () => {
    const item = mockItem({ availabilityStatus: 'Maintenance' });
    Item.findByPk.mockResolvedValueOnce(item).mockResolvedValueOnce(mockWithEquipment('Decommissioned'));

    await ctrl.updateItemStatus({ params: { id: '1' }, body: { status: 'Decommissioned' } }, mockRes());

    expect(Equipment.increment).not.toHaveBeenCalled();
    expect(Equipment.decrement).not.toHaveBeenCalled();
  });

  test('refuses to change the status of a currently-Borrowed item', async () => {
    const item = mockItem({ availabilityStatus: 'Borrowed' });
    Item.findByPk.mockResolvedValueOnce(item);

    await expect(
      ctrl.updateItemStatus({ params: { id: '1' }, body: { status: 'Maintenance' } }, mockRes())
    ).rejects.toMatchObject({ statusCode: 409 });
    expect(item.save).not.toHaveBeenCalled();
  });

  test('rejects an invalid target status with 400', async () => {
    const item = mockItem({ availabilityStatus: 'Available' });
    Item.findByPk.mockResolvedValueOnce(item);

    await expect(
      ctrl.updateItemStatus({ params: { id: '1' }, body: { status: 'Reserved' } }, mockRes())
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(item.save).not.toHaveBeenCalled();
  });

  test('404s when the item does not exist', async () => {
    Item.findByPk.mockResolvedValueOnce(null);
    await expect(
      ctrl.updateItemStatus({ params: { id: '999' }, body: { status: 'Maintenance' } }, mockRes())
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  test('no-ops cleanly (no save, no counter change) when the status is already the target', async () => {
    const item = mockItem({ availabilityStatus: 'Maintenance' });
    Item.findByPk.mockResolvedValueOnce(item).mockResolvedValueOnce(mockWithEquipment('Maintenance'));

    await ctrl.updateItemStatus({ params: { id: '1' }, body: { status: 'Maintenance' } }, mockRes());

    expect(item.save).not.toHaveBeenCalled();
    expect(Equipment.increment).not.toHaveBeenCalled();
    expect(Equipment.decrement).not.toHaveBeenCalled();
  });
});
