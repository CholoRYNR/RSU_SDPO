'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('item', {
      item_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      equipment_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'equipment', key: 'equipment_id' },
        onUpdate: 'CASCADE',
        onDelete: 'RESTRICT'
      },
      item_code: { type: Sequelize.STRING(100), allowNull: false, unique: true },
      qr_code_path: { type: Sequelize.STRING(255), allowNull: true },
      item_condition: {
        type: Sequelize.ENUM('Good', 'Damaged', 'Under Repair', 'Lost'),
        allowNull: true,
        defaultValue: 'Good'
      },
      availability_status: {
        type: Sequelize.ENUM('Available', 'Borrowed', 'Reserved'),
        allowNull: true,
        defaultValue: 'Available'
      },
      engraving_status: {
        type: Sequelize.ENUM('Not Engraved', 'Engraved', 'Tagged'),
        allowNull: true,
        defaultValue: 'Not Engraved'
      },
      current_borrower_id: {
        type: Sequelize.INTEGER,
        allowNull: true,
        references: { model: 'borrower', key: 'borrower_id' },
        onUpdate: 'CASCADE',
        onDelete: 'SET NULL'
      },
      created_at: { type: Sequelize.DATE, allowNull: true, defaultValue: Sequelize.fn('now') }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('item');
  }
};
