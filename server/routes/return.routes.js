const express = require('express');
const catchAsync = require('../helpers/catchAsync');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const ctrl = require('../controllers/return.controller');

const router = express.Router();

router.post('/:id', authMiddleware, roleMiddleware(['Admin', 'Director', 'Staff']), catchAsync(ctrl.returnTransaction));

module.exports = router;
