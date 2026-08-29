const { Sequelize } = require('sequelize');
const config = require('../config/database');

const env = process.env.NODE_ENV || 'development';
const envConfig = config[env];

const sequelize = envConfig.use_env_variable
  ? new Sequelize(process.env[envConfig.use_env_variable], envConfig)
  : new Sequelize(envConfig.database, envConfig.username, envConfig.password, envConfig);

module.exports = sequelize;
