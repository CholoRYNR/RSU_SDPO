'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('user', {
      user_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      username: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      password: { type: Sequelize.STRING(255), allowNull: false },
      user_role: { type: Sequelize.ENUM('Admin', 'Director', 'Staff', 'Borrower'), allowNull: false },
      email_address: { type: Sequelize.STRING(150), allowNull: false, unique: true },
      contact_number: { type: Sequelize.STRING(15), allowNull: true },
      account_status: {
        type: Sequelize.ENUM('Active', 'Blocked', 'Restricted'),
        allowNull: true,
        defaultValue: 'Active'
      },
      created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.fn('now') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('user');
  }
};
