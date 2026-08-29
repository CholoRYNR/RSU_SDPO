'use strict';

// Verifies that all 7 /api/reports/* routes are wired through authMiddleware
// and a staff-only roleMiddleware([...]) gate, exactly as report.routes.js
// declares (authMiddleware, staffOnly, catchAsync(ctrl.xxx)). This does not
// re-litigate whether that gate is the right one — it already is, per the
// route file — it only confirms the wiring is actually present for every
// endpoint and behaves like a role gate.

jest.mock('../../models', () => require('../fixtures/mockModels')());

const authMiddleware = require('../../middlewares/authMiddleware');
const router = require('../../routes/report.routes');

const EXPECTED_PATHS = ['/transaction-log', '/borrowing', '/overdue', '/utilization', '/inventory', '/history', '/condition'];

function getLayer(path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path);
  if (!layer) throw new Error(`No route registered for ${path}`);
  return layer.route;
}

describe('report.routes.js wiring', () => {
  test('registers exactly the 7 expected GET endpoints', () => {
    const paths = router.stack.filter((l) => l.route).map((l) => l.route.path);
    expect(paths.sort()).toEqual([...EXPECTED_PATHS].sort());
  });

  test.each(EXPECTED_PATHS)('%s is a GET route with exactly 3 handlers: auth, role gate, controller', (path) => {
    const route = getLayer(path);
    expect(route.methods.get).toBe(true);
    expect(route.stack).toHaveLength(3);
  });

  test.each(EXPECTED_PATHS)('%s applies the real authMiddleware as its first handler', (path) => {
    const route = getLayer(path);
    expect(route.stack[0].handle).toBe(authMiddleware);
  });

  test.each(EXPECTED_PATHS)('%s gates on role: Admin/Director/Staff pass, everyone else gets a 403-flagged error', (path) => {
    const route = getLayer(path);
    const roleGate = route.stack[1].handle;

    ['Admin', 'Director', 'Staff'].forEach((role) => {
      const next = jest.fn();
      roleGate({ user: { userRole: role } }, {}, next);
      expect(next).toHaveBeenCalledWith(); // called with no error -> allowed through
    });

    ['Student', 'Faculty', 'Stakeholder', undefined].forEach((role) => {
      const next = jest.fn();
      roleGate({ user: role ? { userRole: role } : null }, {}, next);
      expect(next).toHaveBeenCalledTimes(1);
      const err = next.mock.calls[0][0];
      expect(err).toBeInstanceOf(Error);
      expect(err.statusCode).toBe(403);
    });
  });

  test.each(EXPECTED_PATHS)('%s registers a 3rd handler (the catchAsync-wrapped controller)', (path) => {
    const route = getLayer(path);
    expect(typeof route.stack[2].handle).toBe('function');
  });

  test('catchAsync forwards a rejected controller promise to next() instead of leaving it unhandled', () => {
    const catchAsync = require('../../helpers/catchAsync');
    const next = jest.fn();
    const boom = new Error('boom');
    const wrapped = catchAsync(() => Promise.reject(boom));
    return wrapped({}, {}, next).then(() => {
      expect(next).toHaveBeenCalledWith(boom);
    });
  });
});
