const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    title: { type: String, required: true },
    message: { type: String, required: true },
    type: {
      type: String,
      enum: [
        'report_status', 'new_report', 'assignment', 'message', 'system', 'emergency_alert', 'verification',
        'info', 'success', 'warning',
        'complaint_status', 'complaint_assigned', 'complaint_forwarded', 'complaint_escalated',
        'complaint_resolved', 'complaint_rejected',
      ],
      default: 'system',
    },
    relatedReport: { type: mongoose.Schema.Types.ObjectId },
    relatedReportType: { type: String, enum: ['infrastructure', 'emergency', 'missing_person', 'public_complaint', 'workflow_complaint', 'municipal_complaint'] },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
