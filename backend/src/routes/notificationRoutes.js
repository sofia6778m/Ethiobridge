const express = require('express');
const router = express.Router();
const {
  getNotifications, markAsRead, markAllRead, deleteNotification, deleteNotifications,
} = require('../controllers/notificationController');
const { protect } = require('../middleware/auth');

router.get('/', protect, getNotifications);
router.put('/read-all', protect, markAllRead);
router.put('/:id/read', protect, markAsRead);
// Bulk soft-delete (body: { ids: [] } or { all: true }) — registered before the
// single-id route so DELETE /api/notifications is never captured as :id.
router.delete('/', protect, deleteNotifications);
router.delete('/:id', protect, deleteNotification);

module.exports = router;
