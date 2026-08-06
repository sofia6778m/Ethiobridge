const mongoose = require('mongoose');
const { generateGovernanceId, isDuplicateKeyError } = require('../utils/governanceIdGenerator');

// ── Shared enums ──────────────────────────────────────────────────────────────

// Complaint categories are now DB-driven (ComplaintCategory collection) so
// every GovernmentOffice can define its own set. The string below is kept only
// as the default seed set used when provisioning new offices.
const DEFAULT_GOVERNANCE_CATEGORIES = [
  'Unreasonable Delay',
  'Corruption / Bribery',
  'Unprofessional Conduct',
  'Arbitrary Denial of Service',
  'Lack of Information / Transparency',
  'Nepotism / Favoritism',
  'Office Closed / Staff Absent',
  'Lost or Mishandled Documents',
  'Other',
];

const ADMIN_ACTIONS = [
  'Warning',
  'Written Warning',
  'Service Correction Order',
  'Training Required',
  'Disciplinary Referral',
  'Anti-Corruption Referral',
  'Close Without Action',
];

const STATUSES = [
  'Submitted',
  'Under Review',
  'Need More Information',
  'In Progress',
  'Investigation in Progress',
  'Awaiting Woreda Response',
  'Action Taken',
  'Resolved',
  'Rejected',
  'Reopened',
  'Escalated',
  'Closed',
];

const CLOSED_STATUSES = ['Resolved', 'Rejected', 'Closed'];

// ── Sub-schemas ───────────────────────────────────────────────────────────────

const woredaRequestSchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    requestedByName: { type: String, default: '' },
    requestedAt: { type: Date, default: Date.now },
    dueAt: { type: Date },
    status: { type: String, enum: ['Pending', 'Responded', 'Overdue', 'Cancelled'], default: 'Pending' },
    // Woreda response
    response: { type: String, default: '', trim: true },
    responseFiles: [{ type: String }],
    respondedAt: { type: Date },
    respondedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    respondedByName: { type: String, default: '' },
  },
  { _id: true }
);

const noteSchema = new mongoose.Schema(
  {
    note: { type: String, required: true, trim: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String, default: '' },
    role: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'at', updatedAt: false } }
);

const adminActionSchema = new mongoose.Schema(
  {
    action: { type: String, enum: ADMIN_ACTIONS, required: true },
    note: { type: String, default: '', trim: true },
    files: [{ type: String }],
    recordedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    recordedByName: { type: String, default: '' },
    recordedAt: { type: Date, default: Date.now },
  },
  { _id: true }
);

const timelineEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    title: { type: String, default: '' },
    message: { type: String, default: '', trim: true },
    performedByRole: { type: String, default: '' },
    performedByName: { type: String, default: '' },
    files: [{ type: String }],
  },
  { timestamps: { createdAt: 'at', updatedAt: false } }
);

// Citizen-facing response from the assigned office. Distinct from internal
// investigation notes — this is what the reporter sees in their complaint feed.
const officerResponseSchema = new mongoose.Schema(
  {
    message: { type: String, required: true, trim: true },
    files: [{ type: String }],
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String, default: '' },
    role: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'at', updatedAt: false } }
);

const auditEntrySchema = new mongoose.Schema(
  {
    action: { type: String, required: true },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    userName: { type: String, default: 'System' },
    role: { type: String, default: 'system' },
    details: { type: String, default: '' },
    oldStatus: { type: String, default: '' },
    newStatus: { type: String, default: '' },
    ipAddress: { type: String, default: '' },
  },
  { timestamps: { createdAt: 'at', updatedAt: false } }
);

// ── Main schema ───────────────────────────────────────────────────────────────

const governanceComplaintSchema = new mongoose.Schema(
  {
    // Tracking
    trackingId: { type: String, unique: true }, // GOV-YYYY-000001
    // Content — category/office are DB-driven (ComplaintCategory /
    // GovernmentOffice collections). The name strings stay denormalized for
    // display + exports; the ObjectIds keep the DB relationships authoritative.
    category: { type: String, required: true, trim: true },
    categoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'ComplaintCategory', default: null },
    title: { type: String, default: '', trim: true },
    description: { type: String, required: true, trim: true },
    incidentDate: { type: Date },
    incidentTime: { type: String, default: '' },
    incidentLocation: { type: String, default: '', trim: true },
    employeesInvolved: { type: String, default: '', trim: true },
    serviceReceived: { type: String, default: '', trim: true },
    urgencyLevel: { type: String, enum: ['Low', 'Medium', 'High'], default: 'Medium' },
    // Routing — a governance complaint starts at the Subcity Governance Office
    // of the selected subcity and coordinates with the chosen office/woreda.
    subcity: { type: String, default: '', trim: true },
    subcityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcity', default: null },
    woredaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Woreda' },
    woredaName: { type: String, default: '' },
    office: { type: String, default: '', trim: true }, // Office / Bureau within the woreda (denormalized)
    officeId: { type: mongoose.Schema.Types.ObjectId, ref: 'GovernmentOffice', default: null },
    // Reporter (identity hidden for anonymous reports)
    reporter: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reporterName: { type: String, default: '' },
    reporterPhone: { type: String, default: '' },
    reporterEmail: { type: String, default: '' },
    isAnonymous: { type: Boolean, default: false },
    consent: { type: Boolean, default: false },
    // Evidence (photos / PDF / audio / video)
    evidenceFiles: [{ type: String }],
    // Workflow
    status: { type: String, enum: STATUSES, default: 'Submitted' },
    assignedLevel: { type: String, enum: ['Woreda', 'Subcity'], default: 'Subcity' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedToOffice: { type: String, default: '' }, // Subcity Governance Office
    assignedAt: { type: Date },
    // Woreda coordination
    woredaRequests: [woredaRequestSchema],
    // Investigation
    investigationNotes: [noteSchema],
    officialDocuments: [{ type: String }],
    adminActions: [adminActionSchema],
    // Escalation
    escalated: { type: Boolean, default: false },
    escalatedTo: { type: String, enum: ['', 'Subcity Administrator', 'Regional Bureau'], default: '' },
    escalatedAt: { type: Date },
    escalationReason: { type: String, default: '' },
    escalatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    escalatedByName: { type: String, default: '' },
    // SLA / overdue
    slaDueAt: { type: Date },
    isOverdue: { type: Boolean, default: false },
    overdueSince: { type: Date },
    overdueNotifiedAt: { type: Date },
    // Resolution / rejection / reopen / close
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    resolvedByName: { type: String, default: '' },
    resolutionNote: { type: String, default: '' },
    rejectedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedByName: { type: String, default: '' },
    rejectionReason: { type: String, default: '' },
    reopenedCount: { type: Number, default: 0 },
    reopenedAt: { type: Date },
    reopenedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reopenedByName: { type: String, default: '' },
    closedAt: { type: Date },
    closedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    closedByName: { type: String, default: '' },
    // Citizen confirmation of the resolution
    confirmedByCitizen: { type: Boolean, default: false },
    confirmedAt: { type: Date },
    // Logs
    timeline: [timelineEntrySchema],
    auditTrail: [auditEntrySchema],
    // Citizen-facing responses posted by the assigned office / its officers.
    officerResponses: [officerResponseSchema],
    notificationHistory: [
      {
        event: { type: String, default: '' },
        title: { type: String, default: '' },
        message: { type: String, default: '' },
        channels: { type: String, default: 'in-app' },
      },
      { timestamps: { createdAt: 'at', updatedAt: false } },
    ],
  },
  { timestamps: true }
);

// ── Tracking ID: GOV-YYYY-000001 ──────────────────────────────────────────────
governanceComplaintSchema.pre('save', async function (next) {
  if (!this.trackingId) {
    try {
      this.trackingId = await generateGovernanceId();
    } catch (err) {
      if (isDuplicateKeyError(err)) {
        return next(new Error('Tracking ID collision — please retry.'));
      }
      return next(err);
    }
  }
  next();
});

// Backfill SLA deadline after insert (createdAt is only known post-insert).
// The deadline is resolved from the category-based SlaRule collection
// (corruption = 3d, unreasonable delay = 7d, unprofessional conduct = 5d,
// default = 48h) so every complaint carries a category-appropriate due date.
governanceComplaintSchema.post('save', async function (doc) {
  if (!doc.slaDueAt && doc.createdAt) {
    try {
      const { resolveSlaDueAt } = require('../utils/slaRules');
      const due = await resolveSlaDueAt(doc.category, doc.subcityId, doc.createdAt);
      await mongoose.model('GovernanceComplaint').updateOne(
        { _id: doc._id, slaDueAt: { $exists: false } },
        { $set: { slaDueAt: due } }
      );
    } catch (err) {
      await mongoose.model('GovernanceComplaint').updateOne(
        { _id: doc._id, slaDueAt: { $exists: false } },
        { $set: { slaDueAt: new Date(doc.createdAt.getTime() + 48 * 60 * 60 * 1000) } }
      );
    }
  }
});

// ── Indexes ───────────────────────────────────────────────────────────────────
governanceComplaintSchema.index({ status: 1 });
governanceComplaintSchema.index({ category: 1 });
governanceComplaintSchema.index({ categoryId: 1 });
governanceComplaintSchema.index({ subcity: 1 });
governanceComplaintSchema.index({ subcityId: 1 });
governanceComplaintSchema.index({ woredaId: 1 });
governanceComplaintSchema.index({ office: 1 });
governanceComplaintSchema.index({ officeId: 1 });
governanceComplaintSchema.index({ reporter: 1 });
governanceComplaintSchema.index({ assignedTo: 1 });
governanceComplaintSchema.index({ urgencyLevel: 1, status: 1 });
governanceComplaintSchema.index({ slaDueAt: 1, status: 1 });
governanceComplaintSchema.index({ isOverdue: 1, status: 1 });
governanceComplaintSchema.index({ createdAt: -1 });

module.exports = mongoose.model('GovernanceComplaint', governanceComplaintSchema);
module.exports.DEFAULT_GOVERNANCE_CATEGORIES = DEFAULT_GOVERNANCE_CATEGORIES;
module.exports.GOVERNANCE_CATEGORIES = DEFAULT_GOVERNANCE_CATEGORIES;
module.exports.ADMIN_ACTIONS = ADMIN_ACTIONS;
module.exports.STATUSES = STATUSES;
module.exports.CLOSED_STATUSES = CLOSED_STATUSES;
