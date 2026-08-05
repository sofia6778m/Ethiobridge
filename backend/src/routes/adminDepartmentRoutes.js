const express = require('express');
const router = express.Router();
const {
  getDepartments,
  getDepartmentsBySubcity,
  createDepartment,
  updateDepartment,
  deleteDepartment,
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

// All department master-data routes require an admin account (System Admin).
router.use(protect, authorize('admin', 'ADMIN'));

// Subcity-scoped department lookup must be registered before any /:id routes.
router.get('/by-subcity/:subcityId', getDepartmentsBySubcity);

router.get('/', getDepartments);
router.post('/', createDepartment);
router.put('/:id', updateDepartment);
router.delete('/:id', deleteDepartment);

module.exports = router;
