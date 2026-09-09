const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/users', require('./user.routes'));
router.use('/borrowers', require('./borrower.routes'));
router.use('/equipment', require('./equipment.routes'));
router.use('/categories', require('./category.routes'));
router.use('/qr', require('./qr.routes'));
router.use('/borrow', require('./borrow.routes'));
router.use('/return', require('./return.routes'));
router.use('/damage-loss', require('./damageLoss.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/reports', require('./report.routes'));
router.use('/dashboard', require('./dashboard.routes'));
router.use('/audit-logs', require('./auditLog.routes'));
router.use('/cron', require('./cron.routes'));

module.exports = router;
