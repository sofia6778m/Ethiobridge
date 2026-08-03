const mongoose = require('mongoose');

const publicComplaintSchema = new mongoose.Schema(
  {
    trackingNumber: { type: String, unique: true },
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
      enum: ['Pending', 'Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected', 'Closed'],
      default: 'Pending',
    },
    assignedOrganization: { type: String, default: '' },
    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    assignedAt: { type: Date },
    resolvedAt: { type: Date },
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
    timeline: [
      {
        action: { type: String, required: true },
        description: { type: String },
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
    const model = mongoose.model('PublicComplaint');
    // Sequential numbers that skip any already in use, so deleted or raced
    // records never produce a duplicate tracking number (a duplicate would
    // reject the save and lose the complaint).
    let number = (await model.countDocuments()) + 1;
    while (await model.exists({ trackingNumber: `ETH-PC-${String(number).padStart(5, '0')}` })) {
      number += 1;
    }
    this.trackingNumber = `ETH-PC-${String(number).padStart(5, '0')}`;
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
publicComplaintSchema.index({ woredaId: 1 });
publicComplaintSchema.index({ woredaId: 1, department: 1 });
publicComplaintSchema.index({ escalationDeadline: 1, status: 1 });
publicComplaintSchema.index({ createdAt: -1 });

module.exports = mongoose.model('PublicComplaint', publicComplaintSchema);
