const mongoose = require('mongoose');

/**
 * WorkflowComplaint — the advanced government complaint workflow model.
 *
 * Workflow states
 * ───────────────
 *  pending             → just submitted, awaiting woreda action
 *  resolved_by_woreda  → woreda resolved it within the SLA window
 *  pending_escalation  → woreda marked it unresolved (manual escalation trigger)
 *  escalated_to_subcity → auto-escalated after SLA timeout OR manual escalation
 *  resolved_by_subcity → subcity department resolved it
 *
 * Scope fields
 * ────────────
 *  subcity    : BOLE | YEKA | LEMMI_KURA
 *  woredaId   : ref → Woreda
 *  department : Electricity | Road | Water
 *  issueTypeId: ref → IssueType
 */

const timelineEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    description: { type: String, default: '' },
    performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    performedByName: { type: String, default: 'System' },
    performedByRole: { type: String, default: 'system' },
    previousStatus: { type: String },
    newStatus: { type: String },
  },
  { _id: false, timestamps: { createdAt: 'createdAt', updatedAt: false } }
);

const workflowComplaintSchema = new mongoose.Schema(
  {
    // Auto-generated human-readable tracking number
    trackingNumber: { type: String, unique: true },

    // ── Scope / routing ──────────────────────────────────────────────────────
    // No enum restriction — any subcity created in the Subcity collection is
    // valid so newly created subcities work without code changes.
    subcity: {
      type: String,
      required: true,
    },
    woredaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Woreda',
      required: true,
    },
    woredaName: { type: String, default: '' },
    // No enum restriction — any department created in Department Management is
    // valid so new departments work without code changes.
    department: {
      type: String,
      required: true,
    },
    issueTypeId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'IssueType',
    },
    issueTypeName: { type: String, default: '' },

    // ── Complaint content ────────────────────────────────────────────────────
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    attachments: [{ type: String }],
    latitude: { type: Number },
    longitude: { type: Number },

    // ── Reporter ────────────────────────────────────────────────────────────
    anonymous: { type: Boolean, default: false },
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reporterName: { type: String, default: '' },
    reporterPhone: { type: String, default: '' },
    reporterEmail: { type: String, default: '' },

    // ── Workflow status ──────────────────────────────────────────────────────
    workflowStatus: {
      type: String,
      enum: [
        'pending',
        'resolved_by_woreda',
        'pending_escalation',
        'escalated_to_subcity',
        'resolved_by_subcity',
      ],
      default: 'pending',
    },

    // ── Resolution data ──────────────────────────────────────────────────────
    woredaResolution: { type: String, default: '' },
    subcityResolution: { type: String, default: '' },
    resolvedByWoreda: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    resolvedBySubcity: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

    // ── SLA / escalation timestamps ──────────────────────────────────────────
    // Configurable escalation window (hours). Defaults to 72h but can be
    // overridden per-complaint or system-wide via env.
    escalationHours: { type: Number, default: 72 },
    escalationDeadline: { type: Date },  // createdAt + escalationHours
    escalatedAt: { type: Date },
    resolvedAt: { type: Date },
    woredaResolvedAt: { type: Date },
    subcityResolvedAt: { type: Date },

    // ── Audit trail ─────────────────────────────────────────────────────────
    timeline: [timelineEntrySchema],
  },
  { timestamps: true }
);

// ── Pre-save hooks ───────────────────────────────────────────────────────────

// Auto-generate tracking number: WF-<YYYYMM>-<5-digit-seq>
workflowComplaintSchema.pre('save', async function (next) {
  if (!this.trackingNumber) {
    const now = new Date();
    const prefix = `WF-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const count = await mongoose
      .model('WorkflowComplaint')
      .countDocuments();
    this.trackingNumber = `${prefix}-${String(count + 1).padStart(5, '0')}`;
  }
  // Set escalation deadline on first save
  if (!this.escalationDeadline && this.createdAt) {
    this.escalationDeadline = new Date(
      this.createdAt.getTime() + this.escalationHours * 60 * 60 * 1000
    );
  }
  next();
});

// Set escalationDeadline after document is first created (createdAt is only
// available after the initial insert, so we use a post-save hook for that).
workflowComplaintSchema.post('save', async function (doc) {
  if (!doc.escalationDeadline) {
    doc.escalationDeadline = new Date(
      doc.createdAt.getTime() + doc.escalationHours * 60 * 60 * 1000
    );
    // Use updateOne to avoid triggering pre-save hooks recursively.
    await mongoose
      .model('WorkflowComplaint')
      .updateOne({ _id: doc._id }, { escalationDeadline: doc.escalationDeadline });
  }
});

// ── Indexes ──────────────────────────────────────────────────────────────────
// trackingNumber already has unique:true on the field — no separate index needed
workflowComplaintSchema.index({ workflowStatus: 1 });
workflowComplaintSchema.index({ subcity: 1 });
workflowComplaintSchema.index({ woredaId: 1 });
workflowComplaintSchema.index({ department: 1 });
workflowComplaintSchema.index({ escalationDeadline: 1, workflowStatus: 1 });
workflowComplaintSchema.index({ createdAt: -1 });

module.exports = mongoose.model('WorkflowComplaint', workflowComplaintSchema);
