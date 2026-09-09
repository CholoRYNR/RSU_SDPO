'use strict';

// Verifies server/controllers/damageLoss.controller.js's fee-visibility
// additions from the S7 Phase 3 audit: a fee assessed via flag() (see
// server/models/MaintenanceFee.js) was created with feeStatus:'Unpaid' but
// there was previously no way anywhere in the codebase — backend or
// frontend — to ever mark it Paid/Waived, and list()/serialize() never
// surfaced it at all. Covers the new findFeeForRecord()/serializeWithFee()
// matching logic and the new updateFeeStatus endpoint. Does not attempt
// full coverage of the whole controller (a pre-existing zero-coverage gap
// noted separately) — scoped to what this pass actually changed.

jest.mock('../../models', () => ({
  DamageLossRecord: { findAll: jest.fn(), findByPk: jest.fn() },
  Transaction: {},
  Borrower: {},
  User: {},
  Item: { findByPk: jest.fn() },
  Equipment: { increment: jest.fn() },
  Category: {},
  MaintenanceFee: { findOne: jest.fn(), findByPk: jest.fn(), create: jest.fn() },
  sequelize: { transaction: jest.fn() }
}));
jest.mock('../../helpers/notify', () => ({ notifyBorrower: jest.fn() }));
jest.mock('../../helpers/transactionLog', () => ({ logStatusChange: jest.fn() }));

const { DamageLossRecord, MaintenanceFee } = require('../../models');
const ctrl = require('../../controllers/damageLoss.controller');

function mockRes() {
  return { json: jest.fn() };
}

function baseRecord(overrides = {}) {
  return {
    id: 1,
    transactionId: 5,
    borrowerId: 3,
    incidentType: 'Damaged',
    dateReported: '2026-08-01',
    conditionDetails: 'Cracked backboard',
    resolutionStatus: 'Pending Replacement',
    replacementEquipment: null,
    replacementDate: null,
    resolutionDate: null,
    transaction: { id: 5, requestDatetime: '2026-08-01', createdAt: '2026-08-01' },
    borrower: { firstName: 'Juan', lastName: 'Dela Cruz', borrowerCategory: 'Student', collegeOrUnit: 'CCS', user: { accountStatus: 'Restricted' } },
    item: { itemCode: 'BB-1-001', equipment: { equipmentName: 'Basketball', category: { categoryName: 'Basketball' } } },
    recordedByUser: { username: 'staff1' },
    verifiedByUser: null,
    ...overrides
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/damage-loss (list) — fee visibility', () => {
  test('attaches the matching fee for a record with an assessed fee', async () => {
    const record = baseRecord();
    DamageLossRecord.findAll.mockResolvedValueOnce([record]);
    MaintenanceFee.findOne.mockResolvedValueOnce({ id: 9, feeAmount: '500.00', feeStatus: 'Unpaid', paymentDate: null });

    const res = mockRes();
    await ctrl.list({}, res);

    expect(MaintenanceFee.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { transactionId: 5, borrowerId: 3, feeType: 'Damage' } })
    );
    const payload = res.json.mock.calls[0][0];
    expect(payload.data[0].fee).toEqual({ id: 9, amount: '500.00', status: 'Unpaid', paymentDate: null });
  });

  test('maps a Lost incident to feeType "Loss", not "Damage"', async () => {
    const record = baseRecord({ incidentType: 'Lost' });
    DamageLossRecord.findAll.mockResolvedValueOnce([record]);
    MaintenanceFee.findOne.mockResolvedValueOnce(null);

    await ctrl.list({}, mockRes());

    expect(MaintenanceFee.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ feeType: 'Loss' }) })
    );
  });

  test('fee is null when no MaintenanceFee row matches (no fee was ever assessed)', async () => {
    const record = baseRecord();
    DamageLossRecord.findAll.mockResolvedValueOnce([record]);
    MaintenanceFee.findOne.mockResolvedValueOnce(null);

    const res = mockRes();
    await ctrl.list({}, res);

    expect(res.json.mock.calls[0][0].data[0].fee).toBeNull();
  });
});

describe('PATCH /api/damage-loss/fees/:feeId/status (updateFeeStatus)', () => {
  test('marks a fee Paid and stamps a paymentDate', async () => {
    const fee = { id: 9, feeStatus: 'Unpaid', paymentDate: null, save: jest.fn().mockResolvedValue() };
    MaintenanceFee.findByPk.mockResolvedValueOnce(fee);

    const req = { params: { feeId: '9' }, body: { status: 'Paid' } };
    const res = mockRes();
    await ctrl.updateFeeStatus(req, res);

    expect(fee.feeStatus).toBe('Paid');
    expect(fee.paymentDate).toBeInstanceOf(Date);
    expect(fee.save).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].data.status).toBe('Paid');
  });

  test('marks a fee Waived and clears any paymentDate', async () => {
    const fee = { id: 9, feeStatus: 'Unpaid', paymentDate: null, save: jest.fn().mockResolvedValue() };
    MaintenanceFee.findByPk.mockResolvedValueOnce(fee);

    await ctrl.updateFeeStatus({ params: { feeId: '9' }, body: { status: 'Waived' } }, mockRes());

    expect(fee.feeStatus).toBe('Waived');
    expect(fee.paymentDate).toBeNull();
  });

  test('rejects an invalid status with 400 and never saves', async () => {
    const fee = { id: 9, feeStatus: 'Unpaid', save: jest.fn() };
    MaintenanceFee.findByPk.mockResolvedValueOnce(fee);

    await expect(
      ctrl.updateFeeStatus({ params: { feeId: '9' }, body: { status: 'Refunded' } }, mockRes())
    ).rejects.toMatchObject({ statusCode: 400 });
    expect(fee.save).not.toHaveBeenCalled();
  });

  test('404s when the fee does not exist', async () => {
    MaintenanceFee.findByPk.mockResolvedValueOnce(null);
    await expect(
      ctrl.updateFeeStatus({ params: { feeId: '999' }, body: { status: 'Paid' } }, mockRes())
    ).rejects.toMatchObject({ statusCode: 404 });
  });
});
