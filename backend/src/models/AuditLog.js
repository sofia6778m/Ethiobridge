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
