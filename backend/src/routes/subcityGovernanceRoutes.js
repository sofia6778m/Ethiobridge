/**
 * subcityGovernanceRoutes.js
 *
 * Subcity-scoped governance management endpoints:
 *   GET/POST/PUT/DELETE  /api/subcity/government-offices
 *   GET/POST/PUT/DELETE  /api/subcity/complaint-categories
 *   GET/POST/PUT/DELETE  /api/subcity/governance-users
 *
 * All routes require an authenticated Subcity Admin (subcity_*, SUBCITY_ADMIN,
 * SUBCITY_HEAD). The controller already enforces subcity isolation — a Subcity
 * Admin can only read/write records that belong to their own subcity.
 *
 * The existing /api/governance-management/* routes remain available to
 * platform admins (admin / ADMIN) for cross-subcity read access. These new
 * routes mirror the same controller functions but are mounted exclusively for
 * subcity-admin roles, making the ownership boundary explicit in the API.
 */

const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  getOffices,
  getOffice,
  getOfficesBySubcityId,
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

// ── Authorization ─────────────────────────────────────────────────────────────
// Any subcity_* role (subcity_admin, subcity_bole, subcity_yeka, subcity_koye,
// any future subcity_<name>, …) plus the canonical SUBCITY_ADMIN / SUBCITY_HEAD
// values. The authorize() middleware wildcard accepts all subcity_* roles when
// at least one is listed, so a single subcity_* entry covers every derived role.
const SUBCITY_ROLES = ['SUBCITY_ADMIN', 'SUBCITY_HEAD', 'subcity_admin', 'subcity_bole'];

router.use(protect, authorize(...SUBCITY_ROLES));

// ── Summary ───────────────────────────────────────────────────────────────────
router.get('/summary', getManagementSummary);

// ── Government Offices ────────────────────────────────────────────────────────
router.get('/government-offices',           getOffices);
router.get('/government-offices/by-subcity/:subcityId', getOfficesBySubcityId);
router.get('/government-offices/:id',       getOffice);
router.post('/government-offices',          createOffice);
router.put('/government-offices/:id',       updateOffice);
router.patch('/government-offices/:id/toggle', toggleOffice);
router.delete('/government-offices/:id',    deleteOffice);

// ── Complaint Categories ──────────────────────────────────────────────────────
router.get('/complaint-categories',           getCategories);
router.post('/complaint-categories',          createCategory);
router.put('/complaint-categories/:id',       updateCategory);
router.patch('/complaint-categories/:id/toggle', toggleCategory);
router.delete('/complaint-categories/:id',    deleteCategory);

// ── Governance Users (officers + supervisors) ─────────────────────────────────
router.get('/governance-users',                  getOfficers);
router.get('/governance-users/:id',              getOfficer);
router.put('/governance-users/:id',              updateOfficer);
router.patch('/governance-users/:id/toggle',     toggleOfficer);
router.put('/governance-users/:id/reset-password', resetOfficerPassword);
router.delete('/governance-users/:id',           deleteOfficer);

// ── SLA Rules (subcity-scoped response deadlines) ─────────────────────────────
router.get('/sla-rules',             getSlaRules);
router.post('/sla-rules',            upsertSlaRule);
router.delete('/sla-rules/:id',      deleteSlaRule);

module.exports = router;
