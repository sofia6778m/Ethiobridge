const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema(
  {
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    // The user whose action triggered this notification. The recipient is
    // never the actor — actors are excluded before a Notification is created.
    actorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
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
        // Campaign / fundraising module
        'campaign_status', 'campaign_update', 'donation_receipt',
      ],
      default: 'system',
    },
    relatedReport: { type: mongoose.Schema.Types.ObjectId },
    relatedReportType: { type: String, enum: ['infrastructure', 'emergency', 'missing_person', 'workflow_complaint', 'municipal_complaint', 'governance_complaint'] },
    // Complaint this notification belongs to (municipal or governance).
    complaintId: { type: mongoose.Schema.Types.ObjectId },
    // Public Alert this notification belongs to — lets alert deletion also
    // remove every citizen bell notification for that alert.
    alertId: { type: mongoose.Schema.Types.ObjectId, ref: 'PublicAlert' },
    // Campaign this notification belongs to — lets campaign deletion also
    // remove every bell notification tied to that campaign.
    campaignId: { type: mongoose.Schema.Types.ObjectId, ref: 'Campaign' },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    // Soft-delete flag. Deleting a notification only hides it from its owner's
    // inbox/list — the underlying alert, complaint, report, message or other
    // source record is NEVER touched, and other users' notifications are never
    // affected (each Notification belongs to exactly one recipient).
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

// Unread lookup per recipient is the hottest query (bell + dashboards).
notificationSchema.index({ recipient: 1, isDeleted: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
