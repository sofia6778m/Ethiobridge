const mongoose = require('mongoose');

// Tracks which citizens a published alert was delivered to, and via which
// channels. SMS / Email / Push are "placeholders" in this build — the records
// are written so the delivery pipeline can be connected to real providers.
const alertDeliverySchema = new mongoose.Schema(
  {
    alert: { type: mongoose.Schema.Types.ObjectId, ref: 'PublicAlert', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    channels: [{ type: String, enum: ['inApp', 'email', 'sms', 'push'] }],
    status: { type: String, enum: ['pending', 'delivered', 'failed'], default: 'pending' },
    deliveredAt: { type: Date },
    error: { type: String },
  },
  { timestamps: true }
);

// One delivery record per alert per citizen.
alertDeliverySchema.index({ alert: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('AlertDelivery', alertDeliverySchema);
