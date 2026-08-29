'use strict';

const { sendPdf, sendExcel } = require('./reportRenderer');

const FILENAME_BASE = 'overdue-report';

exports.pdf = (res, reportData) => sendPdf(res, reportData, FILENAME_BASE);
exports.excel = (res, reportData) => sendExcel(res, reportData, FILENAME_BASE);
