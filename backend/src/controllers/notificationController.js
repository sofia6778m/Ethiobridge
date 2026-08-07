const Notification = require('../models/Notification');
const { markAsRead: serviceMarkAsRead, markAllAsRead: serviceMarkAllAsRead } = require('../services/notificationService');

// @desc  Get my notifications
// @route GET /api/notifications
// @access Private
const getNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total = await Notification.countDocuments({ recipient: req.user._id });
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    const unreadCount = await Notification.countDocuments({ recipient: req.user._id, isRead: false });

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
    res.json({ success: true, message: 'All notifications marked as read', modifiedCount: result.modifiedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Delete a notification
// @route DELETE /api/notifications/:id
// @access Private
const deleteNotification = async (req, res) => {
  try {
    await Notification.findOneAndDelete({ _id: req.params.id, recipient: req.user._id });
    res.json({ success: true, message: 'Notification deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getNotifications, markAsRead, markAllRead, deleteNotification };
