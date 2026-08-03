const AuditLog = require('../models/AuditLog');

const logAction = async ({ user, action, resource, resourceId, details, req }) => {
  try {
    await AuditLog.create({
      user: user?._id,
      userName: user?.fullName || user?.name || 'System',
      userRole: user?.role || 'system',
      action,
      resource,
      resourceId,
      details,
      ipAddress: req?.ip || req?.connection?.remoteAddress,
      userAgent: req?.get('user-agent'),
    });
  } catch (err) {
    console.error('Audit log failed:', err.message);
  }
};

module.exports = { logAction };
