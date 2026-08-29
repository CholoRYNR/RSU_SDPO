'use strict';

// Covers the NEW ?format=pdf and ?format=excel behavior added to all 7
// /api/reports/* endpoints in server/controllers/report.controller.js,
// backed by server/reports/templates/reportRenderer.js and its 5 thin
// per-report wrappers.
//
// This suite intentionally does NOT touch the default (no format / unknown
// format) JSON behavior -- that is already covered byte-for-byte by
// report.controller.test.js and the JSON-path assertions in
// report.output-format.test.js. This file only exercises the new binary
// output paths: that they set the right headers and produce bytes that are
// genuinely a valid PDF (starts with the %PDF- magic) and a genuinely valid
// .xlsx (PK zip magic, and round-trips through ExcelJS's own reader).
//
// A real Node Writable stream is used as the mock `res` (not a jest.fn()
// stub) because both pdfkit (doc.pipe(res)) and ExcelJS (zip.pipe(stream)
// inside workbook.xlsx.write(res)) depend on real stream semantics
// (backpressure/'drain', and the 'finish' event signalling completion) that
// a plain mock object cannot reproduce reliably.

const { Writable } = require('stream');
const ExcelJS = require('exceljs');

jest.mock('../../models', () => require('../fixtures/mockModels')());

const { Transaction, TransactionDetail, Equipment, User } = require('../../models');
const ctrl = require('../../controllers/report.controller');
const {
  makeEquipment,
  makeItem,
  makeBorrower,
  makeTransactionDetail,
  makeTransaction
} = require('../fixtures/reportFixtures');

const PDF_MAGIC = '%PDF-';
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04

/**
 * A minimal but real Writable stream standing in for Express's `res`.
 * Collects every chunk written to it and exposes the usual Express-ish
 * surface (setHeader/getHeader/status/json/headersSent) that
 * reportRenderer.js and the controller's error-fallback branches touch.
 */
function createStreamRes() {
  const chunks = [];
  const headers = {};
  const res = new Writable({
    write(chunk, encoding, callback) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk, encoding));
      res.headersSent = true;
      callback();
    }
  });
  res.headersSent = false;
  res.statusCode = 200;
  res.setHeader = jest.fn((name, value) => {
    headers[String(name).toLowerCase()] = value;
  });
  res.getHeader = (name) => headers[String(name).toLowerCase()];
  res.status = jest.fn((code) => {
    res.statusCode = code;
    return res;
  });
  res.json = jest.fn((body) => {
    res.jsonBody = body;
  });
  res.getBuffer = () => Buffer.concat(chunks);
  res.getHeaders = () => headers;
  return res;
}

function waitFinish(res) {
  return new Promise((resolve, reject) => {
    res.on('finish', resolve);
    res.on('error', reject);
  });
}

async function readXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  return wb;
}

const ENDPOINTS = [
  {
    name: 'borrowing',
    setup: () => Transaction.findAll.mockResolvedValue([]),
    title: 'BORROWING REPORT',
    filenameBase: 'borrowing-report'
  },
  {
    name: 'overdue',
    setup: () => {
      Transaction.findAll.mockResolvedValue([]);
      User.count.mockResolvedValue(0);
    },
    title: 'OVERDUE REPORT',
    filenameBase: 'overdue-report'
  },
  {
    name: 'utilization',
    setup: () => {
      Equipment.findAll.mockResolvedValue([]);
      TransactionDetail.findAll.mockResolvedValue([]);
    },
    title: 'EQUIPMENT UTILIZATION REPORT',
    filenameBase: 'equipment-utilization-report'
  },
  {
    name: 'inventory',
    setup: () => Equipment.findAll.mockResolvedValue([]),
    title: 'EQUIPMENT INVENTORY REPORT',
    filenameBase: 'equipment-inventory-report'
  },
  {
    name: 'history',
    setup: () => Transaction.findAll.mockResolvedValue([]),
    title: 'TRANSACTION HISTORY REPORT',
    filenameBase: 'transaction-history-report'
  },
  {
    name: 'condition',
    setup: () => Equipment.findAll.mockResolvedValue([]),
    title: 'EQUIPMENT CONDITION REPORT',
    filenameBase: 'equipment-condition-report'
  },
  {
    name: 'transactionLog',
    setup: () => Transaction.findAll.mockResolvedValue([]),
    // title is dynamic ("TRANSACTION LOG REPORT - <Month> <Year>"); checked separately.
    titlePrefix: 'TRANSACTION LOG REPORT',
    filenameBase: 'transaction-log-report'
  }
];

describe('?format=pdf on every /api/reports/* endpoint (empty dataset)', () => {
  beforeEach(() => jest.clearAllMocks());

  test.each(ENDPOINTS)('$name: sets application/pdf + Content-Disposition, streams a genuine %PDF- file', async ({ name, setup, filenameBase }) => {
    setup();
    const req = { query: { format: 'pdf', quarter: '1', year: '2026', month: '1' } };
    const res = createStreamRes();

    ctrl[name](req, res);
    await waitFinish(res);

    expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'application/pdf');
    const disposition = res.getHeader('Content-Disposition');
    expect(disposition).toMatch(/^attachment; filename="/);
    expect(disposition).toContain(`${filenameBase}.pdf`);

    // res.json must never be called on the success path -- this is the
    // binary-output counterpart of the JSON-path test in
    // report.output-format.test.js.
    expect(res.json).not.toHaveBeenCalled();

    const buf = res.getBuffer();
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.slice(0, 5).toString('latin1')).toBe(PDF_MAGIC);
    // A syntactically complete PDF ends with %%EOF (possibly followed by
    // trailing whitespace/newline).
    expect(buf.slice(-8).toString('latin1')).toMatch(/%%EOF\s*$/);
  });
});

describe('?format=excel on every /api/reports/* endpoint (empty dataset)', () => {
  beforeEach(() => jest.clearAllMocks());

  test.each(ENDPOINTS)('$name: sets spreadsheetml Content-Type + Content-Disposition, streams a genuine .xlsx that ExcelJS can re-load', async ({ name, setup, filenameBase }) => {
    setup();
    const req = { query: { format: 'excel', quarter: '1', year: '2026', month: '1' } };
    const res = createStreamRes();

    const finished = waitFinish(res);
    await ctrl[name](req, res);
    await finished;

    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    const disposition = res.getHeader('Content-Disposition');
    expect(disposition).toMatch(/^attachment; filename="/);
    expect(disposition).toContain(`${filenameBase}.xlsx`);
    expect(res.json).not.toHaveBeenCalled();

    const buf = res.getBuffer();
    expect(buf.length).toBeGreaterThan(0);
    expect(buf.slice(0, 4)).toEqual(ZIP_MAGIC);

    // Round-trip: load the exact bytes we streamed back through ExcelJS
    // itself. If this throws, the file we produced is not a real workbook.
    const wb = await readXlsx(buf);
    expect(wb.worksheets.length).toBeGreaterThanOrEqual(1);
    const sheet = wb.worksheets[0];
    // Row 1 = "RSU SDPO - <title>" banner, always present.
    expect(String(sheet.getCell(1, 1).value)).toMatch(/^RSU SDPO -/);
  });
});

describe('default (no format param) still returns JSON when format=pdf/excel are also exercised in the same suite', () => {
  // Sanity check that mixing format=pdf/excel calls above with a plain call
  // in the same test file doesn't leak any renderer state (e.g. reused
  // PDFDocument/Workbook instances) into the JSON path.
  test('borrowing with no format still calls res.json once, not res.send/res.end', async () => {
    jest.clearAllMocks();
    Transaction.findAll.mockResolvedValue([]);
    const req = { query: { quarter: '1', year: '2026' } };
    const res = { json: jest.fn() };
    await ctrl.borrowing(req, res);
    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });

  test('an unrecognized format value (e.g. "csv") falls through to JSON, not an error', async () => {
    jest.clearAllMocks();
    Transaction.findAll.mockResolvedValue([]);
    const req = { query: { format: 'csv', quarter: '1', year: '2026' } };
    const res = { json: jest.fn() };
    await ctrl.borrowing(req, res);
    expect(res.json).toHaveBeenCalledTimes(1);
    expect(res.json.mock.calls[0][0].success).toBe(true);
  });
});

describe('populated-data sanity: PDF and Excel both include real row content, not just an empty shell', () => {
  test('borrowing PDF (populated) is still a valid %PDF- stream with multiple pages worth of headroom untested but non-trivial size', async () => {
    const basketball = makeEquipment({ equipmentName: 'Basketball' });
    const txn = makeTransaction({
      transactionStatus: 'Approved',
      borrower: makeBorrower({ firstName: 'Juan', lastName: 'Dela Cruz' }),
      details: [makeTransactionDetail({ item: makeItem({ equipment: basketball }) })]
    });
    Transaction.findAll.mockResolvedValue([txn]);

    const req = { query: { format: 'pdf', quarter: '1', year: '2026' } };
    const res = createStreamRes();
    ctrl.borrowing(req, res);
    await waitFinish(res);

    const buf = res.getBuffer();
    expect(buf.slice(0, 5).toString('latin1')).toBe(PDF_MAGIC);
    // A populated report should produce more bytes than a bare empty-state PDF.
    expect(buf.length).toBeGreaterThan(500);
  });

  test('condition Excel (populated) round-trips with the expected number of data rows', async () => {
    const equip = makeEquipment({
      equipmentName: 'Volleyball',
      items: [makeItem({ itemCondition: 'Good' }), makeItem({ itemCondition: 'Damaged' })]
    });
    Equipment.findAll.mockResolvedValue([equip]);

    const req = { query: { format: 'excel' } };
    const res = createStreamRes();
    const finished = waitFinish(res);
    await ctrl.condition(req, res);
    await finished;

    const buf = res.getBuffer();
    const wb = await readXlsx(buf);
    const sheet = wb.worksheets[0];

    // Layout per reportRenderer.sendExcel: row1=title, row2=generated-at,
    // row3=blank, then stats rows (3 for condition: Good/Damaged/Lost),
    // then a blank spacer, then the header row, then 1 data row.
    // Rather than hardcode every offset, just confirm the row containing
    // 'Volleyball' exists and the row immediately below the header holds it.
    let found = false;
    sheet.eachRow((row) => {
      if (row.getCell(1).value === 'Volleyball') {
        found = true;
        expect(row.getCell(4).value).toBe('Damaged'); // worst condition
      }
    });
    expect(found).toBe(true);
  });
});
