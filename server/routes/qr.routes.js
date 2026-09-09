const express = require('express');
const catchAsync = require('../helpers/catchAsync');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const ctrl = require('../controllers/qr.controller');

const router = express.Router();
const staffOnly = roleMiddleware(['Admin', 'Director', 'Staff']);

router.get('/items', authMiddleware, staffOnly, catchAsync(ctrl.listItems));
router.post('/generate', authMiddleware, staffOnly, catchAsync(ctrl.generate));
router.patch('/items/:id/status', authMiddleware, staffOnly, catchAsync(ctrl.updateItemStatus));
// Public: client/pages/scan.html depends on this staying unauthenticated for
// the public equipment-lookup-by-QR flow.
router.get('/lookup/:itemCode', catchAsync(ctrl.lookup));

module.exports = router;
