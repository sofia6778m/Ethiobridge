const express = require('express');
const router = express.Router();
const {
  getDepartmentStats, getDepartmentReports, getDepartmentReportDetail,
  acceptReport, rejectReport, startWorking, markComplete,
  getDepartmentComplaints, updateDepartmentComplaintStatus,
} = require('../controllers/departmentController');
const { protect, authorize } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');

router.use(protect, authorize('department'));

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
