const Notification = require('../models/Notification');

const createNotification = async ({ recipient, title, message, type, relatedReport, relatedReportType, io }) => {
  try {
    const notification = await Notification.create({ recipient, title, message, type, relatedReport, relatedReportType });

    if (io) {
      io.to(recipient.toString()).emit('notification:new', {
        _id: notification._id,
        title: notification.title,
        message: notification.message,
        type: notification.type,
        relatedReport: notification.relatedReport,
        relatedReportType: notification.relatedReportType,
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
