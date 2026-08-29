require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');

const routes = require('./routes');
const errorHandler = require('./middlewares/errorHandler');
const sequelize = require('./database/connection');
const { runOverdueSweep } = require('./jobs/overdueSweep');

const app = express();

// Core middleware
// client/ pages use inline <script> blocks and inline onclick/onchange handlers
// throughout (not external .js files), so helmet's default CSP — which blocks
// inline scripts even under 'self' — silently breaks every click on the site.
// Relaxing script-src/script-src-attr here to match style-src's existing
// 'unsafe-inline'. Before any public deployment, migrate inline scripts to
// external files + nonces and drop this back to the strict default.
// This server is plain HTTP only (no TLS listener) in development. Helmet's
// defaults assume HTTPS: it sends Strict-Transport-Security and a CSP with
// upgrade-insecure-requests, which tell the browser to force this origin to
// https on every future visit. Since localhost:3000 never speaks TLS, that
// self-inflicts ERR_INVALID_HTTP_RESPONSE / ERR_SSL_PROTOCOL_ERROR once the
// browser caches the policy. Disable both here; re-enable hsts once this is
// actually served over HTTPS in production.
app.use(
  helmet({
    hsts: false,
    contentSecurityPolicy: {
      directives: {
        ...helmet.contentSecurityPolicy.getDefaultDirectives(),
        'script-src': ["'self'", "'unsafe-inline'"],
        'script-src-attr': ["'unsafe-inline'"],
        'upgrade-insecure-requests': null
      }
    }
  })
);
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// API routes
app.use('/api', routes);

// Static client (optional, adjust if serving client separately)
app.use(express.static('client'));

// Global error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, async () => {
  console.log(`RSU SDPO server running on port ${PORT}`);
  try {
    await sequelize.authenticate();
    console.log(`Database connected (${sequelize.getDialect()} @ ${sequelize.config.host || 'DATABASE_URL'})`);

    // Flip Released transactions past their due date to Overdue — once at
    // startup, then hourly. No new dependency: setInterval is enough at
    // this project's scale and matches its plain-Node style elsewhere.
    runOverdueSweep().catch((err) => console.error('Overdue sweep failed:', err.message));
    setInterval(() => {
      runOverdueSweep().catch((err) => console.error('Overdue sweep failed:', err.message));
    }, 60 * 60 * 1000);
  } catch (err) {
    console.error('Database connection failed:', err.message);
    console.error('Check DATABASE_URL in .env — it must be the Supabase session pooler connection string.');
  }
});

module.exports = app;
