const InfrastructureReport = require('../models/InfrastructureReport');
const PublicComplaint = require('../models/PublicComplaint');
const User = require('../models/User');
const Notification = require('../models/Notification');
const createNotification = require('../utils/createNotification');

const getDepartmentStats = async (req, res) => {
  try {
    const department = req.user.department;
    const woredaId = req.user.woredaId;

    const [
      total, pending, assigned, inProgress, completed, resolved, rejected,
      // PublicComplaint counts scoped to this department+woreda
      totalComplaints, submittedComplaints, reviewingComplaints,
      resolvedComplaints, rejectedComplaints,
    ] = await Promise.all([
      InfrastructureReport.countDocuments({ woredaId, department }),
      InfrastructureReport.countDocuments({ woredaId, department, status: 'Pending' }),
      InfrastructureReport.countDocuments({ woredaId, department, status: 'Assigned' }),
      InfrastructureReport.countDocuments({ woredaId, department, status: 'In Progress' }),
      InfrastructureReport.countDocuments({ woredaId, department, status: 'Completed' }),
      InfrastructureReport.countDocuments({ woredaId, department, status: 'Resolved' }),
      InfrastructureReport.countDocuments({ woredaId, department, status: 'Rejected' }),
      PublicComplaint.countDocuments({ woredaId, department }),
      PublicComplaint.countDocuments({ woredaId, department, status: 'Submitted' }),
      PublicComplaint.countDocuments({ woredaId, department, status: 'Under Review' }),
      PublicComplaint.countDocuments({ woredaId, department, status: 'Resolved' }),
      PublicComplaint.countDocuments({ woredaId, department, status: 'Rejected' }),
    ]);

    res.json({
      success: true,
      stats: {
        total, pending, assigned, inProgress, completed, resolved, rejected,
        complaints: {
          total: totalComplaints,
          submitted: submittedComplaints,
          reviewing: reviewingComplaints,
          resolved: resolvedComplaints,
          rejected: rejectedComplaints,
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDepartmentReports = async (req, res) => {
  try {
    const department = req.user.department;
    const woredaId = req.user.woredaId;
    const { status, search, page = 1, limit = 20 } = req.query;
    const query = { woredaId, department };

    if (status) query.status = status;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { reportId: { $regex: search, $options: 'i' } },
      ];
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
    const department = req.user.department;
    const woredaId = req.user.woredaId;
    const report = await InfrastructureReport.findOne({ _id: req.params.id, woredaId, department })
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
    const report = await InfrastructureReport.findOne({ _id: req.params.id, woredaId: req.user.woredaId, department: req.user.department });
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
    const report = await InfrastructureReport.findOne({ _id: req.params.id, woredaId: req.user.woredaId, department: req.user.department });
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
    const report = await InfrastructureReport.findOne({ _id: req.params.id, woredaId: req.user.woredaId, department: req.user.department });
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
    const report = await InfrastructureReport.findOne({ _id: req.params.id, woredaId: req.user.woredaId, department: req.user.department });
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

// @desc  List PublicComplaint documents scoped to this department account
// @route GET /api/department/complaints
// @access Private (department)
const getDepartmentComplaints = async (req, res) => {
  try {
    const department = req.user.department;
    const woredaId   = req.user.woredaId;
    const { status, search, page = 1, limit = 20 } = req.query;

    // Hard-scope: the department user can ONLY see complaints for their
    // exact woreda + department combination, regardless of query params.
    const query = { woredaId, department };
    if (status) query.status = status;
    if (search) {
      query.$or = [
        { title:          { $regex: search, $options: 'i' } },
        { description:    { $regex: search, $options: 'i' } },
        { trackingNumber: { $regex: search, $options: 'i' } },
        { reporterName:   { $regex: search, $options: 'i' } },
      ];
    }

    const total = await PublicComplaint.countDocuments(query);
    const complaints = await PublicComplaint.find(query)
      .populate('reporter', 'fullName email phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * Number(limit))
      .limit(Number(limit))
      .select('-timeline');

    res.json({
      success: true,
      total,
      page:  Number(page),
      pages: Math.ceil(total / Number(limit)),
      complaints,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Update the status of a PublicComplaint (department-scoped)
// @route PATCH /api/department/complaints/:id/status
// @access Private (department)
const updateDepartmentComplaintStatus = async (req, res) => {
  try {
    const department = req.user.department;
    const woredaId   = req.user.woredaId;
    const { status, comment } = req.body;

    const VALID = ['Submitted', 'Under Review', 'In Progress', 'Resolved', 'Rejected', 'Closed'];
    if (!VALID.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status. Must be one of: ${VALID.join(', ')}` });
    }

    // Enforce scope: the complaint must belong to this exact dept+woreda.
    const complaint = await PublicComplaint.findOne({ _id: req.params.id, woredaId, department });
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found or not in your scope' });
    }

    const previousStatus = complaint.status;
    complaint.status = status;
    if (status === 'Resolved')   complaint.resolvedAt = new Date();
    if (status === 'Under Review') complaint.assignedAt = new Date();

    complaint.timeline.push({
      action: 'status_changed',
      description: comment || `Status changed to ${status}`,
      performedBy:     req.user._id,
      performedByName: req.user.fullName,
      performedByRole: req.user.role,
      previousStatus,
      newStatus: status,
    });

    await complaint.save();

    // Notify the reporter if non-anonymous.
    if (complaint.reporter) {
      await createNotification({
        recipient: complaint.reporter,
        title: 'Complaint Status Updated',
        message: `Your complaint ${complaint.trackingNumber} has been updated to "${status}" by the ${department} department.`,
        type: 'info',
        relatedReport:     complaint._id,
        relatedReportType: 'public_complaint',
        io: req.app?.get('io') || null,
      });
    }

    res.json({ success: true, message: 'Status updated', complaint });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getDepartmentStats, getDepartmentReports, getDepartmentReportDetail,
  acceptReport, rejectReport, startWorking, markComplete,
  getDepartmentComplaints, updateDepartmentComplaintStatus,
};
