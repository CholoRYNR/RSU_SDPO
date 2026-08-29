'use strict';

// None of the preceding 16 migrations create explicit indexes on
// foreign-key columns. Postgres automatically indexes primary keys and
// columns carrying a UNIQUE constraint, but plain FK columns get no index
// unless one is added explicitly — every join/filter on these columns
// (e.g. "all transactions for this borrower", "all items for this
// equipment") would otherwise force a sequential scan as the tables grow.
//
// borrower.user_id is intentionally NOT included below: it already carries
// a UNIQUE constraint (migration 002), and Postgres backs every UNIQUE
// constraint with its own index automatically.
//
// This is an additive, non-destructive migration (CREATE INDEX / DROP
// INDEX only) — it does not alter any existing table structure or data,
// so it is safe to run against the live Supabase database without
// touching the 16 already-applied migrations above it.
module.exports = {
  async up(queryInterface) {
    await queryInterface.addIndex('equipment', ['category_id'], {
      name: 'equipment_category_id_idx'
    });

    await queryInterface.addIndex('item', ['equipment_id'], {
      name: 'item_equipment_id_idx'
    });
    await queryInterface.addIndex('item', ['current_borrower_id'], {
      name: 'item_current_borrower_id_idx'
    });

    await queryInterface.addIndex('transaction', ['borrower_id'], {
      name: 'transaction_borrower_id_idx'
    });
    await queryInterface.addIndex('transaction', ['approved_by'], {
      name: 'transaction_approved_by_idx'
    });
    await queryInterface.addIndex('transaction', ['released_by'], {
      name: 'transaction_released_by_idx'
    });
    await queryInterface.addIndex('transaction', ['returned_by'], {
      name: 'transaction_returned_by_idx'
    });
    await queryInterface.addIndex('transaction', ['received_by_staff'], {
      name: 'transaction_received_by_staff_idx'
    });
    await queryInterface.addIndex('transaction', ['reviewed_by'], {
      name: 'transaction_reviewed_by_idx'
    });

    await queryInterface.addIndex('transaction_details', ['transaction_id'], {
      name: 'transaction_details_transaction_id_idx'
    });
    await queryInterface.addIndex('transaction_details', ['item_id'], {
      name: 'transaction_details_item_id_idx'
    });

    await queryInterface.addIndex('transaction_logs', ['transaction_id'], {
      name: 'transaction_logs_transaction_id_idx'
    });
    await queryInterface.addIndex('transaction_logs', ['changed_by'], {
      name: 'transaction_logs_changed_by_idx'
    });

    await queryInterface.addIndex('maintenance_fee', ['transaction_id'], {
      name: 'maintenance_fee_transaction_id_idx'
    });
    await queryInterface.addIndex('maintenance_fee', ['borrower_id'], {
      name: 'maintenance_fee_borrower_id_idx'
    });

    await queryInterface.addIndex('notification', ['user_id'], {
      name: 'notification_user_id_idx'
    });

    await queryInterface.addIndex('damage_loss_records', ['transaction_id'], {
      name: 'damage_loss_records_transaction_id_idx'
    });
    await queryInterface.addIndex('damage_loss_records', ['borrower_id'], {
      name: 'damage_loss_records_borrower_id_idx'
    });
    await queryInterface.addIndex('damage_loss_records', ['item_id'], {
      name: 'damage_loss_records_item_id_idx'
    });
    await queryInterface.addIndex('damage_loss_records', ['recorded_by'], {
      name: 'damage_loss_records_recorded_by_idx'
    });
    await queryInterface.addIndex('damage_loss_records', ['replacement_verified_by'], {
      name: 'damage_loss_records_replacement_verified_by_idx'
    });
  },

  async down(queryInterface) {
    await queryInterface.removeIndex('damage_loss_records', 'damage_loss_records_replacement_verified_by_idx');
    await queryInterface.removeIndex('damage_loss_records', 'damage_loss_records_recorded_by_idx');
    await queryInterface.removeIndex('damage_loss_records', 'damage_loss_records_item_id_idx');
    await queryInterface.removeIndex('damage_loss_records', 'damage_loss_records_borrower_id_idx');
    await queryInterface.removeIndex('damage_loss_records', 'damage_loss_records_transaction_id_idx');

    await queryInterface.removeIndex('notification', 'notification_user_id_idx');

    await queryInterface.removeIndex('maintenance_fee', 'maintenance_fee_borrower_id_idx');
    await queryInterface.removeIndex('maintenance_fee', 'maintenance_fee_transaction_id_idx');

    await queryInterface.removeIndex('transaction_logs', 'transaction_logs_changed_by_idx');
    await queryInterface.removeIndex('transaction_logs', 'transaction_logs_transaction_id_idx');

    await queryInterface.removeIndex('transaction_details', 'transaction_details_item_id_idx');
    await queryInterface.removeIndex('transaction_details', 'transaction_details_transaction_id_idx');

    await queryInterface.removeIndex('transaction', 'transaction_reviewed_by_idx');
    await queryInterface.removeIndex('transaction', 'transaction_received_by_staff_idx');
    await queryInterface.removeIndex('transaction', 'transaction_returned_by_idx');
    await queryInterface.removeIndex('transaction', 'transaction_released_by_idx');
    await queryInterface.removeIndex('transaction', 'transaction_approved_by_idx');
    await queryInterface.removeIndex('transaction', 'transaction_borrower_id_idx');

    await queryInterface.removeIndex('item', 'item_current_borrower_id_idx');
    await queryInterface.removeIndex('item', 'item_equipment_id_idx');

    await queryInterface.removeIndex('equipment', 'equipment_category_id_idx');
  }
};
