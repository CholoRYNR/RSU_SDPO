'use strict';

const path = require('path');
const { Borrower, User } = require('../models');
const { getClient } = require('../config/supabase');

const DOCUMENTS_BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'borrower-documents';

function serialize(borrower) {
  return {
    id: borrower.id,
    firstName: borrower.firstName,
    lastName: borrower.lastName,
    middleName: borrower.middleName,
    collegeOrUnit: borrower.collegeOrUnit,
    borrowerCategory: borrower.borrowerCategory,
    directorAuthorizationStatus: borrower.directorAuthorizationStatus,
    user: borrower.user
      ? { id: borrower.user.id, emailAddress: borrower.user.emailAddress, accountStatus: borrower.user.accountStatus }
      : null
  };
}

exports.list = async (req, res) => {
  const rows = await Borrower.findAll({
    include: [{ model: User, as: 'user' }],
    order: [['lastName', 'ASC'], ['firstName', 'ASC']]
  });
  res.json({ success: true, data: rows.map(serialize) });
};

function documentStatus(borrower) {
  return {
    validIdUploaded: !!(borrower && borrower.validIdPath),
    authorizationDocumentUploaded: !!(borrower && borrower.authorizationDocumentPath)
  };
}

async function findOwnBorrower(req) {
  const borrower = await Borrower.findOne({ where: { userId: req.user.id } });
  if (!borrower) {
    const err = new Error('Only borrower accounts have documents on file');
    err.statusCode = 403;
    throw err;
  }
  return borrower;
}

exports.myDocumentStatus = async (req, res) => {
  const borrower = await Borrower.findOne({ where: { userId: req.user.id } });
  res.json({ success: true, data: documentStatus(borrower) });
};

async function uploadToStorage(folder, field, req, file) {
  const ext = path.extname(file.originalname).toLowerCase();
  const key = path.posix.join(folder, `borrower-${req.user.id}-${field}-${Date.now()}${ext}`);
  const { error } = await getClient()
    .storage.from(DOCUMENTS_BUCKET)
    .upload(key, file.buffer, { contentType: file.mimetype, upsert: false });
  if (error) {
    const err = new Error(`Failed to upload ${field}: ${error.message}`);
    err.statusCode = 502;
    throw err;
  }
  return key;
}

// Each field is independent — a borrower can upload just the ID now and the
// authorization document later (or both together); requiredness for actually
// submitting a request is enforced client-side against this saved state.
exports.uploadDocuments = async (req, res) => {
  const borrower = await findOwnBorrower(req);
  const files = req.files || {};

  if (!files.validId && !files.authorizationDocument) {
    const err = new Error('No file uploaded — attach a valid ID or authorization document');
    err.statusCode = 400;
    throw err;
  }

  if (files.validId) {
    borrower.validIdPath = await uploadToStorage('valid_ids', 'validId', req, files.validId[0]);
  }
  if (files.authorizationDocument) {
    borrower.authorizationDocumentPath = await uploadToStorage(
      'authorization_documents',
      'authorizationDocument',
      req,
      files.authorizationDocument[0]
    );
  }
  await borrower.save();

  res.json({ success: true, data: documentStatus(borrower) });
};

// ---- Staff-facing document review (transaction drawer "View Document") ----

const DOCUMENT_FIELD_BY_TYPE = { 'valid-id': 'validIdPath', 'authorization-document': 'authorizationDocumentPath' };

exports.staffDocumentStatus = async (req, res) => {
  const borrower = await Borrower.findByPk(req.params.id);
  if (!borrower) {
    const err = new Error('Borrower not found');
    err.statusCode = 404;
    throw err;
  }
  res.json({ success: true, data: documentStatus(borrower) });
};

exports.downloadDocument = async (req, res) => {
  const field = DOCUMENT_FIELD_BY_TYPE[req.params.type];
  if (!field) {
    const err = new Error('Unknown document type — expected "valid-id" or "authorization-document"');
    err.statusCode = 400;
    throw err;
  }

  const borrower = await Borrower.findByPk(req.params.id);
  if (!borrower || !borrower[field]) {
    const err = new Error('That document has not been submitted');
    err.statusCode = 404;
    throw err;
  }

  const { data, error } = await getClient().storage.from(DOCUMENTS_BUCKET).download(borrower[field]);
  if (error || !data) {
    return res.status(404).json({ success: false, message: 'Document file is missing in storage' });
  }
  res.set('Content-Type', data.type || 'application/octet-stream');
  res.send(Buffer.from(await data.arrayBuffer()));
};
