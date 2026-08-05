const express = require('express');
const router = express.Router();
const {
  createAlert,
  updateAlert,
  getAlerts,
  getManagedAlert,
  getPublicAlerts,
  getPublicAlertById,
  getMyAlerts,
  updateAlertStatus,
  deleteAlert,
  getAlertStats,
  getAlertAnalytics,
  exportAlerts,
  getSubscriptions,
  updateSubscriptions,
  getComplaintClusters,
  getAlertAuditLog,
} = require('../controllers/alertController');
const { protect, authorize } = require('../middleware/auth');

// ── Management (role-scoped) ─────────────────────────────────────────────────
const MANAGE_ROLES = [
  'admin', 'ADMIN', 'government',
  'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'SUBCITY_HEAD',
  'woreda', 'WOREDA_HEAD', 'department', 'DEPARTMENT_ADMIN',
];

// Public — list active alerts.
router.get('/', getPublicAlerts);

// Citizen-facing subscription endpoints.
router.get('/subscriptions/me', protect, authorize('citizen', 'CITIZEN'), getSubscriptions);
router.put('/subscriptions/me', protect, authorize('citizen', 'CITIZEN'), updateSubscriptions);

// Complaint cluster analytics — admin/complaint managers.
router.get('/complaint-clusters', protect, authorize('admin', 'ADMIN', 'government', 'SUBCITY_HEAD', 'WOREDA_HEAD'), getComplaintClusters);

// Stats + analytics + export + audit (fixed paths BEFORE the /:id catch-all).
router.get('/stats', protect, authorize(...MANAGE_ROLES), getAlertStats);
router.get('/analytics', protect, authorize(...MANAGE_ROLES), getAlertAnalytics);
router.get('/export', protect, authorize(...MANAGE_ROLES), exportAlerts);
router.get('/audit', protect, authorize('admin', 'ADMIN', 'government', 'SUBCITY_HEAD', 'WOREDA_HEAD'), getAlertAuditLog);

// Scoped management list & detail (before the public /:id catch-all).
router.get('/manage', protect, authorize(...MANAGE_ROLES), getAlerts);
router.get('/manage/:id', protect, authorize(...MANAGE_ROLES), getManagedAlert);

// Citizen — alerts matched to the logged-in user's location (before the public /:id catch-all).
router.get('/my', protect, authorize('citizen', 'CITIZEN'), getMyAlerts);

// Public — get an active alert by ID (kept LAST so fixed paths win).
router.get('/:id', getPublicAlertById);

// Create / mutate.
router.post('/', protect, authorize(...MANAGE_ROLES), createAlert);
router.put('/:id', protect, authorize(...MANAGE_ROLES), updateAlert);
router.patch('/:id/status', protect, authorize(...MANAGE_ROLES), updateAlertStatus);
router.delete('/:id', protect, authorize('admin', 'ADMIN', 'government'), deleteAlert);

module.exports = router;
