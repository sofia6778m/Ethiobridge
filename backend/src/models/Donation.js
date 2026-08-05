const mongoose = require('mongoose');

// Donation Management System
// ─────────────────────────
// One document per donation submission. Backwards compatible with the legacy
// fundraising flow (campaignController.donate) while adding the full
// verification workflow:
//
//   paymentStatus      pending → completed (once verified by an admin)
//   verificationStatus pending_verification → verified | rejected
//
// The reference number (DON-YYYY-NNNNNN) is allocated atomically from the
// Counter collection by src/utils/donationReference.js.
const donationSchema = new mongoose.Schema({
  // ── Purpose / campaign (donation_campaigns collection) ──
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true,
  },
  purposeLabel: {
    type: String,
    default: '',
  },

  // ── Donation type ─────────────────────────────────────────────────────────
  // cash    — monetary donation verified via payment receipts
  // in_kind — non-monetary goods/services registered against the campaign
  donationType: {
    type: String,
    enum: ['cash', 'in_kind'],
    default: 'cash',
  },
  // In-kind donation details (used when donationType === 'in_kind').
  inKind: {
    itemName: { type: String, trim: true, default: '' },
    description: { type: String, default: '' },
    quantity: { type: Number, default: 1 },
    unit: { type: String, trim: true, default: '' },
    // Monetary value assigned to the goods for transparency/impact reporting.
    estimatedValue: { type: Number, default: 0 },
    condition: { type: String, default: 'new' },
    photos: [
      {
        url: { type: String, default: '' },
        publicId: { type: String, default: '' },
      },
    ],
  },

  // ── Local government office scope ─────────────────────────────────────────
  // Denormalized from the campaign at submission time so donations can be
  // tracked and reported per subcity / woreda / department without joins.
  subcity: { type: String, default: '' },
  subcityId: { type: mongoose.Schema.Types.ObjectId, default: null },
  woreda: { type: String, default: '' },
  woredaId: { type: mongoose.Schema.Types.ObjectId, default: null },
  department: { type: String, default: '' },

  // ── Donor identity ──
  donor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  fullName: {
    type: String,
    required: true,
    trim: true,
    maxlength: 120,
  },
  phone: {
    type: String,
    required: true,
    trim: true,
    maxlength: 20,
  },
  email: {
    type: String,
    trim: true,
    lowercase: true,
    maxlength: 120,
  },
  isAnonymous: {
    type: Boolean,
    default: false,
  },
  // Legacy aliases — kept populated so the older fundraising pages keep working.
  donorName: {
    type: String,
    default: '',
  },
  donorEmail: {
    type: String,
    default: '',
  },

  // ── Amount ──
  amount: {
    type: Number,
    required: true,
    min: 1,
  },
  currency: {
    type: String,
    default: 'ETB',
  },
  recurringMonthly: {
    type: Boolean,
    default: false,
  },

  // ── Message / comment ──
  message: {
    type: String,
    default: '',
    maxlength: 1000,
  },

  // ── Payment method ──
  paymentMethod: {
    type: String,
    enum: [
      'telebirr', 'cbe_birr', 'cbe_bank', 'awash_bank', 'dashen_bank', 'amole',
      'chapa', 'chapa_payment', 'coopay_amole', 'visa', 'mastercard',
      'bank_transfer', 'qr_code', 'in_kind',
    ],
    required: true,
  },
  paymentMethodName: {
    type: String,
    default: '',
  },
  paymentMethodAccount: {
    type: String,
    default: '',
  },
  transactionId: {
    type: String,
  },

  // ── Verification workflow ──
  verificationStatus: {
    type: String,
    enum: ['pending_verification', 'verified', 'rejected'],
    default: 'pending_verification',
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending',
  },
  rejectionReason: {
    type: String,
    default: '',
  },
  verifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  verifiedAt: {
    type: Date,
  },
  verificationHistory: [
    {
      action: { type: String, enum: ['submitted', 'receipt_uploaded', 'verified', 'rejected'], default: 'submitted' },
      admin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      reason: { type: String, default: '' },
      date: { type: Date, default: Date.now },
    },
  ],

  // ── Proof of payment (receipt image) ──
  receiptImageUrl: {
    type: String,
    default: '',
  },
  receiptPublicId: {
    type: String,
    default: '',
  },
  receiptSubmittedAt: {
    type: Date,
  },

  // ── Identifiers ──
  referenceNumber: {
    type: String,
    unique: true,
    sparse: true,
  },
  receiptNumber: {
    type: String,
    unique: true,
    sparse: true,
  },
  certificatePdfUrl: {
    type: String,
    default: '',
  },
  qrPayload: {
    type: String,
    default: '',
  },

  // ── Source ──
  source: {
    type: String,
    enum: ['web', 'mobile', 'other'],
    default: 'web',
  },
  ipHash: {
    type: String,
    default: '',
  },
}, { timestamps: true });

donationSchema.index({ campaign: 1, createdAt: -1 });
donationSchema.index({ donor: 1, createdAt: -1 });
donationSchema.index({ paymentStatus: 1 });
donationSchema.index({ verificationStatus: 1, createdAt: -1 });
donationSchema.index({ phone: 1, amount: 1, campaign: 1, createdAt: -1 });
donationSchema.index({ subcity: 1, verificationStatus: 1, createdAt: -1 });
donationSchema.index({ woreda: 1, verificationStatus: 1, createdAt: -1 });
donationSchema.index({ department: 1, verificationStatus: 1, createdAt: -1 });

// Assign the legacy RCP-… receipt number when none is present (kept for the
// older fundraising flow — the new flow keys on DON-YYYY-NNNNNN instead).
donationSchema.pre('save', function (next) {
  if (!this.receiptNumber) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.receiptNumber = `RCP-${timestamp}${random}`;
  }
  // Legacy donations created as "completed" are treated as already verified so
  // they surface correctly in the admin dashboard's Verified tab.
  if (!this.verificationStatus && this.paymentStatus === 'completed') {
    this.verificationStatus = 'verified';
  }
  next();
});

module.exports = mongoose.model('Donation', donationSchema);
