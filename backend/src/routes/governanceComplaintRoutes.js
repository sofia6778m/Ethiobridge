const express = require('express');
const router = express.Router();
const { protect, protectOptional, authorize } = require('../middleware/auth');
const { governanceUpload } = require('../config/cloudinary');
const { complaintSubmitLimiter } = require('../middleware/rateLimiter');
const {
  createComplaint,
  getComplaints,
  getComplaintById,
  trackComplaint,
  reopenByTracking,
  updateStatus,
  getAssignableOfficers,
  assignOfficer,
  confirmResolution,
  requestWoredaInfo,
  respondToWoredaRequest,
  respondToCitizen,
  requestMoreInfo,
  addInvestigationNote,
  uploadOfficialDocument,
  recordAdministrativeAction,
  resolveComplaint,
  rejectComplaint,
  escalateComplaint,
  reopenComplaint,
  addEvidence,
  downloadAcknowledgment,
  getAuditTrail,
  getStats,
  getAnalytics,
  exportComplaints,
  SUB_CITY_OFFICER_ROLES,
  WOREDA_OFFICER_ROLES,
  GOVERNANCE_MANAGER_ROLES,
  GOVERNANCE_VIEWER_ROLES,
} = require('../controllers/governanceComplaintController');

// Role-scoped (must precede /:id routes)
router.get('/analytics', protect, authorize(...GOVERNANCE_MANAGER_ROLES), getAnalytics);
router.get('/stats', protect, authorize(...GOVERNANCE_VIEWER_ROLES), getStats);
router.get('/export/pdf', protect, authorize(...GOVERNANCE_MANAGER_ROLES), exportComplaints);
router.get('/export/excel', protect, authorize(...GOVERNANCE_MANAGER_ROLES), exportComplaints);

// Public / shared
router.get('/track/:trackingId', protectOptional, trackComplaint);
router.post('/reopen-by-tracking', protectOptional, complaintSubmitLimiter, reopenByTracking);

// List + create (anonymous and logged-in citizens use the same endpoint)
router.get('/', protect, authorize(...GOVERNANCE_VIEWER_ROLES), getComplaints);
router.post('/', protectOptional, complaintSubmitLimiter, governanceUpload.array('evidence', 8), createComplaint);

// Per-complaint actions
router.get('/:id/audit', protect, authorize(...GOVERNANCE_VIEWER_ROLES), getAuditTrail);
router.get('/:id/acknowledgment', protect, authorize(...GOVERNANCE_VIEWER_ROLES), downloadAcknowledgment);
router.post('/:id/reopen', protect, authorize('citizen', 'CITIZEN', ...GOVERNANCE_MANAGER_ROLES), reopenComplaint);
router.post('/:id/evidence', protect, authorize('citizen', 'CITIZEN'), governanceUpload.array('evidence', 8), addEvidence);
router.post('/:id/request-woreda', protect, authorize(...SUB_CITY_OFFICER_ROLES), requestWoredaInfo);
router.post('/:id/respond-woreda', protect, authorize(...WOREDA_OFFICER_ROLES), governanceUpload.array('evidence', 8), respondToWoredaRequest);
router.post('/:id/respond', protect, authorize(...GOVERNANCE_MANAGER_ROLES), governanceUpload.array('evidence', 8), respondToCitizen);
router.post('/:id/request-info', protect, authorize(...GOVERNANCE_MANAGER_ROLES), requestMoreInfo);
router.post('/:id/notes', protect, authorize(...GOVERNANCE_MANAGER_ROLES), addInvestigationNote);
router.post('/:id/documents', protect, authorize(...GOVERNANCE_MANAGER_ROLES), governanceUpload.array('documents', 8), uploadOfficialDocument);
router.post('/:id/administrative-action', protect, authorize(...GOVERNANCE_MANAGER_ROLES), governanceUpload.array('evidence', 5), recordAdministrativeAction);
router.post('/:id/resolve', protect, authorize(...GOVERNANCE_MANAGER_ROLES), resolveComplaint);
router.post('/:id/reject', protect, authorize(...GOVERNANCE_MANAGER_ROLES), rejectComplaint);
router.post('/:id/escalate', protect, authorize(...GOVERNANCE_MANAGER_ROLES), escalateComplaint);
router.post('/:id/status', protect, authorize(...GOVERNANCE_MANAGER_ROLES), updateStatus);
router.get('/:id/assignable-officers', protect, authorize(...SUB_CITY_OFFICER_ROLES), getAssignableOfficers);
router.post('/:id/assign', protect, authorize(...SUB_CITY_OFFICER_ROLES), assignOfficer);
router.post('/:id/confirm-resolution', protect, authorize('citizen', 'CITIZEN'), confirmResolution);
router.get('/:id', protect, authorize(...GOVERNANCE_VIEWER_ROLES), getComplaintById);

module.exports = router;
