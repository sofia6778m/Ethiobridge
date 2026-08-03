const express = require('express');
const router = express.Router();
const {
  getStats, getReports, getReportDetail, updateReportStatus, getNotifications, getCitizens,
} = require('../controllers/subcityController');
const { protect, authorize } = require('../middleware/auth');

// Only subcity administrators may access these routes. Account creation is
// performed exclusively by the system admin via /api/admin/users.
const subcityRoles = ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura'];

router.use(protect, authorize(...subcityRoles));

router.get('/stats', getStats);
router.get('/reports', getReports);
router.get('/reports/:id', getReportDetail);
router.put('/reports/:id/status', updateReportStatus);
router.get('/notifications', getNotifications);
router.get('/citizens', getCitizens);

module.exports = router;
