'use strict';

const multer = require('multer');

// A single real photo per Equipment listing (type-level, not per physical
// unit — see equipment.controller.js#uploadPhoto), replacing the
// category-level stock icon the Equipment Showroom used as its only visual
// before this. Same image MIME types as uploadMiddleware.js's IMAGE_MIME —
// kept as a separate small middleware rather than extended onto
// uploadMiddleware.js's multer .fields() config, since that one is shaped
// specifically around the borrower document fields.
//
// 4MB, not uploadMiddleware.js's 2MB: this endpoint only ever accepts one
// file per request (unlike the borrower-documents endpoint, which can
// receive two files in the same request and has to keep their combined
// size under Vercel's 4.5MB request-body cap), so it can use nearly the
// whole ceiling on its own.
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const IMAGE_MAX = 4 * 1024 * 1024; // 4MB

function fileFilter(req, file, cb) {
  if (!IMAGE_MIME.includes(file.mimetype)) {
    return cb(new Error('Only JPG, PNG, or WEBP images are allowed'));
  }
  cb(null, true);
}

const single = multer({ storage: multer.memoryStorage(), fileFilter, limits: { fileSize: IMAGE_MAX } }).single('photo');

function uploadEquipmentPhoto(req, res, next) {
  single(req, res, (err) => {
    if (err) {
      err.statusCode = 400;
      if (err.code === 'LIMIT_FILE_SIZE') err.message = 'Photo must be 4MB or smaller.';
      return next(err);
    }
    if (!req.file) {
      const noFileErr = new Error('No photo uploaded');
      noFileErr.statusCode = 400;
      return next(noFileErr);
    }
    next();
  });
}

module.exports = uploadEquipmentPhoto;
