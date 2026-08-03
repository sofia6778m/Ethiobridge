const PublicComplaint = require('../models/PublicComplaint');
const createNotification = require('../utils/createNotification');
const User = require('../models/User');
const Woreda = require('../models/Woreda');
const { verifySubmissionPassword } = require('../utils/verifySubmissionPassword');
const {
  buildComplaintScope,
  isComplaintInScope,
  COMPLAINT_SCOPED_ROLES,
} = require('../utils/scopeFilter');

const getIo = (req) => req.app?.get('io') || null;

// ── Helpers ───────────────────────────────────────────────────────────────────

// Creates the complaint and regenerates the tracking number on a duplicate-key
// collision so a concurrent submission can never be lost to a race.
const createWithTracking = async (data) => {
  try {
    return await PublicComplaint.create(data);
  } catch (err) {
    if (err && err.code === 11000) {
      delete data.trackingNumber;
      return await PublicComplaint.create(data);
    }
    throw err;
  }
};

// Normalises any subcity label used on the public complaint forms into the
// canonical scope keys used by the role-based dashboard filters. Any new
// subcity created in Subcity Management is handled by the fallback branch.
const SUBCITY_NORMALIZE = {
  BOLE: 'BOLE',
  YEKA: 'YEKA',
  LEMI: 'LEMMI_KURA',
  LEMMI: 'LEMMI_KURA',
  LEMMI_KURA: 'LEMMI_KURA',
  'LEMMI KURA': 'LEMMI_KURA',
};

const normalizeSubcity = (raw) => {
  const key = String(raw || '').trim().toUpperCase().replace(/\s+/g, '_');
  return SUBCITY_NORMALIZE[key] || key;
};

// Builds a case-insensitive regex that tolerates both underscore and space
// spellings (e.g. "LEMMI_KURA" matches "Lemmi Kura" / "lemmi_kura").
const subcityRegex = (subcity) =>
  new RegExp(`^${normalizeSubcity(subcity).replace(/[ _]+/g, '[ _]')}$`, 'i');

// @desc  List woredas for a subcity (drives the complaint form woreda dropdown)
// @route GET /api/public-complaints/subcity-woredas?subcity=<name>
// @access Public
const getSubcityWoredas = async (req, res) => {
  try {
    const raw = (req.query.subcity || '').trim();
    if (!raw) {
      return res.status(400).json({ success: false, message: 'A subcity query parameter is required' });
    }
    // Case-insensitive match against whatever name is stored in the Woreda
    // collection, tolerant of underscore/space casing differences.
    const woredas = await Woreda.find({
      subcity: subcityRegex(raw),
      status: 'Active',
    }).select('_id name departments').sort({ name: 1 });

    res.json({ success: true, woredas });
  } catch (error) {
    console.error('[PublicComplaint] getSubcityWoredas error:', error);
    res.status(500).json({ success: false, message: 'Failed to load woredas' });
  }
};

// Resolves a raw woreda name into a Woreda record (used when the complaint form
// only submits the woreda name, not its Mongo id). Returns null when not found.
const findWoreda = async (woredaId, woredaName, subcity) => {
  if (woredaId) {
    return Woreda.findById(woredaId).select('_id name subcity departments');
  }
  if (woredaName) {
    const nameRe = new RegExp(`^${String(woredaName).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const filter = { name: nameRe };
    if (subcity) filter.subcity = subcityRegex(subcity);
    return Woreda.findOne(filter).select('_id name subcity departments');
  }
  return null;
};

// Normalises the department label against the woreda's own department list
// (the same source of truth used when provisioning department accounts), so
// notifications and role scoping match exactly.
const normalizeDepartment = (woredaDoc, department) => {
  if (!department) return '';
  if (woredaDoc && Array.isArray(woredaDoc.departments) && woredaDoc.departments.length) {
    const wanted = String(department).trim().toLowerCase();
    const match = woredaDoc.departments.find((d) => String(d).toLowerCase() === wanted);
    if (match) return match;
  }
  return String(department).trim();
};

// @desc  Create a public complaint
// @route POST /api/public-complaints
// @access Public (optional auth — anonymous submissions allowed)
const createComplaint = async (req, res) => {
  try {
    const {
      title, category, description, region, city, district,
      latitude, longitude, priority, anonymous,
      reporterName, reporterPhone, reporterEmail,
      subcity, woredaId, woredaName, department,
    } = req.body;

    if (!title || !description || !region || !priority) {
      return res.status(400).json({ success: false, message: 'Title, description, region, and priority are required.' });
    }

    // Dashboard complaint form sends requirePassword — verify the submitted
    // password against the logged-in account before accepting the complaint.
    // The public page (no password field) is unaffected.
    if (req.body.requirePassword === 'true') {
      try {
        await verifySubmissionPassword(req.user, req.body.password);
      } catch (pErr) {
        return res.status(pErr.status || 400).json({ success: false, message: pErr.message });
      }
    }

    // Category is optional on the public form now — default it so existing
    // category-based stats, filters and notifications keep working.
    const safeCategory = category || 'Other';

    // ── Routing scope resolution ────────────────────────────────────────────
    const normalizedSubcity = subcity ? normalizeSubcity(subcity) : '';
    const woredaDoc = await findWoreda(woredaId, woredaName, normalizedSubcity);

    if (woredaDoc) {
      if (normalizedSubcity && !subcityRegex(normalizedSubcity).test(woredaDoc.subcity)) {
        return res.status(400).json({
          success: false,
          message: `Woreda "${woredaDoc.name}" does not belong to the selected subcity`,
        });
      }
    } else if (woredaId || (woredaName && normalizedSubcity)) {
      return res.status(400).json({
        success: false,
        message: 'The selected woreda was not found. Please refresh and try again.',
      });
    }

    const normalizedDepartment = normalizeDepartment(woredaDoc, department);

    const attachments = req.files ? req.files.map(f => f.path) : [];
    const isAnonymous = anonymous === 'true' || anonymous === true;

    const now = new Date();
    const complaintData = {
      title,
      category: safeCategory,
      description,
      region,
      city: city || '',
      district: district || '',
      priority,
      anonymous: isAnonymous,
      attachments,
      status: 'Pending',
      submittedAt: now,
      // SLA deadlines — 48 hours to Subcity, 5 days to Subcity Administrator.
      escalationDeadline: new Date(now.getTime() + 48 * 60 * 60 * 1000),
      subcityEscalationDeadline: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      timeline: [{
        action: 'created',
        description: 'Complaint submitted',
        performedByRole: isAnonymous ? 'public' : 'citizen',
        previousStatus: null,
        newStatus: 'Pending',
      }],
    };

    if (normalizedSubcity) complaintData.subcity = normalizedSubcity;
    if (woredaDoc) {
      complaintData.woredaId = woredaDoc._id;
      complaintData.woredaName = woredaDoc.name;
    } else if (woredaName) {
      complaintData.woredaName = woredaName;
    }
    if (normalizedDepartment) complaintData.department = normalizedDepartment;

    if (!isAnonymous && req.user) {
      complaintData.reporter = req.user._id;
      complaintData.citizenId = req.user._id;
      complaintData.reporterName = req.user.fullName || '';
      complaintData.reporterPhone = req.user.phone || '';
      complaintData.reporterEmail = req.user.email || '';
    } else {
      complaintData.reporterName = reporterName || '';
      complaintData.reporterPhone = reporterPhone || '';
      complaintData.reporterEmail = reporterEmail || '';
    }

    if (latitude)  complaintData.latitude  = parseFloat(latitude);
    if (longitude) complaintData.longitude = parseFloat(longitude);

    const complaint = await createWithTracking(complaintData);

    const io = getIo(req);

    // Notify the exact department user(s) matching this woreda + department
    // so the complaint appears on their dashboard immediately.
    if (woredaDoc && normalizedDepartment) {
      const deptUsers = await User.find({ role: 'department', woredaId: woredaDoc._id, department: normalizedDepartment }).select('_id');
      for (const u of deptUsers) {
        await createNotification({
          recipient: u._id,
          title: 'New Complaint for Your Department',
          message: `New ${normalizedDepartment} complaint: "${title}"`,
          type: 'info',
          relatedReport: complaint._id,
          relatedReportType: 'public_complaint',
          io,
        });
      }
    }

    // Notify the woreda manager(s) for this woreda.
    if (woredaDoc) {
      const woredaUsers = await User.find({ role: 'woreda', woredaId: woredaDoc._id }).select('_id');
      for (const u of woredaUsers) {
        await createNotification({
          recipient: u._id,
          title: 'New Complaint in Your Woreda',
          message: `New ${normalizedDepartment || safeCategory} complaint: "${title}"`,
          type: 'info',
          relatedReport: complaint._id,
          relatedReportType: 'public_complaint',
          io,
        });
      }
    }

    // Notify admins.
    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const admin of admins) {
      await createNotification({
        recipient: admin._id,
        title: 'New Public Complaint',
        message: `A new ${safeCategory} complaint has been submitted: ${title}`,
        type: 'info',
        relatedReport: complaint._id,
        relatedReportType: 'public_complaint',
        io,
      });
    }

    // Push a live refresh to every connected dashboard (admin report page etc.)
    if (io) io.emit('complaint:created', { complaint });

    res.status(201).json({
      success: true,
      message: 'Complaint submitted successfully',
      data: {
        complaint,
        trackingNumber: complaint.trackingNumber,
      },
    });
  } catch (err) {
    console.error('[PublicComplaint] Create error:', err);
    res.status(500).json({ success: false, message: 'Failed to submit complaint' });
  }
};

const getPublicComplaints = async (req, res) => {
  try {
    const { page = 1, limit = 15, status, category, priority, search } = req.query;
    const query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { trackingNumber: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { woredaName: { $regex: search, $options: 'i' } },
        { subcity: { $regex: search, $options: 'i' } },
        { department: { $regex: search, $options: 'i' } },
        { reporterName: { $regex: search, $options: 'i' } },
      ];
    }

    // Enforce role-based scope on the server — authenticated users can only
    // ever see complaints inside their assigned scope.
    if (req.user) Object.assign(query, buildComplaintScope(req.user));

    const total = await PublicComplaint.countDocuments(query);
    const complaints = await PublicComplaint.find(query)
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
    console.error('[PublicComplaint] Get all error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch complaints' });
  }
};

const getComplaintById = async (req, res) => {
  try {
    const complaint = await PublicComplaint.findById(req.params.id)
      .populate('reporter', 'fullName email phone')
      .populate('assignedTo', 'fullName organizationName')
      .populate('timeline.performedBy', 'fullName role');

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    // Logged-in users from a scoped role may not view complaints outside
    // their subcity / woreda / department / personal scope.
    if (req.user && COMPLAINT_SCOPED_ROLES.includes(req.user.role) && !isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorized to view this complaint' });
    }

    res.json({ success: true, data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Get by id error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch complaint' });
  }
};

const getByTrackingNumber = async (req, res) => {
  try {
    const complaint = await PublicComplaint.findOne({ trackingNumber: req.params.trackingNumber })
      .populate('reporter', 'fullName email phone')
      .populate('assignedTo', 'fullName organizationName')
      .populate('timeline.performedBy', 'fullName role');

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    res.json({ success: true, data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Get by tracking error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch complaint' });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { status, comment } = req.body;
    const validStatuses = ['Pending', 'Submitted', 'Under Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected', 'Closed'];

    if (!validStatuses.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const complaint = await PublicComplaint.findOne({
      _id: req.params.id,
      ...buildComplaintScope(req.user),
    });
    if (!complaint) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this complaint' });
    }

    const previousStatus = complaint.status;
    complaint.status = status;

    if (status === 'Resolved') complaint.resolvedAt = new Date();
    if (status === 'Assigned') complaint.assignedAt = new Date();

    complaint.timeline.push({
      action: 'status_changed',
      description: comment || `Status changed from ${previousStatus} to ${status}`,
      performedBy: req.user?._id,
      performedByName: req.user?.fullName || 'System',
      performedByRole: req.user?.role || 'admin',
      previousStatus,
      newStatus: status,
    });

    await complaint.save();

    const io = getIo(req);

    // Notify reporter
    if (complaint.reporter) {
      await createNotification({
        recipient: complaint.reporter,
        title: 'Complaint Status Updated',
        message: `Your complaint ${complaint.trackingNumber} status has been updated to ${status}`,
        type: 'info',
        relatedReport: complaint._id,
        relatedReportType: 'public_complaint',
        io,
      });
    }

    // Notify the department account assigned to this complaint (for actions
    // taken by admins/subcity so the responsible office stays in the loop).
    if (status === 'Assigned' && complaint.woredaId && complaint.department) {
      const deptUsers = await User.find({ role: 'department', woredaId: complaint.woredaId, department: complaint.department }).select('_id');
      for (const u of deptUsers) {
        await createNotification({
          recipient: u._id,
          title: 'Complaint Assigned to Your Department',
          message: `Complaint ${complaint.trackingNumber} has been assigned: ${complaint.title}`,
          type: 'info',
          relatedReport: complaint._id,
          relatedReportType: 'public_complaint',
          io,
        });
      }
    }

    // Live dashboard refresh.
    if (io) io.emit('complaint:updated', { complaint });

    res.json({ success: true, message: 'Status updated', data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Update status error:', err);
    res.status(500).json({ success: false, message: 'Failed to update status' });
  }
};

const getStats = async (req, res) => {
  try {
    const match = buildComplaintScope(req.user);

    const [statusCounts, categoryCounts, priorityCounts, total] = await Promise.all([
      PublicComplaint.aggregate([
        { $match: match },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      PublicComplaint.aggregate([
        { $match: match },
        { $group: { _id: '$category', count: { $sum: 1 } } },
      ]),
      PublicComplaint.aggregate([
        { $match: match },
        { $group: { _id: '$priority', count: { $sum: 1 } } },
      ]),
      PublicComplaint.countDocuments(match),
    ]);

    const byStatus = {};
    statusCounts.forEach(s => { byStatus[s._id] = s.count; });

    const byCategory = {};
    categoryCounts.forEach(c => { byCategory[c._id] = c.count; });

    const byPriority = {};
    priorityCounts.forEach(p => { byPriority[p._id] = p.count; });

    res.json({
      success: true,
      data: {
        total,
        byStatus,
        byCategory,
        byPriority,
      },
    });
  } catch (err) {
    console.error('[PublicComplaint] Stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
};

// ── Escalation helpers (used by the cron scheduler and manual admin trigger) ──

// Stage 1 — 48h SLA exceeded: escalate to the Subcity office.
async function escalateToSubcity(complaint, io) {
  if (complaint.escalatedToSubcityAt) return;
  const previousStatus = complaint.status;
  complaint.status = 'Under Review';
  complaint.escalatedToSubcityAt = new Date();
  complaint.timeline.push({
    action: 'escalated_to_subcity',
    description: 'Complaint automatically escalated to the Subcity office (48-hour deadline exceeded).',
    performedByName: 'System',
    performedByRole: 'system',
    previousStatus,
    newStatus: 'Under Review',
  });
  await complaint.save();

  const subcityRole = `subcity_${normalizeSubcity(complaint.subcity).toLowerCase()}`;
  const subcityUsers = await User.find({ role: subcityRole }).select('_id');
  for (const u of subcityUsers) {
    await createNotification({
      recipient: u._id,
      title: 'Complaint Escalated to Your Subcity',
      message: `Complaint ${complaint.trackingNumber} "${complaint.title}" has been escalated to your subcity.`,
      type: 'warning',
      relatedReport: complaint._id,
      relatedReportType: 'public_complaint',
      io,
    });
  }

  if (complaint.reporter) {
    await createNotification({
      recipient: complaint.reporter,
      title: 'Complaint Escalated',
      message: `Your complaint ${complaint.trackingNumber} has been escalated to the ${complaint.subcity} subcity office for further action.`,
      type: 'warning',
      relatedReport: complaint._id,
      relatedReportType: 'public_complaint',
      io,
    });
  }

  if (io) io.emit('complaint:updated', { complaint });
}

// Stage 2 — 5-day SLA exceeded: escalate to the Subcity Administrator.
async function escalateToSubcityAdmin(complaint, io) {
  if (complaint.escalatedToSubcityAdminAt) return;
  const previousStatus = complaint.status;
  complaint.status = 'Assigned';
  complaint.assignedAt = new Date();
  complaint.escalatedToSubcityAdminAt = new Date();
  complaint.timeline.push({
    action: 'escalated_to_subcity_admin',
    description: 'Complaint automatically escalated to the Subcity Administrator (5-day deadline exceeded).',
    performedByName: 'System',
    performedByRole: 'system',
    previousStatus,
    newStatus: 'Assigned',
  });
  await complaint.save();

  // The "Subcity Administrator" escalation is delivered to system admins —
  // the highest responsible authority in the platform.
  const admins = await User.find({ role: 'admin' }).select('_id');
  for (const admin of admins) {
    await createNotification({
      recipient: admin._id,
      title: 'Complaint Needs Administrator Attention',
      message: `Complaint ${complaint.trackingNumber} "${complaint.title}" exceeded 5 days and was escalated to you.`,
      type: 'warning',
      relatedReport: complaint._id,
      relatedReportType: 'public_complaint',
      io,
    });
  }

  if (complaint.reporter) {
    await createNotification({
      recipient: complaint.reporter,
      title: 'Complaint Escalated',
      message: `Your complaint ${complaint.trackingNumber} has been escalated to the Subcity Administrator.`,
      type: 'warning',
      relatedReport: complaint._id,
      relatedReportType: 'public_complaint',
      io,
    });
  }

  if (io) io.emit('complaint:updated', { complaint });
}

module.exports = {
  createComplaint,
  getPublicComplaints,
  getComplaintById,
  getByTrackingNumber,
  updateStatus,
  getStats,
  getSubcityWoredas,
  escalateToSubcity,
  escalateToSubcityAdmin,
};
