const mongoose = require('mongoose');

// Expense / milestone / completion evidence uploaded by campaign managers.
// Proofs start as `pending` and are verified (or rejected) by the approving
// authority for the campaign (Subcity Admin for woreda campaigns, System Admin
// for subcity campaigns). Only verified proofs are shown publicly.
const PROOF_TYPES = ['expense', 'milestone', 'completion', 'general'];
const PROOF_STATUSES = ['pending', 'verified', 'rejected'];

const campaignProofSchema = new mongoose.Schema(
  {
    campaign: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign', required: true },
    uploader: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    uploaderName: { type: String, default: '' },
    uploaderRole: { type: String, default: '' },
    title: { type: String, default: '', trim: true, maxlength: 150 },
    description: { type: String, default: '' },
    files: { type: [String], default: [] },
    type: { type: String, enum: PROOF_TYPES, default: 'general' },
    status: { type: String, enum: PROOF_STATUSES, default: 'pending' },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedByName: { type: String, default: '' },
    verifiedAt: { type: Date, default: null },
    verifiedNote: { type: String, default: '' },
  },
  { timestamps: true }
);

campaignProofSchema.index({ campaign: 1, createdAt: -1 });
campaignProofSchema.index({ status: 1 });

module.exports = mongoose.model('CampaignProof', campaignProofSchema);
