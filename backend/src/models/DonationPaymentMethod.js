const mongoose = require('mongoose');

// Donation Payment Method (donation_payment_methods collection)
// ─────────────────────────────────────────────────────────────
// Ethiopian payment channels offered to donors. Each method holds the account /
// wallet details donors need to complete a transfer plus the payload used to
// build the unique per-method QR code. Managed by admins at runtime.
const donationPaymentMethodSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    nameAmharic: {
      type: String,
      default: '',
    },
    type: {
      type: String,
      enum: ['mobile_wallet', 'bank', 'aggregator', 'other'],
      required: true,
    },
    // Account / wallet number the donor pays into.
    accountNumber: {
      type: String,
      default: '',
    },
    // Registered account / wallet holder name.
    accountHolder: {
      type: String,
      default: '',
    },
    // Branch information (banks only).
    branch: {
      type: String,
      default: '',
    },
    additionalInfo: {
      type: String,
      default: '',
    },
    // Optional verbatim QR content (e.g. a CBE Birr merchant QR string). When
    // empty the system builds the QR from accountNumber + donation reference.
    qrContent: {
      type: String,
      default: '',
    },
    // Short human instructions for completing the transfer.
    instructions: {
      type: String,
      default: '',
    },
    iconKey: {
      type: String,
      default: 'FaWallet',
    },
    colorHex: {
      type: String,
      default: '#6366f1',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    sortOrder: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

donationPaymentMethodSchema.index({ isActive: 1, sortOrder: 1 });

module.exports = mongoose.model('DonationPaymentMethod', donationPaymentMethodSchema);
