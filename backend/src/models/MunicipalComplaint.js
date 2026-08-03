const mongoose = require('mongoose');

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const responseSchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true },
    officer: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    officerName: { type: String, default: '' },
    officerRole: { type: String, default: '' },
    fromLevel: { type: String, enum: ['Woreda', 'Subcity'], default: 'Woreda' },
    evidenceFiles: [{ type: String }],
  },
  { timestamps: { createdAt: 'at', updatedAt: false } }
);

const assessmentSchema = new mongoose.Schema(
  {
    requiresSpecialEquipment: { type: Boolean, default: false },
    requiresBudgetAboveLimit: { type: Boolean, default: false },
    requiresSubcityApproval: { type: Boolean, default: false },
    affectsMoreThan50Households: { type: Boolean, default: false },
    publicSafetyRisk: { type: Boolean, default: false },
    requiresMajorInfrastructureReplacement: { type: Boolean, default: false },
    note: { type: String, default: '', trim: true },
    assessedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assessedByName: { type: String, default: '' },
    assessedAt: { type: Date },
  },
  { _id: false }
);

const escalationEntrySchema = new mongoose.Schema(
  {
    fromLevel: { type: String, default: '' },
    toLevel: { type: String, default: '' },
    reason: { type: String, default: '', trim: true },
    triggeredBy: { type: String, default: 'manual' }, // manual | sla
    triggeredByName: { type: String, default: 'System' },
    at: { type: Date, default: Date.now },
  },
  { _id: false }
);

const auditEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true }, // Created, Viewed, Updated, Assigned, Responded, Forwarded, Escalated, Resolved, Reopened
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String, default: 'System' },
    role: { type: String, default: 'system' },
    details: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'at', updatedAt: false } }
);

// ── Main schema ───────────────────────────────────────────────────────────────

const municipalComplaintSchema = new mongoose.Schema(
  {
    // Tracking
    trackingId: { type: String, unique: true }, // CMP-YYYY-000001
    // Content
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true, trim: true },
    issueType: { type: String, default: '' },   // from the issue template
    issueLevel: { type: String, enum: ['Woreda', 'Subcity'], default: 'Woreda' },
    category: { type: String, default: '' },    // department name (Electricity | Water | Road | custom)
    // Location
    locationText: { type: String, default: '', trim: true },
    latitude: { type: Number },
    longitude: { type: Number },
    // Routing (Subcity -> Woreda -> Department)
    region: { type: String, default: '' },
    subcity: { type: String, default: '', trim: true }, // no enum — live Subcity collection
    woredaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Woreda' },
    woredaName: { type: String, default: '' },
    department: { type: String, default: '', trim: true }, // no enum — live Department collection
    // Reporter
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reporterName: { type: String, default: '' },
    reporterPhone: { type: String, default: '' },
    reporterEmail: { type: String, default: '' },
    // Media
    photos: [{ type: String }],
    videos: [{ type: String }],
    evidenceFiles: [{ type: String }],
    // Workflow
    priority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    status: {
      type: String,
      enum: ['Submitted', 'In Review', 'Assigned', 'In Progress', 'Completed', 'Forwarded to Subcity', 'Escalated', 'Resolved', 'Rejected', 'Closed'],
      default: 'Submitted',
    },
    assignedLevel: { type: String, enum: ['Woreda', 'Subcity'], default: 'Woreda' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedToDepartment: { type: String, default: '' },
    assignedAt: { type: Date },
    // Department response
    responseMessage: { type: String, default: '' },
    responses: [responseSchema],
    technicianName: { type: String, default: '' },
    // ── Field operations / work order ─────────────────────────────────────────
    acceptedAt: { type: Date },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acceptedByName: { type: String, default: '' },
    rejectReason: { type: String, default: '' },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedByName: { type: String, default: '' },
    rejectedAt: { type: Date },
    startedAt: { type: Date },
    startedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    startedByName: { type: String, default: '' },
    completedAt: { type: Date },
    completedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    completedByName: { type: String, default: '' },
    // ── Inspector assignment (field visit) ────────────────────────────────────
    inspectorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    inspectorName: { type: String, default: '' },
    inspectorVisitAt: { type: Date },
    inspectorNotes: { type: String, default: '' },
    inspectorFindings: { type: String, default: '' },
    // ── Technician work order ─────────────────────────────────────────────────
    technicianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    technicianName: { type: String, default: '' },
    technicianPriority: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    technicianDueAt: { type: Date },
    workOrderNotes: { type: String, default: '' },
    // Woreda assessment + forwarding
    assessment: { type: assessmentSchema, default: () => ({}) },
    forwardReason: { type: String, default: '' },
    forwardedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    forwardedByName: { type: String, default: '' },
    forwardedAt: { type: Date },
    // Escalation
    escalated: { type: Boolean, default: false },
    escalatedTo: { type: String, enum: ['', 'Subcity Department', 'Subcity Administrator'], default: '' },
    escalatedAt: { type: Date },
    escalationHistory: [escalationEntrySchema],
    // SLA
    slaDueAt: { type: Date },            // createdAt + 48h (first response due)
    subcitySlaDueAt: { type: Date },     // escalatedAt + 5 days (subcity action due)
    // Resolution
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedByName: { type: String, default: '' },
    resolutionNote: { type: String, default: '' },
    reopenedCount: { type: Number, default: 0 },
    // ── Resolution verification + citizen feedback ────────────────────────────
    resolutionVerification: {
      verified: { type: Boolean, default: false },
      verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
      verifiedByName: { type: String, default: '' },
      verifiedAt: { type: Date },
      verificationNote: { type: String, default: '', trim: true },
    },
    citizenFeedback: {
      rating: { type: Number, min: 1, max: 5 },
      comment: { type: String, default: '', trim: true },
      at: { type: Date },
    },
    // ── SLA overdue tracking (flagged by the escalation scheduler) ─────────────
    isOverdue: { type: Boolean, default: false },
    overdueSince: { type: Date },
    overdueNotifiedAt: { type: Date },
    // Internal
    internalNotes: [
      {
        note: { type: String, required: true, trim: true },
        user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        userName: { type: String, default: '' },
        role: { type: String, default: '' },
      },
      { timestamps: { createdAt: 'at', updatedAt: false } },
    ],
    // ── Work progress log (before/after photos + work notes) ───────────────────
    workProgress: [
      {
        step: { type: String, default: 'update' }, // started | update | completed
        notes: { type: String, default: '', trim: true },
        beforePhotos: [{ type: String }],
        afterPhotos: [{ type: String }],
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        byName: { type: String, default: '' },
      },
      { timestamps: { createdAt: 'at', updatedAt: false } },
    ],
    // Logs
    notificationHistory: [
      {
        event: { type: String, default: '' },
        title: { type: String, default: '' },
        message: { type: String, default: '' },
        channels: { type: String, default: 'in-app' },
      },
      { timestamps: { createdAt: 'at', updatedAt: false } },
    ],
    auditTrail: [auditEntrySchema],
  },
  { timestamps: true }
);

// ── Tracking ID: CMP-YYYY-000001 ──────────────────────────────────────────────
municipalComplaintSchema.pre('save', async function (next) {
  if (!this.trackingId) {
    const model = mongoose.model('MunicipalComplaint');
    const year = new Date().getFullYear();
    let number = (await model.countDocuments()) + 1;
    let candidate = `CMP-${year}-${String(number).padStart(6, '0')}`;
    // Skip numbers already in use so deletes/races never produce duplicates.
    let guard = 0;
    while (await model.exists({ trackingId: candidate })) {
      number += 1;
      candidate = `CMP-${year}-${String(number).padStart(6, '0')}`;
      guard += 1;
      if (guard > 1000) break;
    }
    this.trackingId = candidate;
  }
  next();
});

// Backfill SLA deadline after insert (createdAt is only known post-insert).
municipalComplaintSchema.post('save', async function (doc) {
  if (!doc.slaDueAt && doc.createdAt) {
    await mongoose.model('MunicipalComplaint').updateOne(
      { _id: doc._id, slaDueAt: { $exists: false } },
      { $set: { slaDueAt: new Date(doc.createdAt.getTime() + 48 * 60 * 60 * 1000) } }
    );
  }
});

// ── Indexes ───────────────────────────────────────────────────────────────────
municipalComplaintSchema.index({ status: 1 });
municipalComplaintSchema.index({ priority: 1 });
municipalComplaintSchema.index({ subcity: 1 });
municipalComplaintSchema.index({ woredaId: 1 });
municipalComplaintSchema.index({ woredaId: 1, department: 1 });
municipalComplaintSchema.index({ assignedLevel: 1, assignedToDepartment: 1 });
municipalComplaintSchema.index({ reporter: 1 });
municipalComplaintSchema.index({ slaDueAt: 1, status: 1 });
municipalComplaintSchema.index({ technicianId: 1, status: 1 });
municipalComplaintSchema.index({ inspectorId: 1, status: 1 });
municipalComplaintSchema.index({ isOverdue: 1, status: 1 });
municipalComplaintSchema.index({ createdAt: -1 });

module.exports = mongoose.model('MunicipalComplaint', municipalComplaintSchema);
