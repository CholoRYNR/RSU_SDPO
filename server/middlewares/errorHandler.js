module.exports = (err, req, res, next) => {
  console.error(err.stack);
  // Streaming endpoints (PDF/Excel report export) can throw after bytes are
  // already on the wire. Calling res.json() at that point would itself
  // throw ERR_HTTP_HEADERS_SENT, so delegate to Express's default handler
  // instead of attempting to send a fresh response.
  if (res.headersSent) {
    return next(err);
  }
  const status = err.statusCode || 500;
  res.status(status).json({
    success: false,
    message: err.message || 'Internal Server Error',
    // Only ever set by authMiddleware.js right now (AUTH_EXPIRED) — purely
    // additive, existing consumers that only destructure {success,message,
    // data} are unaffected. Lets the client tell a real expired/missing
    // session apart from an ordinary business-logic 401 (wrong password,
    // etc.) without guessing from message text.
    ...(err.code ? { code: err.code } : {}),
  });
};
