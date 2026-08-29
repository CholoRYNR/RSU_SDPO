'use strict';

const multer = require('multer');

// Borrower-submitted documents for the borrowing slip — buffered in memory
// here, then uploaded to Supabase Storage by the controller (see
// borrower.controller.js), which also decides the destination key.
const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
const MAX_SIZE = 5 * 1024 * 1024; // 5MB

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    return cb(new Error('Only JPG, PNG, WEBP, or PDF files are allowed'));
  }
  cb(null, true);
}

const fields = multer({ storage: multer.memoryStorage(), fileFilter, limits: { fileSize: MAX_SIZE } }).fields([
  { name: 'validId', maxCount: 1 },
  { name: 'authorizationDocument', maxCount: 1 }
]);

// Normalizes multer's errors (wrong type, too large) into this app's
// {success:false,message} contract instead of falling through as a 500.
module.exports = function uploadDocuments(req, res, next) {
  fields(req, res, (err) => {
    if (err) {
      err.statusCode = 400;
      return next(err);
    }
    next();
  });
};
