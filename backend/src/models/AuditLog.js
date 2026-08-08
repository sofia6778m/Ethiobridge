const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    userName: { type: String },
    userRole: { type: String },
    action: {
      type: String,
      required: true,
      enum: [
        'report_created', 'report_approved', 'report_rejected', 'report_assigned',
        'report_status_changed', 'report_deleted', 'report_verified',
        'citizen_verification', 'feedback_added', 'comment_added',
        'user_login', 'user_register', 'user_approved', 'user_deactivated',
        'user_reactivated',
        'media_uploaded', 'export_performed',
        // Public complaint workflow actions
        'complaint_created', 'complaint_status_changed', 'complaint_accepted',
        'complaint_rejected', 'complaint_info_requested', 'complaint_officer_assigned',
        'complaint_technician_assigned', 'complaint_work_completed',
        'complaint_forwarded', 'complaint_resolved', 'complaint_reopened',
        'complaint_closed', 'complaint_note_added', 'complaint_escalated',
        'complaint_verified', 'complaint_viewed',
        // Governance complaint workflow actions
        'governance_created', 'governance_status_changed', 'governance_assigned',
        'governance_resolved', 'governance_rejected', 'governance_closed',
        'governance_reopened', 'governance_escalated', 'governance_note_added',
        'governance_response_posted', 'governance_info_requested',
        'governance_woreda_contacted', 'governance_woreda_responded',
        'governance_document_uploaded', 'governance_admin_action',
        'governance_evidence_added', 'governance_viewed', 'governance_overdue',
        'governance_resolution_confirmed',
        // Alert workflow actions
        'alert_create', 'alert_update', 'alert_scheduled', 'alert_publish',
        'alert_archive', 'alert_delete',
        // Campaign / fundraising workflow actions
        'campaign_create', 'campaign_update', 'campaign_submit', 'campaign_approve',
        'campaign_reject', 'campaign_complete', 'campaign_suspend', 'campaign_restore',
        'campaign_delete', 'campaign_activate', 'campaign_deactivate',
        'campaign_fraud_check', 'campaign_fraud_review', 'campaign_reported',
        'donation_create', 'donation_verify', 'donation_public', 'donation_track',
      ],
    },
    resource: { type: String },
    resourceId: { type: mongoose.Schema.Types.ObjectId },
    details: { type: mongoose.Schema.Types.Mixed },
    ipAddress: { type: String },
    userAgent: { type: String },
  },
  { timestamps: true }
);

auditLogSchema.index({ user: 1 });
auditLogSchema.index({ action: 1 });
auditLogSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AuditLog', auditLogSchema);
