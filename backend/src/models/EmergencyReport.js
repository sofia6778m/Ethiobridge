const mongoose = require('mongoose');

const timelineEventSchema = new mongoose.Schema({
  action: {
    type: String,
    required: true,
    enum: [
      'created', 'approved', 'rejected', 'assigned', 'status_changed',
      'work_started', 'work_completed', 'comment_added',
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

const emergencyReportSchema = new mongoose.Schema(
  {
    reportId: { type: String, unique: true },
    title: { type: String, required: true, trim: true },
    description: { type: String, required: true },
    emergencyType: {
      type: String,
      required: true,
      enum: ['Flood', 'Fire', 'Landslide', 'Drought', 'Food Shortage', 'Medical Emergency', 'Disease Outbreak', 'Other'],
    },
    urgencyLevel: {
      type: String,
      enum: ['Low', 'Medium', 'High', 'Critical'],
      default: 'High',
    },
    priorityLevel: {
      type: String,
      enum: ['Low', 'Medium', 'High'],
      default: 'High',
    },
    numberOfPeopleAffected: { type: Number },
    region: { type: String, required: true },
    city: { type: String },
    // No enum restriction — any subcity created in the Subcity collection is valid.
    subcity: { type: String },
    woredaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Woreda' },
    woredaName: { type: String },
    specificLocation: { type: String },
    latitude: { type: Number },
    longitude: { type: Number },
    photos: [{ type: String }],
    status: {
      type: String,
      enum: ['Pending', 'Under Review', 'Active', 'In Progress', 'Resolved', 'Rejected'],
      default: 'Pending',
    },
    submittedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    assignedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // NGOs, volunteers

    autoAssignedOrganization: { type: String },
    department: { type: String, index: true },
    assignedDepartment: { type: String },
    assignedToUser: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    assignedAt: { type: Date },
    responsibleOrganization: { type: String },

    assistanceProvided: { type: String },
    verifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    verifiedAt: { type: Date },
    resolvedAt: { type: Date },

    timeline: [timelineEventSchema],

    progressHistory: [
      {
        status: String,
        note: String,
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
        updatedAt: { type: Date, default: Date.now },
      },
    ],
  },
  { timestamps: true }
);

emergencyReportSchema.pre('save', async function (next) {
  if (!this.reportId) {
    const count = await mongoose.model('EmergencyReport').countDocuments();
    this.reportId = `EM-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
  }
  next();
});

module.exports = mongoose.model('EmergencyReport', emergencyReportSchema);
