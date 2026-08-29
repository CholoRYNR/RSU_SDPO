'use strict';

const { createClient } = require('@supabase/supabase-js');

// Created lazily (not at require-time) so importing this module doesn't
// crash the whole app for routes that never touch Storage before the
// Supabase env vars are configured.
let client = null;

function getClient() {
  if (!client) {
    const { SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY } = process.env;
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in .env — see .env.example');
    }
    // Service-role key: this client only ever runs server-side (never sent
    // to the browser) and needs to read/write borrower documents in a
    // private bucket regardless of Row Level Security policies.
    client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false }
    });
  }
  return client;
}

module.exports = { getClient };
