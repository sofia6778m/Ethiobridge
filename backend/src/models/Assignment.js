const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  report: { type: mongoose.Schema.Types.ObjectId, ref: 'InfrastructureReport', required: true },
  assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  assignedDepartment: { type: String },
  dueDate: { type: Date },
  notes: { type: String },
  status: {
    type: String,
    enum: ['Active', 'In Progress', 'Completed', 'Cancelled'],
    default: 'Active',
  },
  completedAt: { type: Date },
  completedNotes: { type: String },
}, { timestamps: true });

assignmentSchema.index({ report: 1 });
assignmentSchema.index({ assignedTo: 1 });
assignmentSchema.index({ status: 1 });

module.exports = mongoose.model('Assignment', assignmentSchema);
