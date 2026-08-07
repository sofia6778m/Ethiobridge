const InfrastructureReport = require('../models/InfrastructureReport');
const createNotification = require('../utils/createNotification');
const { departmentMatchFilter } = require('../utils/departmentRecipients');

// Department scope filter for records owned by this department account.
// Matches the department name case-insensitively (survives "water" vs "Water")
// AND on the live departmentId ObjectId when the account has one, so both
// legacy `department` accounts and canonical `department_officer` accounts see
// the same dashboard data.
const departmentScope = (user) => {
  const scope = {};
  if (user.woredaId) scope.woredaId = user.woredaId;
  const match = departmentMatchFilter(user.department, user.departmentId);
  if (match) Object.assign(scope, match);
  return scope;
};

const getDepartmentStats = async (req, res) => {
  try {
    const scope = departmentScope(req.user);
    const infra = { ...scope, report_type: 'infrastructure' };

    const [
      total, pending, assigned, inProgress, completed, resolved, rejected,
    ] = await Promise.all([
      InfrastructureReport.countDocuments(infra),
      InfrastructureReport.countDocuments({ ...infra, status: { $in: ['Pending', 'Submitted'] } }),
      InfrastructureReport.countDocuments({ ...infra, status: 'Assigned' }),
      InfrastructureReport.countDocuments({ ...infra, status: 'In Progress' }),
      InfrastructureReport.countDocuments({ ...infra, status: 'Completed' }),
      InfrastructureReport.countDocuments({ ...infra, status: 'Resolved' }),
      InfrastructureReport.countDocuments({ ...infra, status: 'Rejected' }),
    ]);

    res.json({
      success: true,
      stats: {
        total, pending, assigned, inProgress, completed, resolved, rejected,
        // Split analytics — count infrastructure reports separately so
        // dashboards can report each flow independently.
        analytics: {
          infrastructure: {
            total,
            pending,
            assigned,
            inProgress,
            completed,
            resolved,
            rejected,
          },
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDepartmentReports = async (req, res) => {
  try {
    const scope = departmentScope(req.user);
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = { ...scope, report_type: 'infrastructure' };

    if (status) query.status = status;
    if (search) {
      const filters = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { reportId: { $regex: search, $options: 'i' } },
      ];
      query.$or = scope.$or ? scope.$or.concat(filters) : filters;
    }

    const total = await InfrastructureReport.countDocuments(query);
    const reports = await InfrastructureReport.find(query)
      .populate('submittedBy', 'fullName email phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), reports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDepartmentReportDetail = async (req, res) => {
  try {
    const report = await InfrastructureReport.findOne({ _id: req.params.id, ...departmentScope(req.user) })
      .populate('submittedBy', 'fullName email phone')
      .populate('assignedTo', 'fullName email');
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const acceptReport = async (req, res) => {
  try {
    const report = await InfrastructureReport.findOne({ _id: req.params.id, ...departmentScope(req.user) });
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    report.status = 'Assigned';
    report.assignedTo = req.user._id;
    report.progressHistory.push({
      status: 'Assigned',
      note: 'Report accepted by department',
      updatedBy: req.user._id,
      updatedAt: new Date(),
    });
    await report.save();

    res.json({ success: true, message: 'Report accepted', report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const rejectReport = async (req, res) => {
  try {
    const { note } = req.body;
    const report = await InfrastructureReport.findOne({ _id: req.params.id, ...departmentScope(req.user) });
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    report.status = 'Rejected';
    report.rejectionReason = note || 'Rejected by department';
    report.department = undefined;
    report.assignedDepartment = undefined;
    report.progressHistory.push({
      status: 'Rejected',
      note: note || 'Rejected by department',
      updatedBy: req.user._id,
      updatedAt: new Date(),
    });
    await report.save();

    res.json({ success: true, message: 'Report rejected', report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const startWorking = async (req, res) => {
  try {
    const report = await InfrastructureReport.findOne({ _id: req.params.id, ...departmentScope(req.user) });
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    report.status = 'In Progress';
    report.progressHistory.push({
      status: 'In Progress',
      note: 'Work started',
      updatedBy: req.user._id,
      updatedAt: new Date(),
    });
    await report.save();

    res.json({ success: true, message: 'Work started', report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const markComplete = async (req, res) => {
  try {
    const { note } = req.body;
    const report = await InfrastructureReport.findOne({ _id: req.params.id, ...departmentScope(req.user) });
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    report.status = 'Completed';
    report.workCompletedBy = req.user._id;
    report.completedAt = new Date();

    if (req.files) {
      const files = Array.isArray(req.files) ? req.files : Object.values(req.files).flat();
      if (files.length > 0) {
        report.afterPhotos = files.map(f => f.path);
      }
    }

    report.progressHistory.push({
      status: 'Completed',
      note: note || 'Work completed',
      updatedBy: req.user._id,
      updatedAt: new Date(),
    });
    await report.save();

    const io = req.app.get('io');
    if (report.submittedBy) {
      await createNotification({
        recipient: report.submittedBy,
        actorId: req.user._id,
        title: 'Report Completed',
        message: `Your report "${report.title}" has been marked as completed by ${req.user.department} department.`,
        type: 'report_status',
        relatedReport: report._id,
        relatedReportType: 'infrastructure',
        io,
      });
    }

    res.json({ success: true, message: 'Report marked complete', report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getDepartmentStats, getDepartmentReports, getDepartmentReportDetail,
  acceptReport, rejectReport, startWorking, markComplete,
};
