const express = require('express');
const router = express.Router();
const { protect, protectOptional, authorize } = require('../middleware/auth');
const {
  createDonation,
  trackDonationByRef,
  getMyDonations,
  getDonation,
  getCampaignDonations,
  getAllDonations,
  verifyDonation,
  getDonationStats,
  exportDonations,
} = require('../controllers/donationController');

const MANAGE_ROLES = [
  'admin', 'ADMIN', 'government',
  'subcity_admin', 'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'SUBCITY_HEAD', 'SUBCITY_ADMIN',
  'woreda_admin', 'woreda', 'WOREDA_HEAD', 'WOREDA_ADMIN',
];
const CITIZEN_ROLES = ['citizen', 'CITIZEN'];

// Public donation submission — guests and every logged-in role can donate.
// protectOptional attaches the account identity for logged-in users (so their
// profile data pre-fills and the donor is linked) but never rejects a guest.
// Donor identity is never gated by role.
router.post('/', protectOptional, createDonation);

// Citizens can list their own donations and track their receipts.
router.get('/my', protect, authorize(...CITIZEN_ROLES), getMyDonations);

// Public receipt lookup by tracking reference — no auth, kept before the /:id catch-all.
router.get('/track/:donationRef', trackDonationByRef);

// Manager reads (fixed paths BEFORE the /:id catch-all).
router.get('/stats', protect, authorize(...MANAGE_ROLES), getDonationStats);
router.get('/export', protect, authorize(...MANAGE_ROLES), exportDonations);
router.get('/campaign/:campaignId', protect, authorize(...MANAGE_ROLES), getCampaignDonations);
router.get('/all', protect, authorize(...MANAGE_ROLES), getAllDonations);

// Owner (citizen) or in-scope manager.
router.get('/:id', protect, getDonation);
router.post('/:id/verify', protect, authorize(...MANAGE_ROLES), verifyDonation);

module.exports = router;
