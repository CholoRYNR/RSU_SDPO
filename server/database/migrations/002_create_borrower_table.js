'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('borrower', {
      borrower_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        unique: true,
        references: { model: 'user', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      first_name: { type: Sequelize.STRING(100), allowNull: false },
      last_name: { type: Sequelize.STRING(100), allowNull: false },
      middle_name: { type: Sequelize.STRING(100), allowNull: true },
      college_or_unit: { type: Sequelize.STRING(200), allowNull: false },
      borrower_category: {
        type: Sequelize.ENUM('Faculty', 'Staff', 'Employee', 'Student', 'External'),
        allowNull: false
      },
      valid_id_path: { type: Sequelize.STRING(255), allowNull: true },
      authorization_document_path: { type: Sequelize.STRING(255), allowNull: true },
      director_authorization_status: {
        type: Sequelize.ENUM('Not Required', 'Pending', 'Authorized'),
        allowNull: false,
        defaultValue: 'Not Required'
      },
      created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.fn('now') },
      updated_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.fn('now') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('borrower');
  }
};
