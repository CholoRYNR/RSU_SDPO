'use strict';

// Verifies server/helpers/notify.js's notifyBorrower/notifyStaff behavior
// end-to-end against mocked models + mocked email/SMS services. No real
// network call is ever made: emailService and smsService are jest.mock()'d
// wholesale, and models come from the shared fixtures/mockModels.js factory
// used by the report test suite.

jest.mock('../../models', () => require('../fixtures/mockModels')());
jest.mock('../../services/notificationService/emailService');
jest.mock('../../services/notificationService/smsService');

const { Notification, User } = require('../../models');
const { sendEmail } = require('../../services/notificationService/emailService');
const { sendSms } = require('../../services/notificationService/smsService');
const { notifyBorrower, notifyStaff } = require('../../helpers/notify');

function makeUser(overrides = {}) {
  return {
    id: 1,
    emailAddress: 'user@example.com',
    contactNumber: '09171234567',
    userRole: 'Borrower',
    ...overrides
  };
}

describe('helpers/notify.js', () => {
  let errorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    Notification.create.mockResolvedValue({ id: 100 });
    Notification.bulkCreate.mockResolvedValue([]);
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  describe('exported function signatures (contract relied on by 9 existing call sites)', () => {
    test('notifyBorrower still declares (userId, message, type)', () => {
      expect(typeof notifyBorrower).toBe('function');
      expect(notifyBorrower).toHaveLength(3);
    });

    test('notifyStaff still declares (message, type)', () => {
      expect(typeof notifyStaff).toBe('function');
      expect(notifyStaff).toHaveLength(2);
    });
  });

  describe('notifyBorrower', () => {
    test('writes the in-app (System) notification and returns it', async () => {
      User.findByPk.mockResolvedValue(makeUser());
      sendEmail.mockResolvedValue({ success: true, messageId: 'm1' });
      sendSms.mockResolvedValue({ success: true, response: {} });

      const created = await notifyBorrower(1, 'Request approved', 'Approval');

      expect(Notification.create).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 1,
          notificationType: 'Approval',
          message: 'Request approved',
          deliveryChannel: 'System',
          deliveryStatus: 'Sent'
        })
      );
      expect(created).toEqual({ id: 100 });
    });

    test('the in-app write happens before, and is unaffected by, any email/SMS attempt', async () => {
      const callOrder = [];
      User.findByPk.mockImplementation(async () => {
        callOrder.push('findByPk');
        return makeUser();
      });
      Notification.create.mockImplementation(async (payload) => {
        callOrder.push(`create:${payload.deliveryChannel}`);
        return { id: 100 };
      });
      sendEmail.mockImplementation(async () => {
        callOrder.push('sendEmail');
        return { success: true, messageId: 'm1' };
      });
      sendSms.mockImplementation(async () => {
        callOrder.push('sendSms');
        return { success: true, response: {} };
      });

      await notifyBorrower(1, 'msg', 'Type');

      expect(callOrder[0]).toBe('create:System');
      expect(callOrder.indexOf('create:System')).toBeLessThan(callOrder.indexOf('sendEmail'));
      expect(callOrder.indexOf('create:System')).toBeLessThan(callOrder.indexOf('sendSms'));
    });

    test('the in-app write succeeds even when both email and SMS fail', async () => {
      User.findByPk.mockResolvedValue(makeUser());
      sendEmail.mockResolvedValue({ success: false, error: 'smtp down' });
      sendSms.mockResolvedValue({ success: false, error: 'sms down' });

      await expect(notifyBorrower(1, 'msg', 'Type')).resolves.toEqual({ id: 100 });
      expect(Notification.create).toHaveBeenCalledTimes(1);
    });

    test('records Email and SMS Notification rows as Sent when both channels succeed', async () => {
      User.findByPk.mockResolvedValue(makeUser());
      sendEmail.mockResolvedValue({ success: true, messageId: 'm1' });
      sendSms.mockResolvedValue({ success: true, response: {} });

      await notifyBorrower(1, 'msg', 'Type');

      expect(Notification.bulkCreate).toHaveBeenCalledTimes(1);
      const rows = Notification.bulkCreate.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ deliveryChannel: 'Email', deliveryStatus: 'Sent' }),
          expect.objectContaining({ deliveryChannel: 'SMS', deliveryStatus: 'Sent' })
        ])
      );
    });

    test('records Email and SMS Notification rows as Failed when both channels fail', async () => {
      User.findByPk.mockResolvedValue(makeUser());
      sendEmail.mockResolvedValue({ success: false, error: 'smtp down' });
      sendSms.mockResolvedValue({ success: false, error: 'sms down' });

      await notifyBorrower(1, 'msg', 'Type');

      const rows = Notification.bulkCreate.mock.calls[0][0];
      expect(rows).toHaveLength(2);
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ deliveryChannel: 'Email', deliveryStatus: 'Failed' }),
          expect.objectContaining({ deliveryChannel: 'SMS', deliveryStatus: 'Failed' })
        ])
      );
    });

    test('records mixed deliveryStatus when one channel succeeds and the other fails', async () => {
      User.findByPk.mockResolvedValue(makeUser());
      sendEmail.mockResolvedValue({ success: true, messageId: 'm1' });
      sendSms.mockResolvedValue({ success: false, error: 'sms down' });

      await notifyBorrower(1, 'msg', 'Type');

      const rows = Notification.bulkCreate.mock.calls[0][0];
      expect(rows).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ deliveryChannel: 'Email', deliveryStatus: 'Sent' }),
          expect.objectContaining({ deliveryChannel: 'SMS', deliveryStatus: 'Failed' })
        ])
      );
    });

    test('skips SMS silently (no row written, sendSms never called) when contactNumber is null', async () => {
      User.findByPk.mockResolvedValue(makeUser({ contactNumber: null }));
      sendEmail.mockResolvedValue({ success: true, messageId: 'm1' });

      await notifyBorrower(1, 'msg', 'Type');

      expect(sendSms).not.toHaveBeenCalled();
      expect(Notification.bulkCreate).toHaveBeenCalledTimes(1);
      const rows = Notification.bulkCreate.mock.calls[0][0];
      expect(rows).toHaveLength(1);
      expect(rows[0].deliveryChannel).toBe('Email');
      expect(rows.some((r) => r.deliveryChannel === 'SMS')).toBe(false);
    });

    test('skips Email silently (no row written, sendEmail never called) when emailAddress is falsy', async () => {
      User.findByPk.mockResolvedValue(makeUser({ emailAddress: null }));
      sendSms.mockResolvedValue({ success: true, response: {} });

      await notifyBorrower(1, 'msg', 'Type');

      expect(sendEmail).not.toHaveBeenCalled();
      const rows = Notification.bulkCreate.mock.calls[0][0];
      expect(rows).toHaveLength(1);
      expect(rows[0].deliveryChannel).toBe('SMS');
    });

    test('never throws when the User lookup rejects; in-app notification is still returned', async () => {
      User.findByPk.mockRejectedValue(new Error('DB connection lost'));

      await expect(notifyBorrower(1, 'msg', 'Type')).resolves.toEqual({ id: 100 });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(sendSms).not.toHaveBeenCalled();
    });

    test('never throws when the User lookup resolves to null (unknown userId)', async () => {
      User.findByPk.mockResolvedValue(null);

      await expect(notifyBorrower(999, 'msg', 'Type')).resolves.toEqual({ id: 100 });
      expect(sendEmail).not.toHaveBeenCalled();
      expect(sendSms).not.toHaveBeenCalled();
    });

    test('never throws when emailService throws synchronously (defense in depth beyond its own contract)', async () => {
      User.findByPk.mockResolvedValue(makeUser());
      sendEmail.mockImplementation(() => {
        throw new Error('unexpected synchronous failure from emailService');
      });
      sendSms.mockResolvedValue({ success: true, response: {} });

      await expect(notifyBorrower(1, 'msg', 'Type')).resolves.toEqual({ id: 100 });
      expect(Notification.create).toHaveBeenCalledTimes(1);
    });

    test('never throws when smsService throws synchronously (defense in depth beyond its own contract)', async () => {
      User.findByPk.mockResolvedValue(makeUser());
      sendEmail.mockResolvedValue({ success: true, messageId: 'm1' });
      sendSms.mockImplementation(() => {
        throw new Error('unexpected synchronous failure from smsService');
      });

      await expect(notifyBorrower(1, 'msg', 'Type')).resolves.toEqual({ id: 100 });
      expect(Notification.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('notifyStaff', () => {
    test('delivers in-app, email, and SMS notifications to every Admin/Director/Staff user, not just one', async () => {
      const staff = [
        makeUser({ id: 10, userRole: 'Admin' }),
        makeUser({ id: 11, userRole: 'Director' }),
        makeUser({ id: 12, userRole: 'Staff' })
      ];
      User.findAll.mockResolvedValue(staff);
      sendEmail.mockResolvedValue({ success: true, messageId: 'm1' });
      sendSms.mockResolvedValue({ success: true, response: {} });

      await notifyStaff('New borrowing request', 'NewRequest');

      expect(User.findAll).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userRole: ['Admin', 'Director', 'Staff'] } })
      );

      // First bulkCreate call is the in-app (System) fan-out, one row per
      // staff member.
      const inAppRows = Notification.bulkCreate.mock.calls[0][0];
      expect(inAppRows).toHaveLength(3);
      expect(inAppRows.map((r) => r.userId).sort()).toEqual([10, 11, 12]);
      expect(inAppRows.every((r) => r.deliveryChannel === 'System' && r.deliveryStatus === 'Sent')).toBe(true);

      // Email/SMS attempted for every staff member, not just the first.
      expect(sendEmail).toHaveBeenCalledTimes(3);
      expect(sendSms).toHaveBeenCalledTimes(3);
      const emailedIds = sendEmail.mock.calls.map(() => true).length;
      expect(emailedIds).toBe(3);
    });

    test('the in-app fan-out succeeds even when every staff member fails email and SMS', async () => {
      const staff = [makeUser({ id: 10, userRole: 'Admin' }), makeUser({ id: 11, userRole: 'Staff' })];
      User.findAll.mockResolvedValue(staff);
      sendEmail.mockResolvedValue({ success: false, error: 'down' });
      sendSms.mockResolvedValue({ success: false, error: 'down' });

      await expect(notifyStaff('msg', 'Type')).resolves.toBeUndefined();

      const inAppRows = Notification.bulkCreate.mock.calls[0][0];
      expect(inAppRows).toHaveLength(2);
      expect(inAppRows.every((r) => r.deliveryStatus === 'Sent')).toBe(true);
    });

    test('does nothing (no bulkCreate, no email/SMS attempts) when there are no staff users', async () => {
      User.findAll.mockResolvedValue([]);

      await expect(notifyStaff('msg', 'Type')).resolves.toBeUndefined();
      expect(Notification.bulkCreate).not.toHaveBeenCalled();
      expect(sendEmail).not.toHaveBeenCalled();
      expect(sendSms).not.toHaveBeenCalled();
    });

    test('skips SMS per-user (no row, sendSms not called for that user) when a staff member has no contactNumber', async () => {
      const staff = [
        makeUser({ id: 10, userRole: 'Admin', contactNumber: null }),
        makeUser({ id: 11, userRole: 'Staff', contactNumber: '09170000000' })
      ];
      User.findAll.mockResolvedValue(staff);
      sendEmail.mockResolvedValue({ success: true, messageId: 'm1' });
      sendSms.mockResolvedValue({ success: true, response: {} });

      await notifyStaff('msg', 'Type');

      expect(sendSms).toHaveBeenCalledTimes(1);
      expect(sendSms).toHaveBeenCalledWith('09170000000', 'msg');
    });

    // Per the task spec, notifyStaff must never throw even when the User
    // lookup itself rejects (mirroring notifyBorrower's own try/catch
    // around its User.findByPk call). This test captures whether that
    // contract actually holds for notifyStaff's User.findAll call.
    test('should never throw when the User lookup rejects (mirrors notifyBorrower)', async () => {
      User.findAll.mockRejectedValue(new Error('DB down'));

      await expect(notifyStaff('msg', 'Type')).resolves.toBeUndefined();
    });
  });
});
