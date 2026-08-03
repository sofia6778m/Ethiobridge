const AlertBroadcast = require('../models/AlertBroadcast');

const getIo = (req) => req.app?.get('io') || null;

// @desc  Create a new broadcast alert (government only)
// @route POST /api/alerts
const createAlert = async (req, res) => {
  try {
    const { title, category, severity, region, zone, woreda, description, expiresAt } = req.body;

    if (!title || !category || !severity || !region || !description) {
      return res.status(400).json({
        success: false,
        message: 'Title, category, severity, region, and description are required.',
      });
    }

    const alertData = {
      title,
      category,
      severity,
      region,
      zone: zone || '',
      woreda: woreda || '',
      description,
      publishedBy: req.user._id,
      publishedByName: req.user.fullName || '',
      publishedByOrg: req.user.organizationName || '',
    };

    if (expiresAt) alertData.expiresAt = new Date(expiresAt);

    const alert = await AlertBroadcast.create(alertData);

    // Broadcast via Socket.io to all connected clients
    const io = getIo(req);
    if (io) {
      io.emit('alert:new', {
        _id: alert._id,
        title: alert.title,
        category: alert.category,
        severity: alert.severity,
        region: alert.region,
        zone: alert.zone,
        woreda: alert.woreda,
        description: alert.description,
        status: alert.status,
        publishedByName: alert.publishedByName,
        publishedByOrg: alert.publishedByOrg,
        createdAt: alert.createdAt,
      });
    }

    res.status(201).json({
      success: true,
      message: 'Alert broadcasted successfully',
      data: { alert },
    });
  } catch (err) {
    console.error('[AlertBroadcast] Create error:', err);
    res.status(500).json({ success: false, message: 'Failed to create alert' });
  }
};

// @desc  Get all active alerts (public)
// @route GET /api/alerts
const getActiveAlerts = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, severity, region, status } = req.query;
    const query = {};

    if (status) {
      query.status = status;
    } else {
      query.status = 'active';
    }
    if (category) query.category = category;
    if (severity) query.severity = severity;
    if (region) query.region = region;

    const total = await AlertBroadcast.countDocuments(query);
    const alerts = await AlertBroadcast.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({
      success: true,
      data: {
        alerts,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    console.error('[AlertBroadcast] Get all error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch alerts' });
  }
};

// @desc  Get alert by ID
// @route GET /api/alerts/:id
const getAlertById = async (req, res) => {
  try {
    const alert = await AlertBroadcast.findById(req.params.id)
      .populate('publishedBy', 'fullName organizationName role');

    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    // Increment views
    alert.views += 1;
    await alert.save();

    res.json({ success: true, data: { alert } });
  } catch (err) {
    console.error('[AlertBroadcast] Get by id error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch alert' });
  }
};

// @desc  Update alert status (government/admin)
// @route PATCH /api/alerts/:id/status
const updateAlertStatus = async (req, res) => {
  try {
    const { status } = req.body;
    const validStatuses = ['active', 'expired', 'archived'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const alert = await AlertBroadcast.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    alert.status = status;
    await alert.save();

    // Broadcast status update
    const io = getIo(req);
    if (io) {
      io.emit('alert:statusUpdate', { _id: alert._id, status: alert.status });
    }

    res.json({ success: true, message: 'Alert status updated', data: { alert } });
  } catch (err) {
    console.error('[AlertBroadcast] Update status error:', err);
    res.status(500).json({ success: false, message: 'Failed to update alert status' });
  }
};

// @desc  Delete alert (government/admin)
// @route DELETE /api/alerts/:id
const deleteAlert = async (req, res) => {
  try {
    const alert = await AlertBroadcast.findById(req.params.id);
    if (!alert) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    await alert.deleteOne();

    const io = getIo(req);
    if (io) {
      io.emit('alert:deleted', { _id: alert._id });
    }

    res.json({ success: true, message: 'Alert deleted' });
  } catch (err) {
    console.error('[AlertBroadcast] Delete error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete alert' });
  }
};

// @desc  Get alert statistics (government/admin)
// @route GET /api/alerts/stats
const getAlertStats = async (req, res) => {
  try {
    const [statusCounts, categoryCounts, severityCounts, total] = await Promise.all([
      AlertBroadcast.aggregate([{ $group: { _id: '$status', count: { $sum: 1 } } }]),
      AlertBroadcast.aggregate([{ $group: { _id: '$category', count: { $sum: 1 } } }]),
      AlertBroadcast.aggregate([{ $group: { _id: '$severity', count: { $sum: 1 } } }]),
      AlertBroadcast.countDocuments(),
    ]);

    const byStatus = {};
    statusCounts.forEach(s => { byStatus[s._id] = s.count; });
    const byCategory = {};
    categoryCounts.forEach(c => { byCategory[c._id] = c.count; });
    const bySeverity = {};
    severityCounts.forEach(s => { bySeverity[s._id] = s.count; });

    res.json({
      success: true,
      data: { total, byStatus, byCategory, bySeverity },
    });
  } catch (err) {
    console.error('[AlertBroadcast] Stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
};

module.exports = {
  createAlert,
  getActiveAlerts,
  getAlertById,
  updateAlertStatus,
  deleteAlert,
  getAlertStats,
};
