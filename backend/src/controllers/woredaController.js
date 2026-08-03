const Woreda = require('../models/Woreda');
const User = require('../models/User');
const InfrastructureReport = require('../models/InfrastructureReport');
const EmergencyReport = require('../models/EmergencyReport');
const PublicComplaint = require('../models/PublicComplaint');
const createNotification = require('../utils/createNotification');
const { DEPARTMENTS } = require('../utils/scopeFilter');

const SUBCITY_MAP = {
  subcity_bole: 'BOLE',
  subcity_yeka: 'YEKA',
  subcity_lemmi_kura: 'LEMMI_KURA',
};

const getSubcityValue = (req) => SUBCITY_MAP[req.user.role];

const getWoredas = async (req, res) => {
  try {
    const subcity = getSubcityValue(req);
    const woredas = await Woreda.find({ subcity }).sort({ name: 1 });
    const result = await Promise.all(woredas.map(async (w) => {
      const userCount = await User.countDocuments({ woredaId: w._id, role: 'woreda' });
      return { ...w.toObject(), userCount };
    }));
    res.json({ success: true, woredas: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getWoredaStats = async (req, res) => {
  try {
    // Scope anchor is woredaId only — do NOT add subcity to the query because
    // the subcity string stored on reports may differ in casing from user.subcity
    const woredaId = req.user.woredaId;

    const [
      totalReports,
      pendingReports,
      inProgressReports,
      resolvedReports,
      rejectedReports,
      totalComplaints,
      pendingComplaints,
      resolvedComplaints,
    ] = await Promise.all([
      InfrastructureReport.countDocuments({ woredaId }),
      InfrastructureReport.countDocuments({ woredaId, status: 'Pending' }),
      InfrastructureReport.countDocuments({ woredaId, status: { $in: ['Assigned', 'In Progress'] } }),
      InfrastructureReport.countDocuments({ woredaId, status: 'Resolved' }),
      InfrastructureReport.countDocuments({ woredaId, status: 'Rejected' }),
      PublicComplaint.countDocuments({ woredaId }),
      PublicComplaint.countDocuments({ woredaId, status: 'Submitted' }),
      PublicComplaint.countDocuments({ woredaId, status: 'Resolved' }),
    ]);

    const departmentStats = await Promise.all(
      DEPARTMENTS.map(async (dept) => {
        const total    = await InfrastructureReport.countDocuments({ woredaId, department: dept });
        const resolved = await InfrastructureReport.countDocuments({ woredaId, department: dept, status: 'Resolved' });
        const pending  = await InfrastructureReport.countDocuments({ woredaId, department: dept, status: 'Pending' });
        return { department: dept, total, resolved, pending };
      })
    );

    res.json({
      success: true,
      stats: {
        totalReports, pendingReports, inProgressReports,
        resolvedReports, rejectedReports,
        totalComplaints, pendingComplaints, resolvedComplaints,
        departmentStats,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getWoredaReports = async (req, res) => {
  try {
    const woredaId = req.user.woredaId;
    // Scope by woredaId only — subcity is an unreliable secondary index
    const { status, department, page = 1, limit = 20 } = req.query;
    const query = { woredaId };

    if (status) query.status = status;
    if (department) query.department = department;

    const total = await InfrastructureReport.countDocuments(query);
    const reports = await InfrastructureReport.find(query)
      .populate('submittedBy', 'fullName email phone')
      .populate('assignedTo', 'fullName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), reports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getWoredaReportDetail = async (req, res) => {
  try {
    const woredaId = req.user.woredaId;
    const report = await InfrastructureReport.findOne({ _id: req.params.id, woredaId })
      .populate('submittedBy', 'fullName email phone')
      .populate('assignedTo', 'fullName email phone');
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const assignToDepartment = async (req, res) => {
  try {
    const woredaId = req.user.woredaId;
    const { id } = req.params;
    const { department } = req.body;

    const report = await InfrastructureReport.findOne({ _id: id, woredaId });
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    if (!department || !department.trim()) {
      return res.status(400).json({ success: false, message: 'Department is required' });
    }

    report.department = department.trim();
    report.assignedDepartment = department.trim();
    report.status = 'Assigned';
    report.assignedAt = new Date();

    report.progressHistory.push({
      status: 'Assigned',
      note: `Assigned to ${department} department`,
      updatedBy: req.user._id,
      updatedAt: new Date(),
    });

    await report.save();

    // Notify every department user whose scope matches this exact woreda + department.
    const deptUsers = await User.find({ woredaId, department: department.trim(), role: 'department' });
    const io = req.app.get('io');
    for (const u of deptUsers) {
      await createNotification({
        recipient: u._id,
        title: 'New Report Assignment',
        message: `Report "${report.title}" has been assigned to ${department}`,
        type: 'assignment',
        relatedReport: report._id,
        relatedReportType: 'infrastructure',
        io,
      });
    }

    res.json({ success: true, message: `Assigned to ${department}`, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getWoredas,
  getWoredaStats, getWoredaReports, getWoredaReportDetail, assignToDepartment,
};
