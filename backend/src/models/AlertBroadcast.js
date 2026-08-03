const mongoose = require('mongoose');

const alertBroadcastSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: ['flood', 'rainfall', 'road_closure', 'health', 'power_outage'],
    },
    severity: {
      type: String,
      required: true,
      enum: ['Info', 'Warning', 'Critical'],
      default: 'Info',
    },
    region: { type: String, required: true },
    zone: { type: String, default: '' },
    woreda: { type: String, default: '' },
    description: { type: String, required: true },
    status: {
      type: String,
      enum: ['active', 'expired', 'archived'],
      default: 'active',
    },
    publishedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    publishedByName: { type: String, default: '' },
    publishedByOrg: { type: String, default: '' },
    expiresAt: { type: Date },
    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

alertBroadcastSchema.index({ status: 1, createdAt: -1 });
alertBroadcastSchema.index({ category: 1 });
alertBroadcastSchema.index({ severity: 1 });
alertBroadcastSchema.index({ region: 1 });

module.exports = mongoose.model('AlertBroadcast', alertBroadcastSchema);
