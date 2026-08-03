const express = require('express');
const router = express.Router();
const {
  createComplaint,
  getPublicComplaints,
  getComplaintById,
  getByTrackingNumber,
  updateStatus,
  getStats,
  getSubcityWoredas,
  escalateToSubcity,
  escalateToSubcityAdmin,
} = require('../controllers/publicComplaintController');
const { protect, protectOptional, authorize } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const { validateComplaint, validateComplaintStatus } = require('../middleware/validation');
const { COMPLAINT_MANAGER_ROLES } = require('../utils/scopeFilter');

// Public — track by tracking number (public access key)
router.get('/track/:trackingNumber', getByTrackingNumber);

// Public — woredas for a subcity (complaint form dropdown). Must be before /:id.
router.get('/subcity-woredas', getSubcityWoredas);

// List — public, but scoped to the logged-in user's role when authenticated
router.get('/', protectOptional, getPublicComplaints);

// Public — create complaint (optional auth — anonymous submissions allowed).
// protectOptional links a logged-in citizen's submission to their account;
// multer parses attachments first so the express-validator checks run against
// the real text fields, then the controller normalises routing data.
router.post('/', protectOptional, upload.array('attachments', 5), validateComplaint, createComplaint);

// Complaint managers — update status (enforced scope in controller)
router.patch('/:id/status', protect, authorize(...COMPLAINT_MANAGER_ROLES), validateComplaintStatus, updateStatus);

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
