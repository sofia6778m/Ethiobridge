const express = require('express');
const router = express.Router();
const { protect, protectOptional, authorize } = require('../middleware/auth');
const {
  GOVERNANCE_READ_ROLES,
  GOVERNANCE_MANAGEMENT_ROLES,
  getOffices,
  getOffice,
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
  getOfficer,
  updateOfficer,
  toggleOfficer,
  deleteOfficer,
  resetOfficerPassword,
  getSlaRules,
  upsertSlaRule,
  deleteSlaRule,
  getManagementSummary,
} = require('../controllers/governanceManagementController');

// ── Public reads ──────────────────────────────────────────────────────────────
// Used by the public submission form. protectOptional: logged-in citizens are
// identified but anonymous visitors can still load the dropdowns. The same GET
// handlers also serve subcity admins (scoped to their own subcity by role).
router.get('/offices', protectOptional, getOffices);
router.get('/categories', protectOptional, getCategories);

// ── Read routes — subcity admins + platform admins (read-only for platform) ──
router.get('/summary', protect, authorize(...GOVERNANCE_READ_ROLES), getManagementSummary);
router.get('/officers', protect, authorize(...GOVERNANCE_READ_ROLES), getOfficers);
router.get('/offices/:id', protect, authorize(...GOVERNANCE_READ_ROLES), getOffice);
router.get('/officers/:id', protect, authorize(...GOVERNANCE_READ_ROLES), getOfficer);

// ── Write routes — subcity admins only ───────────────────────────────────────
// Platform admins (admin/ADMIN/government) are intentionally excluded from
// write routes. The controller also has a hard isAdmin() guard as a second
// layer of defence.

// Government Office management
router.post('/offices',            protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), createOffice);
router.put('/offices/:id',         protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), updateOffice);
router.patch('/offices/:id/toggle',protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), toggleOffice);
router.delete('/offices/:id',      protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), deleteOffice);

// Complaint Category management
router.post('/categories',             protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), createCategory);
router.put('/categories/:id',          protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), updateCategory);
router.patch('/categories/:id/toggle', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), toggleCategory);
router.delete('/categories/:id',       protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), deleteCategory);

// Governance Officer user management
// Creation uses the single dedicated endpoint POST /api/governance-users
// (see backend/src/index.js) so there is only one way to create an account.
router.put('/officers/:id',                protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), updateOfficer);
router.patch('/officers/:id/toggle',       protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), toggleOfficer);
router.delete('/officers/:id',             protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), deleteOfficer);
router.put('/officers/:id/reset-password', protect, authorize(...GOVERNANCE_MANAGEMENT_ROLES), resetOfficerPassword);

// ── SLA rules — category-based response deadlines ─────────────────────────────
// Subcity admins manage their own subcity's rules; platform admins manage the
// global defaults (both role sets are explicitly allowed).
router.get('/sla-rules',    protect, authorize('admin', 'ADMIN', ...GOVERNANCE_MANAGEMENT_ROLES), getSlaRules);
router.post('/sla-rules',   protect, authorize('admin', 'ADMIN', ...GOVERNANCE_MANAGEMENT_ROLES), upsertSlaRule);
router.delete('/sla-rules/:id', protect, authorize('admin', 'ADMIN', ...GOVERNANCE_MANAGEMENT_ROLES), deleteSlaRule);

module.exports = router;
