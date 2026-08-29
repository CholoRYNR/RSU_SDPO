const express = require('express');
const catchAsync = require('../helpers/catchAsync');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const ctrl = require('../controllers/equipment.controller');

const router = express.Router();
const staffOnly = roleMiddleware(['Admin', 'Director', 'Staff']);

router.get('/', catchAsync(ctrl.list));
router.get('/:id', catchAsync(ctrl.getOne));
router.post('/', authMiddleware, staffOnly, catchAsync(ctrl.create));
router.put('/:id', authMiddleware, staffOnly, catchAsync(ctrl.update));
router.delete('/:id', authMiddleware, staffOnly, catchAsync(ctrl.remove));

module.exports = router;
