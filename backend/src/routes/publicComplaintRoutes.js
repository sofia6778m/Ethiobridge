const express = require('express');
const router = express.Router();
const {
  createComplaint,
  getPublicComplaints,
  getComplaintById,
  getByTrackingNumber,
  updateStatus,
  assignOfficer,
  assignTechnician,
  acceptOfficerAssignment,
  updateTechnicianWorkState,
  verifyWork,
  closeComplaint,
  escalateToSubcityManual,
  addInternalNote,
  acceptComplaint,
  rejectComplaint,
  requestMoreInfo,
  markWaitingParts,
  forwardToSubcity,
  resolveBySubcity,
  getAuditLog,
  getAssignableUsers,
  getStats,
  getSubcityWoredas,
  escalateToSubcity,
  escalateToSubcityAdmin,
} = require('../controllers/publicComplaintController');
const { protect, protectOptional, authorize } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const { validateComplaint, validateComplaintStatus } = require('../middleware/validation');
const { complaintSubmitLimiter } = require('../middleware/rateLimiter');
const {
  COMPLAINT_MANAGER_ROLES,
  COMPLAINT_OFFICER_ROLES,
  SUBCITY_RESOLVE_ROLES,
} = require('../utils/scopeFilter');

// Public — track by tracking number (public access key). Phone number supplied
// as a query param is verified against the submission contact.
router.get('/track/:trackingNumber', getByTrackingNumber);

// Public — woredas for a subcity (complaint form dropdown). Must be before /:id.
router.get('/subcity-woredas', getSubcityWoredas);

// Complaint managers — users eligible for officer / technician assignment
router.get('/assignable-users', protect, authorize(...COMPLAINT_MANAGER_ROLES), getAssignableUsers);

// List — public, but scoped to the logged-in user's role when authenticated
router.get('/', protectOptional, getPublicComplaints);

// Public — create complaint (optional auth — anonymous submissions allowed).
// protectOptional links a logged-in citizen's submission to their account;
// multer parses attachments first so the express-validator checks run against
// the real text fields, then the controller normalises routing data.
// The submission limiter prevents spam on the anonymous endpoint.
router.post('/', protectOptional, complaintSubmitLimiter, upload.array('attachments', 5), validateComplaint, createComplaint);

// Complaint managers — update status (enforced scope in controller)
router.patch('/:id/status', protect, authorize(...COMPLAINT_MANAGER_ROLES), validateComplaintStatus, updateStatus);

// Citizen complaint workflow — department officer actions. Woreda admins can
// view/monitor but never drive the workflow (excluded via COMPLAINT_OFFICER_ROLES).
router.post('/:id/accept', protect, authorize(...COMPLAINT_OFFICER_ROLES), acceptComplaint);
router.post('/:id/reject', protect, authorize(...COMPLAINT_OFFICER_ROLES), rejectComplaint);
router.post('/:id/request-info', protect, authorize(...COMPLAINT_OFFICER_ROLES), requestMoreInfo);
router.post('/:id/waiting-parts', protect, authorize(...COMPLAINT_OFFICER_ROLES), markWaitingParts);
router.post('/:id/forward', protect, authorize(...COMPLAINT_OFFICER_ROLES), forwardToSubcity);
router.post('/:id/resolve-by-subcity', protect, authorize(...SUBCITY_RESOLVE_ROLES), resolveBySubcity);

// Complaint managers — audit trail for a complaint
router.get('/:id/audit', protect, authorize(...COMPLAINT_MANAGER_ROLES), getAuditLog);

// Complaint officers — operational workflow actions (enforced scope in controller)
router.put('/:id/assign-officer', protect, authorize(...COMPLAINT_OFFICER_ROLES), assignOfficer);
router.put('/:id/assign-technician', protect, authorize(...COMPLAINT_OFFICER_ROLES), assignTechnician);
router.put('/:id/escalate', protect, authorize(...COMPLAINT_OFFICER_ROLES), escalateToSubcityManual);
router.post('/:id/internal-notes', protect, authorize(...COMPLAINT_MANAGER_ROLES), addInternalNote);

// Field staff — accept / progress work orders (self-scope checked in controller)
router.put('/:id/accept-officer', protect, authorize('OFFICER'), acceptOfficerAssignment);
router.put('/:id/technician-work-state', protect, authorize('TECHNICIAN', 'CONTRACTOR'), updateTechnicianWorkState);
router.put('/:id/verify', protect, authorize('OFFICER'), verifyWork);

// Department admin — close a resolved complaint
router.put('/:id/close', protect, authorize(...COMPLAINT_MANAGER_ROLES), closeComplaint);

// Stats (role-scoped)
router.get('/stats', protect, authorize(...COMPLAINT_MANAGER_ROLES), getStats);

// Admin — run the escalation pass manually (also runs automatically on a cron)
router.post('/admin/run-escalation', protect, authorize('admin'), async (req, res) => {
  try {
    const PublicComplaint = require('../models/PublicComplaint');
    const io = req.app?.get('io') || null;
    const now = new Date();
    const results = { subcity: 0, admin: 0 };

    const stage1 = await PublicComplaint.find({
      status: { $nin: ['Resolved', 'Rejected', 'Closed'] },
      escalatedToSubcityAt: { $exists: false },
      escalationDeadline: { $lte: now },
    });
    for (const c of stage1) {
      await escalateToSubcity(c, io);
      results.subcity += 1;
    }

    const stage2 = await PublicComplaint.find({
      status: { $nin: ['Resolved', 'Rejected', 'Closed'] },
      escalatedToSubcityAdminAt: { $exists: false },
      subcityEscalationDeadline: { $lte: now },
    });
    for (const c of stage2) {
      await escalateToSubcityAdmin(c, io);
      results.admin += 1;
    }

    res.json({ success: true, message: `Escalation pass complete (${results.subcity} to subcity, ${results.admin} to administrator)`, results });
  } catch (err) {
    console.error('[PublicComplaint] Manual escalation error:', err);
    res.status(500).json({ success: false, message: 'Escalation pass failed' });
  }
});

// Get by ID (must be after /stats, /track and /admin) — scope-checked when authenticated
router.get('/:id', protectOptional, getComplaintById);

module.exports = router;
