const express = require('express');
const router = express.Router();
const {
  getStats, getUsers, createUser, updateUser, approveUser, toggleUserActive, deleteUser,
  getPendingApprovals, getRegionStats, getActivityLogs, getDepartments, getLocations,
  createDepartment, updateDepartment, deleteDepartment,
  getAdminWoredas, createWoreda, updateWoreda, deleteWoreda, getWoredaDeps,
  getAdminSubcities, createSubcity, updateSubcity, deleteSubcity,
  getIssueTypes, createIssueType, updateIssueType, deleteIssueType,
  toggleIssueType, seedIssueTypes,
} = require('../controllers/adminController');
const { protect, authorize } = require('../middleware/auth');
const {
  getSubcityDepartments, createSubcityDepartment,
  updateSubcityDepartment, deleteSubcityDepartment,
} = require('../controllers/subcityDepartmentController');

// All admin routes require admin role
router.use(protect, authorize('admin'));

router.get('/stats', getStats);
router.get('/region-stats', getRegionStats);
router.get('/departments', getDepartments);
router.post('/departments', createDepartment);
router.put('/departments/:id', updateDepartment);
router.delete('/departments/:id', deleteDepartment);
router.get('/woredas', getAdminWoredas);
router.post('/woredas', createWoreda);
router.put('/woredas/:id', updateWoreda);
router.delete('/woredas/:id', deleteWoreda);
router.get('/subcities', getAdminSubcities);
router.post('/subcities', createSubcity);
router.put('/subcities/:id', updateSubcity);
router.delete('/subcities/:id', deleteSubcity);
// Subcity-scoped department management (admin only)
router.get('/subcities/:id/departments', getSubcityDepartments);
router.post('/subcities/:id/departments', createSubcityDepartment);
router.put('/subcities/:id/departments/:deptId', updateSubcityDepartment);
router.delete('/subcities/:id/departments/:deptId', deleteSubcityDepartment);
router.get('/locations', getLocations);
router.get('/activity-logs', getActivityLogs);

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
