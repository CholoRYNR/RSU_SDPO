'use strict';

// System-integrity pass (2026-10):
//
//  1. notification.dedupe_key + UNIQUE (user_id, dedupe_key) — one workflow
//     event can only ever produce one notification per recipient, even if
//     the action is double-submitted or re-triggered (helpers/notify.js).
//  2. transaction.documents_verified_by / documents_verified_datetime — the
//     Admin/Staff document-verification step a request must pass before it
//     can reach the Director. Rows already past review are backfilled from
//     their existing review fields so in-flight requests keep moving.
//  3. transaction.request_key + UNIQUE (borrower_id, request_key) —
//     idempotency for self-service submissions.
//  4. Canonical item codes: every unit's code becomes
//     "EQ-<equipment_id padded to 3>-<sequence padded to 3>" so the QR label,
//     the equipment record, borrowing requests and transactions all carry
//     the same Equipment ID. The previous code is preserved in
//     item.legacy_item_code so already-printed labels still resolve.
//  5. Stock reconciliation: available_quantity is recomputed from the units
//     actually marked Available. (New equipment no longer starts at 0 —
//     equipment.controller.js#create now registers every unit up front.)
//
// Postgres only (uses regex operators and window functions).

// LPAD() truncates values longer than the target width; JS padStart (used
// by helpers/equipmentCode.js) doesn't — this keeps both identical.
const pad3 = (expr) => `(CASE WHEN length((${expr})::text) >= 3 THEN (${expr})::text ELSE lpad((${expr})::text, 3, '0') END)`;
const CANONICAL = "'^EQ-[0-9]+-[0-9]+$'";

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.sequelize.transaction(async (t) => {
      // 1. Notifications
      await queryInterface.addColumn('notification', 'dedupe_key', { type: Sequelize.STRING(120), allowNull: true }, { transaction: t });
      await queryInterface.addIndex('notification', ['user_id', 'dedupe_key'], {
        unique: true,
        name: 'notification_user_id_dedupe_key_unique',
        transaction: t
      });

      // 2. Document verification
      await queryInterface.addColumn(
        'transaction',
        'documents_verified_by',
        {
          type: Sequelize.INTEGER,
          allowNull: true,
          references: { model: 'user', key: 'user_id' },
          onUpdate: 'CASCADE',
          onDelete: 'SET NULL'
        },
        { transaction: t }
      );
      await queryInterface.addColumn('transaction', 'documents_verified_datetime', { type: Sequelize.DATE, allowNull: true }, { transaction: t });
      await queryInterface.sequelize.query(
        `UPDATE "transaction"
            SET documents_verified_by = reviewed_by,
                documents_verified_datetime = COALESCE(review_datetime, updated_at)
          WHERE transaction_status IN ('For Approval','Approved','Released','Returned','Overdue','For Resolution','Replacement','Resolved','Completed')
            AND documents_verified_datetime IS NULL`,
        { transaction: t }
      );

      // 3. Request idempotency
      await queryInterface.addColumn('transaction', 'request_key', { type: Sequelize.STRING(64), allowNull: true }, { transaction: t });
      await queryInterface.addIndex('transaction', ['borrower_id', 'request_key'], {
        unique: true,
        name: 'transaction_borrower_id_request_key_unique',
        transaction: t
      });

      // 4. Canonical item codes
      await queryInterface.addColumn('item', 'legacy_item_code', { type: Sequelize.STRING(100), allowNull: true, unique: true }, { transaction: t });
      await queryInterface.sequelize.query(
        `UPDATE item SET legacy_item_code = item_code WHERE item_code !~ ${CANONICAL}`,
        { transaction: t }
      );
      await queryInterface.sequelize.query(
        `WITH used AS (
           SELECT equipment_id, COALESCE(MAX(split_part(item_code, '-', 3)::int), 0) AS max_seq
             FROM item
            WHERE item_code ~ ${CANONICAL}
            GROUP BY equipment_id
         ), numbered AS (
           SELECT i.item_id, i.equipment_id,
                  ROW_NUMBER() OVER (PARTITION BY i.equipment_id ORDER BY i.item_id) + COALESCE(u.max_seq, 0) AS seq
             FROM item i
             LEFT JOIN used u ON u.equipment_id = i.equipment_id
            WHERE i.item_code !~ ${CANONICAL}
         )
         UPDATE item
            SET item_code = 'EQ-' || ${pad3('numbered.equipment_id')} || '-' || ${pad3('numbered.seq')}
           FROM numbered
          WHERE item.item_id = numbered.item_id`,
        { transaction: t }
      );

      // 5. Stock reconciliation — available_quantity is recomputed from the
      //    units actually marked Available, so the cached counter can't have
      //    drifted from reality. Equipment whose total exceeds its registered
      //    units is left as-is on purpose: per the official inventory
      //    reconciliation (scripts/reconcileOfficialInventory.js) the
      //    difference is non-serviceable stock that must not be borrowable.
      await queryInterface.sequelize.query(
        `UPDATE equipment e
            SET total_quantity = GREATEST(e.total_quantity, COALESCE(c.cnt, 0)),
                available_quantity = COALESCE(c.available, 0)
           FROM equipment e2
           LEFT JOIN (SELECT equipment_id,
                             COUNT(*)::int AS cnt,
                             COUNT(*) FILTER (WHERE availability_status = 'Available')::int AS available
                        FROM item GROUP BY equipment_id) c ON c.equipment_id = e2.equipment_id
          WHERE e.equipment_id = e2.equipment_id`,
        { transaction: t }
      );
    });
  },

  async down(queryInterface) {
    await queryInterface.sequelize.transaction(async (t) => {
      // Restore pre-standardization codes where one was recorded. Units
      // created by step 5 have no legacy code and keep their canonical one.
      await queryInterface.sequelize.query(
        'UPDATE item SET item_code = legacy_item_code WHERE legacy_item_code IS NOT NULL',
        { transaction: t }
      );
      await queryInterface.removeColumn('item', 'legacy_item_code', { transaction: t });
      await queryInterface.removeIndex('transaction', 'transaction_borrower_id_request_key_unique', { transaction: t });
      await queryInterface.removeColumn('transaction', 'request_key', { transaction: t });
      await queryInterface.removeColumn('transaction', 'documents_verified_datetime', { transaction: t });
      await queryInterface.removeColumn('transaction', 'documents_verified_by', { transaction: t });
      await queryInterface.removeIndex('notification', 'notification_user_id_dedupe_key_unique', { transaction: t });
      await queryInterface.removeColumn('notification', 'dedupe_key', { transaction: t });
    });
  }
};
