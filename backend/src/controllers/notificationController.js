const Notification = require('../models/Notification');
const {
  markAsRead: serviceMarkAsRead,
  markAllAsRead: serviceMarkAllAsRead,
  softDelete: serviceSoftDelete,
  softDeleteMany: serviceSoftDeleteMany,
} = require('../services/notificationService');

const getIo = (req) => (req.app && typeof req.app.get === 'function' && req.app.get('io')) || null;

const validObjectIds = (value) => {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value.filter(Boolean).map(String);
  return null;
};

// Push the authoritative unread count to the user's room so every open surface
// (bell badge, dashboard widgets, notification pages) stays in sync in real
// time after a read / unread / delete operation.
const emitUnreadCount = (io, userId) => {
  if (!io || !userId) return;
  Notification.countDocuments({ recipient: userId, isDeleted: false, isRead: false })
    .then((count) => io.to(String(userId)).emit('notification:unread', { unreadCount: count }))
    .catch(() => {});
};

// @desc  Get my notifications
// @route GET /api/notifications
// @access Private
const getNotifications = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 20));
    const scope = { recipient: req.user._id, isDeleted: false };
    const total = await Notification.countDocuments(scope);
    const notifications = await Notification.find(scope)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    const unreadCount = await Notification.countDocuments({ ...scope, isRead: false });

    res.json({ success: true, total, unreadCount, notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Mark notification as read
// @route PUT /api/notifications/:id/read
// @access Private
const markAsRead = async (req, res) => {
  try {
    // Ownership-scoped: a user can only mark their own notification read.
    const notification = await serviceMarkAsRead(req.user._id, req.params.id);
    if (notification) {
      const io = getIo(req);
      if (io) io.to(String(req.user._id)).emit('notification:read', { id: String(notification._id) });
      emitUnreadCount(io, req.user._id);
    }
    res.json({ success: true, message: 'Marked as read', data: notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Mark all notifications as read
// @route PUT /api/notifications/read-all
// @access Private
const markAllRead = async (req, res) => {
  try {
    const result = await serviceMarkAllAsRead(req.user._id);
    const io = getIo(req);
    if (io) io.to(String(req.user._id)).emit('notification:read-all', {});
    emitUnreadCount(io, req.user._id);
    res.json({ success: true, message: 'All notifications marked as read', modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Delete (soft) a single notification — hides it from the owner's inbox
//        only; the source alert/complaint/report/message is never touched.
// @route DELETE /api/notifications/:id
// @access Private
const deleteNotification = async (req, res) => {
  try {
    const deleted = await serviceSoftDelete(req.user._id, req.params.id);
    if (deleted) {
      const io = getIo(req);
      if (io) io.to(String(req.user._id)).emit('notification:deleted', { id: String(deleted._id) });
      emitUnreadCount(io, req.user._id);
    }
    res.json({ success: true, message: 'Notification deleted', data: deleted });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Delete (soft) multiple notifications — body { ids: [] } or { all: true }
// @route DELETE /api/notifications
// @access Private
const deleteNotifications = async (req, res) => {
  try {
    const { ids, all } = req.body || {};
    let result;
    let payloadIds = null;

    if (all === true || all === 'true') {
      result = await Notification.updateMany(
        { recipient: req.user._id, isDeleted: false },
        { isDeleted: true }
      );
    } else {
      const idList = validObjectIds(ids);
      if (!idList || !idList.length) {
        return res.status(400).json({ success: false, message: 'Provide notification ids to delete.' });
      }
      result = await serviceSoftDeleteMany(req.user._id, idList);
      payloadIds = idList;
    }

    const io = getIo(req);
    if (io) io.to(String(req.user._id)).emit('notification:deleted', payloadIds ? { ids: payloadIds } : { all: true });
    emitUnreadCount(io, req.user._id);

    res.json({ success: true, message: 'Notifications deleted', deletedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getNotifications, markAsRead, markAllRead, deleteNotification, deleteNotifications };
