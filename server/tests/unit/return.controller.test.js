'use strict';

// Verifies server/controllers/return.controller.js — previously zero test
// coverage (High #3, 2026-09-08 system audit) despite implementing the
// entire Step 5 (Return) workflow: per-item condition recording, Damage/
// Loss Record creation, borrower auto-restriction, and the transaction's
// final status (Completed vs. For Resolution).

jest.mock('../../models', () => ({
  Equipment: { increment: jest.fn() },
  User: { findByPk: jest.fn() },
  DamageLossRecord: { create: jest.fn() },
  sequelize: { transaction: jest.fn() }
}));
jest.mock('../../controllers/borrow.controller', () => ({
  serialize: jest.fn((t) => ({ serialized: true, id: t.id })),
  loadTransactionOr404: jest.fn(),
  assertStatusIn: jest.fn()
}));
jest.mock('../../helpers/notify', () => ({ notifyBorrower: jest.fn() }));
jest.mock('../../helpers/transactionLog', () => ({ logStatusChange: jest.fn() }));

const { Equipment, User, DamageLossRecord, sequelize } = require('../../models');
const { serialize, loadTransactionOr404, assertStatusIn } = require('../../controllers/borrow.controller');
const { notifyBorrower } = require('../../helpers/notify');
const { logStatusChange } = require('../../helpers/transactionLog');
const ctrl = require('../../controllers/return.controller');

function mockRes() {
  return { json: jest.fn() };
}

function makeDetail(itemOverrides = {}) {
  return {
    update: jest.fn().mockResolvedValue(undefined),
    item: {
      id: itemOverrides.id ?? 1,
      itemCode: itemOverrides.itemCode ?? 'BB-1-0001',
      equipmentId: itemOverrides.equipmentId ?? 10,
      update: jest.fn().mockResolvedValue(undefined)
    }
  };
}

function makeTxn(overrides = {}) {
  return Object.assign(
    {
      id: 7,
      borrowerId: 3,
      transactionStatus: 'Released',
      details: [makeDetail()],
      borrower: { user: { id: 5 } },
      save: jest.fn().mockResolvedValue(undefined)
    },
    overrides
  );
}

function req(items, userId = 9) {
  return { params: { id: 7 }, body: { items }, user: { id: userId } };
}

beforeEach(() => {
  jest.clearAllMocks();
  sequelize.transaction.mockImplementation((cb) => cb({}));
  assertStatusIn.mockImplementation(() => {}); // passes by default
  User.findByPk.mockResolvedValue({ id: 1, accountStatus: 'Active', save: jest.fn().mockResolvedValue(undefined) });
  DamageLossRecord.create.mockImplementation((data) => Promise.resolve(Object.assign({ id: 100 }, data)));
});

describe('POST /api/borrow/:id/return — validation', () => {
  test('rejects with 400 when items is missing', async () => {
    await expect(ctrl.returnTransaction({ params: { id: 7 }, body: {}, user: { id: 9 } }, mockRes())).rejects.toMatchObject({
      statusCode: 400
    });
    expect(loadTransactionOr404).not.toHaveBeenCalled();
  });

  test('rejects with 400 when items is an empty array', async () => {
    await expect(ctrl.returnTransaction(req([]), mockRes())).rejects.toMatchObject({ statusCode: 400 });
  });

  test('rejects with 400 when a line is missing itemCode', async () => {
    await expect(ctrl.returnTransaction(req([{ condition: 'Good' }]), mockRes())).rejects.toMatchObject({ statusCode: 400 });
  });

  test('rejects with 400 when a line has an invalid condition', async () => {
    await expect(
      ctrl.returnTransaction(req([{ itemCode: 'BB-1-0001', condition: 'Fine' }]), mockRes())
    ).rejects.toMatchObject({ statusCode: 400 });
  });

  test('rejects with 400 when a returned item in the transaction has no matching line', async () => {
    loadTransactionOr404.mockResolvedValue(makeTxn({ details: [makeDetail({ itemCode: 'BB-1-0001' }), makeDetail({ itemCode: 'BB-1-0002' })] }));

    await expect(
      ctrl.returnTransaction(req([{ itemCode: 'BB-1-0001', condition: 'Good' }]), mockRes())
    ).rejects.toMatchObject({ statusCode: 400, message: expect.stringContaining('BB-1-0002') });
  });

  test('delegates the status check to assertStatusIn with [Released, Overdue] — an Overdue transaction must be returnable', async () => {
    const txn = makeTxn({ transactionStatus: 'Overdue' });
    loadTransactionOr404.mockResolvedValue(txn);

    await ctrl.returnTransaction(req([{ itemCode: 'BB-1-0001', condition: 'Good' }]), mockRes());

    expect(assertStatusIn).toHaveBeenCalledWith(txn, ['Released', 'Overdue']);
  });

  test('propagates the error assertStatusIn throws (e.g. a transaction that is not Released/Overdue)', async () => {
    loadTransactionOr404.mockResolvedValue(makeTxn());
    assertStatusIn.mockImplementation(() => {
      const err = new Error('This action requires the transaction to be "Released" or "Overdue"');
      err.statusCode = 409;
      throw err;
    });

    await expect(ctrl.returnTransaction(req([{ itemCode: 'BB-1-0001', condition: 'Good' }]), mockRes())).rejects.toMatchObject({
      statusCode: 409
    });
  });
});

describe('POST /api/borrow/:id/return — all items returned Good', () => {
  test('restores the item to Available, increments availableQuantity, and completes the transaction', async () => {
    const detail = makeDetail({ itemCode: 'BB-1-0001', equipmentId: 42 });
    const txn = makeTxn({ details: [detail] });
    loadTransactionOr404.mockResolvedValue(txn);

    const res = mockRes();
    await ctrl.returnTransaction(req([{ itemCode: 'BB-1-0001', condition: 'Good' }]), res);

    expect(detail.update).toHaveBeenCalledWith({ returnedCondition: 'Good', conditionNotes: null }, { transaction: {} });
    expect(detail.item.update).toHaveBeenCalledWith(
      { availabilityStatus: 'Available', itemCondition: 'Good', currentBorrowerId: null },
      { transaction: {} }
    );
    expect(Equipment.increment).toHaveBeenCalledWith('availableQuantity', { by: 1, where: { id: 42 }, transaction: {} });
    expect(DamageLossRecord.create).not.toHaveBeenCalled();

    expect(txn.transactionStatus).toBe('Completed');
    expect(txn.returnedBy).toBe(9);
    expect(txn.save).toHaveBeenCalledTimes(1);
    expect(logStatusChange).toHaveBeenCalledWith(7, 9, 'Released', 'Completed', 'Returned in good condition');

    expect(User.findByPk).not.toHaveBeenCalled(); // no restriction path taken
    expect(notifyBorrower).toHaveBeenCalledWith(5, expect.stringContaining('good condition'), 'Return');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { serialized: true, id: 7 } });
  });

  test('carries returnedCondition notes through to the detail record', async () => {
    const detail = makeDetail({ itemCode: 'BB-1-0001' });
    loadTransactionOr404.mockResolvedValue(makeTxn({ details: [detail] }));

    await ctrl.returnTransaction(req([{ itemCode: 'BB-1-0001', condition: 'Good', notes: 'Slightly scuffed but fine' }]), mockRes());

    expect(detail.update).toHaveBeenCalledWith(
      { returnedCondition: 'Good', conditionNotes: 'Slightly scuffed but fine' },
      { transaction: {} }
    );
  });
});

describe('POST /api/borrow/:id/return — Damaged/Lost items', () => {
  test('creates a DamageLossRecord, leaves the item out of the lending pool, and does not restore availableQuantity', async () => {
    const detail = makeDetail({ itemCode: 'BB-1-0001', equipmentId: 42, id: 55 });
    const txn = makeTxn({ details: [detail], borrowerId: 3 });
    loadTransactionOr404.mockResolvedValue(txn);

    await ctrl.returnTransaction(req([{ itemCode: 'BB-1-0001', condition: 'Damaged', notes: 'Cracked backboard' }], 9), mockRes());

    expect(detail.item.update).toHaveBeenCalledWith({ itemCondition: 'Damaged' }, { transaction: {} });
    // Deliberately NOT called with availabilityStatus/currentBorrowerId reset.
    expect(detail.item.update).not.toHaveBeenCalledWith(
      expect.objectContaining({ availabilityStatus: expect.anything() }),
      expect.anything()
    );
    expect(Equipment.increment).not.toHaveBeenCalled();

    expect(DamageLossRecord.create).toHaveBeenCalledWith(
      {
        transactionId: 7,
        borrowerId: 3,
        itemId: 55,
        incidentType: 'Damaged',
        dateReported: expect.any(Date),
        conditionDetails: 'Cracked backboard',
        recordedBy: 9
      },
      { transaction: {} }
    );
  });

  test('flips the transaction to For Resolution and restricts the borrower account', async () => {
    const savedUser = { id: 1, accountStatus: 'Active', save: jest.fn().mockResolvedValue(undefined) };
    User.findByPk.mockResolvedValue(savedUser);
    const txn = makeTxn({ borrower: { user: { id: 5 } } });
    loadTransactionOr404.mockResolvedValue(txn);

    await ctrl.returnTransaction(req([{ itemCode: 'BB-1-0001', condition: 'Lost' }]), mockRes());

    expect(txn.transactionStatus).toBe('For Resolution');
    expect(User.findByPk).toHaveBeenCalledWith(5, { transaction: {} });
    expect(savedUser.accountStatus).toBe('Restricted');
    expect(savedUser.save).toHaveBeenCalledWith({ transaction: {} });
  });

  test('logStatusChange remarks say "Lost/Damaged" when any returned item was Lost', async () => {
    loadTransactionOr404.mockResolvedValue(makeTxn());

    await ctrl.returnTransaction(req([{ itemCode: 'BB-1-0001', condition: 'Lost' }]), mockRes());

    expect(logStatusChange).toHaveBeenCalledWith(
      7,
      9,
      'Released',
      'For Resolution',
      expect.stringContaining('Lost/Damaged')
    );
  });

  test('logStatusChange remarks say plain "Damaged" when nothing was Lost', async () => {
    loadTransactionOr404.mockResolvedValue(makeTxn());

    await ctrl.returnTransaction(req([{ itemCode: 'BB-1-0001', condition: 'Damaged' }]), mockRes());

    const call = logStatusChange.mock.calls[0];
    expect(call[3]).toBe('For Resolution');
    expect(call[4]).toContain('Damaged');
    expect(call[4]).not.toContain('Lost');
  });

  test('notifies the borrower about the restriction, not the good-condition message', async () => {
    loadTransactionOr404.mockResolvedValue(makeTxn());

    await ctrl.returnTransaction(req([{ itemCode: 'BB-1-0001', condition: 'Lost' }]), mockRes());

    expect(notifyBorrower).toHaveBeenCalledWith(5, expect.stringContaining('restricted'), 'Return');
  });

  test('a mixed return (one Good, one Damaged) still overall counts as For Resolution, but the Good item is still restored', async () => {
    const goodDetail = makeDetail({ itemCode: 'BB-1-0001', equipmentId: 42 });
    const badDetail = makeDetail({ itemCode: 'BB-1-0002', equipmentId: 43, id: 56 });
    const txn = makeTxn({ details: [goodDetail, badDetail] });
    loadTransactionOr404.mockResolvedValue(txn);

    await ctrl.returnTransaction(
      req([
        { itemCode: 'BB-1-0001', condition: 'Good' },
        { itemCode: 'BB-1-0002', condition: 'Damaged' }
      ]),
      mockRes()
    );

    expect(goodDetail.item.update).toHaveBeenCalledWith(
      { availabilityStatus: 'Available', itemCondition: 'Good', currentBorrowerId: null },
      { transaction: {} }
    );
    expect(Equipment.increment).toHaveBeenCalledTimes(1);
    expect(Equipment.increment).toHaveBeenCalledWith('availableQuantity', { by: 1, where: { id: 42 }, transaction: {} });
    expect(DamageLossRecord.create).toHaveBeenCalledTimes(1);
    expect(txn.transactionStatus).toBe('For Resolution');
  });
});

describe('POST /api/borrow/:id/return — no linked borrower/user', () => {
  test('skips notifyBorrower but still completes the return', async () => {
    const txn = makeTxn({ borrower: null });
    loadTransactionOr404.mockResolvedValue(txn);

    await ctrl.returnTransaction(req([{ itemCode: 'BB-1-0001', condition: 'Good' }]), mockRes());

    expect(notifyBorrower).not.toHaveBeenCalled();
    expect(txn.transactionStatus).toBe('Completed');
  });
});
