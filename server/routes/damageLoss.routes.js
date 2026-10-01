const express = require('express');
const catchAsync = require('../helpers/catchAsync');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const ctrl = require('../controllers/damageLoss.controller');

const router = express.Router();
const staffOnly = roleMiddleware(['Admin', 'Director', 'Staff']);

router.use(authMiddleware, staffOnly);
router.get('/', catchAsync(ctrl.list));
router.patch('/:id/replacement', catchAsync(ctrl.submitReplacement));
router.patch('/:id/verify', catchAsync(ctrl.verifyReplacement));
router.patch('/:id/resolve', catchAsync(ctrl.resolve));
router.patch('/:id/flag', catchAsync(ctrl.flag));
router.patch('/:id/unflag', catchAsync(ctrl.unflag));

module.exports = router;
