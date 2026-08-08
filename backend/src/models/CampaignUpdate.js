const mongoose = require('mongoose');

// Progress updates posted by campaign managers (e.g. "funds disbursed to the
// clinic", "reached 50% of goal"). Donors of the campaign are notified when an
// update is posted.
const UPDATE_TYPES = ['general', 'progress', 'milestone', 'reminder', 'completion'];

const campaignUpdateSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    authorName: { type: String, default: '' },
    authorRole: { type: String, default: '' },
    title: { type: String, default: '', trim: true, maxlength: 150 },
    message: { type: String, required: [true, 'Update message is required'] },
    type: { type: String, enum: UPDATE_TYPES, default: 'general' },
    images: { type: [String], default: [] },
  },
  { timestamps: true }
);

campaignUpdateSchema.index({ campaign: 1, createdAt: -1 });

module.exports = mongoose.model('CampaignUpdate', campaignUpdateSchema);
