const express = require('express');
const catchAsync = require('../helpers/catchAsync');
const ctrl = require('../controllers/equipment.controller');

const router = express.Router();

router.get('/', catchAsync(ctrl.list));
router.get('/:id', catchAsync(ctrl.getOne));
router.post('/', catchAsync(ctrl.create));
router.put('/:id', catchAsync(ctrl.update));
router.delete('/:id', catchAsync(ctrl.remove));

module.exports = router;
