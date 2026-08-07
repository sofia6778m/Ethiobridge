const mongoose = require('mongoose');
const {
  SEVERITY_VALUES,
  ALERT_STATUSES,
  safetyInstructionsFor,
  isCriticalSeverity,
} = require('../utils/alertMetadata');

const auditEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true }, // created | updated | published | expired | archived | reactivated | deleted | scheduled
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String },
    userRole: { type: String },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const attachmentSchema = new mongoose.Schema(
  {
    url: { type: String },
    publicId: { type: String },
    fileName: { type: String },
    mimeType: { type: String },
    size: { type: Number },
  },
  { _id: false }
);

const alertSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 200 },
    // Category is OPTIONAL and free-text: null, "" or undefined are all valid
    // (normalized to null in the pre('validate') hook) and any non-empty string
    // is accepted. Legacy enum values keep working for existing documents.
    category: { type: String, trim: true, maxlength: 120, default: null },
    // Legacy free-label used only when category === 'other' (kept for old rows).
    customCategory: { type: String, trim: true },
    severity: { type: String, required: true, enum: SEVERITY_VALUES, default: 'information' },
    description: { type: String, required: true, maxlength: 5000 },
    safetyInstructions: [{ type: String }],

    // ── Targeting ──────────────────────────────────────────────────────────
    // Canonical targeting: an alert targets a set of subcities and (optionally)
    // a set of woredas. `scope` / `scopeType` and the singular legacy fields
    // (`subcityId` / `subcityName` / `woredaId` / `woredaName`) are derived for
    // backward compatibility with the pre-existing code that reads them.
    targetType: { type: String, enum: ['city', 'subcity', 'woreda'], default: 'city' },
    subcityIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subcity' }],
    subcityNames: [{ type: String }],
    woredaIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Woreda' }],
    woredaNames: [{ type: String }],
    targetLabel: { type: String }, // human-readable summary, e.g. "Bole — Woreda 3"

    scope: { type: String, enum: ['all', 'subcity', 'woreda'], default: 'all' },
    scopeType: { type: String, enum: ['city', 'subcity', 'woreda'], default: 'city' },
    subcityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcity' },
    subcityName: { type: String },
    woredaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Woreda' },
    woredaName: { type: String },

    // ── Scheduling ──────────────────────────────────────────────────────────
    schedule: {
      startAt: { type: Date },
      endAt: { type: Date },
    },

    // Who created it / authority shown to citizens.
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    createdByName: { type: String },
    createdByRole: { type: String },
    roleCreatedBy: { type: String }, // alias of createdByRole (specified field name)
    createdByOrg: { type: String },
    sourceAuthority: { type: String },
    emergencyContact: { type: String },

    // Attachments (PDF / image, up to 3 × 5MB).
    attachments: [attachmentSchema],

    // Lifecycle.
    status: { type: String, enum: ALERT_STATUSES, default: 'draft', index: true },
    isPublished: { type: Boolean, default: false, index: true },
    scheduledAt: { type: Date }, // legacy mirror of schedule.startAt
    publishedAt: { type: Date },
    expiresAt: { type: Date }, // legacy mirror of schedule.endAt
    pinned: { type: Boolean, default: false }, // critical/emergency alerts are pinned

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
    source: { type: String, enum: ['manual'], default: 'manual' },
    clusterLabel: { type: String },

    auditHistory: [auditEntrySchema],
  },
  { timestamps: true }
);

alertSchema.index({ status: 1, severity: 1, createdAt: -1 });
alertSchema.index({ status: 1, isPublished: 1 });
// NOTE: `subcityIds` and `woredaIds` are both arrays. MongoDB refuses a
// compound index over two array fields ("cannot index parallel arrays",
// even for empty arrays on MongoDB ≥ 8.0), so they must be single-field
// multikey indexes instead of one compound index.
alertSchema.index({ targetType: 1 });
alertSchema.index({ subcityIds: 1 });
alertSchema.index({ woredaIds: 1 });
alertSchema.index({ scope: 1, subcityName: 1, woredaName: 1 });
alertSchema.index({ scheduledAt: 1 }, { partialFilterExpression: { status: 'scheduled' } });
alertSchema.index({ expiresAt: 1 }, { partialFilterExpression: { status: { $in: ['published', 'active'] } } });

// Auto-populate safety instructions from the category when none are supplied,
// and keep `pinned`, `isPublished`, `scopeType`, `roleCreatedBy`, the singular
// legacy target fields and the schedule mirrors consistent with the canonical
// fields (covers create, update and scheduler paths defensively).
alertSchema.pre('validate', function (next) {
  // Normalize empty category values so an optional blank category is never
  // rejected by the enum validator, and never auto-attached flood instructions.
  if (this.category === '' || this.category === undefined) this.category = null;
  if (!this.safetyInstructions || this.safetyInstructions.length === 0) {
    this.safetyInstructions = safetyInstructionsFor(this.category);
  }
  if (isCriticalSeverity(this.severity)) {
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

  // roleCreatedBy mirrors createdByRole.
  if (this.createdByRole && !this.roleCreatedBy) {
    this.roleCreatedBy = this.createdByRole;
  }
  if (this.roleCreatedBy && !this.createdByRole) {
    this.createdByRole = this.roleCreatedBy;
  }

  // Schedule mirrors — `schedule` is the canonical container, the flat
  // scheduledAt/expiresAt fields stay in sync for legacy consumers.
  if (this.schedule) {
    if (this.schedule.startAt) this.scheduledAt = this.schedule.startAt;
    if (this.schedule.endAt) this.expiresAt = this.schedule.endAt;
  } else if (this.scheduledAt || this.expiresAt) {
    this.schedule = { startAt: this.scheduledAt, endAt: this.expiresAt };
  }

  // Keep scope consistent with target arrays for legacy consumers.
  if ((this.subcityIds && this.subcityIds.length) || (this.woredaIds && this.woredaIds.length)) {
    if (this.woredaIds && this.woredaIds.length) this.scope = 'woreda';
    else if (this.subcityIds && this.subcityIds.length) this.scope = 'subcity';
    else this.scope = 'all';
  }
  if (this.scope && scopeTypeMap[this.scope]) {
    this.scopeType = scopeTypeMap[this.scope];
  }
  if (this.scope !== 'all' && !this.targetType) {
    this.targetType = this.scope === 'woreda' ? 'woreda' : 'subcity';
  }
  next();
});

module.exports = mongoose.model('PublicAlert', alertSchema);
