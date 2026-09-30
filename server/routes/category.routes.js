const express = require('express');
const catchAsync = require('../helpers/catchAsync');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const ctrl = require('../controllers/category.controller');

const router = express.Router();
// Same roles allowed to create/edit Equipment itself (server/routes/equipment.routes.js)
// — adding a category is part of that same "manage the catalog" permission,
// not a separate one.
const staffOnly = roleMiddleware(['Admin', 'Director', 'Staff']);

router.get('/', catchAsync(ctrl.list));
router.post('/', authMiddleware, staffOnly, catchAsync(ctrl.create));

module.exports = router;
