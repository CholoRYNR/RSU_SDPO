const express = require('express');
const passport = require('passport');
const catchAsync = require('../helpers/catchAsync');
const authMiddleware = require('../middlewares/authMiddleware');
const ctrl = require('../controllers/auth.controller');
const { User, Borrower } = require('../models');
// Requiring this registers the 'google' strategy against the shared
// passport singleton above (see server/config/passport.js) — needed before
// passport.authenticate('google', ...) below can resolve that strategy by
// name. server/app.js also requires it at startup for the same reason;
// requiring it again here is a no-op (Node caches the module).
require('../config/passport');

const router = express.Router();

router.post('/register', catchAsync(ctrl.register));
router.post('/login', catchAsync(ctrl.login));
router.post('/verify-registration', catchAsync(ctrl.verifyRegistration));
router.post('/resend-verification', catchAsync(ctrl.resendVerification));
router.post('/forgot-password', catchAsync(ctrl.forgotPassword));
router.post('/reset-password', catchAsync(ctrl.resetPassword));
router.get('/me', authMiddleware, catchAsync(ctrl.me));

// Google OAuth 2.0. This app is stateless/JWT-based (no express-session
// anywhere), so every passport.authenticate() call here passes
// { session: false } — passport must not fall back to req.session, which
// doesn't exist.
router.get('/google', passport.authenticate('google', { session: false, scope: ['profile', 'email'] }));

router.get(
  '/google/callback',
  // failureRedirect covers the "no real error, just no successful login"
  // case — e.g. the user cancels the Google consent screen — where the
  // strategy calls done(null, false) rather than done(err).
  passport.authenticate('google', {
    session: false,
    failureRedirect: '/pages/auth/user-login.html?oauth_error=1'
  }),
  catchAsync(async (req, res) => {
    // req.user is the User instance server/config/passport.js's verify
    // callback resolved (matched by googleId, linked by email, or newly
    // created — always a Borrower per that file's rule). Re-fetch with the
    // borrowerProfile include so serializeUser() sees the same shape the
    // password-login path does.
    const withBorrower = await User.findByPk(req.user.id, {
      include: [{ model: Borrower, as: 'borrowerProfile' }]
    });
    const token = ctrl.signToken(withBorrower);
    const serialized = ctrl.serializeUser(withBorrower);
    // A URL fragment (#), not a query string: fragments never leave the
    // browser, so the token never lands in morgan's access log or in a
    // Referer header the way a query string would.
    res.redirect(
      `/pages/auth/oauth-complete.html#token=${encodeURIComponent(token)}&user=${encodeURIComponent(
        JSON.stringify(serialized)
      )}`
    );
  }),
  // Route-scoped error handler (4 args = error middleware). Express's Route
  // dispatch runs handlers registered together in one router.get() call as
  // a single stack, skipping straight to the first 4-arg handler when an
  // earlier one calls next(err) — which is exactly what happens when
  // config/passport.js's verify callback rejects with done(err) (e.g. the
  // "email belongs to a staff account" case). Converts that into a redirect
  // carrying the specific message, instead of falling through to the global
  // JSON error handler, which would leave the browser looking at a raw API
  // error instead of the login page.
  (err, req, res, next) => { // eslint-disable-line no-unused-vars
    const message =
      (err && err.message) || 'Google sign-in failed. Please try again or use your username and password.';
    res.redirect(`/pages/auth/user-login.html?oauth_error=${encodeURIComponent(message)}`);
  }
);

module.exports = router;
