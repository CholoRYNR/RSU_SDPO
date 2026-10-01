'use strict';

// One canonical identifier scheme, derived from the database primary key,
// so every module shows the same ID for the same record:
//
//   Equipment ID  = "EQ-" + equipment_id padded to 3 digits   → EQ-005
//   Item Code     = <Equipment ID> + "-" + unit sequence       → EQ-005-001
//
// The Item Code is what each physical unit's QR label encodes, so the
// Equipment ID is literally the prefix of every QR it owns — scanning a
// label, the borrowing request, the transaction detail and the equipment
// record all resolve to the same equipment_id. The client never builds
// these itself; it always displays the values the API returns.

function formatEquipmentCode(equipmentId) {
  return `EQ-${String(equipmentId).padStart(3, '0')}`;
}

function formatItemCode(equipmentId, sequence) {
  return `${formatEquipmentCode(equipmentId)}-${String(sequence).padStart(3, '0')}`;
}

// Returns { equipmentId, sequence } for a canonical item code, or null.
function parseItemCode(code) {
  const m = /^EQ-(\d+)-(\d+)$/.exec(String(code || '').trim());
  if (!m) return null;
  return { equipmentId: Number(m[1]), sequence: Number(m[2]) };
}

// Highest unit sequence already used for an equipment, given its items'
// codes — new units continue after it so a code is never reused.
function maxSequence(equipmentId, codes) {
  return (codes || []).reduce((max, code) => {
    const parsed = parseItemCode(code);
    return parsed && parsed.equipmentId === Number(equipmentId) ? Math.max(max, parsed.sequence) : max;
  }, 0);
}

module.exports = { formatEquipmentCode, formatItemCode, parseItemCode, maxSequence };
