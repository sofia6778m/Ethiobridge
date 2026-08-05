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
        // Service Governance complaints
        'governance_submitted', 'governance_status', 'governance_info_requested',
        'governance_action_taken', 'governance_resolved', 'governance_rejected',
        'governance_reopened', 'governance_escalated', 'governance_closed',
        'public_alert',
        // Campaigns & donations
        'campaign_approval', 'campaign_approved', 'campaign_rejected',
        'donation_received', 'donation_verified', 'donation_rejected', 'donation_update',
      ],
      default: 'system',
    },
    relatedReport: { type: mongoose.Schema.Types.ObjectId },
    relatedReportType: { type: String, enum: ['infrastructure', 'emergency', 'missing_person', 'public_complaint', 'workflow_complaint', 'municipal_complaint', 'governance_complaint', 'campaign', 'donation'] },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Notification', notificationSchema);
