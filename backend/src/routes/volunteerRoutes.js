const express = require('express');
const router = express.Router();
const { protect, protectOptional, authorize } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');
const {
  registerVolunteer, getMyVolunteering, getVolunteers, getCampaignVolunteers,
  getVolunteerStats, updateVolunteerStatus, deleteVolunteer,
} = require('../controllers/volunteerController');

// Subcity & Woreda admins manage volunteers for their own campaigns.
const OFFICE_ROLES = ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'woreda', 'SUBCITY_HEAD', 'WOREDA_HEAD'];

// Public: register as a volunteer for a campaign (guests allowed).
router.post('/', generalLimiter, protectOptional, registerVolunteer);

// Citizen: my volunteering history.
router.get('/my', generalLimiter, protect, getMyVolunteering);

// Office / Admin: volunteers for a specific campaign (must be in scope).
router.get('/campaign/:campaignId', generalLimiter, protect, authorize('admin', 'ADMIN', ...OFFICE_ROLES), getCampaignVolunteers);

// Office / Admin: manage volunteers across their campaigns.
router.get('/stats', generalLimiter, protect, authorize('admin', 'ADMIN', ...OFFICE_ROLES), getVolunteerStats);
router.get('/', generalLimiter, protect, authorize('admin', 'ADMIN', ...OFFICE_ROLES), getVolunteers);

router.patch('/:id/status', protect, authorize('admin', 'ADMIN', ...OFFICE_ROLES), updateVolunteerStatus);
router.delete('/:id', protect, authorize('admin', 'ADMIN', ...OFFICE_ROLES), deleteVolunteer);

module.exports = router;
