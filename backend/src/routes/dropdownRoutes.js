const express = require('express');
const router = express.Router();
const {
  getSubcities,
  getWoredas,
  getDepartments,
  getPublicIssues,
} = require('../controllers/dropdownController');

// Public dependent-dropdown endpoints.
//
// Mounted at /api BEFORE the admin woreda/department routers. They handle the
// ID-scoped lookups (GET /api/woredas?subcityId=..., GET /api/departments?woredaId=...)
// as public reads and call next() when no lookup param is present, so every
// other woreda/department route keeps its admin-only protection.
router.get('/subcities', getSubcities);
router.get('/woredas', getWoredas);
router.get('/departments', getDepartments);
router.get('/public-issues', getPublicIssues);

module.exports = router;
