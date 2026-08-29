const express = require('express');
const catchAsync = require('../helpers/catchAsync');
const authMiddleware = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/user.controller');

const router = express.Router();

router.use(authMiddleware);
router.put('/profile', catchAsync(ctrl.updateProfile));
router.put('/change-password', catchAsync(ctrl.changePassword));

module.exports = router;
