const express = require('express');
const catchAsync = require('../helpers/catchAsync');
const ctrl = require('../controllers/category.controller');

const router = express.Router();

router.get('/', catchAsync(ctrl.list));

module.exports = router;
