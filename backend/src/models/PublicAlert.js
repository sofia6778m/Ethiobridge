const mongoose = require('mongoose');
const {
  CATEGORY_VALUES,
  SEVERITY_VALUES,
  ALERT_STATUSES,
  safetyInstructionsFor,
} = require('../utils/alertMetadata');

const auditEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true }, // created | updated | published | expired | archived | reactivated | deleted
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String },
    userRole: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const alertSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, required: true, enum: CATEGORY_VALUES },
    severity: { type: String, required: true, enum: SEVERITY_VALUES, default: 'information' },
    description: { type: String, required: true, maxlength: 5000 },
    safetyInstructions: [{ type: String }],

    // Targeting — all of Addis Ababa when no subcity/woreda chosen.
    scope: { type: String, enum: ['all', 'subcity', 'woreda'], default: 'all' },
    // Human-friendly mirror of `scope`: city = whole Addis Ababa, else the
    // specific subcity / woreda the alert targets.
    scopeType: { type: String, enum: ['city', 'subcity', 'woreda'], default: 'city' },
    subcityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcity' },
    subcityName: { type: String },
    woredaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Woreda' },
    woredaName: { type: String },

    // Who published it.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
    createdByRole: { type: String },
    createdByOrg: { type: String },

    // Lifecycle.
    status: { type: String, enum: ALERT_STATUSES, default: 'active', index: true },
    isPublished: { type: Boolean, default: false, index: true },
    scheduledAt: { type: Date }, // when a scheduled alert should go live
    publishedAt: { type: Date },
    expiresAt: { type: Date },
    pinned: { type: Boolean, default: false }, // emergency alerts are pinned

    // Outreach / delivery tracking.
    views: { type: Number, default: 0 },
    deliveryStats: {
      notifiedCitizens: { type: Number, default: 0 },
      inApp: { type: Number, default: 0 },
      email: { type: Number, default: 0 },
      sms: { type: Number, default: 0 },
      push: { type: Number, default: 0 },
    },

    // Where the alert came from.
    source: { type: String, enum: ['manual', 'complaint_cluster'], default: 'manual' },
    relatedComplaintIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'PublicComplaint' }],
    clusterLabel: { type: String },

    auditHistory: [auditEntrySchema],
  },
  { timestamps: true }
);

alertSchema.index({ status: 1, severity: 1, createdAt: -1 });
alertSchema.index({ status: 1, isPublished: 1 });
alertSchema.index({ scope: 1, subcityName: 1, woredaName: 1 });
alertSchema.index({ scheduledAt: 1 }, { partialFilterExpression: { status: 'scheduled' } });
alertSchema.index({ expiresAt: 1 }, { partialFilterExpression: { status: { $in: ['published', 'active'] } } });

// Auto-populate safety instructions from the category when none are supplied,
// and keep `pinned`, `isPublished` and `scopeType` consistent with the other
// fields (covers create, update and scheduler paths defensively).
alertSchema.pre('validate', function (next) {
  if (!this.safetyInstructions || this.safetyInstructions.length === 0) {
    this.safetyInstructions = safetyInstructionsFor(this.category);
  }
  if (this.severity === 'emergency') {
    this.pinned = true;
  } else if (this.isNew || this.isModified('severity')) {
    this.pinned = false;
  }
  // 'published' and 'active' are both live statuses.
  this.isPublished = this.status === 'published' || this.status === 'active';
  const scopeTypeMap = { all: 'city', subcity: 'subcity', woreda: 'woreda' };
  if (this.scope && scopeTypeMap[this.scope]) {
    this.scopeType = scopeTypeMap[this.scope];
  }
  next();
});

module.exports = mongoose.model('PublicAlert', alertSchema);
