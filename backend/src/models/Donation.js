const mongoose = require('mongoose');

// A donation is either a cash contribution (type: 'money') or an in-kind item
// pledge (type: 'in_kind'). Money contributions carry a paymentMethod; in-kind
// pledges carry an items list. Every donation gets a unique DON-YYYY-NNNNNN
// reference (donationReference util) used for tracking + the receipt.
const DONATION_TYPES = ['money', 'in_kind'];
const PAYMENT_METHODS = ['telebirr', 'chapa', 'cbe_birr', 'cash', 'bank_transfer', 'in_kind'];
const DONATION_STATUSES = ['pending', 'verified', 'failed', 'refunded'];

const itemSchema = new mongoose.Schema(
  {
    name: { type: String, required: [true, 'Item name is required'], trim: true },
    quantity: { type: Number, default: 1, min: 1 },
  },
  { _id: false }
);

const donationSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
    donationRef: { type: String, unique: true },
    // Present unless the donation is fully anonymous.
    donor: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Name/phone are validated in the controller (required unless anonymous),
    // so the schema stays permissive enough to store anonymous donations.
    donorName: { type: String, default: '', trim: true },
    donorPhone: { type: String, default: '', trim: true },
    donorEmail: { type: String, default: '', trim: true },
    message: { type: String, default: '', trim: true, maxlength: 500 },
    isAnonymous: { type: Boolean, default: false },
    type: { type: String, enum: DONATION_TYPES, required: true },
    // Required when type === 'money'.
    amount: { type: Number, min: [1, 'Donation amount must be greater than zero'] },
    paymentMethod: { type: String, enum: PAYMENT_METHODS, required: true },
    // Required when type === 'in_kind'.
    items: { type: [itemSchema], default: [] },
    itemNotes: { type: String, default: '' },
    status: { type: String, enum: DONATION_STATUSES, default: 'pending' },
    verification: {
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      verifiedByName: { type: String, default: '' },
      verifiedAt: { type: Date, default: null },
      note: { type: String, default: '' },
    },
  },
  { timestamps: true }
);

donationSchema.index({ campaign: 1, status: 1 });
donationSchema.index({ donor: 1, createdAt: -1 });

module.exports = mongoose.model('Donation', donationSchema);
module.exports.DONATION_TYPES = DONATION_TYPES;
module.exports.PAYMENT_METHODS = PAYMENT_METHODS;
module.exports.DONATION_STATUSES = DONATION_STATUSES;
