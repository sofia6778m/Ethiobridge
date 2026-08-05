const express = require('express');
const router = express.Router();
const { protect, authorize } = require('../middleware/auth');
const {
  // Subcity admin
  getSubcityAdminProfile,
  getSubcityAdminStats,
  getSubcityWoredas,
  createSubcityWoreda,
  updateSubcityWoreda,
  deleteSubcityWoreda,
  createWoredaAdmin,
  resetWoredaAdminPassword,
  getSubcityAdminComplaints,
  getSubcityAnalytics,
  getSubcityDepartments,
  createSubcityDepartment,
  updateSubcityDepartment,
  deleteSubcityDepartment,
  getSubcityUsers,
  createSubcityUser,
  updateSubcityUser,
  toggleSubcityUserActive,
  deleteSubcityUser,
  // Woreda admin
  getWoredaAdminProfile,
  getWoredaAdminStats,
  getWoredaDepartments,
  createWoredaDepartment,
  updateWoredaDepartment,
  deleteWoredaDepartment,
  getWoredaStaff,
  createWoredaStaff,
  updateWoredaStaff,
  toggleWoredaStaffActive,
  deleteWoredaStaff,
  getWoredaAdminComplaints,
  assignOfficerToComplaint,
  assignTechnicianToComplaint,
  escalateComplaint,
  closeComplaint,
  getWoredaAnalytics,
  // Officer
  getOfficerProfile,
  getOfficerStats,
  getOfficerComplaints,
  officerVerifyComplaint,
  officerAssignTechnician,
  getOfficerTechnicians,
  // Technician
  getTechnicianProfile,
  getTechnicianStats,
  getTechnicianWorkOrders,
  technicianStartWork,
  technicianCompleteWork,
} = require('../controllers/hierarchyController');

// ── SUBCITY_ADMIN ─────────────────────────────────────────────────────────────
// `subcity_admin` is the canonical role for subcity admins created through the
// admin UI; `SUBCITY_ADMIN` is kept for legacy accounts. The authorize()
// middleware also lets any derived subcity_* role through these routes.
const SUBCITY_ADMIN_ROLES = ['SUBCITY_ADMIN', 'subcity_admin'];
const subcityGuard = protect;
router.get('/subcity/me', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), getSubcityAdminProfile);
router.get('/subcity/stats', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), getSubcityAdminStats);
router.get('/subcity/woredas', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), getSubcityWoredas);
router.post('/subcity/woredas', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), createSubcityWoreda);
router.put('/subcity/woredas/:id', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), updateSubcityWoreda);
router.delete('/subcity/woredas/:id', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), deleteSubcityWoreda);
router.post('/subcity/woreda-admins', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), createWoredaAdmin);
router.put('/subcity/woreda-admins/:id/reset-password', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), resetWoredaAdminPassword);
router.get('/subcity/complaints', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), getSubcityAdminComplaints);
router.get('/subcity/analytics', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), getSubcityAnalytics);
router.get('/subcity/departments', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), getSubcityDepartments);
router.post('/subcity/departments', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), createSubcityDepartment);
router.put('/subcity/departments/:id', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), updateSubcityDepartment);
router.delete('/subcity/departments/:id', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), deleteSubcityDepartment);
router.get('/subcity/users', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), getSubcityUsers);
router.post('/subcity/users', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), createSubcityUser);
router.put('/subcity/users/:id', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), updateSubcityUser);
router.put('/subcity/users/:id/toggle-active', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), toggleSubcityUserActive);
router.delete('/subcity/users/:id', subcityGuard, authorize(...SUBCITY_ADMIN_ROLES), deleteSubcityUser);

// ── WOREDA_ADMIN ──────────────────────────────────────────────────────────────
// `woreda_admin` is the canonical role for woreda admins created through the
// admin UI; `WOREDA_ADMIN` is kept for legacy accounts.
router.get('/woreda/me', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), getWoredaAdminProfile);
router.get('/woreda/stats', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), getWoredaAdminStats);
router.get('/woreda/departments', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), getWoredaDepartments);
router.post('/woreda/departments', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), createWoredaDepartment);
router.put('/woreda/departments/:id', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), updateWoredaDepartment);
router.delete('/woreda/departments/:id', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), deleteWoredaDepartment);
router.get('/woreda/staff', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), getWoredaStaff);
router.post('/woreda/staff', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), createWoredaStaff);
router.put('/woreda/staff/:id', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), updateWoredaStaff);
router.put('/woreda/staff/:id/toggle-active', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), toggleWoredaStaffActive);
router.delete('/woreda/staff/:id', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), deleteWoredaStaff);
router.get('/woreda/complaints', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), getWoredaAdminComplaints);
router.put('/woreda/complaints/:id/assign-officer', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), assignOfficerToComplaint);
router.put('/woreda/complaints/:id/assign-technician', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), assignTechnicianToComplaint);
router.post('/woreda/complaints/:id/escalate', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), escalateComplaint);
router.post('/woreda/complaints/:id/close', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), closeComplaint);
router.get('/woreda/analytics', subcityGuard, authorize('WOREDA_ADMIN', 'woreda_admin'), getWoredaAnalytics);

// ── OFFICER ───────────────────────────────────────────────────────────────────
router.get('/officer/me', subcityGuard, authorize('OFFICER'), getOfficerProfile);
router.get('/officer/stats', subcityGuard, authorize('OFFICER'), getOfficerStats);
router.get('/officer/complaints', subcityGuard, authorize('OFFICER'), getOfficerComplaints);
router.put('/officer/complaints/:id/verify', subcityGuard, authorize('OFFICER'), officerVerifyComplaint);
router.put('/officer/complaints/:id/assign-technician', subcityGuard, authorize('OFFICER'), officerAssignTechnician);
router.get('/officer/technicians', subcityGuard, authorize('OFFICER'), getOfficerTechnicians);

// ── TECHNICIAN ────────────────────────────────────────────────────────────────
router.get('/technician/me', subcityGuard, authorize('TECHNICIAN'), getTechnicianProfile);
router.get('/technician/stats', subcityGuard, authorize('TECHNICIAN'), getTechnicianStats);
router.get('/technician/work-orders', subcityGuard, authorize('TECHNICIAN'), getTechnicianWorkOrders);
router.put('/technician/work-orders/:id/start', subcityGuard, authorize('TECHNICIAN'), technicianStartWork);
router.put('/technician/work-orders/:id/complete', subcityGuard, authorize('TECHNICIAN'), technicianCompleteWork);

module.exports = router;
