const mongoose = require('mongoose');

// Tracks whether a citizen has actually opened/read an alert. Presence of a
// row for an alert means the citizen marked it as read (unread badge = live
// alerts visible to the citizen with no matching row here).
const alertReadSchema = new mongoose.Schema(
  {
    alert: { type: mongoose.Schema.Types.ObjectId, ref: 'PublicAlert', required: true, index: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    readCount: { type: Number, default: 0 },
    firstReadAt: { type: Date },
    lastReadAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// One read record per alert per citizen.
alertReadSchema.index({ alert: 1, user: 1 }, { unique: true });

module.exports = mongoose.model('AlertRead', alertReadSchema);
