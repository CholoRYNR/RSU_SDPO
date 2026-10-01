'use strict';

// Borrowing workflow (approved RSU SDPO process):
//
//   Borrower submits request ............ Acknowledged
//   Admin/Staff reviews + verifies docs . For Approval    (or Rejected / returned for correction)
//   Director approves ................... Approved        (or Rejected)
//   Equipment released .................. Released        (→ Overdue if past due)
//   Equipment returned .................. Completed       (or For Resolution if damaged/lost)
//   Replacement workflow ................ Replacement → Resolved → Completed
//
// 'Pending', 'For Review' and 'Returned' remain in the database enum for
// historical rows but are never assigned by current code.
const STATUS = Object.freeze({
  PENDING: 'Pending',
  ACKNOWLEDGED: 'Acknowledged',
  FOR_APPROVAL: 'For Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
  CANCELLED: 'Cancelled',
  RELEASED: 'Released',
  OVERDUE: 'Overdue',
  FOR_RESOLUTION: 'For Resolution',
  REPLACEMENT: 'Replacement',
  RESOLVED: 'Resolved',
  COMPLETED: 'Completed'
});

// Statuses at which an Admin/Staff document review is still outstanding.
const AWAITING_REVIEW = [STATUS.PENDING, STATUS.ACKNOWLEDGED];

// Statuses a transaction only reaches once the Director has approved it.
const POST_APPROVAL = [
  STATUS.APPROVED,
  STATUS.RELEASED,
  'Returned',
  STATUS.OVERDUE,
  STATUS.FOR_RESOLUTION,
  STATUS.REPLACEMENT,
  STATUS.RESOLVED,
  STATUS.COMPLETED
];

// Requests still "open" from the borrower's point of view (not yet a final
// outcome) — used for pending-request counts.
const OPEN_REQUEST = [STATUS.PENDING, STATUS.ACKNOWLEDGED, 'For Review', STATUS.FOR_APPROVAL];

// Equipment physically with the borrower.
const OUT_WITH_BORROWER = [STATUS.RELEASED, STATUS.OVERDUE];

module.exports = { STATUS, AWAITING_REVIEW, POST_APPROVAL, OPEN_REQUEST, OUT_WITH_BORROWER };
