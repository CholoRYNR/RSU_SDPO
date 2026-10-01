'use strict';

// Single timezone strategy for the whole system: every timestamp is
// captured server-side as a real UTC instant (new Date() / Postgres
// timestamptz — never a browser-supplied clock), and every human-readable
// rendering of one is done in Philippine Time. PHT is a fixed UTC+8 offset
// with no daylight saving, so boundaries can be computed arithmetically
// without a timezone database, and Intl formatting is pinned to
// 'Asia/Manila' so output never depends on the server process's own TZ
// (Vercel/Railway run in UTC).

const PH_TIME_ZONE = 'Asia/Manila';
const PHT_OFFSET_MS = 8 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

// "Sep 14, 2026"
function formatDate(value, fallback = '—') {
  const d = toDate(value);
  return d ? d.toLocaleDateString('en-US', { timeZone: PH_TIME_ZONE, month: 'short', day: 'numeric', year: 'numeric' }) : fallback;
}

// "3:05 PM"
function formatTime(value, fallback = '') {
  const d = toDate(value);
  return d ? d.toLocaleTimeString('en-US', { timeZone: PH_TIME_ZONE, hour: 'numeric', minute: '2-digit', hour12: true }) : fallback;
}

// "Sep 14, 2026, 3:05 PM"
function formatDateTime(value, fallback = '—') {
  const d = toDate(value);
  return d
    ? d.toLocaleString('en-US', {
        timeZone: PH_TIME_ZONE,
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      })
    : fallback;
}

// The instant shifted so its UTC getters read PHT wall-clock values — the
// standard fixed-offset trick for "what day/month/year is it in Manila".
function toPhtWallClock(value) {
  const d = toDate(value) || new Date();
  return new Date(d.getTime() + PHT_OFFSET_MS);
}

function nowInPht() {
  return toPhtWallClock(new Date());
}

// UTC instant for 00:00 PHT on the given PHT calendar date. monthIndex0 may
// overflow (e.g. 12 → January of the next year), same as Date.UTC.
function startOfPhtDate(year, monthIndex0, day) {
  return new Date(Date.UTC(year, monthIndex0, day, 0, 0, 0) - PHT_OFFSET_MS);
}

// UTC instant for 00:00 PHT on the PHT calendar day containing `value`.
function startOfPhtDay(value) {
  const wall = toPhtWallClock(value);
  return startOfPhtDate(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate());
}

// PHT calendar day-of-month (1-31) for a stored instant.
function phtDayOfMonth(value) {
  return toPhtWallClock(value).getUTCDate();
}

// "YYYY-MM-DD" in PHT — a stable key for grouping instants by local day.
function phtDayKey(value) {
  const wall = toPhtWallClock(value);
  return `${wall.getUTCFullYear()}-${String(wall.getUTCMonth() + 1).padStart(2, '0')}-${String(wall.getUTCDate()).padStart(2, '0')}`;
}

// "Mon", "Tue", ... for a PHT day.
function phtWeekdayShort(value) {
  const d = toDate(value);
  return d ? d.toLocaleDateString('en-US', { timeZone: PH_TIME_ZONE, weekday: 'short' }) : '';
}

// Parses a client-supplied local date-time ("2026-09-14T15:00" from a
// <input type="datetime-local">, or "2026-09-14") as Philippine Time. A
// string that already carries an explicit offset/Z is respected as-is.
// Returns null for empty/invalid input. Without this, the server would
// interpret an offset-less value in its own process timezone (UTC on the
// hosting platform), shifting every due date by 8 hours.
function parsePhtDateTime(value) {
  if (value === undefined || value === null || value === '') return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const str = String(value).trim();
  if (/([zZ]|[+-]\d{2}:?\d{2})$/.test(str)) {
    return toDate(str);
  }
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?$/);
  if (!m) return null;
  const [, y, mo, d, h = '00', mi = '00', s = '00'] = m;
  const utc = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s)) - PHT_OFFSET_MS;
  const result = new Date(utc);
  return Number.isNaN(result.getTime()) ? null : result;
}

module.exports = {
  PH_TIME_ZONE,
  PHT_OFFSET_MS,
  DAY_MS,
  formatDate,
  formatTime,
  formatDateTime,
  toPhtWallClock,
  nowInPht,
  startOfPhtDate,
  startOfPhtDay,
  phtDayOfMonth,
  phtDayKey,
  phtWeekdayShort,
  parsePhtDateTime
};
