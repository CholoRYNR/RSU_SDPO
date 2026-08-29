const express = require('express');
const catchAsync = require('../helpers/catchAsync');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const ctrl = require('../controllers/report.controller');

const router = express.Router();
const staffOnly = roleMiddleware(['Admin', 'Director', 'Staff']);

router.get('/transaction-log', authMiddleware, staffOnly, catchAsync(ctrl.transactionLog));
router.get('/borrowing', authMiddleware, staffOnly, catchAsync(ctrl.borrowing));
router.get('/overdue', authMiddleware, staffOnly, catchAsync(ctrl.overdue));
router.get('/utilization', authMiddleware, staffOnly, catchAsync(ctrl.utilization));
router.get('/inventory', authMiddleware, staffOnly, catchAsync(ctrl.inventory));
router.get('/history', authMiddleware, staffOnly, catchAsync(ctrl.history));
router.get('/condition', authMiddleware, staffOnly, catchAsync(ctrl.condition));

module.exports = router;
