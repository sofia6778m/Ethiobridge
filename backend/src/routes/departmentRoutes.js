const express = require('express');
const router = express.Router();
const {
  getDepartmentStats, getDepartmentReports, getDepartmentReportDetail,
  acceptReport, rejectReport, startWorking, markComplete,
  getDepartmentComplaints, updateDepartmentComplaintStatus,
} = require('../controllers/departmentController');
const { protect, authorize } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');

// `department` is the legacy role; `department_officer` is the canonical role
// for department officers created through the admin UI. Both share the same
// woredaId + department scoped data.
router.use(protect, authorize('department', 'department_officer'));

router.get('/stats', getDepartmentStats);

// Infrastructure reports
router.get('/reports', getDepartmentReports);
router.get('/reports/:id', getDepartmentReportDetail);
router.put('/reports/:id/accept', acceptReport);
router.put('/reports/:id/reject', rejectReport);
router.put('/reports/:id/start', startWorking);
router.put('/reports/:id/complete', upload.any(), markComplete);

// Public complaints routed to this department
router.get('/complaints', getDepartmentComplaints);
router.patch('/complaints/:id/status', updateDepartmentComplaintStatus);

module.exports = router;
