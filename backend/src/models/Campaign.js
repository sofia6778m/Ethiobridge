const mongoose = require('mongoose');

// Community Campaign & Local Development Platform
// ─────────────────────────────────────────────────────
// One document per official community fundraising campaign created by a
// Subcity or Woreda office of Addis Ababa. Extends the legacy fundraising
// model with local-development concepts:
//   category       — one of the 11 community campaign categories
//   priority       — High / Medium / Low indicator
//   impactMetrics  — measurable impact (beneficiaries, houses, students, …)
//   expenseSummary — transparent expense breakdown
//   updates        — progress updates with photos, videos & receipts
//   proofOfWork    — denormalized public proof-of-work gallery
//   officialVerified — badge shown once a System Admin approves the office account + campaign
const campaignSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  // Backwards-compatible umbrella type (infrastructure / emergency / general).
  campaignType: {
    type: String,
    enum: ['infrastructure', 'emergency', 'general'],
    required: true,
  },
  // Community campaign category (the primary taxonomy of the platform).
  category: {
    type: String,
    enum: [
      'school_feeding', 'back_to_school', 'elderly_home_repair', 'social_welfare',
      'community_health', 'emergency_medical', 'youth_sports_libraries',
      'sanitation_river_cleanup', 'green_initiatives', 'public_square_rehab',
      'community_center', 'other',
    ],
    default: 'other',
  },
  image: {
    type: String,
    default: '',
  },
  goalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  raisedAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  donors: {
    type: Number,
    default: 0,
  },
  location: {
    region: { type: String, default: '' },
    city: { type: String, default: '' },
    specificLocation: { type: String, default: '' },
  },
  // ── Local government office scope ─────────────────────────────────────────
  // Every campaign belongs to a Subcity and Woreda office. Set automatically
  // from the creating admin's scope and used to scope office dashboards and
  // per-office donation tracking.
  subcity: { type: String, default: '' },
  subcityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcity' },
  woreda: { type: String, default: '' },
  woredaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Woreda' },
  // Road, Water, Electricity, Public Space, Drainage, ...
  department: { type: String, default: '' },
  // Legacy urgency level — superseded by `priority` for the community platform
  // but kept so older records keep their values.
  urgencyLevel: {
    type: String,
    enum: ['low', 'normal', 'high', 'critical'],
    default: 'normal',
  },
  // Priority indicator (High / Medium / Low) shown publicly.
  priority: {
    type: String,
    enum: ['high', 'medium', 'low'],
    default: 'medium',
  },
  // ── Transparency: impact metrics ──────────────────────────────────────────
  estimatedBeneficiaries: {
    type: Number,
    default: 0,
  },
  // Actual measurable impact as reported by the office via updates.
  impactMetrics: {
    beneficiariesReached: { type: Number, default: 0 },
    housesRepaired: { type: Number, default: 0 },
    studentsSupported: { type: Number, default: 0 },
    mealsServed: { type: Number, default: 0 },
    elderlyServed: { type: Number, default: 0 },
    patientsSupported: { type: Number, default: 0 },
    youthEngaged: { type: Number, default: 0 },
    treesPlanted: { type: Number, default: 0 },
    sanitationSites: { type: Number, default: 0 },
    equipmentProvided: { type: Number, default: 0 },
    volunteersEngaged: { type: Number, default: 0 },
    volunteersApproved: { type: Number, default: 0 },
    custom: [
      {
        label: { type: String, default: '' },
        value: { type: Number, default: 0 },
      },
    ],
  },
  // ── Transparency: expense summary ─────────────────────────────────────────
  expenseSummary: [
    {
      label: { type: String, trim: true, default: '' },
      amount: { type: Number, default: 0 },
      date: { type: Date, default: Date.now },
      category: { type: String, default: '' },
    },
  ],
  // Bank / wallet destination the donations for THIS campaign should be sent
  // to. When set it overrides the global payment-method account for display.
  destinationAccount: {
    bankName: { type: String, default: '' },
    accountNumber: { type: String, default: '' },
    accountHolder: { type: String, default: '' },
    walletNumber: { type: String, default: '' },
    instructions: { type: String, default: '' },
  },
  startDate: {
    type: Date,
    default: Date.now,
  },
  endDate: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'closed'],
    default: 'pending',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  approver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: Date,
  // Official verified badge — set to true once the System Admin approves this
  // campaign (and the creating office account is verified).
  officialVerified: {
    type: Boolean,
    default: false,
  },
  relatedReport: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedReportModel',
  },
  relatedReportModel: {
    type: String,
    enum: ['InfrastructureReport', 'EmergencyReport', null],
    default: null,
  },
  successStories: [
    {
      title: String,
      description: String,
      image: String,
      date: Date,
    },
  ],
  updates: [
    {
      title: { type: String, trim: true, default: '' },
      description: { type: String, default: '' },
      date: { type: Date, default: Date.now },
      // 'update' = general progress, 'milestone' = key project milestone
      type: { type: String, enum: ['update', 'milestone'], default: 'update' },
      // Proof-of-work media attached to the update (photos / videos / receipts)
      media: [
        {
          kind: { type: String, enum: ['image', 'video', 'receipt', 'document'], default: 'image' },
          url: { type: String, default: '' },
          publicId: { type: String, default: '' },
          caption: { type: String, default: '' },
        },
      ],
      // For receipt media: the amount the receipt covers.
      receiptAmount: { type: Number, default: 0 },
      postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    },
  ],
  // ── Public proof-of-work gallery ──────────────────────────────────────────
  // Denormalized snapshot of the latest verified update media so the public
  // transparency dashboard can render the gallery without walking all updates.
  proofOfWork: [
    {
      kind: { type: String, enum: ['image', 'video', 'receipt', 'document'], default: 'image' },
      url: { type: String, default: '' },
      publicId: { type: String, default: '' },
      caption: { type: String, default: '' },
      date: { type: Date, default: Date.now },
      updateId: { type: mongoose.Schema.Types.ObjectId },
    },
  ],
  comments: [
    {
      author: { type: String, default: 'Anonymous' },
      text: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],
  tags: [String],
  isFeatured: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

campaignSchema.index({ status: 1, createdAt: -1 });
campaignSchema.index({ campaignType: 1, status: 1 });
campaignSchema.index({ category: 1, status: 1 });
campaignSchema.index({ priority: 1, status: 1 });
campaignSchema.index({ createdBy: 1 });
campaignSchema.index({ subcity: 1, status: 1 });
campaignSchema.index({ woreda: 1, status: 1 });
campaignSchema.index({ department: 1, status: 1 });

// Virtual: percentage progress (0-100)
campaignSchema.virtual('progressPercent').get(function () {
  if (!this.goalAmount) return 0;
  return Math.min(100, Math.round(((this.raisedAmount || 0) / this.goalAmount) * 100));
});

// Virtual: days remaining until the campaign ends.
campaignSchema.virtual('daysRemaining').get(function () {
  const end = new Date(this.endDate);
  return Math.max(0, Math.ceil((end - Date.now()) / (1000 * 60 * 60 * 24)));
});

// Virtual: date of the latest public update.
campaignSchema.virtual('lastUpdateDate').get(function () {
  if (!this.updates || this.updates.length === 0) return this.updatedAt || this.createdAt;
  const latest = this.updates.reduce((a, b) => (new Date(a.date) > new Date(b.date) ? a : b));
  return latest.date;
});

campaignSchema.set('toObject', { virtuals: true });
campaignSchema.set('toJSON', { virtuals: true });

module.exports = mongoose.model('Campaign', campaignSchema);
