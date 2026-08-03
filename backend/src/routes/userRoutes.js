const express = require('express');
const router = express.Router();
const { getOfficers, getTechnicians } = require('../controllers/userController');
const { protect, authorize } = require('../middleware/auth');
const { COMPLAINT_MANAGER_ROLES } = require('../utils/scopeFilter');

// Role-scoped user lists for assignment dropdowns. These endpoints are the ONLY
// allowed source for officer / technician options — the raw /api/admin/users
// list must never feed these dropdowns.
router.get('/officers', protect, authorize(...COMPLAINT_MANAGER_ROLES), getOfficers);
router.get('/technicians', protect, authorize(...COMPLAINT_MANAGER_ROLES), getTechnicians);

module.exports = router;
