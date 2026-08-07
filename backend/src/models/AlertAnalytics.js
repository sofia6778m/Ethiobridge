const mongoose = require('mongoose');

// Per-alert performance analytics fed by the delivery pipeline (recipients,
// channels) and by citizen behaviour (dashboard views, clicks, reads).
const alertAnalyticsSchema = new mongoose.Schema(
  {
    alert: { type: mongoose.Schema.Types.ObjectId, ref: 'PublicAlert', required: true, unique: true, index: true },
    totalRecipients: { type: Number, default: 0 },
    smsDelivered: { type: Number, default: 0 },
    emailDelivered: { type: Number, default: 0 },
    inAppDelivered: { type: Number, default: 0 },
    dashboardViews: { type: Number, default: 0 },
    clicks: { type: Number, default: 0 },
    reads: { type: Number, default: 0 },
    uniqueReaders: { type: Number, default: 0 },
    // reads / dashboardViews, guard-divided (0 when no views).
    clickThroughRate: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('AlertAnalytics', alertAnalyticsSchema);
