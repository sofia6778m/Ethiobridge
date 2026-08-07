const express = require('express');
const router = express.Router();
const { createInfrastructure } = require('../controllers/reportController');
const { protectOptional } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const { generalLimiter, uploadLimiter } = require('../middleware/rateLimiter');
const { validatePublicInfrastructureReport } = require('../middleware/validation');

// ── Infrastructure reports ────────────────────────────────────────────────────
// Public (anonymous allowed). Routes the report to the responsible department
// dashboard and stores it in the InfrastructureReport collection with
// report_type='infrastructure'. Authentication never changes the report type.
router.post(
  '/infrastructure',
  generalLimiter,
  uploadLimiter,
  protectOptional,
  upload.array('media', 10),
  validatePublicInfrastructureReport,
  createInfrastructure
);

module.exports = router;
