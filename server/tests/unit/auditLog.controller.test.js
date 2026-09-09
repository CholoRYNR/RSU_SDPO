'use strict';

// Verifies server/controllers/auditLog.controller.js — previously zero test
// coverage (High #3, 2026-09-08 system audit). Backs audit-log.html
// (the page whose error-state XSS was separately fixed as Medium #13).

jest.mock('../../models', () => ({
  TransactionLog: { findAll: jest.fn() },
  User: {}
}));

const { TransactionLog } = require('../../models');
const ctrl = require('../../controllers/auditLog.controller');

function mockRes() {
  return { json: jest.fn() };
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe('GET /api/audit-logs', () => {
  test('with no transactionId query param: fetches across all transactions, newest first, capped at 200', async () => {
    TransactionLog.findAll.mockResolvedValue([]);

    await ctrl.list({ query: {} }, mockRes());

    const callArgs = TransactionLog.findAll.mock.calls[0][0];
    expect(callArgs.where).toBeUndefined();
    expect(callArgs.order).toEqual([['changeDatetime', 'DESC']]);
    expect(callArgs.limit).toBe(200);
  });

  test('with a transactionId query param: filters to that transaction and does not cap the result', async () => {
    TransactionLog.findAll.mockResolvedValue([]);

    await ctrl.list({ query: { transactionId: '42' } }, mockRes());

    const callArgs = TransactionLog.findAll.mock.calls[0][0];
    expect(callArgs.where).toEqual({ transactionId: 42 });
    expect(callArgs.limit).toBeUndefined();
  });

  test('serializes changedBy from the joined user\'s username when present', async () => {
    TransactionLog.findAll.mockResolvedValue([
      {
        id: 1,
        transactionId: 42,
        changedBy: 7,
        changedByUser: { username: 'admin.angelo' },
        oldStatus: 'Acknowledged',
        newStatus: 'For Approval',
        remarks: null,
        changeDatetime: new Date('2026-09-01')
      }
    ]);

    const res = mockRes();
    await ctrl.list({ query: {} }, res);

    expect(res.json.mock.calls[0][0].data[0].changedBy).toBe('admin.angelo');
  });

  test('falls back to "User #<id>" when changedBy is set but the user join came back empty', async () => {
    TransactionLog.findAll.mockResolvedValue([
      {
        id: 1,
        transactionId: 42,
        changedBy: 7,
        changedByUser: null,
        oldStatus: 'Acknowledged',
        newStatus: 'For Approval',
        remarks: null,
        changeDatetime: new Date('2026-09-01')
      }
    ]);

    const res = mockRes();
    await ctrl.list({ query: {} }, res);

    expect(res.json.mock.calls[0][0].data[0].changedBy).toBe('User #7');
  });

  test('falls back to "System" for an automated change with no changedBy at all (e.g. the overdue sweep)', async () => {
    TransactionLog.findAll.mockResolvedValue([
      {
        id: 1,
        transactionId: 42,
        changedBy: null,
        changedByUser: null,
        oldStatus: 'Released',
        newStatus: 'Overdue',
        remarks: 'Automatically flagged overdue by system sweep',
        changeDatetime: new Date('2026-09-01')
      }
    ]);

    const res = mockRes();
    await ctrl.list({ query: {} }, res);

    expect(res.json.mock.calls[0][0].data[0].changedBy).toBe('System');
  });
});
