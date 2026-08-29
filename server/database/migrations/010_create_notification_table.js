'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('notification', {
      notification_id: { type: Sequelize.INTEGER, primaryKey: true, autoIncrement: true },
      user_id: {
        type: Sequelize.INTEGER,
        allowNull: false,
        references: { model: 'user', key: 'user_id' },
        onUpdate: 'CASCADE',
        onDelete: 'CASCADE'
      },
      notification_type: { type: Sequelize.STRING(100), allowNull: false },
      message: { type: Sequelize.TEXT, allowNull: false },
      delivery_channel: { type: Sequelize.ENUM('SMS', 'Email', 'System'), allowNull: false },
      delivery_status: {
        type: Sequelize.ENUM('Pending', 'Sent', 'Failed'),
        allowNull: true,
        defaultValue: 'Pending'
      },
      sent_at: { type: Sequelize.DATE, allowNull: true },
      is_read: { type: Sequelize.BOOLEAN, allowNull: true, defaultValue: false }
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('notification');
  }
};
