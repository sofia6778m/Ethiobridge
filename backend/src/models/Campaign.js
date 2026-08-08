const mongoose = require('mongoose');

// Campaign levels define the ownership/approval workflow:
//   - `subcity` campaigns are created by Subcity Admins and must be approved
//     by the System Admin before going live.
//   - `woreda` campaigns are created by Woreda Admins and must be approved by
//     the Subcity Admin of their subcity before going live.
const CAMPAIGN_LEVELS = ['subcity', 'woreda'];

// User-facing categories. Kept stable so the public filter UI and analytics
// breakdowns stay consistent with stored values.
const CAMPAIGN_CATEGORIES = ['health', 'education', 'emergency_relief', 'community', 'infrastructure', 'other'];

// Workflow state machine:
//   draft      → pending   (submit for approval)
//   pending    → active    (approve)  | rejected  (reject with reason)
//   active     → completed (authority verifies completion) | suspended | cancelled
//   rejected   → pending   (edit + resubmit)
//   suspended  → active    (restore)
const CAMPAIGN_STATUSES = ['draft', 'pending', 'active', 'rejected', 'completed', 'suspended', 'cancelled'];

const campaignSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'Campaign title is required'], trim: true, maxlength: 150 },
    description: { type: String, required: [true, 'Campaign description is required'] },
    category: { type: String, enum: CAMPAIGN_CATEGORIES, default: 'other' },
    campaignLevel: { type: String, enum: CAMPAIGN_LEVELS, required: true },
    location: {
      region: { type: String, default: 'Addis Ababa' },
      subcity: { type: String, default: '' },
      woreda: { type: String, default: '' },
    },
    subcityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcity', default: null },
    woredaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Woreda', default: null },
    goalAmount: { type: Number, required: [true, 'A goal amount is required'], min: [1, 'Goal must be greater than zero'] },
    // Denormalized running totals — updated when donations are verified.
    raisedAmount: { type: Number, default: 0, min: 0 },
    inKindPledges: { type: Number, default: 0, min: 0 },
    endDate: { type: Date },
    image: { type: String, default: '' },
    status: { type: String, enum: CAMPAIGN_STATUSES, default: 'draft' },
    isFeatured: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String, default: '' },
    createdByRole: { type: String, default: '' },
    rejectReason: { type: String, default: '' },
    suspension: {
      reason: { type: String, default: '' },
      suspendedBy: { type: String, default: '' },
      suspendedAt: { type: Date, default: null },
      restoredAt: { type: Date, default: null },
    },
    completion: {
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      verifiedByName: { type: String, default: '' },
      verifiedAt: { type: Date, default: null },
      note: { type: String, default: '' },
    },
    auditHistory: [
      {
        action: { type: String, default: '' },
        byName: { type: String, default: '' },
        byRole: { type: String, default: '' },
        at: { type: Date, default: Date.now },
        note: { type: String, default: '' },
      },
    ],
    // Fraud prevention: a cumulative heuristic score plus the individual flags
    // that produced it. `auto` flags are computed on submission; `citizen_report`
    // flags come from citizens reporting a campaign. System admins review these
    // in the fraud queue and mark each flag dismissed or confirmed.
    fraudScore: { type: Number, default: 0, min: 0 },
    fraudFlags: [
      {
        reason: { type: String, default: '' },
        weight: { type: Number, default: 0 },
        source: { type: String, enum: ['auto', 'citizen_report'], default: 'auto' },
        reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reportNote: { type: String, default: '' },
        status: { type: String, enum: ['open', 'dismissed', 'confirmed'], default: 'open' },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        reviewedAt: { type: Date, default: null },
        reviewNote: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

campaignSchema.index({ status: 1, campaignLevel: 1 });
campaignSchema.index({ 'location.subcity': 1, 'location.woreda': 1 });
campaignSchema.index({ subcityId: 1 });
campaignSchema.index({ woredaId: 1 });
campaignSchema.index({ createdBy: 1 });

const Campaign = mongoose.model('Campaign', campaignSchema);

// Exported alongside the model so controllers/routes share the same canonical
// constants for validation and filtering.
module.exports = Campaign;
module.exports.CAMPAIGN_LEVELS = CAMPAIGN_LEVELS;
module.exports.CAMPAIGN_CATEGORIES = CAMPAIGN_CATEGORIES;
module.exports.CAMPAIGN_STATUSES = CAMPAIGN_STATUSES;
