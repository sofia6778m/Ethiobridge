const Notification = require('../models/Notification');

// Global guard: a user never receives a notification about their own action.
// Every creation path (direct util calls and notifyUser/notifyUsers) funnels
// through here, so passing actorId is sufficient to exclude the actor.
const isSelfNotification = (actorId, recipient) =>
  Boolean(actorId && recipient && String(actorId) === String(recipient));

const createNotification = async ({
  recipient,
  actorId,
  title,
  message,
  type,
  relatedReport,
  relatedReportType,
  complaintId,
  alertId,
  campaignId,
  io,
}) => {
  try {
    if (isSelfNotification(actorId, recipient)) return null;
    const notification = await Notification.create({
      recipient,
      actorId: actorId || undefined,
      title,
      message,
      type,
      relatedReport,
      relatedReportType,
      complaintId,
      alertId,
      campaignId,
    });

    if (io) {
      io.to(recipient.toString()).emit('notification:new', {
        _id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        relatedReport: notification.relatedReport,
        relatedReportType: notification.relatedReportType,
        complaintId: notification.complaintId,
        alertId: notification.alertId,
        campaignId: notification.campaignId,
        actorId: notification.actorId,
        isRead: false,
        createdAt: notification.createdAt,
      });
    }

    return notification;
  } catch (err) {
    console.error('Notification creation failed:', err.message);
  }
};

module.exports = createNotification;
