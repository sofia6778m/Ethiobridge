const PublicComplaint = require('../models/PublicComplaint');
const createNotification = require('../utils/createNotification');
const User = require('../models/User');
const Woreda = require('../models/Woreda');
const Department = require('../models/Department');
const { sendEmail } = require('../services/emailService');
const { sendSms } = require('../services/smsService');
const { logAction } = require('../middleware/auditLog');
const { normalizeDepartmentName } = require('../utils/departmentNames');
const { verifySubmissionPassword } = require('../utils/verifySubmissionPassword');
const { findDepartmentRecipients, departmentMatchFilter } = require('../utils/departmentRecipients');
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

// Delivers a citizen-facing update through every channel that applies:
//   • in-app notification  — when the reporter is a logged-in account
//   • SMS                  — when a reporter phone was provided
//   • email                — when a reporter email was provided
//   • publicNotifications  — stored feed shown on the public tracking page
// Every channel is defensive: an unconfigured SMS/email provider is a no-op.
const notifyReporter = async (complaint, io, { event, title, message, type }) => {
  try {
    const channels = ['in-app'];
    if (complaint.reporter) {
      await createNotification({
        recipient: complaint.reporter,
        title,
        message,
        type: type || 'complaint_status',
        relatedReport: complaint._id,
        relatedReportType: 'public_complaint',
        io,
      });
    }
    if (complaint.reporterPhone) {
      channels.push('sms');
      await sendSms({ to: complaint.reporterPhone, message });
    }
    if (complaint.reporterEmail) {
      channels.push('email');
      await sendEmail({ to: complaint.reporterEmail, subject: title, text: message });
    }
    complaint.publicNotifications.push({
      event,
      title,
      message,
      channels: channels.join(', '),
      at: new Date(),
    });
  } catch (err) {
    console.error('[PublicComplaint] Reporter notification error:', err.message);
  }
};

// Records every workflow action in the central AuditLog collection.
const auditComplaint = async (req, action, complaint, details) => {
  await logAction({
    user: req?.user || null,
    action,
    resource: 'public_complaint',
    resourceId: complaint?._id,
    details: details || `${action} on complaint ${complaint?.trackingNumber || ''}`,
    req,
  });
};

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
    return Woreda.findById(woredaId).select('_id name subcity subcityId departments');
  }
  if (woredaName) {
    const nameRe = new RegExp(`^${String(woredaName).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i');
    const filter = { name: nameRe };
    if (subcity) filter.subcity = subcityRegex(subcity);
    return Woreda.findOne(filter).select('_id name subcity subcityId departments');
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

// Resolves the live Department record for a complaint so role scoping (e.g. the
// department_officer role) can match on departmentId. Prefers the woreda-level
// record, then falls back to the subcity-level record with the same name.
const findDepartmentRef = async (woredaDoc, normalizedDepartment) => {
  if (!normalizedDepartment) return null;
  const subcityId = woredaDoc && woredaDoc.subcityId;
  if (!subcityId) return null;
  const nameRe = new RegExp(`^${escapeRegex(normalizeDepartmentName(normalizedDepartment))}$`, 'i');
  const base = { status: 'Active', subcityId, $or: [{ normalizedDepartmentName: nameRe }, { name: nameRe }] };
  let department = await Department.findOne({ ...base, woredaId: woredaDoc._id }).select('_id').lean();
  if (!department) {
    department = await Department.findOne({ ...base, woredaId: null }).select('_id').lean();
  }
  return department;
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
      report_type: 'public_complaint',
      title,
      category: safeCategory,
      description,
      region,
      city: city || '',
      district: district || '',
      priority,
      anonymous: isAnonymous,
      attachments,
      status: 'Submitted',
      submittedAt: now,
      // SLA deadlines — 48 hours to Subcity, 5 days to Subcity Administrator.
      escalationDeadline: new Date(now.getTime() + 48 * 60 * 60 * 1000),
      subcityEscalationDeadline: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      timeline: [{
        action: 'created',
        description: 'Complaint submitted',
        performedByRole: isAnonymous ? 'public' : 'citizen',
        previousStatus: null,
        newStatus: 'Submitted',
      }],
    };

    if (normalizedSubcity) complaintData.subcity = normalizedSubcity;
    if (woredaDoc) {
      complaintData.woredaId = woredaDoc._id;
      complaintData.woredaName = woredaDoc.name;
      if (woredaDoc.subcityId) complaintData.subcityId = woredaDoc.subcityId;
    } else if (woredaName) {
      complaintData.woredaName = woredaName;
    }
    if (normalizedDepartment) complaintData.department = normalizedDepartment;

    // Live subcity/department references let role scoping match on ObjectIds
    // (department_officer sees only complaints with the same subcityId,
    // woredaId AND departmentId as their account).
    const departmentRef = await findDepartmentRef(woredaDoc, normalizedDepartment);
    if (departmentRef) complaintData.departmentId = departmentRef._id;

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

    // Notify the exact department account(s) matching this woreda + department
    // so the complaint appears on their dashboard immediately. Both the legacy
    // `department` role and the canonical `department_officer` role are reached.
    if (woredaDoc && normalizedDepartment) {
      const deptUsers = await findDepartmentRecipients({ woredaId: woredaDoc._id, department: normalizedDepartment, departmentId: complaint.departmentId });
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

    // Notify the citizen: SMS + email with their tracking number, plus the
    // in-app notification when they were logged in. Stored on the complaint
    // so the public tracking page can replay the full notification history.
    await notifyReporter(complaint, io, {
      event: 'Complaint submitted',
      title: `Complaint ${complaint.trackingNumber} submitted`,
      message: `Your complaint "${title}" was received and routed to the ${normalizedDepartment || safeCategory} department in ${normalizedSubcity || region}. Track it with ID ${complaint.trackingNumber}.`,
      type: 'complaint_status',
    });
    await complaint.save();

    await auditComplaint(req, 'complaint_created', complaint,
      `Complaint submitted${isAnonymous ? ' anonymously' : ` by ${complaint.reporterName || 'citizen'}`}: ${title} → ${normalizedDepartment || safeCategory}`);

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
    // Hard discriminator: this list feeds the Public Complaints tab (and public
    // complaint pages) only, so it must never surface records from any other
    // report type.
    const query = { report_type: 'public_complaint' };

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

    if (req.user) {
      await auditComplaint(req, 'complaint_viewed', complaint, `Complaint viewed by ${req.user.fullName || req.user.role}`);
    }

    res.json({ success: true, data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Get by id error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch complaint' });
  }
};

const getByTrackingNumber = async (req, res) => {
  try {
    const complaint = await PublicComplaint.findOne({
      trackingNumber: { $regex: `^${escapeRegex(req.params.trackingNumber)}$`, $options: 'i' },
    })
      .select('-internalNotes')
      .populate('reporter', 'fullName email phone')
      .populate('assignedTo', 'fullName organizationName')
      .populate('timeline.performedBy', 'fullName role');

    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

    // Citizen verification: the tracking page asks for the phone number used at
    // submission (09XXXXXXXX format). The full details are only shown when it
    // matches; otherwise only a minimal acknowledgement is returned. Comparison
    // normalises formatting (spaces, dashes, +251 country prefix, leading 0).
    const digitize = (s) => String(s || '').replace(/\D/g, '');
    const submittedPhone = digitize(complaint.reporterPhone);
    const providedPhone = digitize(req.query.phone);
    if (!providedPhone) {
      return res.status(400).json({
        success: false,
        message: 'Please provide the phone number used to submit this complaint.',
      });
    }
    const matchesPhone = submittedPhone &&
      (submittedPhone === providedPhone || submittedPhone.slice(-9) === providedPhone.slice(-9));
    if (!matchesPhone) {
      return res.status(403).json({
        success: false,
        message: 'The phone number does not match the one used to submit this complaint.',
      });
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
      'Technician Assigned', 'Technician Requested', 'Accepted', 'In Progress',
      'Awaiting Verification', 'More Info Requested', 'Waiting for Parts',
      'Rework Required', 'Escalated to Subcity', 'Forwarded to Subcity',
      'Resolved', 'Resolved by Subcity', 'Rejected', 'Closed', 'Reopened',
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

    // Notify the citizen through every available channel (in-app + SMS + email)
    // and record the update in the public notification feed + audit log.
    await notifyReporter(complaint, io, {
      event: 'Status updated',
      title: `Complaint ${complaint.trackingNumber} is now ${status}`,
      message: `Your complaint "${complaint.title}" status was updated to ${status}${comment ? `: ${comment}` : ''}.`,
      type: 'complaint_status',
    });
    await complaint.save();
    await auditComplaint(req, 'complaint_status_changed', complaint,
      `Status changed ${previousStatus} → ${status}${comment ? ` (${comment})` : ''}`);

    // Notify the department account assigned to this complaint (for actions
    // taken by admins/subcity so the responsible office stays in the loop).
    if (status === 'Assigned' && complaint.woredaId && complaint.department) {
      const deptUsers = await findDepartmentRecipients({ woredaId: complaint.woredaId, department: complaint.department, departmentId: complaint.departmentId });
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
//   • Woreda-level staff  — must share the complaint's woredaId (or, for legacy
//     accounts predating woredaId, the stored woredaName), and the department
//     when both sides carry one.
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

  const woredaMatches =
    (complaint.woredaId && String(user.woredaId) === String(complaint.woredaId)) ||
    (!!user.woredaName && !!complaint.woredaName &&
      String(user.woredaName).toLowerCase() === String(complaint.woredaName).toLowerCase());
  if (!woredaMatches) return false;

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
      await notifyReporter(complaint, io, {
        event: 'Officer assigned',
        title: `Complaint ${complaint.trackingNumber} assigned`,
        message: `Your complaint "${complaint.title}" has been assigned to officer ${officer.fullName} for review.`,
        type: 'complaint_assigned',
      });
    }
    await auditComplaint(req, 'complaint_officer_assigned', complaint, `Assigned to officer ${officer.fullName}`);
    await complaint.save();
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
      await notifyReporter(complaint, io, {
        event: 'Technician assigned',
        title: `Complaint ${complaint.trackingNumber} — technician assigned`,
        message: `A technician (${technician.fullName}) has been assigned to work on your complaint${dueDate ? `, due ${new Date(dueDate).toISOString().slice(0, 10)}` : ''}.`,
        type: 'complaint_assigned',
      });
    }
    await auditComplaint(req, 'complaint_technician_assigned', complaint, `Assigned to technician ${technician.fullName}`);
    await complaint.save();
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

    await auditComplaint(req, isApproved ? 'complaint_resolved' : 'complaint_reopened', complaint,
      isApproved ? `Work verified and complaint resolved by ${req.user?.fullName || 'officer'}` : `Rework requested: ${String(note).trim()}`);

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

    await auditComplaint(req, 'complaint_closed', complaint, `Complaint closed by ${req.user?.fullName || 'department admin'}`);

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
      const deptUsers = await User.find({ role: { $in: ['department', 'department_officer'] }, ...departmentMatchFilter(dept), isActive: true }).select('_id');
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

    await auditComplaint(req, 'complaint_escalated', complaint, `Escalated to subcity: ${String(reason).trim()}`);

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

// ── Citizen complaint workflow — department officer actions ───────────────────

// Finds a complaint and enforces the caller's role scope. Returns null when the
// complaint is out of scope (403 is sent by the caller).
const findScopedComplaint = async (req, forAction) => {
  const complaint = await PublicComplaint.findOne({
    _id: req.params.id,
    ...buildComplaintScope(req.user),
  });
  if (!complaint) return null;
  return complaint;
};

// @desc  Officer accepts a submitted complaint
// @route POST /api/public-complaints/:id/accept
// @access Complaint officers (department officer + managers)
const acceptComplaint = async (req, res) => {
  try {
    const complaint = await findScopedComplaint(req, 'accept');
    if (!complaint) {
      return res.status(403).json({ success: false, message: 'Not authorized to accept this complaint.' });
    }
    const acceptAllowedFrom = ['Submitted', 'Pending', 'More Info Requested', 'Waiting for Parts'];
    if (!acceptAllowedFrom.includes(complaint.status)) {
      return res.status(400).json({ success: false, message: `Only 'Submitted' complaints can be accepted (current: ${complaint.status}).` });
    }
    const resuming = complaint.status !== 'Submitted' && complaint.status !== 'Pending';

    const previousStatus = complaint.status;
    complaint.status = 'Accepted';
    complaint.acceptedAt = new Date();
    complaint.acceptedBy = req.user?._id || null;
    complaint.acceptedByName = req.user?.fullName || 'System';
    complaint.timeline.push({
      action: 'accepted',
      description: resuming
        ? `${req.user?.fullName || 'Officer'} resumed work on the complaint.`
        : `${req.user?.fullName || 'Officer'} accepted the complaint.`,
      performedBy: req.user?._id,
      performedByName: req.user?.fullName || 'System',
      performedByRole: req.user?.role || 'admin',
      previousStatus,
      newStatus: complaint.status,
    });

    await complaint.save();

    const io = getIo(req);
    await notifyReporter(complaint, io, {
      event: 'Complaint accepted',
      title: `Complaint ${complaint.trackingNumber} accepted`,
      message: `Good news — your complaint "${complaint.title}" has been accepted by the ${complaint.department || 'responsible'} department.`,
      type: 'complaint_status',
    });
    await complaint.save();
    await auditComplaint(req, 'complaint_accepted', complaint, `Complaint accepted by ${req.user?.fullName || 'officer'}`);
    if (io) io.emit('complaint:updated', { complaint });

    res.json({ success: true, message: 'Complaint accepted', data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Accept error:', err);
    res.status(500).json({ success: false, message: 'Failed to accept complaint' });
  }
};

// @desc  Officer rejects a complaint (with a required reason)
// @route POST /api/public-complaints/:id/reject
// @access Complaint officers
const rejectComplaint = async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, message: 'A rejection reason is required.' });
    }

    const complaint = await findScopedComplaint(req, 'reject');
    if (!complaint) {
      return res.status(403).json({ success: false, message: 'Not authorized to reject this complaint.' });
    }

    const previousStatus = complaint.status;
    complaint.status = 'Rejected';
    complaint.rejectReason = reason;
    complaint.rejectedAt = new Date();
    complaint.rejectedBy = req.user?._id || null;
    complaint.rejectedByName = req.user?.fullName || 'System';
    complaint.resolvedAt = complaint.resolvedAt || new Date();
    complaint.timeline.push({
      action: 'rejected',
      description: `Complaint rejected: ${reason}`,
      performedBy: req.user?._id,
      performedByName: req.user?.fullName || 'System',
      performedByRole: req.user?.role || 'admin',
      previousStatus,
      newStatus: complaint.status,
    });

    await complaint.save();

    const io = getIo(req);
    await notifyReporter(complaint, io, {
      event: 'Complaint rejected',
      title: `Complaint ${complaint.trackingNumber} rejected`,
      message: `Your complaint "${complaint.title}" was rejected: ${reason}`,
      type: 'complaint_rejected',
    });
    await complaint.save();
    await auditComplaint(req, 'complaint_rejected', complaint, `Rejected: ${reason}`);
    if (io) io.emit('complaint:updated', { complaint });

    res.json({ success: true, message: 'Complaint rejected', data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Reject error:', err);
    res.status(500).json({ success: false, message: 'Failed to reject complaint' });
  }
};

// @desc  Officer requests more information from the citizen
// @route POST /api/public-complaints/:id/request-info
// @access Complaint officers
const requestMoreInfo = async (req, res) => {
  try {
    const message = String(req.body.message || '').trim();
    if (!message) {
      return res.status(400).json({ success: false, message: 'A message for the citizen is required.' });
    }

    const complaint = await findScopedComplaint(req, 'request-info');
    if (!complaint) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this complaint.' });
    }

    const previousStatus = complaint.status;
    complaint.status = 'More Info Requested';
    complaint.timeline.push({
      action: 'info_requested',
      description: `More information requested: ${message}`,
      performedBy: req.user?._id,
      performedByName: req.user?.fullName || 'System',
      performedByRole: req.user?.role || 'admin',
      previousStatus,
      newStatus: complaint.status,
    });

    await complaint.save();

    const io = getIo(req);
    await notifyReporter(complaint, io, {
      event: 'More information requested',
      title: `Complaint ${complaint.trackingNumber} — more info needed`,
      message: `The department needs more information about "${complaint.title}": ${message}`,
      type: 'complaint_status',
    });
    await complaint.save();
    await auditComplaint(req, 'complaint_info_requested', complaint, `More information requested: ${message}`);
    if (io) io.emit('complaint:updated', { complaint });

    res.json({ success: true, message: 'More information requested', data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Request info error:', err);
    res.status(500).json({ success: false, message: 'Failed to request more information' });
  }
};

// @desc  Officer marks a complaint as waiting for parts
// @route POST /api/public-complaints/:id/waiting-parts
// @access Complaint officers
const markWaitingParts = async (req, res) => {
  try {
    const note = String(req.body.note || '').trim();

    const complaint = await findScopedComplaint(req, 'waiting-parts');
    if (!complaint) {
      return res.status(403).json({ success: false, message: 'Not authorized to update this complaint.' });
    }

    const previousStatus = complaint.status;
    complaint.status = 'Waiting for Parts';
    complaint.timeline.push({
      action: 'waiting_parts',
      description: `Complaint is waiting for parts${note ? `: ${note}` : ''}.`,
      performedBy: req.user?._id,
      performedByName: req.user?.fullName || 'System',
      performedByRole: req.user?.role || 'admin',
      previousStatus,
      newStatus: complaint.status,
    });

    await complaint.save();

    const io = getIo(req);
    await notifyReporter(complaint, io, {
      event: 'Waiting for parts',
      title: `Complaint ${complaint.trackingNumber} — waiting for parts`,
      message: `Work on your complaint "${complaint.title}" is waiting for parts${note ? ` (${note})` : ''}. We will update you as soon as work resumes.`,
      type: 'complaint_status',
    });
    await complaint.save();
    await auditComplaint(req, 'complaint_status_changed', complaint, 'Status → Waiting for Parts');
    if (io) io.emit('complaint:updated', { complaint });

    res.json({ success: true, message: 'Complaint marked as waiting for parts', data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Waiting parts error:', err);
    res.status(500).json({ success: false, message: 'Failed to update complaint' });
  }
};

// @desc  Officer forwards a complaint to the Subcity office
// @route POST /api/public-complaints/:id/forward
// @access Complaint officers
// Requires a reason and captures the estimated budget / required equipment /
// priority so the Subcity office can decide with full context.
const forwardToSubcity = async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, message: 'A forward reason is required.' });
    }

    const complaint = await findScopedComplaint(req, 'forward');
    if (!complaint) {
      return res.status(403).json({ success: false, message: 'Not authorized to forward this complaint.' });
    }

    const previousStatus = complaint.status;
    const targetDepartment = String(req.body.department || complaint.department || '').trim();
    complaint.status = 'Forwarded to Subcity';
    complaint.assignedLevel = 'SUBCITY';
    complaint.forwardReason = reason;
    complaint.estimatedBudget = String(req.body.estimatedBudget || complaint.estimatedBudget || '').trim();
    complaint.requiredEquipment = String(req.body.requiredEquipment || complaint.requiredEquipment || '').trim();
    complaint.forwardPriority = String(req.body.forwardPriority || complaint.priority || '').trim();
    complaint.forwardedAt = new Date();
    complaint.forwardedBy = req.user?._id || null;
    complaint.forwardedByName = req.user?.fullName || 'System';
    complaint.escalatedToSubcity = true;
    complaint.escalatedToSubcityAt = complaint.escalatedToSubcityAt || new Date();
    if (targetDepartment) complaint.department = targetDepartment;
    complaint.timeline.push({
      action: 'forwarded_to_subcity',
      description: `Forwarded to the Subcity office${targetDepartment ? ` (${targetDepartment})` : ''}: ${reason}`,
      performedBy: req.user?._id,
      performedByName: req.user?.fullName || 'System',
      performedByRole: req.user?.role || 'admin',
      previousStatus,
      newStatus: complaint.status,
    });

    await complaint.save();

    const io = getIo(req);

    // Notify the subcity office + subcity-level department accounts.
    const subcityRole = `subcity_${normalizeSubcity(complaint.subcity).toLowerCase()}`;
    const subcityUsers = await User.find({ role: subcityRole }).select('_id');
    for (const u of subcityUsers) {
      await createNotification({
        recipient: u._id,
        title: 'Complaint Forwarded to Your Subcity',
        message: `Complaint ${complaint.trackingNumber} "${complaint.title}" was forwarded to the ${complaint.subcity} subcity office. Reason: ${reason}`,
        type: 'warning',
        relatedReport: complaint._id,
        relatedReportType: 'public_complaint',
        io,
      });
    }
    if (targetDepartment) {
      const deptUsers = await User.find({ role: { $in: ['department', 'department_officer'] }, ...departmentMatchFilter(targetDepartment), isActive: true }).select('_id');
      for (const u of deptUsers) {
        await createNotification({
          recipient: u._id,
          title: 'Forwarded Complaint in Your Department',
          message: `Complaint ${complaint.trackingNumber} forwarded to Subcity (${targetDepartment}). Reason: ${reason}`,
          type: 'warning',
          relatedReport: complaint._id,
          relatedReportType: 'public_complaint',
          io,
        });
      }
    }

    await notifyReporter(complaint, io, {
      event: 'Forwarded to Subcity',
      title: `Complaint ${complaint.trackingNumber} forwarded to Subcity`,
      message: `Your complaint "${complaint.title}" has been forwarded to the ${complaint.subcity} subcity office. Reason: ${reason}`,
      type: 'complaint_forwarded',
    });
    await auditComplaint(req, 'complaint_forwarded', complaint,
      `Forwarded to Subcity${targetDepartment ? ` (${targetDepartment})` : ''}: ${reason}`);
    await complaint.save();
    if (io) io.emit('complaint:updated', { complaint });

    res.json({ success: true, message: 'Complaint forwarded to Subcity', data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Forward error:', err);
    res.status(500).json({ success: false, message: 'Failed to forward complaint' });
  }
};

// @desc  Subcity office resolves a forwarded complaint
// @route POST /api/public-complaints/:id/resolve-by-subcity
// @access Subcity-level roles
const resolveBySubcity = async (req, res) => {
  try {
    const details = String(req.body.details || '').trim();
    if (!details) {
      return res.status(400).json({ success: false, message: 'Resolution details are required.' });
    }

    const complaint = await findScopedComplaint(req, 'resolve-by-subcity');
    if (!complaint) {
      return res.status(403).json({ success: false, message: 'Not authorized to resolve this complaint.' });
    }

    const previousStatus = complaint.status;
    complaint.status = 'Resolved by Subcity';
    complaint.resolutionDetails = details;
    complaint.subcityResolvedAt = new Date();
    complaint.subcityResolvedBy = req.user?._id || null;
    complaint.subcityResolvedByName = req.user?.fullName || 'System';
    complaint.resolvedAt = complaint.resolvedAt || new Date();
    complaint.timeline.push({
      action: 'resolved_by_subcity',
      description: `Resolved at the Subcity level: ${details}`,
      performedBy: req.user?._id,
      performedByName: req.user?.fullName || 'System',
      performedByRole: req.user?.role || 'admin',
      previousStatus,
      newStatus: complaint.status,
    });

    await complaint.save();

    const io = getIo(req);
    await notifyReporter(complaint, io, {
      event: 'Resolved by Subcity',
      title: `Complaint ${complaint.trackingNumber} resolved`,
      message: `Your complaint "${complaint.title}" has been resolved by the ${complaint.subcity} subcity office: ${details}`,
      type: 'complaint_resolved',
    });
    await complaint.save();
    await auditComplaint(req, 'complaint_resolved', complaint, `Resolved by subcity: ${details}`);
    if (io) io.emit('complaint:updated', { complaint });

    res.json({ success: true, message: 'Complaint resolved by subcity', data: { complaint } });
  } catch (err) {
    console.error('[PublicComplaint] Resolve by subcity error:', err);
    res.status(500).json({ success: false, message: 'Failed to resolve complaint' });
  }
};

// @desc  Audit trail for a complaint
// @route GET /api/public-complaints/:id/audit
// @access Complaint managers
const getAuditLog = async (req, res) => {
  try {
    const AuditLog = require('../models/AuditLog');
    const complaint = await PublicComplaint.findById(req.params.id).select('_id').lean();
    if (!complaint) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }
    if (req.user && COMPLAINT_SCOPED_ROLES.includes(req.user.role)) {
      const full = await PublicComplaint.findById(req.params.id).select('subcity woredaId department departmentId subcityId').lean();
      if (!isComplaintInScope(req.user, full)) {
        return res.status(403).json({ success: false, message: 'Not authorized to view this audit log.' });
      }
    }
    const entries = await AuditLog.find({ resource: 'public_complaint', resourceId: complaint._id })
      .sort({ createdAt: -1 })
      .limit(200)
      .lean();
    res.json({ success: true, data: { entries } });
  } catch (err) {
    console.error('[PublicComplaint] Audit log error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch audit log' });
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

  await notifyReporter(complaint, io, {
    event: 'Escalated to Subcity',
    title: `Complaint ${complaint.trackingNumber} escalated`,
    message: `Your complaint "${complaint.title}" was escalated to the ${complaint.subcity} subcity office because it was not resolved within 48 hours.`,
    type: 'complaint_escalated',
  });
  await auditComplaint(null, 'complaint_escalated', complaint, 'Automatic escalation to Subcity office (48-hour deadline exceeded)');
  await complaint.save();

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

  await notifyReporter(complaint, io, {
    event: 'Escalated to Subcity Administrator',
    title: `Complaint ${complaint.trackingNumber} escalated to Subcity Administrator`,
    message: `Your complaint "${complaint.title}" was escalated to the Subcity Administrator because it was not resolved within 5 days.`,
    type: 'complaint_escalated',
  });
  await auditComplaint(null, 'complaint_escalated', complaint, 'Automatic escalation to Subcity Administrator (5-day deadline exceeded)');
  await complaint.save();

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
  acceptComplaint,
  rejectComplaint,
  requestMoreInfo,
  markWaitingParts,
  forwardToSubcity,
  resolveBySubcity,
  getAuditLog,
  getAssignableUsers,
  getStats,
  getSubcityWoredas,
  escalateToSubcity,
  escalateToSubcityAdmin,
};
