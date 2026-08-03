const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  createCampaign, updateCampaign, deleteCampaign, approveCampaign, rejectCampaign,
  getCampaigns, getPublicCampaigns, getCampaign, getMyCampaigns,
  donate, getDonationHistory, getReceipt, getMyReceipts,
  getCampaignStats, getFinancialReports, getFinancialAnalytics, detectFraud,
  saveCampaign, getSavedCampaigns,
  getSuccessStories, getTopDonors, getDistributionReports,
  getAvailableReports, createCampaignFromReport,
} = require('../controllers/campaignController');

// Public routes
router.get('/public', getPublicCampaigns);
router.get('/public/success-stories', getSuccessStories);
router.get('/public/top-donors', getTopDonors);
router.get('/public/:id', getCampaign);

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
