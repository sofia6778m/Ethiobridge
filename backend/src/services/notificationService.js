const Notification = require('../models/Notification');
const createNotification = require('../utils/createNotification');

// Whether two ids refer to the same user (tolerates ObjectIds and strings).
const isActor = (actorId, userId) =>
  Boolean(actorId && userId && String(actorId) === String(userId));

// Create a single in-app + realtime notification. A user never receives a
// notification about their own action — the recipient is skipped entirely when
// they are the actor.
const notifyUser = async ({ userId, actorId, title, message, type, relatedReport, relatedReportType, complaintId, io }) => {
  if (!userId) return null;
  if (isActor(actorId, userId)) return null;
  return createNotification({
    recipient: userId,
    actorId: actorId || undefined,
    title,
    message,
    type,
    relatedReport,
    relatedReportType,
    complaintId,
    io,
  });
};

// Create notifications for many recipients, deduping ids and excluding the actor.
const notifyUsers = async ({ userIds = [], actorId, ...rest }) => {
  const seen = new Set();
  const created = [];
  for (const id of userIds) {
    if (!id) continue;
    const key = String(id);
    if (seen.has(key) || isActor(actorId, id)) continue;
    seen.add(key);
    const notification = await notifyUser({ ...rest, userId: id, actorId });
    if (notification) created.push(notification);
  }
  return created;
};

// Mark a notification read — only its owner may do so.
const markAsRead = async (userId, notificationId) =>
  Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId },
    { isRead: true, readAt: new Date() },
    { new: true }
  );

// Mark every notification of a user read.
const markAllAsRead = async (userId) =>
  Notification.updateMany({ recipient: userId, isRead: false }, { isRead: true, readAt: new Date() });

const getUnreadCount = async (userId) =>
  Notification.countDocuments({ recipient: userId, isRead: false });

module.exports = {
  notifyUser,
  notifyUsers,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  isActor,
};
