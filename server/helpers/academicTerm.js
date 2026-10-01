'use strict';

const { nowInPht, startOfPhtDate, toPhtWallClock } = require('./dateHelper');

// RSU academic calendar, as used by the dashboard's semester selector.
// Academic year "2025-2026" starts in August 2025:
//   1st Semester: August 1 – December 31 (start year)
//   2nd Semester: January 1 – July 31 (following year; includes the
//                 midyear/summer term so no calendar day falls outside a
//                 semester and every transaction is counted exactly once)
// Boundaries are pinned to 00:00 Philippine Time. Change these month
// indexes here (and only here) if the university calendar changes.
const FIRST_SEM_START_MONTH = 7; // August (0-based)
const SECOND_SEM_START_MONTH = 0; // January (0-based)

function semesterLabel(semester) {
  return semester === 2 ? '2nd Semester' : '1st Semester';
}

function academicYearLabel(startYear) {
  return `${startYear}-${startYear + 1}`;
}

// Inclusive start / exclusive end UTC instants for the given term.
function termRange(academicYearStart, semester) {
  const y = Number(academicYearStart);
  if (semester === 2) {
    return {
      start: startOfPhtDate(y + 1, SECOND_SEM_START_MONTH, 1),
      end: startOfPhtDate(y + 1, FIRST_SEM_START_MONTH, 1)
    };
  }
  return {
    start: startOfPhtDate(y, FIRST_SEM_START_MONTH, 1),
    end: startOfPhtDate(y + 1, SECOND_SEM_START_MONTH, 1)
  };
}

// Which term a given instant falls in (defaults to now, in PHT).
function termFor(value) {
  const wall = value ? toPhtWallClock(value) : nowInPht();
  const year = wall.getUTCFullYear();
  const month = wall.getUTCMonth();
  if (month >= FIRST_SEM_START_MONTH) return { academicYearStart: year, semester: 1 };
  return { academicYearStart: year - 1, semester: 2 };
}

function describeTerm(academicYearStart, semester) {
  const { start, end } = termRange(academicYearStart, semester);
  return {
    academicYearStart,
    semester,
    academicYear: academicYearLabel(academicYearStart),
    semesterLabel: semesterLabel(semester),
    start,
    end
  };
}

// Parses ?academicYear=2025 (or "2025-2026") & ?semester=1|2 from a query
// object, falling back to the current PHT term for anything missing or
// invalid.
function termFromQuery(query = {}) {
  const current = termFor();
  const rawYear = query.academicYear != null ? String(query.academicYear) : '';
  const parsedYear = parseInt(rawYear.split('-')[0], 10);
  const parsedSemester = parseInt(query.semester, 10);
  const academicYearStart = Number.isInteger(parsedYear) && parsedYear > 2000 && parsedYear < 2200 ? parsedYear : current.academicYearStart;
  const semester = parsedSemester === 1 || parsedSemester === 2 ? parsedSemester : current.semester;
  return describeTerm(academicYearStart, semester);
}

// Academic years from the earliest recorded activity through the current
// one, newest first — feeds the dashboard's A.Y. dropdown with real data
// instead of a hardcoded option.
function academicYearOptions(earliestDate) {
  const current = termFor().academicYearStart;
  const earliest = earliestDate ? termFor(earliestDate).academicYearStart : current;
  const years = [];
  for (let y = current; y >= Math.min(earliest, current); y -= 1) {
    years.push({ value: y, label: academicYearLabel(y) });
  }
  return years;
}

module.exports = {
  semesterLabel,
  academicYearLabel,
  termRange,
  termFor,
  describeTerm,
  termFromQuery,
  academicYearOptions
};
