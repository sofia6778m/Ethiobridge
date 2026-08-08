const mongoose = require('mongoose');

// A citizen bookmarking a campaign. The compound unique index keeps one
// save per (user, campaign) pair.
const savedCampaignSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
  },
  { timestamps: true }
);

savedCampaignSchema.index({ user: 1, campaign: 1 }, { unique: true });
savedCampaignSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('SavedCampaign', savedCampaignSchema);
