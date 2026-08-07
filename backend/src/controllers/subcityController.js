const InfrastructureReport = require('../models/InfrastructureReport');
const EmergencyReport = require('../models/EmergencyReport');
const User = require('../models/User');
const Notification = require('../models/Notification');

const SUBCITY_MAP = {
  subcity_bole: 'BOLE',
  subcity_yeka: 'YEKA',
  subcity_lemmi_kura: 'LEMMI_KURA',
};

const getSubcityValue = (req) => SUBCITY_MAP[req.user.role];

const getStats = async (req, res) => {
  try {
    const subcity = getSubcityValue(req);

    const [
      totalInfra,
      pendingInfra,
      assignedInfra,
      resolvedInfra,
      totalEmergency,
      pendingEmergency,
      activeEmergency,
      resolvedEmergency,
    ] = await Promise.all([
      InfrastructureReport.countDocuments({ subcity }),
      InfrastructureReport.countDocuments({ subcity, status: 'Pending' }),
      InfrastructureReport.countDocuments({ subcity, status: { $in: ['Assigned', 'In Progress'] } }),
      InfrastructureReport.countDocuments({ subcity, status: 'Resolved' }),
      EmergencyReport.countDocuments({ subcity }),
      EmergencyReport.countDocuments({ subcity, status: 'Pending' }),
      EmergencyReport.countDocuments({ subcity, status: { $in: ['Active', 'In Progress'] } }),
      EmergencyReport.countDocuments({ subcity, status: 'Resolved' }),
    ]);

    res.json({
      success: true,
      stats: {
        infrastructure: { total: totalInfra, pending: pendingInfra, active: assignedInfra, resolved: resolvedInfra },
        emergency: { total: totalEmergency, pending: pendingEmergency, active: activeEmergency, resolved: resolvedEmergency },
        totalReports: totalInfra + totalEmergency,
        pendingReports: pendingInfra + pendingEmergency,
        activeReports: assignedInfra + activeEmergency,
        resolvedReports: resolvedInfra + resolvedEmergency,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getReports = async (req, res) => {
  try {
    const subcity = getSubcityValue(req);
    const { status, type, page = 1, limit = 20 } = req.query;
    const query = { subcity };
    if (status) query.status = status;

    let reports, total;
    if (type === 'emergency') {
      total = await EmergencyReport.countDocuments(query);
      reports = await EmergencyReport.find(query)
        .populate('submittedBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit));
    } else {
      total = await InfrastructureReport.countDocuments(query);
      reports = await InfrastructureReport.find(query)
        .populate('submittedBy', 'fullName email')
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(Number(limit));
    }

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), reports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getReportDetail = async (req, res) => {
  try {
    const subcity = getSubcityValue(req);
    const { id } = req.params;

    let report = await InfrastructureReport.findOne({ _id: id, subcity })
      .populate('submittedBy', 'fullName email phone')
      .populate('assignedTo', 'fullName email')
      .populate('verifiedBy', 'fullName email');

    if (!report) {
      report = await EmergencyReport.findOne({ _id: id, subcity })
        .populate('submittedBy', 'fullName email phone');
    }

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateReportStatus = async (req, res) => {
  try {
    const subcity = getSubcityValue(req);
    const { id } = req.params;
    const { status, note } = req.body;

    let report = await InfrastructureReport.findOne({ _id: id, subcity });
    let model = 'Infrastructure';

    if (!report) {
      report = await EmergencyReport.findOne({ _id: id, subcity });
      model = 'Emergency';
    }

    if (!report) {
      return res.status(404).json({ success: false, message: 'Report not found' });
    }

    const previousStatus = report.status;
    report.status = status;

    if (status === 'Resolved') report.resolvedAt = new Date();
    if (status === 'In Progress' && !report.assignedAt) report.assignedAt = new Date();

    report.progressHistory.push({
      status,
      note: note || '',
      updatedBy: req.user._id,
      updatedAt: new Date(),
    });

    await report.save();

    res.json({ success: true, message: 'Status updated', report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipient: req.user._id })
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ success: true, notifications });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getCitizens = async (req, res) => {
  try {
    const subcity = getSubcityValue(req);
    const citizens = await User.find({ role: 'citizen', subcity })
      .select('fullName email phone region city')
      .sort({ createdAt: -1 });
    res.json({ success: true, citizens });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getStats, getReports, getReportDetail, updateReportStatus, getNotifications, getCitizens };
