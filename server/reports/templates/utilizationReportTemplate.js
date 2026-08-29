'use strict';

const { sendPdf, sendExcel } = require('./reportRenderer');

const FILENAME_BASE = 'equipment-utilization-report';

exports.pdf = (res, reportData) => sendPdf(res, reportData, FILENAME_BASE);
exports.excel = (res, reportData) => sendExcel(res, reportData, FILENAME_BASE);
