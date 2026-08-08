const Notification = require('../models/Notification');
const createNotification = require('../utils/createNotification');

// Whether two ids refer to the same user (tolerates ObjectIds and strings).
const isActor = (actorId, userId) =>
  Boolean(actorId && userId && String(actorId) === String(userId));

// Create a single in-app + realtime notification. A user never receives a
// notification about their own action — the recipient is skipped entirely when
// they are the actor.
const notifyUser = async ({ userId, actorId, title, message, type, relatedReport, relatedReportType, complaintId, campaignId, io }) => {
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
    campaignId,
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

// Mark a notification read — only its owner may do so. Deleted (hidden)
// notifications are never touched.
const markAsRead = async (userId, notificationId) =>
  Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId, isDeleted: false },
    { isRead: true, readAt: new Date() },
    { new: true }
  );

// Mark every non-deleted notification of a user read.
const markAllAsRead = async (userId) =>
  Notification.updateMany(
    { recipient: userId, isRead: false, isDeleted: false },
    { isRead: true, readAt: new Date() }
  );

const getUnreadCount = async (userId) =>
  Notification.countDocuments({ recipient: userId, isRead: false, isDeleted: false });

// Soft-delete (hide) a single notification for its owner. The document is
// kept so the source record's relationship is preserved; only the owner's
// inbox stops showing it.
const softDelete = async (userId, notificationId) =>
  Notification.findOneAndUpdate(
    { _id: notificationId, recipient: userId, isDeleted: false },
    { isDeleted: true },
    { new: true }
  );

// Soft-delete (hide) several notifications at once for their owner.
const softDeleteMany = async (userId, ids) =>
  Notification.updateMany(
    { recipient: userId, isDeleted: false, _id: { $in: ids } },
    { isDeleted: true }
  );

module.exports = {
  notifyUser,
  notifyUsers,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  softDelete,
  softDeleteMany,
  isActor,
};
