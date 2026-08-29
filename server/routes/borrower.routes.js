const express = require('express');
const catchAsync = require('../helpers/catchAsync');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const uploadDocuments = require('../middlewares/uploadMiddleware');
const ctrl = require('../controllers/borrower.controller');

const router = express.Router();
const borrowerOnly = roleMiddleware(['Borrower']);
const staffOnly = roleMiddleware(['Admin', 'Director', 'Staff']);

router.get('/', authMiddleware, staffOnly, catchAsync(ctrl.list));
router.get('/me/documents', authMiddleware, borrowerOnly, catchAsync(ctrl.myDocumentStatus));
router.post('/me/documents', authMiddleware, borrowerOnly, uploadDocuments, catchAsync(ctrl.uploadDocuments));

// Staff reviewing a borrower's submitted ID/authorization document from the
// transaction drawer. Routes above (/me/documents) must stay registered
// first so they aren't shadowed by these :id params.
router.get('/:id/documents', authMiddleware, staffOnly, catchAsync(ctrl.staffDocumentStatus));
router.get('/:id/documents/:type', authMiddleware, staffOnly, catchAsync(ctrl.downloadDocument));

module.exports = router;
