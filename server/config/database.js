require('dotenv').config();

/**
 * Sequelize CLI config — every environment connects to the same Supabase
 * Postgres project via DATABASE_URL. (Previously development pointed at a
 * local XAMPP MySQL instance; the team moved to Supabase as the single
 * source of truth for local dev and deployment alike.)
 */
const supabaseConfig = {
  use_env_variable: 'DATABASE_URL',
  dialect: 'postgres',
  dialectOptions: {
    ssl: { require: true, rejectUnauthorized: false }
  }
};

module.exports = {
  development: supabaseConfig,
  test: supabaseConfig,
  production: supabaseConfig
};
