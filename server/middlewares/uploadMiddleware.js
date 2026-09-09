'use strict';

const multer = require('multer');

// Borrower-submitted documents for the borrowing slip — buffered in memory
// here, then uploaded to Supabase Storage by the controller (see
// borrower.controller.js), which also decides the destination key.
//
// Upload size limits are type-based rather than a single flat cap, kept as
// two separate constants (even though they're equal right now) so image
// and document caps can move independently again later.
//
// Both caps were lowered from their original 5MB/15MB when this app moved
// to Vercel: Vercel hard-caps every serverless function's total request
// body at 4.5MB on every plan, and this endpoint accepts BOTH the ID photo
// and the authorization document together in a single request (see the
// `.fields([...])` call below) — so the two caps have to sum to comfortably
// under 4.5MB, not each independently fit under it. 2MB + 2MB = 4MB,
// leaving headroom for multipart boundary/header overhead. If this app is
// ever run somewhere without that body-size ceiling, these can go back up.
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const DOCUMENT_MIME = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document' // .docx
];
const ALLOWED_MIME = [...IMAGE_MIME, ...DOCUMENT_MIME];

const IMAGE_MAX = 2 * 1024 * 1024; // 2MB
const DOCUMENT_MAX = 2 * 1024 * 1024; // 2MB

function fileFilter(req, file, cb) {
  if (!ALLOWED_MIME.includes(file.mimetype)) {
    return cb(new Error('Only JPG, PNG, WEBP, PDF, or DOCX files are allowed'));
  }
  cb(null, true);
}

// Pure function so it can be unit-tested without simulating a multipart
// request — given a multer file object, returns null when its size is
// within the cap for its MIME category, or a descriptive error message
// when it isn't.
function checkFileSize(file) {
  if (IMAGE_MIME.includes(file.mimetype)) {
    if (file.size > IMAGE_MAX) {
      return 'Images must be 2MB or smaller.';
    }
    return null;
  }
  if (DOCUMENT_MIME.includes(file.mimetype)) {
    if (file.size > DOCUMENT_MAX) {
      return 'Documents must be 2MB or smaller.';
    }
    return null;
  }
  return null;
}

// multer's own limits.fileSize is a single global ceiling applied before
// any per-file logic runs, so it can only express the *highest* allowed
// size of the two — the type-specific cap is then enforced below via
// checkFileSize once multer has parsed the files. Math.max rather than a
// hardcoded constant so this stays correct if the two caps above ever
// diverge again.
const fields = multer({
  storage: multer.memoryStorage(),
  fileFilter,
  limits: { fileSize: Math.max(IMAGE_MAX, DOCUMENT_MAX) }
}).fields([
  { name: 'validId', maxCount: 1 },
  { name: 'authorizationDocument', maxCount: 1 }
]);

// Normalizes multer's errors (wrong type, too large) into this app's
// {success:false,message} contract instead of falling through as a 500.
function uploadDocuments(req, res, next) {
  fields(req, res, (err) => {
    if (err) {
      err.statusCode = 400;
      return next(err);
    }

    // Each field is independent — a borrower can upload just one field at
    // a time — so guard for either being absent before checking size.
    const files = [
      ...((req.files && req.files.validId) || []),
      ...((req.files && req.files.authorizationDocument) || [])
    ];
    for (const file of files) {
      const message = checkFileSize(file);
      if (message) {
        const sizeErr = new Error(message);
        sizeErr.statusCode = 400;
        return next(sizeErr);
      }
    }

    next();
  });
}

module.exports = uploadDocuments;
module.exports.checkFileSize = checkFileSize;
