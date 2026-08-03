const express = require('express');
const router = express.Router();
const {
  createReport, getPublicReports, getPublicAutocomplete, getAllReports, getReport,
  getMyReports, verifyReport, assignReport, updateStatus,
  citizenVerify, addFeedback, addComment, addAfterMedia,
  getAnalytics, exportReports, deleteReport, getAssignedReports,
  getGovernmentUsers, getGovernmentReports, trackByReportId, exportReportPDF,
  exportBulkPDF, exportExcel, getEnhancedAnalytics,
  bulkVerify, bulkDelete, bulkAssign, getSLAStats, getDepartmentStats,
} = require('../controllers/infrastructureController');
const { protect, authorize, requireApproved } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const { generalLimiter, uploadLimiter } = require('../middleware/rateLimiter');
const {
  validateReport, validateVerify, validateAssign, validateStatusUpdate,
  validateFeedback, validateComment, validateCitizenVerify, validateIdParam,
} = require('../middleware/validation');

// Public
router.get('/public', generalLimiter, getPublicReports);
router.get('/public/autocomplete', generalLimiter, getPublicAutocomplete);
router.get('/track/:reportId', generalLimiter, trackByReportId);

// Export (public download)
router.get('/export/pdf/:id', generalLimiter, exportReportPDF);
router.get('/export/pdf', generalLimiter, exportBulkPDF);
router.get('/export/excel', generalLimiter, exportExcel);
router.get('/export', generalLimiter, exportReports);

// Analytics
router.get('/analytics', generalLimiter, getAnalytics);
router.get('/analytics/enhanced', generalLimiter, getEnhancedAnalytics);
router.get('/analytics/sla', protect, authorize('admin', 'government'), getSLAStats);

// Protected
router.get('/government-users', protect, authorize('admin', 'government'), getGovernmentUsers);
router.get('/department-stats', protect, authorize('admin', 'government'), getDepartmentStats);

// All authenticated
router.get('/assigned', protect, authorize('government'), getAssignedReports);

// Government - department filtered
router.get('/government/reports', protect, authorize('government'), getGovernmentReports);

// Public single report
router.get('/:id', generalLimiter, getReport);

// Citizen
router.post('/', protect, authorize('citizen'), requireApproved, uploadLimiter, upload.array('media', 10), validateReport, createReport);
router.get('/my/reports', protect, authorize('citizen'), getMyReports);
router.put('/:id/citizen-verify', protect, authorize('citizen'), validateCitizenVerify, citizenVerify);
router.put('/:id/feedback', protect, authorize('citizen'), validateFeedback, addFeedback);

// Comments (citizen, government, admin, ngo)
router.post('/:id/comments', protect, authorize('citizen', 'government', 'admin', 'ngo'), validateComment, addComment);

// After media (government, admin)
router.put('/:id/after-media', protect, authorize('government', 'admin'), uploadLimiter, upload.array('media', 10), addAfterMedia);

// Admin
router.get('/admin/all', protect, authorize('admin'), getAllReports);
router.put('/:id/verify', protect, authorize('admin'), validateVerify, verifyReport);
router.delete('/:id', protect, authorize('admin'), deleteReport);

// Admin + Government
router.put('/:id/assign', protect, authorize('admin', 'government'), validateAssign, assignReport);
router.put('/:id/status', protect, authorize('admin', 'government'), validateStatusUpdate, updateStatus);

// Bulk operations
router.post('/bulk/verify', protect, authorize('admin'), bulkVerify);
router.post('/bulk/delete', protect, authorize('admin'), bulkDelete);
router.post('/bulk/assign', protect, authorize('admin', 'government'), bulkAssign);

module.exports = router;
