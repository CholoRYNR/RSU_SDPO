'use strict';

// Registers the Google OAuth 2.0 strategy against the shared passport
// singleton. server/app.js requires 'passport' itself and then requires
// this file purely for the side effect of running configurePassport()
// below, at server startup — that's what executes
// passport.use(new GoogleStrategy(...)).
//
// Credentials are read from process.env only inside configurePassport(),
// which runs once when this file is first required (never captured at
// module-load time before that), mirroring config/mailer.js's rule of
// reading env vars at call time rather than up front. One difference from
// mailer.js: passport-google-oauth20's Strategy constructor needs
// clientID/clientSecret synchronously the moment it is built (it throws a
// TypeError if either is empty), so those two values can't be deferred all
// the way out to each individual OAuth request the way mailer.js defers
// SMTP credentials to each sendMail() call. To keep this file safe to
// require with no .env present, a missing GOOGLE_CLIENT_ID/
// GOOGLE_CLIENT_SECRET falls back to an inert placeholder string instead of
// throwing — the real /api/auth/google flow will simply fail once someone
// visits it (Google rejects a bogus client id) until real credentials are
// set, but the server itself still boots.
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { User } = require('../models');

// Derives a unique username from the local part of an email address
// ('juan.delacruz@gmail.com' -> 'juandelacruz'), appending digits until the
// candidate is free. Falls back to 'googleuser' if the email is missing or
// its local part has no usable characters at all.
async function generateUniqueUsername(email) {
  const localPart = email ? email.split('@')[0] : '';
  const base = localPart.replace(/[^a-zA-Z0-9._-]/g, '') || 'googleuser';

  let candidate = base;
  let suffix = 0;
  // Undergrad-capstone scale (a handful of concurrent sign-ups at most), so a
  // simple sequential existence check is fine — no need for a more elaborate
  // collision-avoidance scheme.
  // eslint-disable-next-line no-await-in-loop
  while (await User.findOne({ where: { username: candidate } })) {
    suffix += 1;
    candidate = `${base}${suffix}`;
  }
  return candidate;
}

// The actual verify-callback logic, factored out of the GoogleStrategy
// constructor so it can be unit-tested directly (by mocking ../models)
// without needing to drive the real OAuth2Strategy machinery.
//
// Enforces the same rule auth.controller.js#register already enforces for
// password self-registration: a self-service sign-in path (there, the
// public /api/auth/register endpoint; here, Google sign-in) may only ever
// create or authenticate into a Borrower-role account. It must never create
// or match into an Admin/Director/Staff account — those are provisioned
// separately by SDPO staff, not through public self-service.
async function handleGoogleProfile(profile) {
  const existingByGoogleId = await User.findOne({ where: { googleId: profile.id } });
  if (existingByGoogleId) {
    return existingByGoogleId;
  }

  const email = profile.emails && profile.emails[0] && profile.emails[0].value;
  if (!email) {
    const err = new Error('Your Google account did not share an email address. Please use another sign-in method.');
    throw err;
  }

  const existingByEmail = await User.findOne({ where: { emailAddress: email } });
  if (existingByEmail) {
    // An account with this email already exists (most likely registered the
    // normal username/password way). Only a Borrower account may be linked
    // to a Google sign-in — never silently attach Google login to a staff
    // account.
    if (existingByEmail.userRole !== 'Borrower') {
      const err = new Error('This email belongs to a staff account. Please sign in with your username and password.');
      throw err;
    }
    existingByEmail.googleId = profile.id;
    await existingByEmail.save();
    return existingByEmail;
  }

  // Brand new email: create a Borrower-role User only. A Borrower profile
  // row (firstName/lastName/collegeOrUnit/borrowerCategory) is intentionally
  // NOT created here — Google's basic profile scope doesn't reliably supply
  // any of that, and collegeOrUnit/borrowerCategory never will. The user
  // completes that profile afterward; until they do,
  // borrow.controller.js#createSelfRequest already blocks the one action
  // that needs it ("Only borrower accounts can submit a borrowing request"),
  // which is exactly the right existing guard.
  //
  // password is allowNull:false on this model, but a Google-only account has
  // no password of its own, so a securely random, unusable value is hashed
  // and stored purely to satisfy the column constraint — nobody can ever log
  // in with it because nobody (including the account owner) knows it.
  const username = await generateUniqueUsername(email);
  const randomPassword = crypto.randomBytes(32).toString('hex');
  const passwordHash = await bcrypt.hash(randomPassword, 10);

  const created = await User.create({
    username,
    emailAddress: email,
    password: passwordHash,
    userRole: 'Borrower',
    googleId: profile.id,
    accountStatus: 'Active'
  });

  return created;
}

function configurePassport() {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID || 'not-configured',
        clientSecret: process.env.GOOGLE_CLIENT_SECRET || 'not-configured',
        callbackURL: process.env.GOOGLE_CALLBACK_URL || 'http://localhost:3000/api/auth/google/callback'
      },
      (accessToken, refreshToken, profile, done) => {
        handleGoogleProfile(profile)
          .then((user) => done(null, user))
          .catch((err) => done(err));
      }
    )
  );
}

configurePassport();

// Nothing else in this app needs this file's return value — server/app.js
// requires it purely for the passport.use(...) side effect above, and gets
// the shared `passport` singleton itself from require('passport') directly.
// The verify-callback logic is exported here only so it can be unit-tested
// (server/tests/unit/passport.test.js) without going through the real
// GoogleStrategy/OAuth2 machinery.
module.exports = { handleGoogleProfile, generateUniqueUsername };
