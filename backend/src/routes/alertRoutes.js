const express = require('express');
const router = express.Router();
const {
  createAlert,
  updateAlert,
  publishAlert,
  archiveAlert,
  getAlerts,
  getManagedAlert,
  getPublicAlerts,
  getPublicAlertById,
  getMyAlerts,
  getUnreadAlertCount,
  markAlertRead,
  updateAlertStatus,
  deleteAlert,
  getAlertStats,
  getAlertAnalytics,
  exportAlerts,
  getSubscriptions,
  updateSubscriptions,
  getAlertAuditLog,
} = require('../controllers/alertController');
const { protect, authorize } = require('../middleware/auth');
const { alertUpload } = require('../config/cloudinary');

// ── Management (role-scoped) ─────────────────────────────────────────────────
const MANAGE_ROLES = [
  'admin', 'ADMIN', 'government',
  'subcity_admin', 'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'SUBCITY_HEAD', 'SUBCITY_ADMIN',
  'woreda_admin', 'woreda', 'WOREDA_HEAD', 'WOREDA_ADMIN', 'department', 'DEPARTMENT_ADMIN',
];

const CITIZEN_ROLES = ['citizen', 'CITIZEN'];

// Public — list active alerts.
router.get('/', getPublicAlerts);

// Citizen-facing subscription endpoints.
router.get('/subscriptions/me', protect, authorize(...CITIZEN_ROLES), getSubscriptions);
router.put('/subscriptions/me', protect, authorize(...CITIZEN_ROLES), updateSubscriptions);

// Stats + analytics + export + audit (fixed paths BEFORE the /:id catch-all).
router.get('/stats', protect, authorize(...MANAGE_ROLES), getAlertStats);
router.get('/analytics', protect, authorize(...MANAGE_ROLES), getAlertAnalytics);
router.get('/export', protect, authorize(...MANAGE_ROLES), exportAlerts);
router.get('/audit', protect, authorize('admin', 'ADMIN', 'government', 'SUBCITY_HEAD', 'SUBCITY_ADMIN', 'WOREDA_HEAD', 'WOREDA_ADMIN'), getAlertAuditLog);

// Scoped management list & detail (before the public /:id catch-all).
router.get('/manage', protect, authorize(...MANAGE_ROLES), getAlerts);
router.get('/manage/:id', protect, authorize(...MANAGE_ROLES), getManagedAlert);

// Citizen — alerts matched to the logged-in user's location (before the public /:id catch-all).
router.get('/my/unread-count', protect, authorize(...CITIZEN_ROLES), getUnreadAlertCount);
router.get('/my', protect, authorize(...CITIZEN_ROLES), getMyAlerts);

// Public — get an active alert by ID (kept LAST so fixed paths win).
router.get('/:id', getPublicAlertById);

// Create / mutate.
router.post('/', protect, authorize(...MANAGE_ROLES), alertUpload.array('attachments', 3), createAlert);
router.put('/:id', protect, authorize(...MANAGE_ROLES), alertUpload.array('attachments', 3), updateAlert);
router.post('/:id/publish', protect, authorize(...MANAGE_ROLES), publishAlert);
router.post('/:id/archive', protect, authorize(...MANAGE_ROLES), archiveAlert);
router.post('/:id/read', protect, authorize(...CITIZEN_ROLES), markAlertRead);
router.patch('/:id/status', protect, authorize(...MANAGE_ROLES), updateAlertStatus);
router.delete('/:id', protect, authorize(...MANAGE_ROLES), deleteAlert);

module.exports = router;
