const express = require('express');
const catchAsync = require('../helpers/catchAsync');
const authMiddleware = require('../middlewares/authMiddleware');
const roleMiddleware = require('../middlewares/roleMiddleware');
const uploadEquipmentPhoto = require('../middlewares/equipmentPhotoUpload');
const ctrl = require('../controllers/equipment.controller');

const router = express.Router();
const staffOnly = roleMiddleware(['Admin', 'Director', 'Staff']);

router.get('/', catchAsync(ctrl.list));
router.get('/:id', catchAsync(ctrl.getOne));
// Public, no auth — same reasoning as GET / and GET /:id above: the
// Equipment Showroom card grid (and its photos) needs to load for anyone
// browsing it.
router.get('/:id/photo', catchAsync(ctrl.downloadPhoto));
router.post('/', authMiddleware, staffOnly, catchAsync(ctrl.create));
router.put('/:id', authMiddleware, staffOnly, catchAsync(ctrl.update));
router.post('/:id/photo', authMiddleware, staffOnly, uploadEquipmentPhoto, catchAsync(ctrl.uploadPhoto));
router.delete('/:id', authMiddleware, staffOnly, catchAsync(ctrl.remove));

module.exports = router;
