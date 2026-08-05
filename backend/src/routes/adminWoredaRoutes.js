const express = require('express');
const router = express.Router();
const {
  getAdminWoredas,
  getWoredasBySubcity,
  createWoreda,
  updateWoreda,
  deleteWoreda,
  getWoredaDeps,
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

// All woreda master-data routes require an admin account (System Admin).
router.use(protect, authorize('admin', 'ADMIN'));

// Subcity-scoped woreda lookup must be registered before any /:id routes.
router.get('/by-subcity/:subcityId', getWoredasBySubcity);

router.get('/', getAdminWoredas);
router.post('/', createWoreda);
router.put('/:id', updateWoreda);
router.get('/:id/deps', getWoredaDeps);
router.delete('/:id', deleteWoreda);

module.exports = router;
