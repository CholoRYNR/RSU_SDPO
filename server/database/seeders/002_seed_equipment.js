'use strict';

// NOTE: rsusdpo_db already has 50 real equipment rows / 17 real items seeded
// by the team. This seeder is for a FRESH, empty database elsewhere — do not
// run it against rsusdpo_db.
const EQUIPMENT = [
  { name: 'Molten BG4500 Official Size Basketball', category: 'Ball Games', quantity: 6 },
  { name: 'Wilson Volleyball Pro', category: 'Ball Games', quantity: 5 },
  { name: 'Match Football Size 5', category: 'Ball Games', quantity: 4 },
  { name: 'Yonex Badminton Racket', category: 'Racket Sports', quantity: 10 },
  { name: 'Butterfly Table Tennis Set', category: 'Racket Sports', quantity: 8 },
  { name: 'Olympic Barbell Set 20kg', category: 'Gym Equipment', quantity: 3 },
  { name: 'Everlast Boxing Gloves', category: 'Combat Sports', quantity: 12 },
  { name: 'Athletics Hurdle Set', category: 'Track & Field', quantity: 7 },
  { name: 'TYR Swimming Kickboard', category: 'Swimming', quantity: 9 },
  { name: 'Competition Archery Bow', category: 'Outdoor Recreation', quantity: 4 }
];

module.exports = {
  async up(queryInterface, Sequelize) {
    const now = new Date();
    const categories = await queryInterface.sequelize.query(
      'SELECT category_id, category_name FROM categories',
      { type: Sequelize.QueryTypes.SELECT }
    );
    const categoryIdByName = Object.fromEntries(categories.map((c) => [c.category_name, c.category_id]));

    await queryInterface.bulkInsert(
      'equipment',
      EQUIPMENT.map((e) => ({
        category_id: categoryIdByName[e.category],
        equipment_name: e.name,
        total_quantity: e.quantity,
        available_quantity: e.quantity,
        description: null,
        created_at: now,
        updated_at: now
      })),
      {}
    );

    const equipmentRows = await queryInterface.sequelize.query(
      'SELECT equipment_id, equipment_name FROM equipment',
      { type: Sequelize.QueryTypes.SELECT }
    );
    const equipmentIdByName = Object.fromEntries(equipmentRows.map((e) => [e.equipment_name, e.equipment_id]));

    const items = [];
    let sequence = 1001;
    EQUIPMENT.forEach((e) => {
      const equipmentId = equipmentIdByName[e.name];
      for (let i = 0; i < e.quantity; i += 1) {
        items.push({
          equipment_id: equipmentId,
          item_code: `RSU-SDPO-2026-${sequence}`,
          item_condition: 'Good',
          availability_status: 'Available',
          engraving_status: 'Not Engraved',
          created_at: now
        });
        sequence += 1;
      }
    });
    await queryInterface.bulkInsert('item', items, {});
  },

  async down(queryInterface) {
    await queryInterface.bulkDelete('item', null, {});
    await queryInterface.bulkDelete('equipment', null, {});
  }
};
