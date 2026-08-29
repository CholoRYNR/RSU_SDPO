'use strict';

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getClient } = require('../config/supabase');

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'borrower-documents';
const LEGACY_UPLOADS = [
  { dir: 'valid_ids', folder: 'valid_ids' },
  { dir: 'authorization_documents', folder: 'authorization_documents' }
];
const EXT_TO_MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf'
};

// One-time setup: creates the private borrower-documents bucket if it
// doesn't exist yet, then uploads any files still sitting in the old
// server/uploads/ folders (pre-Supabase-Storage installs) so existing
// borrower records keep working. Safe to re-run.
async function main() {
  const supabase = getClient();

  const { data: buckets, error: listErr } = await supabase.storage.listBuckets();
  if (listErr) throw new Error(`Could not list buckets: ${listErr.message}`);

  if (!buckets.some((b) => b.name === BUCKET)) {
    const { error: createErr } = await supabase.storage.createBucket(BUCKET, { public: false });
    if (createErr) throw new Error(`Could not create bucket "${BUCKET}": ${createErr.message}`);
    console.log(`Created private bucket "${BUCKET}".`);
  } else {
    console.log(`Bucket "${BUCKET}" already exists.`);
  }

  for (const { dir, folder } of LEGACY_UPLOADS) {
    const localDir = path.join(__dirname, '..', 'uploads', dir);
    if (!fs.existsSync(localDir)) continue;

    const files = fs.readdirSync(localDir).filter((f) => f !== '.gitkeep');
    for (const filename of files) {
      const key = path.posix.join(folder, filename);
      const buffer = fs.readFileSync(path.join(localDir, filename));
      const contentType = EXT_TO_MIME[path.extname(filename).toLowerCase()] || 'application/octet-stream';

      const { error } = await supabase.storage.from(BUCKET).upload(key, buffer, { contentType, upsert: true });
      if (error) {
        console.error(`  FAILED  ${key}: ${error.message}`);
      } else {
        console.log(`  migrated ${key}`);
      }
    }
  }

  console.log('Done. Existing borrower.validIdPath / authorizationDocumentPath values already match these storage keys, so no DB update is needed.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
