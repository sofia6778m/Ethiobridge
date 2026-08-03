const InfrastructureReport = require('../models/InfrastructureReport');
const User = require('../models/User');
const createNotification = require('../utils/createNotification');

const LEVEL_HIERARCHY = ['kebele', 'woreda', 'zone', 'regional_bureau', 'federal_ministry'];

const LEVEL_LABELS = {
  kebele: 'Kebele',
  woreda: 'Woreda/Sub-City',
  zone: 'Zone',
  regional_bureau: 'Regional Bureau',
  federal_ministry: 'Federal Ministry',
};

const FORWARD_TARGETS = {
  kebele: ['woreda'],
  woreda: ['zone', 'regional_bureau'],
  zone: ['regional_bureau'],
  regional_bureau: ['federal_ministry'],
  federal_ministry: [],
};

// @desc  Get reports filterable by level tab
// @route GET /api/workflow/reports
// @access Private (government)
const getLevelReports = async (req, res) => {
  try {
    const { view, status, search, category, severity, level, page = 1, limit = 15 } = req.query;

    const query = {};

    // Level tab filter — show reports at this currentLevel
    if (level && LEVEL_HIERARCHY.includes(level)) {
      query.currentLevel = level;
    }

    if (view === 'resolved') {
      query.status = 'Resolved';
    } else if (view === 'forwarded') {
      query['forwardingHistory'] = { $elemMatch: { action: 'forward' } };
    } else if (view === 'history') {
      // all reports that have any forwarding history
    } else if (view === 'incoming') {
      query.status = { $in: ['Pending', 'Under Review', 'Approved', 'Reopened'] };
    }

    if (status) query.status = status;
    if (category) query.category = category;
    if (severity) query.severityLevel = severity;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { reportId: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { kebele: { $regex: search, $options: 'i' } },
        { woreda: { $regex: search, $options: 'i' } },
        { zone: { $regex: search, $options: 'i' } },
        { region: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await InfrastructureReport.countDocuments(query);
    const reports = await InfrastructureReport.find(query)
      .populate('submittedBy', 'fullName email phone')
      .populate('assignedTo', 'fullName email administrativeLevel')
      .populate('verifiedBy', 'fullName email')
      .populate('forwardingHistory.fromOfficer', 'fullName email administrativeLevel')
      .populate('forwardingHistory.toOfficer', 'fullName email administrativeLevel')
      .populate('comments.author', 'fullName role administrativeLevel')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), reports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get single report with full workflow details
// @route GET /api/workflow/reports/:id
// @access Private (government)
const getReportDetail = async (req, res) => {
  try {
    const report = await InfrastructureReport.findById(req.params.id)
      .populate('submittedBy', 'fullName email phone region kebele woreda zone city')
      .populate('assignedTo', 'fullName email administrativeLevel organizationName')
      .populate('verifiedBy', 'fullName email')
      .populate('forwardingHistory.fromOfficer', 'fullName email administrativeLevel organizationName')
      .populate('forwardingHistory.toOfficer', 'fullName email administrativeLevel organizationName')
      .populate('comments.author', 'fullName role administrativeLevel');
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Forward a report to the next administrative level
// @route POST /api/workflow/reports/:id/forward
// @access Private (government)
const forwardReport = async (req, res) => {
  try {
    const { toLevel, comment } = req.body;
    const report = await InfrastructureReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const officer = req.user;

    if (report.status === 'Resolved' || report.status === 'Rejected') {
      return res.status(400).json({ success: false, message: 'Cannot forward a resolved or rejected report' });
    }

    const validTargets = FORWARD_TARGETS[report.currentLevel] || [];
    if (!validTargets.includes(toLevel)) {
      return res.status(400).json({ success: false, message: `Cannot forward from ${LEVEL_LABELS[report.currentLevel]} to ${LEVEL_LABELS[toLevel]}` });
    }

    const forwardingEntry = {
      fromLevel: report.currentLevel,
      fromOfficer: officer._id,
      fromOfficerName: officer.fullName,
      fromDepartment: officer.organizationName || LEVEL_LABELS[report.currentLevel],
      toLevel,
      toOfficerName: LEVEL_LABELS[toLevel],
      toDepartment: LEVEL_LABELS[toLevel],
      comment: comment || '',
      action: 'forward',
      timestamp: new Date(),
    };

    report.forwardingHistory.push(forwardingEntry);
    report.currentLevel = toLevel;
    report.status = 'Received';

    // Auto-assign officer at target level based on report location
    const targetQuery = {
      role: 'government',
      isApproved: true,
      administrativeLevel: toLevel,
    };
    if (report.region) targetQuery.region = report.region;
    if (report.zone) targetQuery.zoneName = report.zone;
    if (report.woreda) targetQuery.woredaName = report.woreda;
    if (report.kebele) targetQuery.kebeleName = report.kebele;

    let targetOfficer = await User.findOne(targetQuery).select('_id fullName organizationName');
    if (!targetOfficer) {
      // Fallback: any officer at target level in same region
      targetOfficer = await User.findOne({
        role: 'government',
        isApproved: true,
        administrativeLevel: toLevel,
        region: report.region || 'Addis Ababa',
      }).select('_id fullName organizationName');
    }
    if (!targetOfficer) {
      // Final fallback: any officer at target level
      targetOfficer = await User.findOne({
        role: 'government',
        isApproved: true,
        administrativeLevel: toLevel,
      }).select('_id fullName organizationName');
    }

    if (targetOfficer) {
      report.assignedTo = targetOfficer._id;
      report.assignedDepartment = targetOfficer.organizationName || LEVEL_LABELS[toLevel];
      report.assignedAt = new Date();
      forwardingEntry.toOfficer = targetOfficer._id;
      forwardingEntry.toOfficerName = targetOfficer.fullName;
      forwardingEntry.toDepartment = targetOfficer.organizationName || LEVEL_LABELS[toLevel];
    }

    await report.addTimelineEvent({
      action: 'forwarded',
      description: `Report forwarded from ${LEVEL_LABELS[report.currentLevel === toLevel ? LEVEL_HIERARCHY[LEVEL_HIERARCHY.indexOf(toLevel) - 1] : report.currentLevel]} to ${LEVEL_LABELS[toLevel]}`,
      note: comment || '',
      performedBy: officer._id,
      performedByName: officer.fullName,
      performedByRole: officer.administrativeLevel || officer.role,
      metadata: { fromLevel: LEVEL_HIERARCHY[Math.max(0, LEVEL_HIERARCHY.indexOf(toLevel) - 1)], toLevel },
    });

    if (report.submittedBy) {
      await createNotification({
        recipient: report.submittedBy,
        title: 'Report Forwarded',
        message: `Your report ${report.reportId} has been forwarded to ${LEVEL_LABELS[toLevel]}. ${comment || ''}`,
        type: 'report_status',
        relatedReport: report._id,
        relatedReportType: 'infrastructure',
      });
    }

    res.json({ success: true, message: `Report forwarded to ${LEVEL_LABELS[toLevel]}`, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Resolve a report at the current level
// @route POST /api/workflow/reports/:id/resolve
// @access Private (government)
const resolveReport = async (req, res) => {
  try {
    const { comment } = req.body;
    const report = await InfrastructureReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const officer = req.user;

    const forwardingEntry = {
      fromLevel: report.currentLevel,
      fromOfficer: officer._id,
      fromOfficerName: officer.fullName,
      fromDepartment: officer.organizationName || LEVEL_LABELS[report.currentLevel],
      toLevel: report.currentLevel,
      toOfficer: officer._id,
      toOfficerName: officer.fullName,
      toDepartment: LEVEL_LABELS[report.currentLevel],
      comment: comment || 'Resolved at this level',
      action: 'resolve',
      timestamp: new Date(),
    };

    report.forwardingHistory.push(forwardingEntry);
    report.status = 'Resolved';
    report.resolvedAt = new Date();

    await report.addTimelineEvent({
      action: 'resolved_at_level',
      description: `Report resolved by ${LEVEL_LABELS[report.currentLevel]}`,
      note: comment || '',
      performedBy: officer._id,
      performedByName: officer.fullName,
      performedByRole: officer.administrativeLevel || officer.role,
    });

    if (report.submittedBy) {
      await createNotification({
        recipient: report.submittedBy,
        title: 'Report Resolved',
        message: `Your report ${report.reportId} has been resolved by ${LEVEL_LABELS[report.currentLevel]}. ${comment || ''}`,
        type: 'report_status',
        relatedReport: report._id,
        relatedReportType: 'infrastructure',
      });
    }

    res.json({ success: true, message: 'Report resolved successfully', report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Close a case (Federal Ministry only)
// @route POST /api/workflow/reports/:id/close
// @access Private (government)
const closeCase = async (req, res) => {
  try {
    const { comment } = req.body;
    const report = await InfrastructureReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const officer = req.user;

    const forwardingEntry = {
      fromLevel: 'federal_ministry',
      fromOfficer: officer._id,
      fromOfficerName: officer.fullName,
      fromDepartment: officer.organizationName || 'Federal Ministry',
      toLevel: 'federal_ministry',
      toOfficer: officer._id,
      toOfficerName: officer.fullName,
      toDepartment: 'Federal Ministry',
      comment: comment || 'Case closed by Federal Ministry',
      action: 'close',
      timestamp: new Date(),
    };

    report.forwardingHistory.push(forwardingEntry);
    report.status = 'Resolved';
    report.resolvedAt = report.resolvedAt || new Date();

    await report.addTimelineEvent({
      action: 'resolved_at_level',
      description: `Case closed by Federal Ministry`,
      note: comment || '',
      performedBy: officer._id,
      performedByName: officer.fullName,
      performedByRole: officer.administrativeLevel || officer.role,
    });

    if (report.submittedBy) {
      await createNotification({
        recipient: report.submittedBy,
        title: 'Case Closed',
        message: `Your report ${report.reportId} has been closed by the Federal Ministry. ${comment || ''}`,
        type: 'report_status',
        relatedReport: report._id,
        relatedReportType: 'infrastructure',
      });
    }

    res.json({ success: true, message: 'Case closed successfully', report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Add a comment
// @route POST /api/workflow/reports/:id/comment
// @access Private (government)
const addComment = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text) return res.status(400).json({ success: false, message: 'Comment text is required' });

    const report = await InfrastructureReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    report.comments.push({
      text,
      author: req.user._id,
      authorName: req.user.fullName,
      authorRole: req.user.administrativeLevel || req.user.role,
    });

    await report.addTimelineEvent({
      action: 'comment_added',
      description: `Comment added by ${LEVEL_LABELS[req.user.administrativeLevel] || req.user.role}`,
      note: text,
      performedBy: req.user._id,
      performedByName: req.user.fullName,
      performedByRole: req.user.administrativeLevel || req.user.role,
    });

    res.json({ success: true, message: 'Comment added', report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get workflow stats — detailed per-level breakdowns for the overview dashboard
// @route GET /api/workflow/stats
// @access Private (government)
const getWorkflowStats = async (req, res) => {
  try {
    const LEVELS = ['kebele', 'woreda', 'zone', 'regional_bureau', 'federal_ministry'];

    // Get all reports for in-memory aggregation (efficient for moderate volumes)
    const allReports = await InfrastructureReport.find({})
      .select('currentLevel status forwardingHistory severityLevel createdAt');

    const total = allReports.length;
    const resolved = allReports.filter(r => ['Resolved', 'Closed'].includes(r.status)).length;
    const critical = allReports.filter(r => r.severityLevel === 'Critical' && !['Resolved', 'Rejected', 'Closed'].includes(r.status)).length;

    // Per-level breakdown
    const levelStats = {};
    for (const level of LEVELS) {
      const pending = allReports.filter(r => r.currentLevel === level && !['Resolved', 'Rejected', 'Closed'].includes(r.status)).length;
      const resolvedAtLevel = allReports.filter(r =>
        r.forwardingHistory?.some(f => f.action === 'resolve' && f.fromLevel === level)
      ).length;
      const escalated = allReports.filter(r =>
        r.forwardingHistory?.some(f => f.action === 'forward' && f.fromLevel === level)
      ).length;
      const totalEverAtLevel = allReports.filter(r =>
        r.currentLevel === level ||
        r.forwardingHistory?.some(f => f.toLevel === level)
      ).length;

      // Determine level status based on pending volume
      let statusLabel = 'Idle';
      if (pending > 20) statusLabel = 'High Volume';
      else if (pending > 10) statusLabel = 'Reviewing';
      else if (pending > 0) statusLabel = 'Processing';
      else statusLabel = 'Clear';

      levelStats[level] = {
        total: totalEverAtLevel,
        pending,
        resolved: resolvedAtLevel,
        escalated,
        status: statusLabel,
      };
    }

    const recentReports = await InfrastructureReport.find({})
      .populate('submittedBy', 'fullName')
      .populate('assignedTo', 'fullName')
      .sort({ createdAt: -1 })
      .limit(5)
      .select('reportId title category severityLevel status createdAt currentLevel');

    res.json({
      success: true,
      stats: {
        ...levelStats,
        total,
        resolved,
        critical,
        recentReports,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get available officers at a target level
// @route GET /api/workflow/officers/:level
// @access Private (government)
const getOfficersAtLevel = async (req, res) => {
  try {
    const { level } = req.params;

    const query = {
      role: 'government',
      administrativeLevel: level,
      isActive: true,
      isApproved: true,
    };

    const officers = await User.find(query).select('fullName email organizationName administrativeLevel');
    res.json({ success: true, officers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get forwarding hierarchy info
// @route GET /api/workflow/hierarchy
// @access Private (government)
const getHierarchy = async (req, res) => {
  try {
    res.json({
      success: true,
      hierarchy: {
        levels: LEVEL_HIERARCHY.map(l => ({ level: l, label: LEVEL_LABELS[l] })),
        forwardTargets: Object.entries(FORWARD_TARGETS).map(([from, to]) => ({
          from,
          fromLabel: LEVEL_LABELS[from],
          to,
          toLabels: to.map(t => LEVEL_LABELS[t]),
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getLevelReports, getReportDetail, forwardReport, resolveReport,
  closeCase, addComment, getWorkflowStats, getOfficersAtLevel, getHierarchy,
};
