const express = require('express');
const router = express.Router();
const {
  createReport, getPublicReports, getAllReports, getReport,
  getMyReports, verifyReport, updateStatus, acceptRequest, deleteReport,
  getGovernmentReports,
} = require('../controllers/emergencyController');
const { protect, authorize, requireApproved } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');

// Public
router.get('/', getPublicReports);
router.get('/:id', getReport);

// Citizen
router.post('/', protect, authorize('citizen'), requireApproved, upload.array('photos', 5), createReport);
router.get('/my/reports', protect, authorize('citizen'), getMyReports);

// NGO / Volunteer - accept request
router.put('/:id/accept', protect, authorize('ngo', 'volunteer'), requireApproved, acceptRequest);

// Admin + Government
router.get('/government/reports', protect, authorize('government'), getGovernmentReports);
router.get('/admin/all', protect, authorize('admin', 'government', 'ngo'), getAllReports);
router.put('/:id/verify', protect, authorize('admin', 'ADMIN'), verifyReport);
router.put('/:id/status', protect, authorize('admin', 'ADMIN', 'government', 'ngo'), updateStatus);
router.delete('/:id', protect, authorize('admin', 'ADMIN'), deleteReport);

module.exports = router;
