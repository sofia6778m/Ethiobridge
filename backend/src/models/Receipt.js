const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
  receiptNumber: {
    type: String,
    required: true,
    unique: true,
  },
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
  donor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  donorName: {
    type: String,
    default: 'Anonymous',
  },
  donorEmail: {
    type: String,
    default: '',
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
    required: true,
  },
  campaignTitle: {
    type: String,
    required: true,
  },
  transactionId: {
    type: String,
  },
  isAnonymous: {
    type: Boolean,
    default: false,
  },
  message: {
    type: String,
    default: '',
  },
  receiptDate: {
    type: Date,
    default: Date.now,
  },
  pdfUrl: String,
}, { timestamps: true });

receiptSchema.index({ donation: 1 });
receiptSchema.index({ donor: 1 });

module.exports = mongoose.model('Receipt', receiptSchema);
