const express = require('express');
const router = express.Router();
const {
  getIssueTypes,
  createWorkflowComplaint,
  getWorkflowComplaints,
  getWorkflowComplaintById,
  trackComplaint,
  woredaResolve,
  woredaEscalate,
  subcityResolve,
  getWorkflowStats,
  getWorkflowAnalytics,
} = require('../controllers/workflowComplaintController');
const { protect, protectOptional, authorize } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const { runEscalationPass } = require('../utils/escalationScheduler');

// ── Public ────────────────────────────────────────────────────────────────────

// Master data — issue type picker for the complaint form (public)
router.get('/issue-types', getIssueTypes);

// Public complaint tracking by tracking number
router.get('/track/:trackingNumber', trackComplaint);

// Submit a new complaint (optional auth — anonymous allowed)
router.post('/', upload.array('attachments', 5), protectOptional, createWorkflowComplaint);

// ── Authenticated — complaint listing & detail ────────────────────────────────

const VIEWER_ROLES = [
  'admin', 'subcity_admin', 'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura',
  'woreda', 'woreda_admin', 'department', 'department_officer', 'citizen',
];

router.get('/stats', protect, authorize(...VIEWER_ROLES), getWorkflowStats);
router.get('/analytics', protect, authorize('admin', 'subcity_admin', 'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'woreda', 'woreda_admin', 'department', 'department_officer'), getWorkflowAnalytics);
router.get('/', protect, authorize(...VIEWER_ROLES), getWorkflowComplaints);
router.get('/:id', protect, authorize(...VIEWER_ROLES), getWorkflowComplaintById);

// ── Woreda actions ────────────────────────────────────────────────────────────

router.patch('/:id/woreda-resolve', protect, authorize('admin', 'woreda', 'woreda_admin'), woredaResolve);
router.patch('/:id/woreda-escalate', protect, authorize('admin', 'woreda', 'woreda_admin'), woredaEscalate);

// ── Subcity / Department actions ──────────────────────────────────────────────

router.patch(
  '/:id/subcity-resolve',
  protect,
  authorize('admin', 'subcity_admin', 'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'department', 'department_officer'),
  subcityResolve
);

// ── Admin-only: manual escalation pass (useful for testing) ──────────────────
router.post('/admin/run-escalation', protect, authorize('admin'), async (req, res) => {
  await runEscalationPass(req.app?.get('io'));
  res.json({ success: true, message: 'Escalation pass completed.' });
});

module.exports = router;
