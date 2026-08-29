const express = require('express');
const catchAsync = require('../helpers/catchAsync');
const ctrl = require('../controllers/qr.controller');

const router = express.Router();

router.get('/items', catchAsync(ctrl.listItems));
router.post('/generate', catchAsync(ctrl.generate));
router.get('/lookup/:itemCode', catchAsync(ctrl.lookup));

module.exports = router;
