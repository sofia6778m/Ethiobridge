const express = require('express');
const router = express.Router();
const {
  getStats, getUsers, createUser, updateUser, approveUser, toggleUserActive, deleteUser,
  getPendingApprovals, getRegionStats, getActivityLogs, getDepartments, getLocations,
  getAdminSubcities, createSubcity, updateSubcity, deleteSubcity,
  createSubcityAdmin, resetSubcityAdminPassword,
  createSubcityUser,
  createWoredaAdmin,
  createDepartmentOfficer,
  getIssueTypes, createIssueType, updateIssueType, deleteIssueType,
  toggleIssueType, seedIssueTypes,
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');

// All admin routes require admin role
router.use(protect, authorize('admin', 'ADMIN'));

router.get('/stats', getStats);
router.get('/region-stats', getRegionStats);
// Department list is read-only reference data (issue types, forms). Creation is
// handled by WOREDA_ADMIN via /api/hierarchy/woreda/departments.
router.get('/departments', getDepartments);
router.get('/locations', getLocations);
router.get('/activity-logs', getActivityLogs);

// Subcity master data (admin only)
router.get('/subcities', getAdminSubcities);
router.post('/subcities', createSubcity);
router.put('/subcities/:id', updateSubcity);
router.delete('/subcities/:id', deleteSubcity);

// Subcity admin accounts (admin only)
// POST /api/admin/subcity-users derives the role automatically from the
// selected subcity (Bole → subcity_bole) and validates against the live
// Subcity collection.
router.post('/subcity-users', createSubcityUser);
router.post('/subcity-admins', createSubcityAdmin);
router.put('/subcity-admins/:id/reset-password', resetSubcityAdminPassword);

// Woreda admin accounts (admin only) — role is always `woreda_admin`, scoped
// to the selected subcity + woreda. Validation happens in the controller.
router.post('/woreda-admins', createWoredaAdmin);

// Department officer accounts (admin only) — role is always `department_officer`,
// scoped to the selected subcity + woreda + department. Validation happens in
// the controller.
router.post('/department-officers', createDepartmentOfficer);

router.get('/users', getUsers);
router.post('/users', createUser);
router.get('/pending-approvals', getPendingApprovals);
router.put('/users/:id', updateUser);
router.put('/users/:id/approve', approveUser);
router.put('/users/:id/toggle-active', toggleUserActive);
router.delete('/users/:id', deleteUser);
router.put('/users/:id/reset-password', require('../controllers/adminController').resetUserPassword);

// ── IssueType management ──────────────────────────────────────────────────────
router.post('/issue-types/seed', seedIssueTypes);
router.get('/issue-types', getIssueTypes);
router.post('/issue-types', createIssueType);
router.put('/issue-types/:id', updateIssueType);
router.patch('/issue-types/:id/toggle', toggleIssueType);
router.delete('/issue-types/:id', deleteIssueType);

module.exports = router;
