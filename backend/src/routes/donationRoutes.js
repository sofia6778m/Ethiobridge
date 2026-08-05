const express = require('express');
const router = express.Router();
const { protect, protectOptional, authorize } = require('../middleware/auth');
const { imageUpload } = require('../config/cloudinary');
const { generalLimiter, uploadLimiter } = require('../middleware/rateLimiter');
const {
  getPublicOverview, getPaymentMethods, createDonation, uploadReceipt, trackDonation,
  getMyDonations, getMyDonationSummary, getCertificate,
  getDonations, getDonation, getDonationStats, verifyDonation, rejectDonation,
  exportDonationsCsv, exportDonationsExcel, exportDonationsPdf,
  getOfficeDonations, getOfficeDonationStats, getOfficeExport,
  getAdminPaymentMethods, createPaymentMethod, updatePaymentMethod, deletePaymentMethod,
} = require('../controllers/donationController');

// Local-government office roles (Subcity & Woreda admins) that manage and
// monitor donations collected for their own office.
const OFFICE_ROLES = ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'woreda', 'SUBCITY_HEAD', 'WOREDA_HEAD'];

// ── Public routes ─────────────────────────────────────────────────────────────
router.get('/overview', getPublicOverview);
router.get('/payment-methods', getPaymentMethods);
router.post('/', generalLimiter, protectOptional, createDonation);
router.get('/track/:referenceNumber', trackDonation);

// ── Donor routes (any authenticated user) ─────────────────────────────────────
router.get('/my', generalLimiter, protect, getMyDonations);
router.get('/my/summary', protect, getMyDonationSummary);

// Upload proof-of-payment receipt image (multipart, field name "receipt").
// Multer errors (size / type) are translated to clean 400 responses here.
const uploadReceiptMiddleware = (req, res, next) => {
  imageUpload.single('receipt')(req, res, (err) => {
    if (err) {
      const message = err.code === 'LIMIT_FILE_SIZE'
        ? 'Receipt image must be under 5 MB.'
        : (err.message || 'Invalid receipt image.');
      return res.status(400).json({ success: false, message });
    }
    next();
  });
};
router.post('/:referenceNumber/upload-receipt', uploadLimiter, uploadReceiptMiddleware, uploadReceipt);

// Certificate download (donor owner or admin only)
router.get('/:id/certificate', protect, getCertificate);

// ── Office routes (Subcity / Woreda admin dashboards) ─────────────────────────
// Registered before /:id so 'office' is never caught by the generic id route.
router.get('/office', generalLimiter, protect, authorize(...OFFICE_ROLES), getOfficeDonations);
router.get('/office/stats', generalLimiter, protect, authorize(...OFFICE_ROLES), getOfficeDonationStats);
router.get('/office/export', generalLimiter, protect, authorize(...OFFICE_ROLES), getOfficeExport);

// ── Admin routes (role-protected) ─────────────────────────────────────────────
// List + exports must be registered before the generic /:id route.
router.get('/', generalLimiter, protect, authorize('admin', 'ADMIN'), getDonations);
router.get('/stats', generalLimiter, protect, authorize('admin', 'ADMIN'), getDonationStats);
router.get('/export/csv', generalLimiter, protect, authorize('admin', 'ADMIN'), exportDonationsCsv);
router.get('/export/excel', generalLimiter, protect, authorize('admin', 'ADMIN'), exportDonationsExcel);
router.get('/export/pdf', generalLimiter, protect, authorize('admin', 'ADMIN'), exportDonationsPdf);

router.get('/:id', protect, authorize('admin', 'ADMIN'), getDonation);
router.post('/:id/verify', protect, authorize('admin', 'ADMIN'), verifyDonation);
router.post('/:id/reject', protect, authorize('admin', 'ADMIN'), rejectDonation);

// ── Payment method management (admin) ─────────────────────────────────────────
router.get('/payment-methods/manage', protect, authorize('admin', 'ADMIN'), getAdminPaymentMethods);
router.post('/payment-methods', protect, authorize('admin', 'ADMIN'), createPaymentMethod);
router.put('/payment-methods/:id', protect, authorize('admin', 'ADMIN'), updatePaymentMethod);
router.delete('/payment-methods/:id', protect, authorize('admin', 'ADMIN'), deletePaymentMethod);

module.exports = router;
