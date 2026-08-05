const mongoose = require('mongoose');

// Donation Notification (donation_notifications collection)
// ─────────────────────────────────────────────────────────
// Delivery records for donation lifecycle events. One document per (donation,
// channel) pair so email / SMS hook delivery is traceable and can be replayed
// later. In-app notifications are additionally written to the shared
// Notification collection so the socket bell stays in sync.
const donationNotificationSchema = new mongoose.Schema(
  {
    donation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Donation',
      required: true,
    },
    event: {
      type: String,
      enum: ['donation_received', 'receipt_uploaded', 'donation_verified', 'donation_rejected'],
      required: true,
    },
    channel: {
      type: String,
      enum: ['in_app', 'email', 'sms'],
      required: true,
    },
    recipientUser: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    recipientContact: {
      type: String,
      default: '',
    },
    subject: {
      type: String,
      default: '',
    },
    message: {
      type: String,
      default: '',
    },
    status: {
      type: String,
      enum: ['pending', 'sent', 'failed', 'skipped'],
      default: 'pending',
    },
    providerRef: {
      type: String,
      default: '',
    },
    sentAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

donationNotificationSchema.index({ donation: 1, channel: 1 });
donationNotificationSchema.index({ event: 1, status: 1 });

module.exports = mongoose.model('DonationNotification', donationNotificationSchema);
