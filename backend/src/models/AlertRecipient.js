const mongoose = require('mongoose');

// Which citizens a published alert was delivered to, and via which channels.
// SMS / Email / Push are recorded as delivery rows (placeholders for real
// providers); the in-app channel creates a live Notification. This is the
// canonical `alertRecipients` collection — a superset of the legacy
// AlertDelivery rows (which remain for backward compatibility).
const alertRecipientSchema = new mongoose.Schema(
  {
    alert: { type: mongoose.Schema.Types.ObjectId, ref: 'PublicAlert', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    channels: [{ type: String, enum: ['inApp', 'email', 'sms', 'push'] }],
    status: { type: String, enum: ['pending', 'delivered', 'failed'], default: 'pending' },
    smsSent: { type: Boolean, default: false },
    emailSent: { type: Boolean, default: false },
    deliveredAt: { type: Date },
    error: { type: String },
  },
  { timestamps: true }
);

// One delivery record per alert per citizen.
alertRecipientSchema.index({ alert: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('AlertRecipient', alertRecipientSchema);
