const express = require('express');
const catchAsync = require('../helpers/catchAsync');
const authMiddleware = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/auth.controller');

const router = express.Router();

router.post('/register', catchAsync(ctrl.register));
router.post('/login', catchAsync(ctrl.login));
router.get('/me', authMiddleware, catchAsync(ctrl.me));

// Google/Facebook OAuth: not yet implemented — the auth flow UI's social
// buttons are still decorative mocks pending Google Cloud/Meta app credentials.

module.exports = router;
