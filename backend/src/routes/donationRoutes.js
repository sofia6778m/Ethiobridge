const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  createDonation,
  createPublicDonation,
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

// Citizens record money donations + in-kind pledges and track their receipts.
router.post('/', protect, authorize(...CITIZEN_ROLES), createDonation);
router.get('/my', protect, authorize(...CITIZEN_ROLES), getMyDonations);

// Public (guest) donation + receipt tracking — no auth, kept before the /:id catch-all.
router.post('/public', createPublicDonation);
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
