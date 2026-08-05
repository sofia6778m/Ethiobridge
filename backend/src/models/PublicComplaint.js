const mongoose = require('mongoose');
const Counter = require('./Counter');

const publicComplaintSchema = new mongoose.Schema(
  {
    trackingNumber: { type: String, unique: true },
    // Discriminates public complaints from other report types. Always
    // 'public_complaint' on this collection — used by dashboards/analytics to
    // query only public complaints.
    report_type: {
      type: String,
      enum: ['public_complaint'],
      default: 'public_complaint',
      index: true,
    },
    title: { type: String, required: true, trim: true },
    category: {
      type: String,
      required: true,
      enum: [
        'Government Service Complaint',
        'Project Delay',
        'Poor Work Quality',
        'Public Property Damage',
        'Other',
      ],
    },
    description: { type: String, required: true },
    region: { type: String, required: true },
    city: { type: String, default: '' },
    subcity: { type: String, default: '' },  // no enum — accepts any subcity name from the Subcity collection
    // Live ObjectId references used for precise role scoping (e.g. the
    // department_officer role scopes on all three IDs). Populated at submission
    // time from the selected woreda/subcity/department master data.
    subcityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcity', default: null },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    woredaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Woreda' },
    woredaName: { type: String, default: '' },
    district: { type: String, default: '' },
    latitude: { type: Number },
    longitude: { type: Number },
    attachments: [{ type: String }],
    priority: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Urgent'],
      default: 'Medium',
    },
    anonymous: { type: Boolean, default: false },
    reporter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Alias for the reporter — always points at the logged-in citizen who
    // submitted the complaint (null for anonymous submissions).
    citizenId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    // Location & routing scope: subcity, woreda and responsible department.
    // No enum restriction — any department name created in Department Management
    // is valid so new departments work without code changes.
    department: {
      type: String,
      default: '',
      trim: true,
    },
    reporterName: { type: String, default: '' },
    reporterPhone: { type: String, default: '' },
    reporterEmail: { type: String, default: '' },
    status: {
      type: String,
      enum: [
        'Pending', 'Submitted', 'Accepted', 'Under Review', 'Assigned', 'Inspector Assigned',
        'Technician Assigned', 'Technician Requested', 'In Progress', 'Waiting for Parts',
        'More Info Requested', 'Awaiting Verification', 'Rework Required',
        'Escalated to Subcity', 'Forwarded to Subcity', 'Resolved by Subcity',
        'Resolved', 'Rejected', 'Closed', 'Reopened',
      ],
      default: 'Submitted',
    },
    // Technician work-order lifecycle. Independent of the complaint status:
    //   ASSIGNED → ACCEPTED → ON_THE_WAY → WORK_STARTED → WORK_PAUSED → WORK_COMPLETED
    technicianWorkState: {
      type: String,
      enum: ['ASSIGNED', 'ACCEPTED', 'ON_THE_WAY', 'WORK_STARTED', 'WORK_PAUSED', 'WORK_COMPLETED'],
      default: null,
    },
    technicianWorkStateUpdatedAt: { type: Date },
    assignedOrganization: { type: String, default: '' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedAt: { type: Date },
    resolvedAt: { type: Date },
    // ── Field-staff assignment (officer / technician) ───────────────────────
    assignedOfficerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedOfficerName: { type: String, default: '' },
    assignedOfficerAt: { type: Date },
    officerAccepted: { type: Boolean, default: false },
    officerAcceptedAt: { type: Date },
    assignedTechnicianId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedTechnicianName: { type: String, default: '' },
    assignedTechnicianAt: { type: Date },
    technicianRequested: { type: Boolean, default: false },
    technicianRequestedAt: { type: Date },
    dueDate: { type: Date },
    workInstruction: { type: String, default: '' },
    // ── Verification (performed by the assigned officer) ────────────────────
    verifiedByOfficerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    verifiedAt: { type: Date },
    verificationNote: { type: String, default: '' },
    // ── Closure (performed by the department admin) ─────────────────────────
    closedByAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    closedByAdminName: { type: String, default: '' },
    // ── Field evidence ───────────────────────────────────────────────────────
    inspectionPhotos: [{ type: String }],
    beforePhotos: [{ type: String }],
    afterPhotos: [{ type: String }],
    workNotes: [
      {
        note: { type: String, required: true },
        by: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        byName: { type: String, default: '' },
        byRole: { type: String, default: '' },
        at: { type: Date, default: Date.now },
      },
    ],
    // Routing level — 'WOREDA' normally, 'SUBCITY' once escalated upward.
    assignedLevel: { type: String, enum: ['WOREDA', 'SUBCITY'], default: 'WOREDA' },
    escalationReason: { type: String, default: '' },
    escalatedToSubcity: { type: Boolean, default: false },
    closedAt: { type: Date },
    // Explicit submission date (also captured by timestamps.createdAt). Kept
    // separate so dashboard tables can always render "submitted on" reliably.
    submittedAt: { type: Date, default: Date.now },
    // ── SLA / escalation timestamps ─────────────────────────────────────────
    // A complaint that has not been resolved escalates automatically:
    //   1. 48 hours  → to the Subcity office
    //   2. 5 days    → to the Subcity Administrator
    escalationDeadline: { type: Date },          // createdAt + 48h
    subcityEscalationDeadline: { type: Date },   // createdAt + 5 days
    escalatedToSubcityAt: { type: Date },
    escalatedToSubcityAdminAt: { type: Date },
    // Internal (non-public) notes visible to officers/admins in the detail view.
    internalNotes: [
      {
        body: { type: String, required: true },
        author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
        authorName: { type: String, default: '' },
        authorRole: { type: String, default: '' },
      },
      { timestamps: true },
    ],
    // Citizen-facing notification feed — shown on the public tracking page and
    // also delivered via SMS / email when contact details were provided.
    publicNotifications: [
      {
        event: { type: String, default: '' },
        title: { type: String, default: '' },
        message: { type: String, default: '' },
        channels: { type: String, default: 'in-app' },
        at: { type: Date, default: Date.now },
      },
    ],
    // ── Department officer actions (citizen complaint workflow) ─────────────
    // Officer accepted the complaint.
    acceptedAt: { type: Date },
    acceptedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    acceptedByName: { type: String, default: '' },
    // Officer rejected the complaint.
    rejectReason: { type: String, default: '' },
    rejectedAt: { type: Date },
    rejectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    rejectedByName: { type: String, default: '' },
    // Officer forwarded the complaint to the Subcity office.
    forwardReason: { type: String, default: '' },
    estimatedBudget: { type: String, default: '' },
    requiredEquipment: { type: String, default: '' },
    forwardPriority: { type: String, default: '' },
    forwardedAt: { type: Date },
    forwardedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    forwardedByName: { type: String, default: '' },
    // Subcity-level resolution (complaint reached the Subcity office).
    subcityResolvedAt: { type: Date },
    subcityResolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    subcityResolvedByName: { type: String, default: '' },
    resolutionDetails: { type: String, default: '' },
    timeline: [
      {
        action: { type: String, required: true },
        description: { type: String },
        at: { type: Date, default: Date.now },
        performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        performedByName: { type: String },
        performedByRole: { type: String },
        previousStatus: { type: String },
        newStatus: { type: String },
      },
    ],
  },
  { timestamps: true }
);

publicComplaintSchema.pre('save', async function (next) {
  if (!this.trackingNumber) {
    const year = new Date().getFullYear();
    // Atomic per-year sequence (Counter collection) so concurrent submissions
    // can never collide: CMP-2026-000001, CMP-2026-000002, ...
    const counter = await Counter.findByIdAndUpdate(
      { _id: `public_complaint:${year}` },
      { $inc: { seq: 1 } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
    this.trackingNumber = `CMP-${year}-${String(counter.seq).padStart(6, '0')}`;
  }
  next();
});

// Set the SLA escalation deadlines after the document exists (createdAt is only
// available after the initial insert), so both existing and new records get them.
publicComplaintSchema.post('save', async function (doc) {
  const updates = {};
  if (!doc.escalationDeadline && doc.createdAt) {
    updates.escalationDeadline = new Date(doc.createdAt.getTime() + 48 * 60 * 60 * 1000);
  }
  if (!doc.subcityEscalationDeadline && doc.createdAt) {
    updates.subcityEscalationDeadline = new Date(doc.createdAt.getTime() + 5 * 24 * 60 * 60 * 1000);
  }
  if (Object.keys(updates).length) {
    // Only backfill when the deadlines are genuinely missing — a manual
    // re-save (e.g. status update) must not reset the SLA windows.
    await mongoose.model('PublicComplaint').updateOne(
      { _id: doc._id, escalationDeadline: { $exists: false } },
      { $set: updates }
    );
  }
});

publicComplaintSchema.index({ status: 1 });
publicComplaintSchema.index({ category: 1 });
publicComplaintSchema.index({ region: 1 });
publicComplaintSchema.index({ subcity: 1 });
publicComplaintSchema.index({ subcityId: 1 });
publicComplaintSchema.index({ woredaId: 1 });
publicComplaintSchema.index({ departmentId: 1 });
publicComplaintSchema.index({ woredaId: 1, department: 1 });
publicComplaintSchema.index({ department: 1 });
publicComplaintSchema.index({ priority: 1 });
publicComplaintSchema.index({ assignedOfficerId: 1 });
publicComplaintSchema.index({ assignedTechnicianId: 1 });
publicComplaintSchema.index({ escalationDeadline: 1, status: 1 });
publicComplaintSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PublicComplaint', publicComplaintSchema);
