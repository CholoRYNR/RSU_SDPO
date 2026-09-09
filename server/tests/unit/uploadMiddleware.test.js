'use strict';

// Verifies server/middlewares/uploadMiddleware.js#checkFileSize in
// isolation: type-based upload size limits (Images 2MB max, Documents
// PDF/DOCX 2MB max — lowered from the original 5MB/15MB to fit under
// Vercel's 4.5MB combined request-body cap, since both files can be
// uploaded together in one request; see the comment above IMAGE_MAX/
// DOCUMENT_MAX in uploadMiddleware.js). checkFileSize is a pure function
// of a plain { mimetype, size } object, so this exercises it directly
// without simulating a full multipart HTTP request through multer.

const uploadDocuments = require('../../middlewares/uploadMiddleware');

const { checkFileSize } = uploadDocuments;

const ONE_MB = 1024 * 1024;

describe('middlewares/uploadMiddleware.js#checkFileSize', () => {
  test('an image at exactly the 2MB cap is allowed', () => {
    expect(checkFileSize({ mimetype: 'image/jpeg', size: 2 * ONE_MB })).toBeNull();
  });

  test('an image one byte over the 2MB cap is rejected with an image-specific message', () => {
    const message = checkFileSize({ mimetype: 'image/jpeg', size: 2 * ONE_MB + 1 });
    expect(message).toEqual(expect.stringContaining('2MB'));
    expect(message.toLowerCase()).toContain('image');
  });

  test('a PDF at exactly the 2MB cap is allowed', () => {
    expect(checkFileSize({ mimetype: 'application/pdf', size: 2 * ONE_MB })).toBeNull();
  });

  test('a PDF one byte over the 2MB cap is rejected with a document-specific message', () => {
    const message = checkFileSize({ mimetype: 'application/pdf', size: 2 * ONE_MB + 1 });
    expect(message).toEqual(expect.stringContaining('2MB'));
    expect(message.toLowerCase()).toContain('document');
  });

  test('a DOCX at exactly its 2MB document cap is allowed (not a default/missing category)', () => {
    const message = checkFileSize({
      mimetype: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      size: 2 * ONE_MB
    });
    expect(message).toBeNull();
  });

  test('a small image well under its cap is allowed', () => {
    expect(checkFileSize({ mimetype: 'image/png', size: 200 * 1024 })).toBeNull();
  });

  test('a small PDF well under its cap is allowed', () => {
    expect(checkFileSize({ mimetype: 'application/pdf', size: 200 * 1024 })).toBeNull();
  });
});
