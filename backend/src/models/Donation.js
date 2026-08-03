const mongoose = require('mongoose');

const donationSchema = new mongoose.Schema({
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true,
  },
  donor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  amount: {
    type: Number,
    required: true,
    min: 1,
  },
  currency: {
    type: String,
    default: 'ETB',
  },
  isAnonymous: {
    type: Boolean,
    default: false,
  },
  message: {
    type: String,
    default: '',
    maxlength: 500,
  },
  paymentMethod: {
    type: String,
    enum: ['telebirr', 'cbe_birr', 'chapa', 'visa', 'mastercard', 'bank_transfer', 'qr_code'],
    required: true,
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'refunded'],
    default: 'pending',
  },
  receiptNumber: {
    type: String,
    unique: true,
    sparse: true,
  },
  transactionId: {
    type: String,
  },
  donorName: {
    type: String,
    default: '',
  },
  donorEmail: {
    type: String,
    default: '',
  },
}, { timestamps: true });

donationSchema.index({ campaign: 1, createdAt: -1 });
donationSchema.index({ donor: 1, createdAt: -1 });
donationSchema.index({ paymentStatus: 1 });

donationSchema.pre('save', function (next) {
  if (!this.receiptNumber) {
    const timestamp = Date.now().toString(36).toUpperCase();
    const random = Math.random().toString(36).substring(2, 6).toUpperCase();
    this.receiptNumber = `RCP-${timestamp}${random}`;
  }
  next();
});

module.exports = mongoose.model('Donation', donationSchema);
