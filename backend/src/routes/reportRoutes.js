const express = require('express');
const router = express.Router();
const { createInfrastructure } = require('../controllers/reportController');
const { createComplaint } = require('../controllers/publicComplaintController');
const { protectOptional } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const { generalLimiter, uploadLimiter } = require('../middleware/rateLimiter');
const { validatePublicInfrastructureReport, validateComplaint } = require('../middleware/validation');

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

// ── Public complaints ─────────────────────────────────────────────────────────
// Public (anonymous allowed). Stores the complaint in the PublicComplaint
// collection with report_type='public_complaint' and routes it to the assigned
// government/public-complaint office.
router.post(
  '/public-complaint',
  generalLimiter,
  uploadLimiter,
  protectOptional,
  upload.array('attachments', 5),
  validateComplaint,
  createComplaint
);

module.exports = router;
