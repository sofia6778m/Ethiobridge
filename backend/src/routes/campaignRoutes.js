const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const {
  createCampaign, updateCampaign, deleteCampaign, approveCampaign, rejectCampaign,
  getCampaigns, getPublicCampaigns, getCampaign, getMyCampaigns,
  donate, getDonationHistory, getReceipt, getMyReceipts,
  getCampaignStats, getFinancialReports, getFinancialAnalytics, detectFraud,
  saveCampaign, getSavedCampaigns,
  getSuccessStories, getTopDonors, getDistributionReports,
  getAvailableReports, createCampaignFromReport,
  // Community Campaign Platform
  getCampaignCategories, getCampaignTransparency, getPublicDonorStats,
  addCampaignUpdate, deleteCampaignUpdate, addExpense, updateImpactMetrics,
  completeCampaign,
} = require('../controllers/campaignController');

// Subcity & Woreda admins manage campaign content for their own office.
const OFFICE_ROLES = ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'woreda', 'SUBCITY_HEAD', 'WOREDA_HEAD'];

// Public routes
router.get('/public', getPublicCampaigns);
router.get('/public/success-stories', getSuccessStories);
router.get('/public/top-donors', getTopDonors);
router.get('/public/donor-stats', getPublicDonorStats);
router.get('/public/:id/transparency', getCampaignTransparency);
router.get('/public/:id', getCampaign);
router.get('/categories', getCampaignCategories);

// Protected routes
router.get('/', protect, getCampaigns);
router.get('/my', protect, getMyCampaigns);
router.get('/stats', protect, getCampaignStats);
router.post('/', protect, createCampaign);
router.put('/:id', protect, updateCampaign);
router.delete('/:id', protect, deleteCampaign);

// Admin only
router.put('/:id/approve', protect, authorize('admin'), approveCampaign);
router.put('/:id/reject', protect, authorize('admin'), rejectCampaign);

// ── Community Campaign Platform: transparency & office content ───────────────
// Proof-of-work updates with media (photos / videos / receipts). Up to 6 files
// per update under the multipart field name "media".
const updateMediaMiddleware = (req, res, next) => {
  upload.array('media', 6)(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Each media file must be under 50 MB.'
        : (err.message || 'Invalid media file.');
      return res.status(400).json({ success: false, message });
    }
    next();
  });
};
router.post('/:id/updates', protect, authorize('admin', 'ADMIN', ...OFFICE_ROLES), updateMediaMiddleware, addCampaignUpdate);
router.delete('/:id/updates/:updateId', protect, authorize('admin', 'ADMIN', ...OFFICE_ROLES), deleteCampaignUpdate);
router.post('/:id/expenses', protect, authorize('admin', 'ADMIN', ...OFFICE_ROLES), addExpense);
router.put('/:id/impact', protect, authorize('admin', 'ADMIN', ...OFFICE_ROLES), updateImpactMetrics);
router.put('/:id/complete', protect, authorize('admin', 'ADMIN', ...OFFICE_ROLES), completeCampaign);

// Donation
router.post('/donate', donate);
router.get('/donations/history', protect, getDonationHistory);
router.get('/donations/receipt/:receiptNumber', getReceipt);
router.get('/donations/receipts/my', protect, getMyReceipts);

// Save Campaign (Citizen)
router.post('/:id/save', protect, saveCampaign);
router.get('/saved/my', protect, getSavedCampaigns);

// Government / NGO
router.get('/financial/reports', protect, getFinancialReports);
router.get('/financial/analytics', protect, authorize('admin'), getFinancialAnalytics);
router.get('/financial/distribution', protect, getDistributionReports);

// Admin fraud detection
router.get('/admin/fraud-detection', protect, authorize('admin'), detectFraud);

// Report-to-Campaign Integration
router.get('/available-reports', protect, getAvailableReports);
router.post('/create-from-report', protect, createCampaignFromReport);

module.exports = router;
