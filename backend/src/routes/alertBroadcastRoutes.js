const express = require('express');
const router = express.Router();
const {
  createAlert,
  getActiveAlerts,
  getAlertById,
  updateAlertStatus,
  deleteAlert,
  getAlertStats,
} = require('../controllers/alertBroadcastController');
const { protect, authorize } = require('../middleware/auth');

// Public — list active alerts
router.get('/', getActiveAlerts);

// Government/Admin — stats (must be before /:id)
router.get('/stats', protect, authorize('government', 'admin'), getAlertStats);

// Government/Admin — create alert
router.post('/', protect, authorize('government', 'admin'), createAlert);

// Public — get by ID
router.get('/:id', getAlertById);

// Government/Admin — update status
router.patch('/:id/status', protect, authorize('government', 'admin'), updateAlertStatus);

// Government/Admin — delete
router.delete('/:id', protect, authorize('government', 'admin'), deleteAlert);

module.exports = router;
