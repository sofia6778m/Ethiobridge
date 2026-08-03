const express = require('express');
const router = express.Router();
const {
  getWoredas, getWoredaStats, getWoredaReports, getWoredaReportDetail, assignToDepartment,
} = require('../controllers/woredaController');
const { protect, authorize } = require('../middleware/auth');

// Woreda read/report routes are locked to subcity/woreda roles. Account and
// woreda CRUD is performed exclusively by the system admin via /api/admin.
const subcityRoles = ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura'];

router.get('/', protect, authorize(...subcityRoles), getWoredas);

router.get('/stats', protect, authorize('woreda'), getWoredaStats);
router.get('/reports', protect, authorize('woreda'), getWoredaReports);
router.get('/reports/:id', protect, authorize('woreda'), getWoredaReportDetail);
router.put('/reports/:id/assign-department', protect, authorize('woreda'), assignToDepartment);

module.exports = router;
