const mongoose = require('mongoose');
const { generateReportId } = require('../utils/reportIdGenerator');

const timelineEventSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'created', 'approved', 'rejected', 'assigned', 'status_changed',
      'work_started', 'work_completed', 'citizen_verified', 'citizen_rejected',
      'reopened', 'comment_added', 'media_uploaded', 'feedback_added',
      'forwarded', 'received', 'resolved_at_level',
    ],
  },
  description: { type: String },
  note: { type: String },
  previousStatus: { type: String },
  newStatus: { type: String },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  performedByName: { type: String },
  performedByRole: { type: String },
  metadata: { type: mongoose.Schema.Types.Mixed },
}, { timestamps: true });

const infrastructureReportSchema = new mongoose.Schema(
  {
    reportId: { type: String, unique: true },
    // Discriminates infrastructure submissions from other report types. Always
    // 'infrastructure' on this collection — used by dashboards/analytics to
    // query only infrastructure reports.
    report_type: {
      type: String,
      enum: ['infrastructure'],
      default: 'infrastructure',
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    // No enum restriction — the citizen form maps Department → category, and
    // anything outside the classic three (e.g. Health, Education) falls back
    // to 'other'. Kept for stats / filter continuity.
    category: {
      type: String,
      default: 'other',
    },
    severityLevel: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'Medium',
    },

    region: { type: String, required: true },
    zone: { type: String, trim: true },
    woreda: { type: String, trim: true },
    kebele: { type: String, trim: true },
    city: { type: String },
    // No enum restriction — any subcity created in the Subcity collection is valid.
    subcity: { type: String },
    // Live ObjectId references used for precise role scoping (mirrors the
    // PublicComplaint schema). Populated at submission time from the selected
    // woreda/subcity/department master data.
    subcityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcity', default: null },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', default: null },
    woredaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Woreda' },
    woredaName: { type: String },
    specificLocation: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
    address: { type: String },

    incidentDate: { type: Date },

    photos: [{ type: String }],
    videos: [{ type: String }],

    status: {
      type: String,
      enum: [
        'Pending', 'Submitted', 'Under Review', 'Approved', 'Rejected',
        'Assigned', 'In Progress', 'Completed',
        'Citizen Verification', 'Resolved', 'Reopened',
        'Received', 'Closed',
      ],
      default: 'Pending',
    },
    rejectionReason: { type: String },

    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    // Alias for the submitting citizen — null for anonymous submissions.
    citizen_id: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reporterName:  { type: String, default: '' },
    reporterEmail: { type: String, default: '' },
    reporterPhone: { type: String, default: '' },

    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },

    assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedDepartment: { type: String },
    department: { type: String, index: true },
    assignedAt: { type: Date },
    dueDate: { type: Date },
    slaDays: { type: Number },
    slaWarningAt: { type: Date },
    slaBreached: { type: Boolean, default: false },
    responsibleOrganization: { type: String },

    autoAssignedOrganization: { type: String },

    // Administrative workflow
    currentLevel: {
      type: String,
      enum: ['citizen', 'kebele', 'woreda', 'zone', 'regional_bureau', 'federal_ministry'],
      default: 'citizen',
    },
    forwardingHistory: [{
      fromLevel: { type: String },
      fromOfficer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      fromOfficerName: { type: String },
      fromDepartment: { type: String },
      toLevel: { type: String },
      toOfficer: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      toOfficerName: { type: String },
      toDepartment: { type: String },
      comment: { type: String },
      action: { type: String, enum: ['forward', 'resolve', 'close'] },
      timestamp: { type: Date, default: Date.now },
    }],

    workCompletedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    completedAt: { type: Date },
    afterPhotos: [{ type: String }],
    afterVideos: [{ type: String }],

    citizenVerified: { type: Boolean },
    citizenVerifiedAt: { type: Date },
    citizenVerificationNote: { type: String },
    citizenRejectionPhotos: [{ type: String }],
    citizenRejectionVideos: [{ type: String }],

    resolvedAt: { type: Date },
    reopenedCount: { type: Number, default: 0 },

    rating: { type: Number, min: 1, max: 5 },
    feedback: { type: String },
    feedbackAt: { type: Date },

    aiAnalysis: {
      analyzed: { type: Boolean, default: false },
      confidenceScore: { type: Number, min: 0, max: 1 },
      detectedType: { type: String },
      detectedSeverity: { type: String },
      detectedDescription: { type: String },
      analyzedAt: { type: Date },
    },

    timeline: [timelineEventSchema],

    comments: [{
      text: { type: String, required: true },
      author: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      authorName: { type: String },
      authorRole: { type: String },
      isInternal: { type: Boolean, default: false },
    }, { timestamps: true }],

    progressHistory: [{
      status: String,
      note: String,
      updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      updatedAt: { type: Date, default: Date.now },
    }],
  },
  { timestamps: true }
);

infrastructureReportSchema.index({ status: 1 });
infrastructureReportSchema.index({ category: 1 });
infrastructureReportSchema.index({ region: 1 });
infrastructureReportSchema.index({ severityLevel: 1 });
infrastructureReportSchema.index({ submittedBy: 1 });
infrastructureReportSchema.index({ assignedTo: 1 });
infrastructureReportSchema.index({ dueDate: 1 });
infrastructureReportSchema.index({ slaBreached: 1 });
infrastructureReportSchema.index({ currentLevel: 1 });
infrastructureReportSchema.index({ subcityId: 1 });
infrastructureReportSchema.index({ woredaId: 1 });
infrastructureReportSchema.index({ departmentId: 1 });
infrastructureReportSchema.index({ woredaId: 1, department: 1 });
infrastructureReportSchema.index({ createdAt: -1 });

// The reportId is generated atomically from the counters collection (see
// utils/reportIdGenerator.js) so concurrent submissions can never receive the
// same ID. No document is saved without a unique IR-YYYY-000001-style ID.
infrastructureReportSchema.pre('save', async function (next) {
  if (!this.reportId) {
    try {
      this.reportId = await generateReportId();
    } catch (err) {
      return next(err);
    }
  }
  next();
});

infrastructureReportSchema.methods.addTimelineEvent = function (event) {
  this.timeline.push({
    action: event.action,
    description: event.description || '',
    note: event.note || '',
    previousStatus: event.previousStatus,
    newStatus: event.newStatus,
    performedBy: event.performedBy,
    performedByName: event.performedByName || '',
    performedByRole: event.performedByRole || '',
    metadata: event.metadata || {},
  });
  return this.save();
};

module.exports = mongoose.model('InfrastructureReport', infrastructureReportSchema);
