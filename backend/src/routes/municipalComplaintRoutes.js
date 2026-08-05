const express = require('express');
const router = express.Router();
const { protect, protectOptional, authorize, requireApproved } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const { runEscalationPass } = require('../controllers/municipalComplaintController');
const {
  getIssueTemplates,
  createComplaint,
  getComplaints,
  getComplaintById,
  trackComplaint,
  assessComplaint,
  forwardComplaint,
  updateStatus,
  addInternalNote,
  escalateManually,
  getStats,
  exportComplaints,
  getAuditTrail,
  getAssignableUsers,
  acceptComplaint,
  rejectComplaint,
  assignInspector,
  assignTechnician,
  startWork,
  completeWork,
  verifyResolution,
  reopenComplaint,
  closeComplaint,
  submitFeedback,
} = require('../controllers/municipalComplaintController');

const SUB_CITY_ROLES = ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'subcity_admin'];
const HIERARCHY_ROLES = ['ADMIN', 'SUBCITY_ADMIN', 'subcity_admin', 'WOREDA_ADMIN', 'woreda_admin', 'OFFICER', 'TECHNICIAN'];
const VIEWER_ROLES = ['admin', 'government', ...SUB_CITY_ROLES, 'woreda', 'woreda_admin', 'department', 'department_officer', 'inspector', 'technician', 'citizen', ...HIERARCHY_ROLES];
const MANAGER_ROLES = ['admin', 'government', ...SUB_CITY_ROLES, 'woreda', 'woreda_admin', 'department', 'department_officer', 'ADMIN', 'SUBCITY_ADMIN', 'WOREDA_ADMIN', 'woreda_admin', 'OFFICER'];
const OFFICER_ROLES = ['admin', 'government', ...SUB_CITY_ROLES, 'woreda', 'woreda_admin', 'department', 'department_officer', 'ADMIN', 'SUBCITY_ADMIN', 'WOREDA_ADMIN', 'woreda_admin', 'OFFICER'];
const FIELD_ROLES = [...OFFICER_ROLES, 'technician', 'TECHNICIAN'];

// Public / shared
router.get('/issue-templates', protectOptional, getIssueTemplates);
router.get('/track/:trackingId', protectOptional, trackComplaint);

// Role-scoped (must precede /:id routes)
router.get('/assignable', protect, authorize(...OFFICER_ROLES), getAssignableUsers);
router.get('/stats', protect, authorize(...MANAGER_ROLES, 'inspector', 'technician'), getStats);
router.get('/export/pdf', protect, authorize(...MANAGER_ROLES), exportComplaints);
router.get('/export/excel', protect, authorize(...MANAGER_ROLES), exportComplaints);
router.get('/', protect, authorize(...VIEWER_ROLES), getComplaints);
router.post('/', protect, authorize('citizen'), requireApproved, upload.array('media', 8), createComplaint);

// Admin manual escalation trigger
router.post('/admin/run-escalation', protect, authorize('admin', 'ADMIN'), async (req, res) => {
  await runEscalationPass(req.app?.get('io') || null);
  res.json({ success: true, message: 'Escalation pass completed.' });
});

// Per-complaint actions
router.get('/:id/audit', protect, authorize(...VIEWER_ROLES), getAuditTrail);
router.post('/:id/assess', protect, authorize(...OFFICER_ROLES), assessComplaint);
router.post('/:id/forward', protect, authorize(...OFFICER_ROLES), forwardComplaint);
router.post('/:id/status', protect, authorize(...MANAGER_ROLES), upload.array('evidence', 5), updateStatus);
router.post('/:id/notes', protect, authorize(...MANAGER_ROLES), addInternalNote);
router.post('/:id/escalate', protect, authorize(...MANAGER_ROLES), escalateManually);
router.post('/:id/accept', protect, authorize(...OFFICER_ROLES), acceptComplaint);
router.post('/:id/reject', protect, authorize(...OFFICER_ROLES), rejectComplaint);
router.post('/:id/assign-inspector', protect, authorize(...OFFICER_ROLES), assignInspector);
router.post('/:id/assign-technician', protect, authorize(...OFFICER_ROLES), assignTechnician);
router.post('/:id/start-work', protect, authorize(...FIELD_ROLES), startWork);
router.post('/:id/complete-work', protect, authorize(...FIELD_ROLES), upload.array('photos', 8), completeWork);
router.post('/:id/verify-resolution', protect, authorize(...OFFICER_ROLES), verifyResolution);
router.post('/:id/reopen', protect, authorize(...OFFICER_ROLES), reopenComplaint);
router.post('/:id/close', protect, authorize(...OFFICER_ROLES), closeComplaint);
router.post('/:id/feedback', protect, authorize('citizen', 'admin', 'government'), submitFeedback);
router.get('/:id', protect, authorize(...VIEWER_ROLES), getComplaintById);

module.exports = router;
