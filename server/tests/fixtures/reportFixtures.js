'use strict';

// Plain-object fixtures for the report.controller unit tests. These stand in
// for what Sequelize's findAll() would resolve with once ../../models is
// jest.mock()'d — report.controller.js only ever reads properties off the
// resolved rows (t.borrower.firstName, d.item.equipment.equipmentName, ...),
// so plain objects are sufficient stand-ins for real model instances.

let nextId = 1;
function id() {
  return nextId++;
}

function makeCategory(overrides = {}) {
  return { id: id(), categoryName: 'Balls', ...overrides };
}

function makeEquipment(overrides = {}) {
  return {
    id: id(),
    equipmentName: 'Basketball',
    totalQuantity: 10,
    availableQuantity: 7,
    category: makeCategory(),
    items: [],
    ...overrides
  };
}

function makeItem(overrides = {}) {
  const equipment = overrides.equipment || makeEquipment();
  return {
    id: id(),
    equipmentId: equipment.id,
    itemCode: `ITM-${String(id()).padStart(4, '0')}`,
    itemCondition: 'Good',
    equipment,
    ...overrides
  };
}

function makeBorrower(overrides = {}) {
  return {
    id: id(),
    firstName: 'Juan',
    lastName: 'Dela Cruz',
    collegeOrUnit: 'College of Engineering',
    borrowerCategory: 'Student',
    user: { emailAddress: 'juan.delacruz@example.com' },
    ...overrides
  };
}

function makeTransactionDetail(overrides = {}) {
  const item = overrides.item || makeItem();
  return {
    id: id(),
    item,
    returnedCondition: null,
    conditionNotes: null,
    ...overrides
  };
}

function makeTransaction(overrides = {}) {
  const requestDatetime = overrides.requestDatetime || new Date('2026-01-15T09:00:00Z');
  return {
    id: id(),
    borrowerId: 1,
    purpose: 'Intramurals practice',
    requestDatetime,
    expectedReturnDatetime: new Date('2026-01-20T09:00:00Z'),
    returnDatetime: null,
    transactionStatus: 'Approved',
    borrower: makeBorrower(),
    reviewer: null,
    approver: null,
    details: [],
    maintenanceFees: [],
    ...overrides
  };
}

module.exports = {
  makeCategory,
  makeEquipment,
  makeItem,
  makeBorrower,
  makeTransactionDetail,
  makeTransaction
};
