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

const getIo = (req) => {
  if (!req || !req.app || typeof req.app.get !== 'function') return null;
  return req.app.get('io') || null;
};

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

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
    const {
      page = 1, limit = 15, status, category, priority, search,
      subcity, woreda, department, from, to,
    } = req.query;
    const query = {};

    if (status) query.status = status;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (search) {
      const re = { $regex: escapeRegex(search), $options: 'i' };
      query.$or = [
        { title: re },
        { trackingNumber: re },
        { description: re },
        { woredaName: re },
        { subcity: re },
        { department: re },
        { reporterName: re },
        { reporterPhone: re },
      ];
    }

    // Advanced filters — subcity, woreda, department, date range.
    if (subcity) query.subcity = { $regex: `^${escapeRegex(subcity)}$`, $options: 'i' };
    if (department) query.department = { $regex: `^${escapeRegex(department)}$`, $options: 'i' };
    if (woreda) {
      // Accept a Mongo ObjectId (woredaId) or a display name (woredaName).
      if (/^[0-9a-fA-F]{24}$/.test(woreda)) query.woredaId = woreda;
      else query.woredaName = { $regex: `^${escapeRegex(woreda)}$`, $options: 'i' };
    }
    if (from || to) {
      query.createdAt = {};
      if (from) query.createdAt.$gte = new Date(`${from}T00:00:00.000Z`);
      if (to) query.createdAt.$lte = new Date(`${to}T23:59:59.999Z`);
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

    console.log(`[PublicComplaint] list returned ${complaints.length} of ${total} complaints`);

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
      .populate('assignedOfficerId', 'fullName email phone role department')
      .populate('assignedTechnicianId', 'fullName email phone role department')
      .populate('verifiedByOfficerId', 'fullName email phone role department')
      .populate('closedByAdminId', 'fullName email phone role department')
      .populate('timeline.performedBy', 'fullName role')
      .populate('internalNotes.author', 'fullName role');

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
    const validStatuses = [
      'Pending', 'Submitted', 'Under Review', 'Assigned', 'Inspector Assigned',
      'Technician Assigned', 'Technician Requested', 'In Progress',
      'Awaiting Verification', 'Rework Required', 'Escalated to Subcity',
      'Resolved', 'Rejected', 'Closed', 'Reopened',
    ];

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
    if (status === 'Closed') complaint.closedAt = new Date();
    if (status === 'Reopened') { complaint.closedAt = null; }
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

    // Notify reporter (in-app + email/SMS when configured)
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

// Roles eligible to be assigned as the complaint "officer". Only dedicated
// OFFICER accounts may fill this role — managers and legacy department
// accounts are never offered in the dropdown.
const OFFICER_ASSIGNABLE_ROLES = ['OFFICER'];

// Roles eligible to be assigned as the field "technician". Only dedicated
// TECHNICIAN / CONTRACTOR accounts may fill this role — a Department Admin is
// never offered in the dropdown.
const TECHNICIAN_ASSIGNABLE_ROLES = ['TECHNICIAN', 'CONTRACTOR'];

// Does a field-staff member (officer / technician) belong to the same
// administrative scope as the complaint?
//   • Woreda-level staff  — must share the complaint's woredaId, and the
//     department when both sides carry one.
//   • Subcity-level staff — no woredaId; must share the complaint's subcity.
//   • Locationless staff  — allowed (legacy / global accounts).
const matchesComplaintLocation = (user, complaint) => {
  if (!user || !complaint) return false;

  if (!user.woredaId) {
    if (user.subcity && complaint.subcity) {
      return normalizeSubcity(user.subcity) === normalizeSubcity(complaint.subcity);
    }
    return true;
  }

  if (!complaint.woredaId) return false;
  if (String(user.woredaId) !== String(complaint.woredaId)) return false;
  if (user.department && complaint.department) {
    return String(user.department).toLowerCase() === String(complaint.department).toLowerCase();
  }
  return true;
};

// @desc  Assign an officer to a complaint
// @route PUT /api/public-complaints/:id/assign-officer
// @access Complaint managers
const assignOfficer = async (req, res) => {
  try {
    const { officerId, note } = req.body;
    if (!officerId) {
      return res.status(400).json({ success: false, message: 'An officer must be selected.' });
    }

    const officer = await User.findOne({ _id: officerId, isActive: true }).select('-password');
    if (!officer) {
      return res.status(404).json({ success: false, message: 'Officer not found or inactive.' });
    }
    if (!OFFICER_ASSIGNABLE_ROLES.includes(officer.role)) {
      return res.status(400).json({ success: false, message: 'The selected user is not an eligible officer.' });
    }

    const complaint = await PublicComplaint.findOne({
      _id: req.params.id,
      ...buildComplaintScope(req.user),
    });
    if (!complaint) {
      return res.status(403).json({ success: false, message: 'Not authorized to assign this complaint.' });
    }
    if (!matchesComplaintLocation(officer, complaint)) {
      return res.status(400).json({
        success: false,
        message: 'The selected officer does not cover this complaint\'s woreda / department.',
      });
    }

    const previousStatus = complaint.status;
    complaint.assignedOfficerId = officer._id;
    complaint.assignedOfficerName = officer.fullName;
    complaint.assignedOfficerAt = new Date();
    complaint.officerAccepted = false;
    complaint.officerAcceptedAt = null;
    if (['Pending', 'Submitted', 'Under Review'].includes(previousStatus)) {
      complaint.status = 'Under Review';
    }
    complaint.timeline.push({
      action: 'officer_assigned',
      description: note || `Complaint assigned to officer ${officer.fullName}.`,
      performedBy: req.user?._id,
      performedByName: req.user?.fullName || 'System',
      performedByRole: req.user?.role || 'admin',
      previousStatus,
      newStatus: complaint.status,
    });

    await complaint.save();

    const io = getIo(req);
    await createNotification({
      recipient: officer._id,
      title: 'Complaint Assigned to You',
      message: `Complaint ${complaint.trackingNumber} "${complaint.title}" has been assigned to you.`,
      type: 'info',
      relatedReport: complaint._id,
      relatedReportType: 'public_complaint',
      io,
    });
    if (complaint.reporter) {
      await createNotification({
        recipient: complaint.reporter,
        title: 'Complaint Assigned',
        message: `Your complaint ${complaint.trackingNumber} has been assigned to ${officer.fullName}.`,
        type: 'info',
        relatedReport: complaint._id,
        relatedReportType: 'public_complaint',
        io,
      });
    }
    if (io) io.emit('complaint:updated', { complaint });

    res.json({ success: true, message: 'Officer assigned', data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Assign officer error:', err);
    res.status(500).json({ success: false, message: 'Failed to assign officer' });
  }
};

// @desc  Assign a technician to a complaint (with due date + work instruction)
// @route PUT /api/public-complaints/:id/assign-technician
// @access Complaint managers
const assignTechnician = async (req, res) => {
  try {
    const { technicianId, dueDate, workInstruction } = req.body;
    if (!technicianId) {
      return res.status(400).json({ success: false, message: 'A technician must be selected.' });
    }

    const technician = await User.findOne({ _id: technicianId, isActive: true }).select('-password');
    if (!technician) {
      return res.status(404).json({ success: false, message: 'Technician not found or inactive.' });
    }
    if (!TECHNICIAN_ASSIGNABLE_ROLES.includes(technician.role)) {
      return res.status(400).json({ success: false, message: 'The selected user is not eligible as a technician.' });
    }

    const complaint = await PublicComplaint.findOne({
      _id: req.params.id,
      ...buildComplaintScope(req.user),
    });
    if (!complaint) {
      return res.status(403).json({ success: false, message: 'Not authorized to assign this complaint.' });
    }
    if (!matchesComplaintLocation(technician, complaint)) {
      return res.status(400).json({
        success: false,
        message: 'The selected technician does not cover this complaint\'s woreda / department.',
      });
    }

    const previousStatus = complaint.status;
    complaint.assignedTechnicianId = technician._id;
    complaint.assignedTechnicianName = technician.fullName;
    complaint.assignedTechnicianAt = new Date();
    complaint.technicianWorkState = 'ASSIGNED';
    complaint.technicianWorkStateUpdatedAt = new Date();
    complaint.technicianRequested = false;
    if (dueDate) complaint.dueDate = new Date(dueDate);
    if (workInstruction) complaint.workInstruction = String(workInstruction).trim();
    complaint.status = 'Technician Assigned';
    complaint.timeline.push({
      action: 'technician_assigned',
      description: `Assigned to technician ${technician.fullName}${dueDate ? ` (due ${new Date(dueDate).toISOString().slice(0, 10)})` : ''}. ${workInstruction ? `Work: ${workInstruction}` : ''}`.trim(),
      performedBy: req.user?._id,
      performedByName: req.user?.fullName || 'System',
      performedByRole: req.user?.role || 'admin',
      previousStatus,
      newStatus: complaint.status,
    });

    await complaint.save();

    const io = getIo(req);
    await createNotification({
      recipient: technician._id,
      title: 'Work Order Assigned',
      message: `Complaint ${complaint.trackingNumber} "${complaint.title}" assigned to you${dueDate ? `, due ${new Date(dueDate).toISOString().slice(0, 10)}` : ''}.`,
      type: 'info',
      relatedReport: complaint._id,
      relatedReportType: 'public_complaint',
      io,
    });
    if (complaint.reporter) {
      await createNotification({
        recipient: complaint.reporter,
        title: 'Technician Assigned',
        message: `A technician (${technician.fullName}) has been assigned to your complaint ${complaint.trackingNumber}.`,
        type: 'info',
        relatedReport: complaint._id,
        relatedReportType: 'public_complaint',
        io,
      });
    }
    if (io) io.emit('complaint:updated', { complaint });

    res.json({ success: true, message: 'Technician assigned', data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Assign technician error:', err);
    res.status(500).json({ success: false, message: 'Failed to assign technician' });
  }
};

// ── Officer acceptance ────────────────────────────────────────────────────────

// @desc  Officer accepts their assignment on a complaint
// @route PUT /api/public-complaints/:id/accept-officer
// @access Assigned officer
const acceptOfficerAssignment = async (req, res) => {
  try {
    const complaint = await PublicComplaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }
    if (String(complaint.assignedOfficerId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'You are not the assigned officer for this complaint.' });
    }
    if (complaint.officerAccepted) {
      return res.status(400).json({ success: false, message: 'Assignment already accepted.' });
    }

    const previousStatus = complaint.status;
    complaint.officerAccepted = true;
    complaint.officerAcceptedAt = new Date();
    complaint.timeline.push({
      action: 'officer_accepted',
      description: `${req.user.fullName || 'Officer'} accepted the assignment.`,
      performedBy: req.user._id,
      performedByName: req.user.fullName || 'System',
      performedByRole: req.user.role || 'OFFICER',
      previousStatus,
      newStatus: complaint.status,
    });

    await complaint.save();

    const io = getIo(req);

    // Notify the department admin / woreda office that the officer is on it.
    if (complaint.woredaId && complaint.department) {
      const managers = await User.find({
        role: { $in: ['DEPARTMENT_ADMIN', 'department'] },
        woredaId: complaint.woredaId,
        department: complaint.department,
      }).select('_id');
      for (const m of managers) {
        await createNotification({
          recipient: m._id,
          title: 'Officer Accepted Complaint',
          message: `${req.user.fullName} accepted complaint ${complaint.trackingNumber}.`,
          type: 'info',
          relatedReport: complaint._id,
          relatedReportType: 'public_complaint',
          io,
        });
      }
    }
    if (io) io.emit('complaint:updated', { complaint });

    res.json({ success: true, message: 'Assignment accepted', data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Accept officer error:', err);
    res.status(500).json({ success: false, message: 'Failed to accept assignment' });
  }
};

// ── Technician work-order state machine ───────────────────────────────────────

// Allowed work-order transitions for a technician:
//   ASSIGNED → ACCEPTED → ON_THE_WAY → WORK_STARTED → WORK_PAUSED ⇄ WORK_STARTED
//                                                              → WORK_COMPLETED
const WORK_STATE_TRANSITIONS = {
  ASSIGNED: ['ACCEPTED'],
  ACCEPTED: ['ON_THE_WAY'],
  ON_THE_WAY: ['WORK_STARTED'],
  WORK_STARTED: ['WORK_PAUSED', 'WORK_COMPLETED'],
  WORK_PAUSED: ['WORK_STARTED'],
  WORK_COMPLETED: [],
};

// @desc  Technician advances / pauses their work order
// @route PUT /api/public-complaints/:id/technician-work-state
// @access Assigned technician
const updateTechnicianWorkState = async (req, res) => {
  try {
    const { workState, note } = req.body;
    if (!workState || !WORK_STATE_TRANSITIONS[workState]) {
      return res.status(400).json({ success: false, message: 'Invalid work state.' });
    }

    const complaint = await PublicComplaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }
    if (String(complaint.assignedTechnicianId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'You are not the assigned technician for this complaint.' });
    }

    const current = complaint.technicianWorkState || 'ASSIGNED';
    if (!WORK_STATE_TRANSITIONS[current].includes(workState)) {
      return res.status(400).json({
        success: false,
        message: `Cannot move from ${current} to ${workState}.`,
      });
    }

    const previousStatus = complaint.status;
    complaint.technicianWorkState = workState;
    complaint.technicianWorkStateUpdatedAt = new Date();
    complaint.workNotes.push({
      note: note || `Work state changed to ${workState}.`,
      by: req.user._id,
      byName: req.user.fullName || 'System',
      byRole: req.user.role || 'TECHNICIAN',
    });
    complaint.timeline.push({
      action: 'technician_work_state',
      description: `${req.user.fullName || 'Technician'} ${workState === 'WORK_COMPLETED' ? 'completed the work' : `moved the work to ${workState}`}${note ? ` — ${note}` : ''}.`,
      performedBy: req.user._id,
      performedByName: req.user.fullName || 'System',
      performedByRole: req.user.role || 'TECHNICIAN',
      previousStatus,
      newStatus: previousStatus,
    });

    // Completing the work moves the complaint to officer verification.
    if (workState === 'WORK_COMPLETED') {
      complaint.status = 'Awaiting Verification';
      complaint.technicianRequested = true;
      complaint.technicianRequestedAt = new Date();
      complaint.timeline[complaint.timeline.length - 1].newStatus = 'Awaiting Verification';
    }

    await complaint.save();

    const io = getIo(req);
    if (workState === 'WORK_COMPLETED') {
      const recipients = [];
      if (complaint.assignedOfficerId) recipients.push(complaint.assignedOfficerId);
      if (complaint.woredaId && complaint.department) {
        const managers = await User.find({
          role: { $in: ['DEPARTMENT_ADMIN', 'department'] },
          woredaId: complaint.woredaId,
          department: complaint.department,
        }).select('_id');
        managers.forEach((m) => recipients.push(m._id));
      }
      const seen = new Set();
      for (const r of recipients) {
        if (seen.has(String(r))) continue;
        seen.add(String(r));
        await createNotification({
          recipient: r,
          title: 'Work Completed — Awaiting Verification',
          message: `Complaint ${complaint.trackingNumber} work is complete and awaiting your verification.`,
          type: 'info',
          relatedReport: complaint._id,
          relatedReportType: 'public_complaint',
          io,
        });
      }
    }
    if (io) io.emit('complaint:updated', { complaint });

    res.json({ success: true, message: 'Work state updated', data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Work state error:', err);
    res.status(500).json({ success: false, message: 'Failed to update work state' });
  }
};

// ── Verification (assigned officer) ───────────────────────────────────────────

// @desc  Officer verifies the completed work (approves or sends back for rework)
// @route PUT /api/public-complaints/:id/verify
// @access Assigned officer
const verifyWork = async (req, res) => {
  try {
    const { verified, note } = req.body;
    if (verified === undefined) {
      return res.status(400).json({ success: false, message: 'A verification decision is required.' });
    }
    if (!note || !String(note).trim()) {
      return res.status(400).json({ success: false, message: 'A verification note is required.' });
    }

    const complaint = await PublicComplaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }
    if (String(complaint.assignedOfficerId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'You are not the assigned officer for this complaint.' });
    }
    if (complaint.status !== 'Awaiting Verification' && complaint.status !== 'Technician Assigned' && complaint.status !== 'Assigned') {
      return res.status(400).json({ success: false, message: `Cannot verify a complaint in "${complaint.status}" status.` });
    }

    const previousStatus = complaint.status;
    const isApproved = verified === true || verified === 'true';
    complaint.verifiedByOfficerId = req.user._id;
    complaint.verifiedAt = new Date();
    complaint.verificationNote = String(note).trim();

    let notifyRecipients = [];
    if (isApproved) {
      complaint.status = 'Resolved';
      complaint.resolvedAt = new Date();
      if (complaint.assignedTechnicianId) notifyRecipients.push(complaint.assignedTechnicianId);
      if (complaint.reporter) notifyRecipients.push(complaint.reporter);
      complaint.timeline.push({
        action: 'verified',
        description: `${req.user.fullName || 'Officer'} verified the work. Complaint resolved.`,
        performedBy: req.user._id,
        performedByName: req.user.fullName || 'System',
        performedByRole: req.user.role || 'OFFICER',
        previousStatus,
        newStatus: 'Resolved',
      });
    } else {
      complaint.status = 'Rework Required';
      complaint.technicianWorkState = 'ASSIGNED';
      complaint.technicianWorkStateUpdatedAt = new Date();
      complaint.technicianRequested = false;
      complaint.technicianRequestedAt = null;
      if (complaint.assignedTechnicianId) notifyRecipients.push(complaint.assignedTechnicianId);
      complaint.timeline.push({
        action: 'rework_required',
        description: `${req.user.fullName || 'Officer'} requested rework: ${String(note).trim()}.`,
        performedBy: req.user._id,
        performedByName: req.user.fullName || 'System',
        performedByRole: req.user.role || 'OFFICER',
        previousStatus,
        newStatus: 'Rework Required',
      });
    }

    await complaint.save();

    const io = getIo(req);
    const seen = new Set();
    for (const r of notifyRecipients) {
      if (!r || seen.has(String(r))) continue;
      seen.add(String(r));
      await createNotification({
        recipient: r,
        title: isApproved ? 'Complaint Resolved' : 'Rework Required',
        message: isApproved
          ? `Complaint ${complaint.trackingNumber} has been verified and resolved.`
          : `Complaint ${complaint.trackingNumber} was sent back for rework: ${String(note).trim()}`,
        type: isApproved ? 'success' : 'warning',
        relatedReport: complaint._id,
        relatedReportType: 'public_complaint',
        io,
      });
    }
    if (io) io.emit('complaint:updated', { complaint });

    res.json({
      success: true,
      message: isApproved ? 'Complaint verified and resolved' : 'Rework requested',
      data: { complaint },
    });
  } catch (err) {
    console.error('[PublicComplaint] Verify error:', err);
    res.status(500).json({ success: false, message: 'Failed to verify complaint' });
  }
};

// ── Closure (department admin) ────────────────────────────────────────────────

// @desc  Department admin closes a resolved complaint
// @route PUT /api/public-complaints/:id/close
// @access Complaint managers (department admin + admins)
const closeComplaint = async (req, res) => {
  try {
    const { note } = req.body;
    const complaint = await PublicComplaint.findOne({
      _id: req.params.id,
      ...buildComplaintScope(req.user),
    });
    if (!complaint) {
      return res.status(403).json({ success: false, message: 'Not authorized to close this complaint.' });
    }
    if (!['Resolved', 'Closed'].includes(complaint.status)) {
      return res.status(400).json({
        success: false,
        message: `Only a resolved complaint can be closed (current status: ${complaint.status}).`,
      });
    }
    if (complaint.status === 'Closed') {
      return res.status(400).json({ success: false, message: 'Complaint is already closed.' });
    }

    const previousStatus = complaint.status;
    complaint.status = 'Closed';
    complaint.closedAt = new Date();
    complaint.closedByAdminId = req.user._id;
    complaint.closedByAdminName = req.user.fullName || 'System';
    complaint.timeline.push({
      action: 'closed',
      description: note || `Complaint closed by ${req.user.fullName || 'department admin'}.`,
      performedBy: req.user._id,
      performedByName: req.user.fullName || 'System',
      performedByRole: req.user.role || 'DEPARTMENT_ADMIN',
      previousStatus,
      newStatus: 'Closed',
    });

    await complaint.save();

    const io = getIo(req);
    if (complaint.reporter) {
      await createNotification({
        recipient: complaint.reporter,
        title: 'Complaint Closed',
        message: `Your complaint ${complaint.trackingNumber} has been closed. Thank you for reporting.`,
        type: 'success',
        relatedReport: complaint._id,
        relatedReportType: 'public_complaint',
        io,
      });
    }
    if (complaint.assignedOfficerId) {
      await createNotification({
        recipient: complaint.assignedOfficerId,
        title: 'Complaint Closed',
        message: `Complaint ${complaint.trackingNumber} you handled has been closed.`,
        type: 'info',
        relatedReport: complaint._id,
        relatedReportType: 'public_complaint',
        io,
      });
    }
    if (complaint.assignedTechnicianId) {
      await createNotification({
        recipient: complaint.assignedTechnicianId,
        title: 'Complaint Closed',
        message: `Complaint ${complaint.trackingNumber} you worked on has been closed.`,
        type: 'info',
        relatedReport: complaint._id,
        relatedReportType: 'public_complaint',
        io,
      });
    }
    if (io) io.emit('complaint:updated', { complaint });

    res.json({ success: true, message: 'Complaint closed', data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Close error:', err);
    res.status(500).json({ success: false, message: 'Failed to close complaint' });
  }
};

// @desc  Manually escalate a complaint to the Subcity office (Forward to Subcity)
// @route PUT /api/public-complaints/:id/escalate
// @access Complaint managers
const escalateToSubcityManual = async (req, res) => {
  try {
    const { reason, targetDepartment, note } = req.body;
    if (!reason || !String(reason).trim()) {
      return res.status(400).json({ success: false, message: 'An escalation reason is required.' });
    }

    const complaint = await PublicComplaint.findOne({
      _id: req.params.id,
      ...buildComplaintScope(req.user),
    });
    if (!complaint) {
      return res.status(403).json({ success: false, message: 'Not authorized to escalate this complaint.' });
    }

    const previousStatus = complaint.status;
    const dept = String(targetDepartment || complaint.department || '').trim();
    complaint.status = 'Escalated to Subcity';
    complaint.assignedLevel = 'SUBCITY';
    complaint.escalationReason = String(reason).trim();
    complaint.escalatedToSubcity = true;
    complaint.escalatedToSubcityAt = new Date();
    if (dept) complaint.department = dept;
    complaint.timeline.push({
      action: 'escalated_to_subcity',
      description: `Escalated to Subcity${dept ? ` (${dept})` : ''}: ${String(reason).trim()}${note ? ` — ${note}` : ''}`,
      performedBy: req.user?._id,
      performedByName: req.user?.fullName || 'System',
      performedByRole: req.user?.role || 'admin',
      previousStatus,
      newStatus: complaint.status,
    });

    await complaint.save();

    const io = getIo(req);

    // Notify the subcity office (subcity role accounts for this subcity).
    const subcityRole = `subcity_${normalizeSubcity(complaint.subcity).toLowerCase()}`;
    const subcityUsers = await User.find({ role: subcityRole }).select('_id');
    for (const u of subcityUsers) {
      await createNotification({
        recipient: u._id,
        title: 'Complaint Escalated to Your Subcity',
        message: `Complaint ${complaint.trackingNumber} "${complaint.title}" was escalated to the ${complaint.subcity} subcity office.`,
        type: 'warning',
        relatedReport: complaint._id,
        relatedReportType: 'public_complaint',
        io,
      });
    }

    // Notify the department account for the target subcity department.
    if (dept) {
      const deptUsers = await User.find({ role: 'department', department: dept, isActive: true }).select('_id');
      for (const u of deptUsers) {
        await createNotification({
          recipient: u._id,
          title: 'Escalated Complaint in Your Department',
          message: `Complaint ${complaint.trackingNumber} escalated to Subcity (${dept}).`,
          type: 'warning',
          relatedReport: complaint._id,
          relatedReportType: 'public_complaint',
          io,
        });
      }
    }

    if (complaint.reporter) {
      await createNotification({
        recipient: complaint.reporter,
        title: 'Complaint Escalated',
        message: `Your complaint ${complaint.trackingNumber} has been escalated to the ${complaint.subcity} subcity office.`,
        type: 'warning',
        relatedReport: complaint._id,
        relatedReportType: 'public_complaint',
        io,
      });
    }
    if (io) io.emit('complaint:updated', { complaint });

    res.json({ success: true, message: 'Complaint escalated to subcity', data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Escalate error:', err);
    res.status(500).json({ success: false, message: 'Failed to escalate complaint' });
  }
};

// @desc  Add an internal (staff-only) note to a complaint
// @route POST /api/public-complaints/:id/internal-notes
// @access Complaint managers
const addInternalNote = async (req, res) => {
  try {
    const { note } = req.body;
    if (!note || !String(note).trim()) {
      return res.status(400).json({ success: false, message: 'Note text is required.' });
    }

    const complaint = await PublicComplaint.findOne({
      _id: req.params.id,
      ...buildComplaintScope(req.user),
    });
    if (!complaint) {
      return res.status(403).json({ success: false, message: 'Not authorized to add a note.' });
    }

    complaint.internalNotes.push({
      body: String(note).trim(),
      author: req.user?._id || null,
      authorName: req.user?.fullName || 'System',
      authorRole: req.user?.role || 'admin',
    });
    complaint.timeline.push({
      action: 'note_added',
      description: 'An internal note was added.',
      performedBy: req.user?._id,
      performedByName: req.user?.fullName || 'System',
      performedByRole: req.user?.role || 'admin',
      previousStatus: complaint.status,
      newStatus: complaint.status,
    });

    await complaint.save();

    const io = getIo(req);
    if (io) io.emit('complaint:updated', { complaint });

    res.json({ success: true, message: 'Internal note added', data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Add note error:', err);
    res.status(500).json({ success: false, message: 'Failed to add internal note' });
  }
};

// @desc  List users eligible for officer / technician assignment
// @route GET /api/public-complaints/assignable-users?complaintId=<id>
// @access Complaint managers
// When a complaintId is supplied the lists are filtered to field staff that
// cover that complaint's woreda / department, so the dropdowns only ever
// present eligible officers and technicians.
const getAssignableUsers = async (req, res) => {
  try {
    let complaintFilter = null;
    if (req.query.complaintId) {
      complaintFilter = await PublicComplaint.findById(req.query.complaintId)
        .select('subcity woredaId department')
        .lean();
      if (!complaintFilter) {
        return res.status(404).json({ success: false, message: 'Complaint not found' });
      }
    }

    const [officers, technicians] = await Promise.all([
      User.find({ role: { $in: OFFICER_ASSIGNABLE_ROLES }, isActive: true })
        .select('_id fullName email phone role department subcity woredaId woredaName')
        .sort({ fullName: 1 })
        .lean(),
      User.find({ role: { $in: TECHNICIAN_ASSIGNABLE_ROLES }, isActive: true })
        .select('_id fullName email phone role department subcity woredaId woredaName')
        .sort({ fullName: 1 })
        .lean(),
    ]);

    const eligible = complaintFilter
      ? (u) => matchesComplaintLocation(u, complaintFilter)
      : () => true;

    res.json({
      success: true,
      data: {
        officers: officers.filter(eligible),
        technicians: technicians.filter(eligible),
      },
    });
  } catch (err) {
    console.error('[PublicComplaint] Assignable users error:', err);
    res.status(500).json({ success: false, message: 'Failed to load assignable users' });
  }
};

const getStats = async (req, res) => {
  try {
    const match = buildComplaintScope(req.user);

    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const since30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

    const [
      statusCounts, categoryCounts, priorityCounts, subcityCounts, departmentCounts,
      trendRows, total,
    ] = await Promise.all([
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
      PublicComplaint.aggregate([
        { $match: match },
        { $group: { _id: '$subcity', count: { $sum: 1 } } },
      ]),
      PublicComplaint.aggregate([
        { $match: match },
        { $group: { _id: '$department', count: { $sum: 1 } } },
      ]),
      PublicComplaint.aggregate([
        {
          $match: {
            ...match,
            status: 'Resolved',
            resolvedAt: { $gte: since30d },
          },
        },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$resolvedAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      PublicComplaint.countDocuments(match),
    ]);

    const byStatus = {};
    statusCounts.forEach(s => { byStatus[s._id] = s.count; });

    const byCategory = {};
    categoryCounts.forEach(c => { byCategory[c._id] = c.count; });

    const byPriority = {};
    priorityCounts.forEach(p => { byPriority[p._id] = p.count; });

    const bySubcity = {};
    subcityCounts.forEach(s => { bySubcity[s._id || 'Unknown'] = s.count; });

    const byDepartment = {};
    departmentCounts.forEach(d => { byDepartment[d._id || 'General'] = d.count; });

    const resolutionTrend = trendRows.map((r) => ({ date: r._id, count: r.count }));

    // Dashboard summary counts.
    const pendingStatuses = ['Pending', 'Submitted'];
    const underReviewStatuses = ['Under Review', 'Assigned', 'Inspector Assigned'];
    const inProgressStatuses = ['In Progress', 'Technician Assigned'];
    const openStatuses = { $nin: ['Resolved', 'Rejected', 'Closed'] };
    const resolvedToday = await PublicComplaint.countDocuments({
      ...match,
      status: 'Resolved',
      resolvedAt: { $gte: startOfToday },
    });
    const closed = await PublicComplaint.countDocuments({ ...match, status: 'Closed' });
    const overdue = await PublicComplaint.countDocuments({
      ...match,
      status: openStatuses,
      escalationDeadline: { $lt: now },
    });

    const summary = {
      total,
      pending: pendingStatuses.reduce((a, s) => a + (byStatus[s] || 0), 0),
      underReview: underReviewStatuses.reduce((a, s) => a + (byStatus[s] || 0), 0),
      inProgress: inProgressStatuses.reduce((a, s) => a + (byStatus[s] || 0), 0),
      escalated: (byStatus['Escalated to Subcity'] || 0),
      resolvedToday,
      closed,
      overdue,
    };

    res.json({
      success: true,
      data: {
        total,
        byStatus,
        byCategory,
        byPriority,
        bySubcity,
        byDepartment,
        resolutionTrend,
        summary,
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
  assignOfficer,
  assignTechnician,
  acceptOfficerAssignment,
  updateTechnicianWorkState,
  verifyWork,
  closeComplaint,
  escalateToSubcityManual,
  addInternalNote,
  getAssignableUsers,
  getStats,
  getSubcityWoredas,
  escalateToSubcity,
  escalateToSubcityAdmin,
};
