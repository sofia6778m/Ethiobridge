const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { upload, alertUpload } = require('../config/cloudinary');
const {
  getPublicCampaigns,
  getFeaturedCampaigns,
  getCampaignCategories,
  getCampaignById,
  getManageCampaigns,
  getApprovals,
  getCampaignAnalytics,
  getCampaignDashboardStats,
  exportCampaigns,
  createCampaign,
  updateCampaign,
  submitCampaign,
  approveCampaign,
  rejectCampaign,
  completeCampaign,
  suspendCampaign,
  restoreCampaign,
  deleteCampaign,
  activateCampaign,
  deactivateCampaign,
  addCampaignUpdate,
  getCampaignUpdates,
  uploadCampaignProof,
  getCampaignProofs,
  getProofQueue,
  verifyProof,
  rejectProof,
  saveCampaign,
  unSaveCampaign,
  getSavedCampaigns,
  getFraudReview,
  checkFraud,
  reviewFraudFlag,
  reportCampaign,
} = require('../controllers/campaignController');

// Campaign managers: system admin / government, subcity admins (canonical +
// derived + legacy), and woreda admins. The controller re-enforces scoping.
const MANAGE_ROLES = [
  'admin', 'ADMIN', 'government',
  'subcity_admin', 'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'SUBCITY_HEAD', 'SUBCITY_ADMIN',
  'woreda_admin', 'woreda', 'WOREDA_HEAD', 'WOREDA_ADMIN',
];
const CITIZEN_ROLES = ['citizen', 'CITIZEN'];
const ADMIN_ROLES = ['admin', 'ADMIN'];

// ── Public reads (no auth) ───────────────────────────────────────────────────
router.get('/categories', getCampaignCategories);
router.get('/featured', getFeaturedCampaigns);
router.get('/', getPublicCampaigns);

// ── Manager reads (fixed paths BEFORE the /:id catch-all) ────────────────────
router.get('/manage', protect, authorize(...MANAGE_ROLES), getManageCampaigns);
router.get('/approvals', protect, authorize(...MANAGE_ROLES), getApprovals);
router.get('/analytics', protect, authorize(...MANAGE_ROLES), getCampaignAnalytics);
router.get('/dashboard-stats', protect, authorize(...MANAGE_ROLES), getCampaignDashboardStats);
router.get('/export', protect, authorize(...MANAGE_ROLES), exportCampaigns);

// ── Citizen saved campaigns ──────────────────────────────────────────────────
router.get('/my/saved', protect, authorize(...CITIZEN_ROLES), getSavedCampaigns);
router.post('/:id/save', protect, authorize(...CITIZEN_ROLES), saveCampaign);
router.delete('/:id/save', protect, authorize(...CITIZEN_ROLES), unSaveCampaign);

// ── Fraud review (system admins) ─────────────────────────────────────────────
router.get('/fraud-review', protect, authorize(...ADMIN_ROLES), getFraudReview);
router.post('/fraud-review/:flagId', protect, authorize(...ADMIN_ROLES), reviewFraudFlag);
router.post('/:id/fraud-check', protect, authorize(...ADMIN_ROLES), checkFraud);

// ── Public detail + updates ──────────────────────────────────────────────────
router.get('/:id', getCampaignById);
router.get('/:id/updates', getCampaignUpdates);
router.get('/:id/proofs', protect, authorize(...MANAGE_ROLES), getCampaignProofs);
router.get('/proofs/queue', protect, authorize(...MANAGE_ROLES), getProofQueue);

// ── Mutations ────────────────────────────────────────────────────────────────
router.post('/', protect, authorize(...MANAGE_ROLES), upload.single('image'), createCampaign);
router.put('/:id', protect, authorize(...MANAGE_ROLES), upload.single('image'), updateCampaign);
router.post('/:id/submit', protect, authorize(...MANAGE_ROLES), submitCampaign);
router.post('/:id/approve', protect, authorize(...MANAGE_ROLES), approveCampaign);
router.post('/:id/reject', protect, authorize(...MANAGE_ROLES), rejectCampaign);
router.post('/:id/complete', protect, authorize(...MANAGE_ROLES), completeCampaign);
// Suspend / restore are open to every campaign manager (not just system
// admins) so any owner can stop a live campaign — and only then delete it.
// Ownership is enforced inside the controller via canManageCampaign.
router.post('/:id/suspend', protect, authorize(...MANAGE_ROLES), suspendCampaign);
router.post('/:id/restore', protect, authorize(...MANAGE_ROLES), restoreCampaign);
// Self-service lifecycle for subcity / woreda owners (scope enforced in controller).
router.delete('/:id', protect, authorize(...MANAGE_ROLES), deleteCampaign);
router.post('/:id/activate', protect, authorize(...MANAGE_ROLES), activateCampaign);
router.post('/:id/deactivate', protect, authorize(...MANAGE_ROLES), deactivateCampaign);
router.post('/:id/report', protect, authorize(...CITIZEN_ROLES), reportCampaign);
router.post('/:id/updates', protect, authorize(...MANAGE_ROLES), alertUpload.array('files', 5), addCampaignUpdate);
router.post('/:id/proofs', protect, authorize(...MANAGE_ROLES), alertUpload.array('files', 5), uploadCampaignProof);
router.post('/:id/proofs/:proofId/verify', protect, authorize(...MANAGE_ROLES), verifyProof);
router.post('/:id/proofs/:proofId/reject', protect, authorize(...MANAGE_ROLES), rejectProof);

module.exports = router;
