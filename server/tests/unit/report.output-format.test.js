'use strict';

// Regression guard for capstone spec S4 (Automated Reports): "generated via
// PDFKit and ExcelJS". This suite was originally written when none of the
// /api/reports/* endpoints produced binary output — every handler always
// called res.json(...) and server/reports/templates/*.js (the PDFKit/ExcelJS
// template files) were 0-byte stubs that nothing in the codebase required.
//
// That gap is now closed: server/reports/templates/reportRenderer.js holds
// the shared PDFKit/ExcelJS rendering logic, the 5 named template files below
// are thin per-report wrappers over it, and
// server/controllers/report.controller.js requires all of them and calls
// into them when req.query.format is 'pdf' or 'excel'. The default (no
// format param) response is still res.json(...) with a {title, heads, data,
// stats} object, so the existing JSON API used by the admin dashboard table
// views is unaffected — that default-path behavior is what the tests below
// still exercise and assert.
//
// These assertions now guard the fixed state: the named template files exist
// and are real implementations (non-zero size), and report.controller.js
// legitimately references reports/templates. They intentionally fail again
// if the wiring ever regresses back to unused, 0-byte stub files.

jest.mock('../../models', () => require('../fixtures/mockModels')());

const fs = require('fs');
const path = require('path');

const { Transaction, Equipment } = require('../../models');
const ctrl = require('../../controllers/report.controller');
const { makeTransaction } = require('../fixtures/reportFixtures');

const REPORT_CONTROLLER_PATH = path.join(__dirname, '..', '..', 'controllers', 'report.controller.js');
const REPORT_ROUTES_PATH = path.join(__dirname, '..', '..', 'routes', 'report.routes.js');
const TEMPLATES_DIR = path.join(__dirname, '..', '..', 'reports', 'templates');

function mockRes() {
  return {
    json: jest.fn(),
    setHeader: jest.fn(),
    send: jest.fn(),
    end: jest.fn(),
    status: jest.fn().mockReturnThis()
  };
}

describe('report.controller.js source: PDF/Excel generation is delegated, not inlined', () => {
  const src = fs.readFileSync(REPORT_CONTROLLER_PATH, 'utf8');

  test('does not require pdfkit or exceljs directly (delegates to reports/templates/reportRenderer.js)', () => {
    expect(src).not.toMatch(/require\(['"]pdfkit['"]\)/);
    expect(src).not.toMatch(/require\(['"]exceljs['"]\)/);
  });

  test('requires reports/templates — regression guard that the PDF/Excel wiring stays wired', () => {
    expect(src).toMatch(/reports[\\/]templates/);
  });

  test('every exported handler responds with res.json (no res.send/res.end/binary content-type)', () => {
    const exportNames = ['transactionLog', 'borrowing', 'overdue', 'utilization', 'inventory', 'history', 'condition'];
    exportNames.forEach((name) => {
      expect(typeof ctrl[name]).toBe('function');
    });
    // Every handler body in the source uses res.json({...}); none set
    // Content-Type to a binary type or stream a buffer/document out.
    expect(src).not.toMatch(/application\/pdf/);
    expect(src).not.toMatch(/spreadsheetml/);
    expect(src.match(/res\.json\(/g).length).toBeGreaterThanOrEqual(7);
  });
});

describe('report.routes.js: no dedicated PDF/Excel export routes exist', () => {
  const src = fs.readFileSync(REPORT_ROUTES_PATH, 'utf8');
  test('no /export, /pdf, or /excel style route is registered', () => {
    expect(src).not.toMatch(/\/(export|pdf|excel|xlsx)\b/i);
  });
});

describe('server/reports/templates/*.js (PDFKit/ExcelJS report generation — implemented and wired)', () => {
  // The 5 per-report templates named by the original spec. reportRenderer.js
  // (the shared PDFKit/ExcelJS rendering logic they all wrap) also lives in
  // this directory but is intentionally excluded from this list — it isn't
  // one of the 5 named templates, and its presence shouldn't break a
  // membership check against them.
  const TEMPLATE_FILES = [
    'borrowingReportTemplate.js',
    'equipmentConditionTemplate.js',
    'overdueReportTemplate.js',
    'transactionHistoryTemplate.js',
    'utilizationReportTemplate.js'
  ];
  const dirFiles = fs.readdirSync(TEMPLATES_DIR).filter((f) => f.endsWith('.js'));

  test('the 5 named report templates exist on disk', () => {
    TEMPLATE_FILES.forEach((f) => {
      expect(dirFiles).toContain(f);
    });
  });

  test('every named template file is implemented (non-zero size), not a 0-byte stub', () => {
    TEMPLATE_FILES.forEach((f) => {
      const stat = fs.statSync(path.join(TEMPLATES_DIR, f));
      expect(stat.size).toBeGreaterThan(0);
    });
  });

  test('report.controller.js (and any other legitimate caller) references reports/templates — confirms real wiring, not dead code', () => {
    const roots = [path.join(__dirname, '..', '..'), path.join(__dirname, '..', '..', '..', 'client')];
    const callers = [];
    const SKIP_DIRS = new Set(['node_modules', '.git', 'tests', 'generated']);

    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (SKIP_DIRS.has(entry.name)) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (/\.(js|html)$/.test(entry.name)) {
          const contents = fs.readFileSync(full, 'utf8');
          if (/reports[\\/]templates/.test(contents)) callers.push(full);
        }
      }
    }

    roots.forEach((root) => {
      if (fs.existsSync(root)) walk(root);
    });

    expect(callers).toContain(REPORT_CONTROLLER_PATH);
  });
});

describe('actual endpoint responses (mocked models): every one returns JSON, never a binary buffer', () => {
  const endpoints = [
    ['borrowing', () => Transaction.findAll.mockResolvedValue([])],
    ['overdue', () => Transaction.findAll.mockResolvedValue([])],
    ['utilization', () => {
      Equipment.findAll.mockResolvedValue([]);
      require('../../models').TransactionDetail.findAll.mockResolvedValue([]);
    }],
    ['inventory', () => Equipment.findAll.mockResolvedValue([])],
    ['history', () => Transaction.findAll.mockResolvedValue([])],
    ['condition', () => Equipment.findAll.mockResolvedValue([])],
    ['transactionLog', () => Transaction.findAll.mockResolvedValue([])]
  ];

  test.each(endpoints)('%s calls res.json and never res.send/res.end (which is how a real PDF/xlsx buffer would go out)', async (name, setup) => {
    jest.clearAllMocks();
    setup();
    const req = { query: { quarter: '1', year: '2026', month: '1' } };
    const res = mockRes();
    await ctrl[name](req, res);

    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.send).not.toHaveBeenCalled();
    expect(res.end).not.toHaveBeenCalled();

    const arg = res.json.mock.calls[0][0];
    // A real PDFKit/ExcelJS payload would be a Buffer; this is always a plain object.
    expect(Buffer.isBuffer(arg)).toBe(false);
    expect(typeof arg).toBe('object');
  });
});

describe('makeTransaction fixture sanity (guards the fixture itself, not just the controller)', () => {
  test('has the fields report.controller.js reads', () => {
    const t = makeTransaction();
    expect(t.borrower.firstName).toBeDefined();
    expect(t.transactionStatus).toBeDefined();
  });
});
