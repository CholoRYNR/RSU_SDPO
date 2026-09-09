'use strict';

// Shared PDF/Excel rendering for the report controller. All quarterly
// reports (borrowing, overdue, utilization, history, inventory, condition)
// share the same { title, heads, data, stats } shape produced by
// report.controller.js, so the actual document-building logic lives here
// once. The per-report template files in this folder are thin wrappers
// that just pin the download filename for their report type.

const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const ExcelJS = require('exceljs');

// Official RSU SDPO seal (already used elsewhere in the app, e.g. the
// borrowing-form watermark) — reused here for branded PDF/Excel report
// headers. server/app.js serves `client/` statically from the repo root
// (`express.static('client')`), i.e. client/ and server/ are always
// deployed side by side, so this relative path is safe across
// environments. Resolved once at module load and existence-checked so a
// missing/renamed asset degrades to a text-only header instead of crashing
// report generation.
const LOGO_PATH = path.join(__dirname, '..', '..', '..', 'client', 'assets', 'images', 'rsu-sdpo-logo.png');
const LOGO_EXISTS = fs.existsSync(LOGO_PATH);

function slugify(title) {
  const slug = String(title || 'report')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
  return slug || 'report';
}

/**
 * Streams a PDF rendering of a { title, heads, data, stats } report to `res`.
 * @param {import('express').Response} res
 * @param {{ title?: string, heads?: string[], data?: Array<Array<string>>, stats?: Array<[string, string]> }} reportData
 * @param {string} [filenameBase] filename without extension; defaults to a slug of the title
 */
function sendPdf(res, reportData, filenameBase) {
  const { title, heads = [], data = [], stats = [] } = reportData || {};
  const filename = `${filenameBase || slugify(title)}.pdf`;

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // If the client aborts the download mid-stream, `res` can emit an
  // unhandled 'error' (e.g. ECONNRESET). pipe() does not forward 'error'
  // events between source and destination, and an unhandled 'error' event
  // on an EventEmitter crashes the whole Node process — not just this
  // request — so both ends need their own listener.
  res.on('error', (err) => {
    console.error('reportRenderer.sendPdf: response stream error:', err);
    if (res.writable) res.end();
  });

  const doc = new PDFDocument({
    margin: 40,
    size: 'A4',
    layout: heads.length > 5 ? 'landscape' : 'portrait'
  });
  doc.on('error', (err) => {
    console.error('reportRenderer.sendPdf: pdfkit document error:', err);
    if (res.writable) res.end();
  });
  doc.pipe(res);

  const startX = doc.page.margins.left;
  const usableWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  const headerTop = doc.y;
  const LOGO_WIDTH = 42;
  if (LOGO_EXISTS) {
    try {
      doc.image(LOGO_PATH, startX, headerTop, { width: LOGO_WIDTH });
    } catch (err) {
      // A corrupt/unreadable logo file should never break report
      // generation — fall back to the text-only header.
      console.error('reportRenderer.sendPdf: failed to draw header logo:', err);
    }
  }

  doc.font('Helvetica-Bold').fontSize(16).text('RSU SDPO', { align: 'center' });
  doc.font('Helvetica').fontSize(12).text(title || 'Report', { align: 'center' });
  doc.fontSize(8).fillColor('#666666').text(`Generated: ${new Date().toLocaleString('en-US')}`, { align: 'center' });
  doc.fillColor('#000000');

  // doc.image() with an explicit x/y draws without moving the text cursor,
  // so the logo and the centered title block can end at different heights
  // depending on title length/wrapping. Advance past whichever is taller
  // before laying out the rest of the page.
  if (LOGO_EXISTS) {
    doc.y = Math.max(doc.y, headerTop + LOGO_WIDTH);
  }
  doc.moveDown(1);

  if (stats.length) {
    doc.font('Helvetica-Bold').fontSize(10).text('Summary');
    doc.font('Helvetica').fontSize(9);
    stats.forEach(([label, value]) => {
      doc.text(`${label}: ${value}`);
    });
    doc.moveDown(1);
  }

  const colWidth = heads.length ? usableWidth / heads.length : usableWidth;
  const rowHeight = 16;

  function drawRow(cells, y, isHeader) {
    doc.font(isHeader ? 'Helvetica-Bold' : 'Helvetica').fontSize(8);
    cells.forEach((cell, i) => {
      doc.text(cell == null ? '' : String(cell), startX + i * colWidth, y, {
        width: colWidth - 4,
        height: rowHeight,
        ellipsis: true
      });
    });
  }

  function drawHeader(y) {
    if (!heads.length) return y;
    drawRow(heads, y, true);
    const lineY = y + rowHeight - 2;
    doc.moveTo(startX, lineY).lineTo(startX + usableWidth, lineY).strokeColor('#cccccc').stroke();
    doc.strokeColor('#000000');
    return y + rowHeight;
  }

  let y = drawHeader(doc.y);
  const bottomLimit = doc.page.height - doc.page.margins.bottom;

  data.forEach((row) => {
    if (y + rowHeight > bottomLimit) {
      doc.addPage();
      y = drawHeader(doc.page.margins.top);
    }
    drawRow(row, y, false);
    y += rowHeight;
  });

  if (!data.length) {
    doc.font('Helvetica-Oblique').fontSize(9).text('No records found for the selected period.', startX, y + 4);
  }

  doc.end();
}

/**
 * Streams an .xlsx rendering of a { title, heads, data, stats } report to `res`.
 * @param {import('express').Response} res
 * @param {{ title?: string, heads?: string[], data?: Array<Array<string>>, stats?: Array<[string, string]> }} reportData
 * @param {string} [filenameBase] filename without extension; defaults to a slug of the title
 */
async function sendExcel(res, reportData, filenameBase) {
  const { title, heads = [], data = [], stats = [] } = reportData || {};
  const filename = `${filenameBase || slugify(title)}.xlsx`;
  const colCount = Math.max(heads.length, 1);

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'RSU SDPO';
  workbook.created = new Date();

  const sheetName = (title || 'Report').substring(0, 31) || 'Report';
  const sheet = workbook.addWorksheet(sheetName);

  sheet.mergeCells(1, 1, 1, colCount);
  const titleCell = sheet.getCell(1, 1);
  titleCell.value = `RSU SDPO - ${title || 'Report'}`;
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = { horizontal: 'center' };

  sheet.mergeCells(2, 1, 2, colCount);
  const genCell = sheet.getCell(2, 1);
  genCell.value = `Generated: ${new Date().toLocaleString('en-US')}`;
  genCell.font = { italic: true, size: 9, color: { argb: 'FF666666' } };
  genCell.alignment = { horizontal: 'center' };

  // Official RSU SDPO seal, floated over the top-left corner of the header
  // band (rows 1-2). This only overlays visually — it never touches cell
  // values, so the `RSU SDPO - <title>` banner text and every downstream
  // row/column offset the rest of this function (and its tests) depend on
  // are unaffected whether or not the logo file is present.
  if (LOGO_EXISTS) {
    try {
      sheet.getRow(1).height = 30;
      sheet.getRow(2).height = 18;
      const logoImageId = workbook.addImage({ filename: LOGO_PATH, extension: 'png' });
      sheet.addImage(logoImageId, {
        tl: { col: 0.15, row: 0.15 },
        ext: { width: 46, height: 46 }
      });
    } catch (err) {
      console.error('reportRenderer.sendExcel: failed to embed header logo:', err);
    }
  }

  let rowIdx = 4;
  if (stats.length) {
    stats.forEach(([label, value]) => {
      sheet.getCell(rowIdx, 1).value = label;
      sheet.getCell(rowIdx, 1).font = { bold: true };
      sheet.getCell(rowIdx, 2).value = value;
      rowIdx += 1;
    });
    rowIdx += 1;
  }

  if (heads.length) {
    const headerRow = sheet.getRow(rowIdx);
    heads.forEach((h, i) => {
      headerRow.getCell(i + 1).value = h;
    });
    headerRow.eachCell((cell) => {
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' } };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
      cell.alignment = { vertical: 'middle' };
    });
    rowIdx += 1;
  }

  const firstDataRow = rowIdx;
  data.forEach((row) => {
    const r = sheet.getRow(rowIdx);
    row.forEach((val, i) => {
      r.getCell(i + 1).value = val;
    });
    rowIdx += 1;
  });

  for (let i = 0; i < colCount; i += 1) {
    let maxLen = heads[i] ? String(heads[i]).length : 10;
    data.forEach((row) => {
      const v = row[i];
      if (v != null) maxLen = Math.max(maxLen, String(v).length);
    });
    sheet.getColumn(i + 1).width = Math.min(Math.max(maxLen + 2, 12), 50);
  }

  if (!data.length) {
    sheet.mergeCells(firstDataRow, 1, firstDataRow, colCount);
    const emptyCell = sheet.getCell(firstDataRow, 1);
    emptyCell.value = 'No records found for the selected period.';
    emptyCell.font = { italic: true };
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

  // Same rationale as sendPdf above: ExcelJS pipes its internal zip stream
  // to `res` internally, which doesn't forward 'error' events either, so an
  // aborted download can otherwise emit an unhandled 'error' on `res` and
  // crash the process.
  res.on('error', (err) => {
    console.error('reportRenderer.sendExcel: response stream error:', err);
    if (res.writable) res.end();
  });

  await workbook.xlsx.write(res);
  res.end();
}

module.exports = { sendPdf, sendExcel, slugify };
