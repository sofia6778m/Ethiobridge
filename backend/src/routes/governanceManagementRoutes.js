const express = require('express');
const router = express.Router();
const { protect, protectOptional, authorize } = require('../middleware/auth');
const {
  GOVERNANCE_MANAGEMENT_ROLES,
  getOffices,
  createOffice,
  updateOffice,
  toggleOffice,
  deleteOffice,
  getCategories,
  createCategory,
  updateCategory,
  toggleCategory,
  deleteCategory,
  getOfficers,
  createOfficer,
  updateOfficer,
  toggleOfficer,
  resetOfficerPassword,
  getManagementSummary,
} = require('../controllers/governanceManagementController');

// Public reads (used by the public submission form) — offices by subcity and
// categories by office. protectOptional so logged-in citizens are identified
// but anonymous visitors can still load the dropdowns. The same GET /offices
// handler serves subcity admins too (it scopes to their subcity by role).
router.get('/offices', protectOptional, getOffices);
router.get('/categories', protectOptional, getCategories);

// Management (subcity admins + platform admins)
router.get('/summary', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), getManagementSummary);

// ── Government Office management ──
router.post('/offices', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), createOffice);
router.put('/offices/:id', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), updateOffice);
router.patch('/offices/:id/toggle', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), toggleOffice);
router.delete('/offices/:id', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), deleteOffice);

// ── Complaint Category management ──
router.post('/categories', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), createCategory);
router.put('/categories/:id', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), updateCategory);
router.patch('/categories/:id/toggle', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), toggleCategory);
router.delete('/categories/:id', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), deleteCategory);

// ── Governance Officer user management ──
router.get('/officers', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), getOfficers);
router.post('/officers', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), createOfficer);
router.put('/officers/:id', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), updateOfficer);
router.patch('/officers/:id/toggle', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), toggleOfficer);
router.put('/officers/:id/reset-password', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), resetOfficerPassword);

module.exports = router;
