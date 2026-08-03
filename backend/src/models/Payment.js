const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
  donation: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Donation',
    required: true,
  },
  campaign: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Campaign',
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  currency: {
    type: String,
    default: 'ETB',
  },
  paymentMethod: {
    type: String,
    enum: ['telebirr', 'cbe_birr', 'chapa', 'visa', 'mastercard', 'bank_transfer', 'qr_code'],
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'processing', 'completed', 'failed', 'refunded'],
    default: 'pending',
  },
  transactionId: {
    type: String,
  },
  qrCode: {
    type: String,
  },
  qrExpiresAt: {
    type: Date,
  },
  paymentDetails: {
    type: mongoose.Schema.Types.Mixed,
  },
  processedAt: Date,
}, { timestamps: true });

paymentSchema.index({ donation: 1 });
paymentSchema.index({ campaign: 1 });
paymentSchema.index({ status: 1 });
paymentSchema.index({ transactionId: 1 });

module.exports = mongoose.model('Payment', paymentSchema);
