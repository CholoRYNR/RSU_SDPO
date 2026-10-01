'use strict';

// Philippine Time (UTC+8) handling used for every recorded and displayed
// transaction timestamp, independent of the server's own timezone.

const d = require('../../helpers/dateHelper');

describe('helpers/dateHelper.js', () => {
  test('formats instants in Asia/Manila, not the server timezone', () => {
    const instant = new Date('2026-08-31T17:30:00Z'); // 1:30 AM Sep 1 in Manila
    expect(d.formatDate(instant)).toBe('Sep 1, 2026');
    expect(d.formatTime(instant)).toBe('1:30 AM');
    expect(d.formatDateTime(instant)).toBe('Sep 1, 2026, 1:30 AM');
    expect(d.phtDayKey(instant)).toBe('2026-09-01');
    expect(d.phtDayOfMonth(instant)).toBe(1);
  });

  test('parses offset-less client date-times as Philippine Time', () => {
    expect(d.parsePhtDateTime('2026-09-14T15:00').toISOString()).toBe('2026-09-14T07:00:00.000Z');
    expect(d.parsePhtDateTime('2026-09-14').toISOString()).toBe('2026-09-13T16:00:00.000Z');
  });

  test('respects an explicit offset and rejects garbage', () => {
    expect(d.parsePhtDateTime('2026-09-14T15:00:00Z').toISOString()).toBe('2026-09-14T15:00:00.000Z');
    expect(d.parsePhtDateTime('2026-09-14T15:00:00+08:00').toISOString()).toBe('2026-09-14T07:00:00.000Z');
    expect(d.parsePhtDateTime('not a date')).toBeNull();
    expect(d.parsePhtDateTime('')).toBeNull();
  });

  test('day boundaries are 00:00 PHT', () => {
    expect(d.startOfPhtDate(2026, 0, 1).toISOString()).toBe('2025-12-31T16:00:00.000Z');
    expect(d.startOfPhtDay(new Date('2026-03-05T20:00:00Z')).toISOString()).toBe('2026-03-05T16:00:00.000Z');
  });
});
