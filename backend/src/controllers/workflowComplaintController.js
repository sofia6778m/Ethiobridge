const WorkflowComplaint = require('../models/WorkflowComplaint');
const IssueType = require('../models/IssueType');
const User = require('../models/User');
const Woreda = require('../models/Woreda');
const createNotification = require('../utils/createNotification');
const { upload } = require('../config/cloudinary');

// Case-insensitive exact-match helper. Department and subcity names on issue
// types are title-cased while the live master-data lists can be lowercase, so
// dependent dropdowns must never rely on an exact-case string compare.
const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ciRegex = (s) => ({ $regex: `^${escapeRegex(s)}$`, $options: 'i' });

const getIo = (req) => req.app?.get('io') || null;

// ── Scope helpers ─────────────────────────────────────────────────────────────

const SUBCITY_ROLE_MAP = {
  subcity_bole: 'BOLE',
  subcity_yeka: 'YEKA',
  subcity_lemmi_kura: 'LEMMI_KURA',
};

/**
 * Build a MongoDB match filter for WorkflowComplaint based on the user's role.
 *   admin            → all
 *   subcity_*        → their subcity
 *   woreda           → their woredaId
 *   department       → their woredaId + department
 *   citizen          → their own submissions
 */
function buildScope(user) {
  if (!user) return {};
  // Derived subcity-admin roles (subcity_koye, subcity_kolfe, …) plus the
  // canonical subcity_admin all scope to their own subcity. Complaint records
  // store the subcity name in UPPERCASE, so normalize the match target too.
  if (user.role && typeof user.role === 'string' && user.role.startsWith('subcity_')) {
    const sub = SUBCITY_ROLE_MAP[user.role] || (user.subcity || '').toUpperCase();
    return sub ? { subcity: sub } : {};
  }
  switch (user.role) {
    case 'admin': return {};
    case 'subcity_bole':
    case 'subcity_yeka':
    case 'subcity_lemmi_kura':
    case 'subcity_admin':
    case 'SUBCITY_ADMIN':
      return { subcity: SUBCITY_ROLE_MAP[user.role] || (user.subcity || '').toUpperCase() };
    case 'woreda':
    case 'woreda_admin':
    case 'WOREDA_ADMIN':
      return { woredaId: user.woredaId };
    case 'department':
    case 'department_officer':
      return { woredaId: user.woredaId, department: user.department };
    case 'citizen':
      return { reporter: user._id };
    default:
      return {};
  }
}


// ── GET /api/workflow-complaints/issue-types ──────────────────────────────────
// Returns all active issue types, optionally filtered by ?department=&subcity=
const getIssueTypes = async (req, res) => {
  try {
    const filter = { isActive: true };
    if (req.query.department) filter.department = ciRegex(req.query.department);
    if (req.query.subcity) filter.subcity = ciRegex(req.query.subcity);
    const issues = await IssueType.find(filter).sort({ department: 1, subcity: 1, name: 1 });
    res.json({ success: true, data: { issueTypes: issues } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── POST /api/workflow-complaints ─────────────────────────────────────────────
// Step 1: Citizen submits a complaint.
// The system auto-assigns subcity, woreda, department, and issue type from the
// issueTypeId the citizen selects (all routing data lives on the IssueType doc).
const createWorkflowComplaint = async (req, res) => {
  try {
    const {
      title, description, priority,
      issueTypeId, woredaId,
      anonymous, reporterName, reporterPhone, reporterEmail,
      latitude, longitude,
    } = req.body;

    if (!title || !description || !issueTypeId || !woredaId) {
      return res.status(400).json({
        success: false,
        message: 'title, description, issueTypeId, and woredaId are required.',
      });
    }

    const issueType = await IssueType.findById(issueTypeId);
    if (!issueType || !issueType.isActive) {
      return res.status(400).json({ success: false, message: 'Invalid or inactive issue type.' });
    }

    const woreda = await Woreda.findById(woredaId);
    if (!woreda) {
      return res.status(400).json({ success: false, message: 'Woreda not found.' });
    }

    // Ensure the selected woreda belongs to the same subcity as the issue type.
    if (woreda.subcity !== issueType.subcity) {
      return res.status(400).json({
        success: false,
        message: 'The selected woreda does not belong to the issue type subcity.',
      });
    }

    const attachments = req.files ? req.files.map((f) => f.path) : [];
    const isAnon = anonymous === 'true' || anonymous === true;

    const escalationHours = parseInt(process.env.ESCALATION_HOURS || '72', 10);

    const data = {
      title,
      description,
      priority: priority || 'Medium',
      subcity: issueType.subcity,
      woredaId: woreda._id,
      woredaName: woreda.name,
      department: issueType.department,
      issueTypeId: issueType._id,
      issueTypeName: issueType.name,
      attachments,
      anonymous: isAnon,
      escalationHours,
      timeline: [{ action: 'created', description: 'Complaint submitted by citizen', performedByRole: 'citizen' }],
    };

    if (latitude) data.latitude = parseFloat(latitude);
    if (longitude) data.longitude = parseFloat(longitude);

    if (!isAnon && req.user) {
      data.reporter = req.user._id;
      data.reporterName = req.user.fullName || '';
      data.reporterPhone = req.user.phone || '';
      data.reporterEmail = req.user.email || '';
    } else {
      data.reporterName = reporterName || '';
      data.reporterPhone = reporterPhone || '';
      data.reporterEmail = reporterEmail || '';
    }

    const complaint = await WorkflowComplaint.create(data);

    // Notify woreda users assigned to this woreda
    const woredaUsers = await User.find({ role: 'woreda', woredaId: woreda._id }).select('_id');
    for (const wu of woredaUsers) {
      await createNotification({
        recipient: wu._id,
        title: 'New Complaint Assigned',
        message: `New ${issueType.department} complaint: "${title}" has been assigned to your woreda.`,
        type: 'info',
        relatedReport: complaint._id,
        relatedReportType: 'workflow_complaint',
        io: getIo(req),
      });
    }

    // Notify admins
    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const admin of admins) {
      await createNotification({
        recipient: admin._id,
        title: 'New Workflow Complaint',
        message: `${issueType.subcity} / ${woreda.name} — ${issueType.department}: "${title}"`,
        type: 'info',
        relatedReport: complaint._id,
        relatedReportType: 'workflow_complaint',
        io: getIo(req),
      });
    }

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully.',
      data: { complaint, trackingNumber: complaint.trackingNumber },
    });
  } catch (err) {
    console.error('[WorkflowComplaint] Create error:', err);
    res.status(500).json({ success: false, message: 'Failed to submit complaint.' });
  }
};


// ── GET /api/workflow-complaints ──────────────────────────────────────────────
const getWorkflowComplaints = async (req, res) => {
  try {
    const { page = 1, limit = 20, workflowStatus, department, subcity, search } = req.query;
    const query = { ...buildScope(req.user) };

    if (workflowStatus) query.workflowStatus = workflowStatus;
    if (department) query.department = department;
    if (subcity) query.subcity = subcity;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { trackingNumber: { $regex: search, $options: 'i' } },
        { issueTypeName: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await WorkflowComplaint.countDocuments(query);
    const complaints = await WorkflowComplaint.find(query)
      .populate('woredaId', 'name subcity')
      .populate('issueTypeId', 'name department subcity')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .select('-timeline');

    res.json({
      success: true,
      data: {
        complaints,
        total,
        page: parseInt(page),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/workflow-complaints/track/:trackingNumber ────────────────────────
const trackComplaint = async (req, res) => {
  try {
    const complaint = await WorkflowComplaint.findOne({ trackingNumber: req.params.trackingNumber })
      .populate('woredaId', 'name subcity')
      .populate('issueTypeId', 'name department subcity')
      .populate('reporter', 'fullName email phone')
      .populate('resolvedByWoreda', 'fullName role')
      .populate('resolvedBySubcity', 'fullName role')
      .populate('timeline.performedBy', 'fullName role');

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found.' });
    }
    res.json({ success: true, data: { complaint } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/workflow-complaints/:id ─────────────────────────────────────────
const getWorkflowComplaintById = async (req, res) => {
  try {
    const scope = buildScope(req.user);
    const complaint = await WorkflowComplaint.findOne({ _id: req.params.id, ...scope })
      .populate('woredaId', 'name subcity')
      .populate('issueTypeId', 'name department subcity')
      .populate('reporter', 'fullName email phone')
      .populate('resolvedByWoreda', 'fullName role')
      .populate('resolvedBySubcity', 'fullName role')
      .populate('timeline.performedBy', 'fullName role');

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found or not in your scope.' });
    }
    res.json({ success: true, data: { complaint } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};


// ── PATCH /api/workflow-complaints/:id/woreda-resolve ────────────────────────
// Step 2a: Woreda marks the complaint as resolved.
const woredaResolve = async (req, res) => {
  try {
    const { resolution } = req.body;
    if (!resolution) {
      return res.status(400).json({ success: false, message: 'resolution text is required.' });
    }

    const scope = buildScope(req.user);
    const complaint = await WorkflowComplaint.findOne({ _id: req.params.id, ...scope });
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found or not in your scope.' });
    }
    if (!['pending', 'pending_escalation'].includes(complaint.workflowStatus)) {
      return res.status(400).json({
        success: false,
        message: `Cannot resolve a complaint with status '${complaint.workflowStatus}'.`,
      });
    }

    const prev = complaint.workflowStatus;
    complaint.workflowStatus = 'resolved_by_woreda';
    complaint.woredaResolution = resolution;
    complaint.resolvedByWoreda = req.user._id;
    complaint.woredaResolvedAt = new Date();
    complaint.resolvedAt = new Date();

    complaint.timeline.push({
      action: 'resolved_by_woreda',
      description: resolution,
      performedBy: req.user._id,
      performedByName: req.user.fullName,
      performedByRole: req.user.role,
      previousStatus: prev,
      newStatus: 'resolved_by_woreda',
    });

    await complaint.save();

    // Notify reporter if non-anonymous
    if (complaint.reporter) {
      await createNotification({
        recipient: complaint.reporter,
        title: 'Complaint Resolved',
        message: `Your complaint ${complaint.trackingNumber} has been resolved by the woreda.`,
        type: 'success',
        relatedReport: complaint._id,
        relatedReportType: 'workflow_complaint',
        io: getIo(req),
      });
    }

    res.json({ success: true, message: 'Complaint resolved by woreda.', data: { complaint } });
  } catch (err) {
    console.error('[WorkflowComplaint] Woreda resolve error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── PATCH /api/workflow-complaints/:id/woreda-escalate ───────────────────────
// Step 2b: Woreda manually marks it as unresolved → triggers escalation.
const woredaEscalate = async (req, res) => {
  try {
    const { reason } = req.body;
    const scope = buildScope(req.user);
    const complaint = await WorkflowComplaint.findOne({ _id: req.params.id, ...scope });
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found or not in your scope.' });
    }
    if (complaint.workflowStatus !== 'pending') {
      return res.status(400).json({
        success: false,
        message: `Only pending complaints can be manually escalated (current: ${complaint.workflowStatus}).`,
      });
    }

    complaint.workflowStatus = 'pending_escalation';
    complaint.timeline.push({
      action: 'pending_escalation',
      description: reason || 'Woreda marked complaint as unresolved.',
      performedBy: req.user._id,
      performedByName: req.user.fullName,
      performedByRole: req.user.role,
      previousStatus: 'pending',
      newStatus: 'pending_escalation',
    });

    await complaint.save();

    // Immediately escalate to subcity
    await _escalateToSubcity(complaint, req.app?.get('io'));

    res.json({ success: true, message: 'Complaint escalated to subcity.', data: { complaint } });
  } catch (err) {
    console.error('[WorkflowComplaint] Woreda escalate error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};


// ── Internal helper — escalate a complaint to subcity ────────────────────────
// Used by both the manual woreda-escalate endpoint and the cron scheduler.
async function _escalateToSubcity(complaint, io) {
  if (complaint.workflowStatus === 'escalated_to_subcity') return; // already done

  const prev = complaint.workflowStatus;
  complaint.workflowStatus = 'escalated_to_subcity';
  complaint.escalatedAt = new Date();
  complaint.timeline.push({
    action: 'escalated_to_subcity',
    description: 'Complaint escalated to subcity department.',
    performedByName: 'System',
    performedByRole: 'system',
    previousStatus: prev,
    newStatus: 'escalated_to_subcity',
  });

  await complaint.save();

  // Find subcity role for the complaint's subcity
  const subcityRoleMap = {
    BOLE: 'subcity_bole',
    YEKA: 'subcity_yeka',
    LEMMI_KURA: 'subcity_lemmi_kura',
  };
  const subcityRole = subcityRoleMap[complaint.subcity];

  // Notify all subcity users for this subcity
  const subcityUsers = await User.find({ role: subcityRole }).select('_id');
  for (const su of subcityUsers) {
    await createNotification({
      recipient: su._id,
      title: 'Complaint Escalated to Your Subcity',
      message: `${complaint.department} complaint "${complaint.title}" (${complaint.trackingNumber}) has been escalated to your subcity.`,
      type: 'warning',
      relatedReport: complaint._id,
      relatedReportType: 'workflow_complaint',
      io,
    });
  }

  // Also notify department users at that subcity
  const deptUsers = await User.find({
    role: 'department',
    department: complaint.department,
    subcity: complaint.subcity,
  }).select('_id');
  for (const du of deptUsers) {
    await createNotification({
      recipient: du._id,
      title: 'Escalated Complaint — Action Required',
      message: `${complaint.department} complaint "${complaint.title}" escalated to your department.`,
      type: 'warning',
      relatedReport: complaint._id,
      relatedReportType: 'workflow_complaint',
      io,
    });
  }
}

// ── PATCH /api/workflow-complaints/:id/subcity-resolve ───────────────────────
// Step 4: Subcity department resolves an escalated complaint.
const subcityResolve = async (req, res) => {
  try {
    const { resolution } = req.body;
    if (!resolution) {
      return res.status(400).json({ success: false, message: 'resolution text is required.' });
    }

    const scope = buildScope(req.user);
    const complaint = await WorkflowComplaint.findOne({ _id: req.params.id, ...scope });
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found or not in your scope.' });
    }
    if (complaint.workflowStatus !== 'escalated_to_subcity') {
      return res.status(400).json({
        success: false,
        message: `Only escalated complaints can be resolved by subcity (current: ${complaint.workflowStatus}).`,
      });
    }

    const prev = complaint.workflowStatus;
    complaint.workflowStatus = 'resolved_by_subcity';
    complaint.subcityResolution = resolution;
    complaint.resolvedBySubcity = req.user._id;
    complaint.subcityResolvedAt = new Date();
    complaint.resolvedAt = new Date();

    complaint.timeline.push({
      action: 'resolved_by_subcity',
      description: resolution,
      performedBy: req.user._id,
      performedByName: req.user.fullName,
      performedByRole: req.user.role,
      previousStatus: prev,
      newStatus: 'resolved_by_subcity',
    });

    await complaint.save();

    if (complaint.reporter) {
      await createNotification({
        recipient: complaint.reporter,
        title: 'Complaint Resolved by Subcity',
        message: `Your complaint ${complaint.trackingNumber} has been resolved by the ${complaint.subcity.replace('_', ' ')} subcity.`,
        type: 'success',
        relatedReport: complaint._id,
        relatedReportType: 'workflow_complaint',
        io: getIo(req),
      });
    }

    res.json({ success: true, message: 'Complaint resolved by subcity.', data: { complaint } });
  } catch (err) {
    console.error('[WorkflowComplaint] Subcity resolve error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};


// ── GET /api/workflow-complaints/stats ────────────────────────────────────────
// Dashboard summary counts scoped to the logged-in user's role.
const getWorkflowStats = async (req, res) => {
  try {
    const match = buildScope(req.user);

    const [
      byStatus,
      bySubcity,
      byDepartment,
      byIssueType,
      byWoreda,
      total,
    ] = await Promise.all([
      WorkflowComplaint.aggregate([
        { $match: match },
        { $group: { _id: '$workflowStatus', count: { $sum: 1 } } },
      ]),
      WorkflowComplaint.aggregate([
        { $match: match },
        { $group: { _id: '$subcity', count: { $sum: 1 } } },
      ]),
      WorkflowComplaint.aggregate([
        { $match: match },
        { $group: { _id: '$department', count: { $sum: 1 } } },
      ]),
      WorkflowComplaint.aggregate([
        { $match: match },
        { $group: { _id: '$issueTypeName', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 15 },
      ]),
      WorkflowComplaint.aggregate([
        { $match: match },
        { $group: { _id: { woreda: '$woredaName', subcity: '$subcity' }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      WorkflowComplaint.countDocuments(match),
    ]);

    const statusMap = {};
    byStatus.forEach((s) => { statusMap[s._id] = s.count; });

    res.json({
      success: true,
      data: {
        total,
        byStatus: {
          pending: statusMap.pending || 0,
          resolved_by_woreda: statusMap.resolved_by_woreda || 0,
          pending_escalation: statusMap.pending_escalation || 0,
          escalated_to_subcity: statusMap.escalated_to_subcity || 0,
          resolved_by_subcity: statusMap.resolved_by_subcity || 0,
        },
        bySubcity: bySubcity.map((s) => ({ subcity: s._id, count: s.count })),
        byDepartment: byDepartment.map((d) => ({ department: d._id, count: d.count })),
        byIssueType: byIssueType.map((i) => ({ issueType: i._id, count: i.count })),
        byWoreda: byWoreda.map((w) => ({
          woreda: w._id.woreda,
          subcity: w._id.subcity,
          count: w.count,
        })),
      },
    });
  } catch (err) {
    console.error('[WorkflowComplaint] Stats error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── GET /api/workflow-complaints/analytics ────────────────────────────────────
// Richer analytics: daily trend + cross-tab breakdowns for charts.
const getWorkflowAnalytics = async (req, res) => {
  try {
    const match = buildScope(req.user);
    const days = parseInt(req.query.days || '30', 10);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const [trend, subcityDeptMatrix] = await Promise.all([
      WorkflowComplaint.aggregate([
        { $match: { ...match, createdAt: { $gte: since } } },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
              workflowStatus: '$workflowStatus',
            },
            count: { $sum: 1 },
          },
        },
        { $sort: { '_id.date': 1 } },
      ]),
      WorkflowComplaint.aggregate([
        { $match: match },
        {
          $group: {
            _id: { subcity: '$subcity', department: '$department', workflowStatus: '$workflowStatus' },
            count: { $sum: 1 },
          },
        },
      ]),
    ]);

    res.json({
      success: true,
      data: { trend, subcityDeptMatrix, days },
    });
  } catch (err) {
    console.error('[WorkflowComplaint] Analytics error:', err);
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getIssueTypes,
  createWorkflowComplaint,
  getWorkflowComplaints,
  getWorkflowComplaintById,
  trackComplaint,
  woredaResolve,
  woredaEscalate,
  subcityResolve,
  getWorkflowStats,
  getWorkflowAnalytics,
  _escalateToSubcity,
};
