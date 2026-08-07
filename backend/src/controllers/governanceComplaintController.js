const mongoose = require('mongoose');
const GovernanceComplaint = require('../models/GovernanceComplaint');
const GovernmentOffice = require('../models/GovernmentOffice');
const ComplaintCategory = require('../models/ComplaintCategory');
const Woreda = require('../models/Woreda');
const Subcity = require('../models/Subcity');
const User = require('../models/User');
const { notifyUser } = require('../services/notificationService');
const { logAction } = require('../middleware/auditLog');
const { sendEmail } = require('../services/emailService');
const { sendSms } = require('../services/smsService');
const {
  generateAcknowledgmentPDF,
  generateGovernancePDF,
  generateGovernanceExcel,
} = require('../utils/governanceComplaintExport');

const { ADMIN_ACTIONS, CLOSED_STATUSES } = require('../models/GovernanceComplaint');

// ── Constants ─────────────────────────────────────────────────────────────────

const SUB_CITY_ROLES = ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura'];

const ALL_SUB_CITY_ROLES = [...SUB_CITY_ROLES, 'subcity_admin', 'SUBCITY_ADMIN'];

const SUB_CITY_OFFICER_ROLES = ['admin', 'government', 'ADMIN', 'SUBCITY_HEAD', ...ALL_SUB_CITY_ROLES, 'GOVERNANCE_OFFICER', 'OFFICE_SUPERVISOR'];

const WOREDA_OFFICER_ROLES = ['woreda', 'woreda_admin', 'WOREDA_ADMIN', 'WOREDA_HEAD', 'OFFICER'];

const GOVERNANCE_MANAGER_ROLES = [
  'admin', 'government', 'ADMIN',
  ...ALL_SUB_CITY_ROLES, 'SUBCITY_HEAD',
  'woreda', 'woreda_admin', 'WOREDA_ADMIN', 'WOREDA_HEAD', 'OFFICER',
  'GOVERNANCE_OFFICER', 'OFFICE_SUPERVISOR',
];

const GOVERNANCE_VIEWER_ROLES = [
  ...GOVERNANCE_MANAGER_ROLES,
  'citizen', 'CITIZEN',
  'department', 'department_officer',
];

// Statuses a citizen sees as "actively handled" on their dashboard cards.
const ACTIVE_STATUSES = [
  'Submitted', 'Under Review', 'Need More Information', 'In Progress',
  'Investigation in Progress',
  'Awaiting Woreda Response', 'Action Taken', 'Reopened', 'Escalated',
];

const WOREDA_REQUEST_DAYS = 5;
const REOPEN_WINDOW_DAYS = 15;

// ── Status display aliases ────────────────────────────────────────────────────
// The workflow stores a rich 12-state enum (Submitted, Under Review, In
// Progress, …). For citizen-facing surfaces we also expose a simplified
// vocabulary (New, Received, Assigned, Under Investigation, Need More
// Information, Resolved, Rejected, Closed) via a displayStatus field — the
// granular enum is kept untouched for the investigation workflow.
const STATUS_ALIASES = {
  'Submitted': 'New',
  'Under Review': 'Received',
  'In Progress': 'Under Investigation',
  'Investigation in Progress': 'Under Investigation',
  'Awaiting Woreda Response': 'Under Investigation',
  'Need More Information': 'Need More Information',
  'Action Taken': 'Action Taken',
  'Resolved': 'Resolved',
  'Rejected': 'Rejected',
  'Reopened': 'Reopened',
  'Escalated': 'Escalated',
  'Closed': 'Closed',
};

// "Assigned" surfaces once an officer has been explicitly assigned to the
// complaint (assignment moves a Submitted complaint to Under Review).
const displayStatusFor = (complaint) => {
  if (!complaint) return '';
  if (complaint.status === 'Under Review' && (complaint.assignedTo || complaint.assignedToOffice)) {
    return 'Assigned';
  }
  return STATUS_ALIASES[complaint.status] || complaint.status;
};

// Attach the simplified citizen-facing status label to API responses. Handles
// both Mongoose documents and lean/populated objects.
const withDisplay = (complaint) => {
  const obj = complaint && typeof complaint.toObject === 'function' ? complaint.toObject() : complaint;
  return { ...obj, displayStatus: displayStatusFor(complaint) };
};

// ── Small helpers ─────────────────────────────────────────────────────────────

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ciRegex = (s) => ({ $regex: `^${escapeRegex(s)}$`, $options: 'i' });

const isSubcityRole = (role) => typeof role === 'string' && role.startsWith('subcity_');

const resolveUserSubcity = async (user) => {
  if (!user) return '';
  if (user.subcity) return user.subcity;
  if (user.woredaId) {
    const w = await Woreda.findById(user.woredaId).lean();
    if (w) return w.subcity;
  }
  return '';
};

const getIO = (req) => {
  if (!req || !req.app || typeof req.app.get !== 'function') return null;
  return req.app.get('io') || null;
};

// Build a Mongo query filter based on the logged-in user's role (RBAC).
const buildGovernanceScope = (user) => {
  if (!user) return { _id: null };

  if (isSubcityRole(user.role)) {
    const sub = user.subcity || user.role.replace(/^subcity_/, '').toUpperCase();
    return sub ? { subcity: ciRegex(sub) } : { _id: null };
  }

  switch (user.role) {
    case 'admin':
    case 'government':
    case 'ADMIN':
      return {};

    case 'subcity_admin':
    case 'SUBCITY_ADMIN':
    case 'SUBCITY_HEAD': {
      const sub = user.subcity || '';
      return sub ? { subcity: ciRegex(sub) } : { _id: null };
    }

    case 'woreda':
    case 'woreda_admin':
    case 'WOREDA_ADMIN':
    case 'WOREDA_HEAD':
      return user.woredaId ? { woredaId: user.woredaId } : { _id: null };

    case 'GOVERNANCE_OFFICER':
    case 'OFFICE_SUPERVISOR': {
      // Assigned to one GovernmentOffice — scope strictly to its complaints.
      if (user.governmentOfficeId) return { officeId: user.governmentOfficeId };
      const sub = user.subcity || '';
      return sub ? { subcity: ciRegex(sub) } : { _id: null };
    }

    case 'OFFICER': {
      const conditions = [{ assignedTo: user._id }];
      if (user.woredaId) conditions.push({ woredaId: user.woredaId });
      return conditions.length === 1 ? conditions[0] : { $or: conditions };
    }

    case 'department':
    case 'department_officer': {
      const conditions = [{ office: ciRegex(user.department || '') }];
      if (user.woredaId) conditions.push({ woredaId: user.woredaId, office: ciRegex(user.department || '') });
      return conditions.length === 1 ? conditions[0] : { $or: conditions };
    }

    case 'citizen':
    case 'CITIZEN':
      return { reporter: user._id };

    default:
      return { _id: null };
  }
};

const isComplaintInScope = (user, complaint) => {
  if (!user || !complaint) return false;

  if (isSubcityRole(user.role)) {
    const sub = (user.subcity || user.role.replace(/^subcity_/, '').toUpperCase() || '').toLowerCase();
    return !!sub && (complaint.subcity || '').toLowerCase() === sub;
  }

  switch (user.role) {
    case 'admin':
    case 'government':
    case 'ADMIN':
      return true;
    case 'subcity_admin':
    case 'SUBCITY_ADMIN':
    case 'SUBCITY_HEAD': {
      const sub = (user.subcity || '').toLowerCase();
      return !!sub && (complaint.subcity || '').toLowerCase() === sub;
    }
    case 'woreda':
    case 'woreda_admin':
    case 'WOREDA_ADMIN':
    case 'WOREDA_HEAD':
      return String(complaint.woredaId) === String(user.woredaId);
    case 'GOVERNANCE_OFFICER':
    case 'OFFICE_SUPERVISOR':
      return user.governmentOfficeId
        ? String(complaint.officeId) === String(user.governmentOfficeId)
        : String(complaint.subcity || '').toLowerCase() === String(user.subcity || '').toLowerCase();
    case 'OFFICER':
      return String(complaint.assignedTo) === String(user._id) ||
        String(complaint.woredaId) === String(user.woredaId);
    case 'department':
    case 'department_officer':
      return String(complaint.woredaId) === String(user.woredaId) &&
        (complaint.office || '').toLowerCase() === (user.department || '').toLowerCase();
    case 'citizen':
    case 'CITIZEN':
      return String(complaint.reporter) === String(user._id);
    default:
      return false;
  }
};

// ── Officer lookups ───────────────────────────────────────────────────────────

const SUB_CITY_ADMIN_ROLE_MATCH = {
  $or: [
    { role: 'subcity_admin' },
    { role: 'SUBCITY_ADMIN' },
    { role: { $regex: /^subcity_/ } },
  ],
};

const findSubcityAdmins = (subcity) =>
  User.find({ ...SUB_CITY_ADMIN_ROLE_MATCH, subcity: ciRegex(subcity), isActive: true }).select('-password').lean();

const findWoredaOfficers = (woredaId) =>
  User.find({ role: { $in: ['woreda', 'woreda_admin', 'WOREDA_ADMIN', 'WOREDA_HEAD', 'OFFICER'] }, woredaId, isActive: true }).select('-password').lean();

// Governance officers assigned to a specific GovernmentOffice — the primary
// handlers of that office's complaints.
const findOfficeOfficers = (officeId) =>
  User.find({ role: { $in: ['GOVERNANCE_OFFICER', 'OFFICE_SUPERVISOR'] }, governmentOfficeId: officeId, isActive: true }).select('-password').lean();

const findAdmins = () =>
  User.find({ role: { $in: ['admin', 'government', 'ADMIN'] }, isActive: true }).select('-password').lean();

// Office supervisors are the escalation/oversight layer for an office's
// complaints — they monitor assignments and citizen activity.
const findOfficeSupervisors = (officeId) =>
  User.find({ role: 'OFFICE_SUPERVISOR', governmentOfficeId: officeId, isActive: true }).select('-password').lean();

// Recipients for citizen-driven activity (evidence, replies): the assigned
// officer plus the office supervisors. Never the citizen themselves.
const findAssignmentRecipients = async (complaint) => {
  const ids = new Set();
  const recipients = [];
  const add = (user) => {
    if (!user || !user._id || ids.has(user._id.toString())) return;
    ids.add(user._id.toString());
    recipients.push(user);
  };
  if (complaint.assignedTo) {
    add(await User.findById(complaint.assignedTo).select('-password').lean());
  }
  const supervisors = await findOfficeSupervisors(complaint.officeId);
  supervisors.forEach(add);
  return recipients;
};

// ── Notification dispatch (in-app + socket + SMS/email hooks) ─────────────────

const dispatchGovernanceNotification = async (io, complaint, targets, { event, title, message, type, actorId }) => {
  const seen = new Set();
  for (const target of targets) {
    if (!target || !target._id || seen.has(target._id.toString())) continue;
    // Never notify the user who performed the action.
    if (actorId && String(target._id) === String(actorId)) continue;
    seen.add(target._id.toString());
    await notifyUser({
      userId: target._id,
      actorId,
      title,
      message,
      type: type || 'governance_status',
      relatedReport: complaint._id,
      relatedReportType: 'governance_complaint',
      complaintId: complaint._id,
      io,
    });
    const channels = ['in-app'];
    if (target.smsNotifications && target.phone) {
      channels.push('sms');
      await sendSms({ to: target.phone, message });
    }
    if (target.emailNotifications && target.email) {
      channels.push('email');
      await sendEmail({ to: target.email, subject: title, text: message });
    }
    complaint.notificationHistory.push({ event, title, message, channels: channels.join(', ') });
  }
};

const AUDIT_ACTION_MAP = {
  'Created': 'governance_created',
  'Status Changed': 'governance_status_changed',
  'Officer Assigned': 'governance_assigned',
  'Resolved': 'governance_resolved',
  'Rejected': 'governance_rejected',
  'Reopened': 'governance_reopened',
  'Escalated': 'governance_escalated',
  'Note Added': 'governance_note_added',
  'Response Posted': 'governance_response_posted',
  'Information Requested': 'governance_info_requested',
  'Woreda Contacted': 'governance_woreda_contacted',
  'Woreda Responded': 'governance_woreda_responded',
  'Document Uploaded': 'governance_document_uploaded',
  'Admin Action Recorded': 'governance_admin_action',
  'Evidence Added': 'governance_evidence_added',
  'Viewed': 'governance_viewed',
  'Overdue': 'governance_overdue',
  'Resolution Confirmed': 'governance_resolution_confirmed',
};

// Pushes an entry to the complaint's embedded audit trail AND writes a global
// AuditLog record so platform admins can review every governance action.
const recordAudit = async (req, complaint, action, user, details = '', meta = {}) => {
  const ip = req?.ip || req?.connection?.remoteAddress || '';
  complaint.auditTrail.push({
    action,
    user: user?._id || null,
    userName: user?.fullName || (user ? `${user.role}` : 'System'),
    role: user?.role || 'system',
    details: details || '',
    oldStatus: meta.oldStatus ?? '',
    newStatus: meta.newStatus ?? '',
    ipAddress: ip,
  });
  await logAction({
    user,
    action: AUDIT_ACTION_MAP[action] || 'governance_status_changed',
    resource: 'governance_complaint',
    resourceId: complaint._id,
    details: { action, details: details || '', oldStatus: meta.oldStatus, newStatus: meta.newStatus },
    req,
  });
};

const pushTimeline = (complaint, action, title, message, user, files = []) => {
  complaint.timeline.push({
    action,
    title,
    message,
    performedByRole: user?.role || 'Citizen',
    performedByName: user?.fullName || 'Citizen',
    files,
  });
};

const emitUpdate = (io, complaint) => {
  if (io) io.emit('governance:updated', { trackingId: complaint.trackingId, status: complaint.status });
};

const fileUrls = (req) => (req.files || []).map((f) => f.path);

const bool = (v) => v === true || v === 'true';

// ── Reporter privacy ─────────────────────────────────────────────────────────
//
// Anonymous reports must never expose the reporter's identity — including the
// contact phone that is kept (encrypted at rest in MongoDB) purely so the
// reporter can track the complaint — to investigating officers. Only the
// reporter themself and platform admins ever see the full contact details.
const redactAnonymousComplaint = (complaint, user) => {
  if (!complaint || complaint.isAnonymous !== true) return complaint;
  const isOwner = !!(user && String(complaint.reporter) === String(user._id));
  const isPrivileged = !!user && ['admin', 'government', 'ADMIN'].includes(user.role);
  if (isOwner || isPrivileged) return complaint;
  complaint.reporterName = 'Anonymous';
  complaint.reporterEmail = '';
  complaint.reporterPhone = '';
  return complaint;
};

// ── Create (public + citizen) ─────────────────────────────────────────────────

// POST /api/governance-complaints  (protectOptional + upload.array('evidence', 8))
const createComplaint = async (req, res) => {
  try {
    const {
      fullName, phone, email,
      subcity, woredaId, officeId, categoryId,
      title, description, incidentDate, incidentLocation, employeesInvolved,
      serviceReceived, urgencyLevel,
      isAnonymous, consent,
    } = req.body;

    const anonymous = bool(isAnonymous);
    const agreed = bool(consent);

    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required.' });
    if (!subcity) return res.status(400).json({ success: false, message: 'Subcity is required.' });
    if (!woredaId) return res.status(400).json({ success: false, message: 'Woreda is required.' });
    if (!officeId) return res.status(400).json({ success: false, message: 'Government office is required.' });
    if (!categoryId) return res.status(400).json({ success: false, message: 'Complaint category is required.' });
    if (!title || String(title).trim().length < 3) {
      return res.status(400).json({ success: false, message: 'Please provide a complaint title.' });
    }
    if (!description || String(description).trim().length < 10) {
      return res.status(400).json({ success: false, message: 'Description must be at least 10 characters.' });
    }
    if (!agreed) return res.status(400).json({ success: false, message: 'You must agree to the reporting terms to continue.' });
    if (!serviceReceived || String(serviceReceived).trim().length < 2) {
      return res.status(400).json({ success: false, message: 'The service you received is required.' });
    }
    if (!incidentDate) return res.status(400).json({ success: false, message: 'Incident date is required.' });
    if (!incidentLocation || String(incidentLocation).trim().length < 3) {
      return res.status(400).json({ success: false, message: 'Incident location is required.' });
    }

    // Validate the woreda belongs to the chosen subcity.
    const woreda = await Woreda.findById(woredaId).lean();
    if (!woreda) return res.status(400).json({ success: false, message: 'Selected woreda does not exist.' });
    if (!new RegExp(`^${escapeRegex(subcity)}$`, 'i').test(woreda.subcity)) {
      return res.status(400).json({ success: false, message: 'Selected woreda does not belong to the chosen subcity.' });
    }

    // Resolve the live Subcity record so complaints carry a subcityId reference
    // (used by analytics and subcity-scoped filtering).
    const subcityRecord = await Subcity.findOne({
      $or: [{ name: ciRegex(subcity) }, { nameLower: ciRegex(subcity) }],
    }).lean();

    // Validate the government office (DB-driven) — it must belong to the chosen
    // subcity and be active. Its name is denormalized onto the complaint.
    const office = await GovernmentOffice.findById(officeId).lean();
    if (!office) return res.status(400).json({ success: false, message: 'Selected government office does not exist.' });
    if (office.isActive === false) return res.status(400).json({ success: false, message: 'Selected government office is not accepting complaints.' });
    if (!new RegExp(`^${escapeRegex(subcity)}$`, 'i').test(office.subcity)) {
      return res.status(400).json({ success: false, message: 'Selected office does not belong to the chosen subcity.' });
    }

    // Validate the complaint category (DB-driven) — it must belong to the
    // selected office and be active.
    const category = await ComplaintCategory.findById(categoryId).lean();
    if (!category) return res.status(400).json({ success: false, message: 'Selected complaint category does not exist.' });
    if (String(category.officeId) !== String(office._id)) {
      return res.status(400).json({ success: false, message: 'Selected category does not belong to the chosen office.' });
    }
    if (category.isActive === false) return res.status(400).json({ success: false, message: 'Selected category is not accepting new complaints.' });

    // Reporter identity — hidden entirely for anonymous reports (phone is still
    // kept so the citizen can track the complaint).
    const reporter = anonymous ? null : (req.user?._id || null);
    const reporterName = anonymous ? '' : String(fullName || req.user?.fullName || '').trim();
    const reporterEmail = anonymous ? '' : String(email || req.user?.email || '').trim();
    const reporterPhone = String(phone || req.user?.phone || '').trim();

    const complaint = new GovernanceComplaint({
      category: category.name,
      categoryId: category._id,
      title: String(title || '').trim(),
      description: String(description).trim(),
      incidentDate: incidentDate ? new Date(incidentDate) : undefined,
      incidentTime: String(req.body.incidentTime || '').trim(),
      incidentLocation: String(incidentLocation || '').trim(),
      employeesInvolved: String(employeesInvolved || '').trim(),
      serviceReceived: String(serviceReceived || '').trim(),
      urgencyLevel: ['Low', 'Medium', 'High'].includes(urgencyLevel) ? urgencyLevel : 'Medium',
      subcity: String(subcity).trim(),
      subcityId: subcityRecord?._id || null,
      woredaId,
      woredaName: woreda.name,
      office: office.name,
      officeId: office._id,
      reporter,
      reporterName,
      reporterPhone,
      reporterEmail,
      isAnonymous: anonymous,
      consent: true,
      evidenceFiles: fileUrls(req),
      status: 'Submitted',
      assignedLevel: 'Subcity',
      assignedToOffice: office.name,
    });

    await recordAudit(req, complaint, 'Created', req.user || null, `Governance complaint submitted (${category.name}, ${office.name})`, { newStatus: 'Submitted' });
    pushTimeline(complaint, 'Submitted', 'Complaint Submitted', `Submitted to the ${office.name} (${subcity}). ${title ? `Title: ${title}` : ''}`, req.user || null);

    await complaint.save();

    const io = getIO(req);

    // Assign the complaint to the first available officer of the selected
    // government office (falling back to the subcity admins).
    const officeOfficers = await findOfficeOfficers(office._id);
    const subcityAdmins = await findSubcityAdmins(complaint.subcity);
    if (officeOfficers.length) complaint.assignedTo = officeOfficers[0]._id;
    else if (subcityAdmins.length) complaint.assignedTo = subcityAdmins[0]._id;

    // Confirm with the citizen — exact wording per spec.
    const confirmTitle = `Complaint submitted: ${complaint.trackingId}`;
    const confirmMessage = `Your complaint has been submitted to the ${office.name}. Tracking ID: ${complaint.trackingId}`;
    const reporterTargets = [];
    if (reporter && req.user) {
      reporterTargets.push({
        _id: req.user._id,
        phone: reporterPhone,
        email: reporterEmail || req.user.email,
        smsNotifications: true,
        emailNotifications: true,
      });
    } else if (reporterPhone) {
      // Anonymous / guest — reachable via SMS only (best effort, no in-app).
      complaint.notificationHistory.push({ event: 'Submitted', title: confirmTitle, message: confirmMessage, channels: 'sms' });
      await sendSms({ to: reporterPhone, message: confirmMessage });
      if (reporterEmail) await sendEmail({ to: reporterEmail, subject: confirmTitle, text: confirmMessage });
    }
    await dispatchGovernanceNotification(io, complaint, reporterTargets, {
      event: 'Submitted',
      title: confirmTitle,
      message: confirmMessage,
      type: 'governance_submitted',
      actorId: req.user?._id,
    });

    // Notify the assigned office's officers and the subcity governance office
    // (monitoring only). The citizen never gets an in-app notification for
    // their own submission — the tracking ID is returned in the response.
    await dispatchGovernanceNotification(io, complaint, officeOfficers, {
      event: 'Submitted',
      title: `New public complaint ${complaint.trackingId}`,
      message: `${anonymous ? 'An anonymous citizen' : (complaint.reporterName || 'A citizen')} reported "${category.name}" against ${office.name} in ${complaint.subcity}.`,
      type: 'governance_status',
      actorId: req.user?._id,
    });

    await dispatchGovernanceNotification(io, complaint, subcityAdmins, {
      event: 'Submitted',
      title: `New public complaint ${complaint.trackingId}`,
      message: `${anonymous ? 'An anonymous citizen' : (complaint.reporterName || 'A citizen')} reported "${category.name}" against ${office.name} in ${complaint.subcity}.`,
      type: 'governance_status',
      actorId: req.user?._id,
    });

    await complaint.save();
    emitUpdate(io, complaint);

    res.status(201).json({ success: true, message: 'Governance complaint submitted', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── List (role-scoped) ────────────────────────────────────────────────────────

// GET /api/governance-complaints
const getComplaints = async (req, res) => {
  try {
    const userSubcity = await resolveUserSubcity(req.user);
    const scope = buildGovernanceScope(req.user);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const filter = { ...scope };

    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.categoryId) filter.categoryId = req.query.categoryId;
    if (req.query.office) filter.office = ciRegex(req.query.office);
    if (req.query.officeId) filter.officeId = req.query.officeId;
    if (req.query.subcity) filter.subcity = ciRegex(req.query.subcity);
    if (req.query.subcityId) filter.subcityId = req.query.subcityId;
    if (req.query.woredaId) filter.woredaId = req.query.woredaId;
    if (req.query.urgency || req.query.priority) {
      filter.urgencyLevel = ciRegex(req.query.urgency || req.query.priority);
    }
    if (req.query.overdue === 'true') {
      filter.$or = [
        { slaDueAt: { $lte: new Date() }, status: { $in: ACTIVE_STATUSES } },
        { 'woredaRequests.status': 'Overdue' },
      ];
    }
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }
    if (req.query.search) {
      const s = escapeRegex(req.query.search);
      filter.$or = [
        { trackingId: { $regex: s, $options: 'i' } },
        { description: { $regex: s, $options: 'i' } },
        { category: { $regex: s, $options: 'i' } },
        { office: { $regex: s, $options: 'i' } },
        { reporterName: { $regex: s, $options: 'i' } },
        { reporterPhone: { $regex: s, $options: 'i' } },
      ];
    }

    const total = await GovernanceComplaint.countDocuments(filter);
    const complaints = await GovernanceComplaint.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-auditTrail -notificationHistory -investigationNotes')
      .lean();

    // Anonymous reports: hide reporter identity from everyone but the reporter
    // themself and platform admins.
    complaints.forEach((c) => {
      redactAnonymousComplaint(c, req.user);
      c.displayStatus = displayStatusFor(c);
    });

    res.json({
      success: true,
      data: { complaints, total, page, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Detail ────────────────────────────────────────────────────────────────────

// GET /api/governance-complaints/:id
const getComplaintById = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id)
      .populate('assignedTo', 'fullName email phone role')
      .lean();
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised to view this complaint.' });
    }

    const auditEntry = {
      action: 'Viewed',
      user: req.user._id,
      userName: req.user.fullName || req.user.role,
      role: req.user.role,
      details: `Complaint viewed by ${req.user.role}`,
      ipAddress: req.ip || req.connection?.remoteAddress || '',
      at: new Date(),
    };
    await GovernanceComplaint.updateOne({ _id: complaint._id }, { $push: { auditTrail: auditEntry } });
    complaint.auditTrail = complaint.auditTrail || [];
    complaint.auditTrail.push(auditEntry);
    await logAction({
      user: req.user,
      action: 'governance_viewed',
      resource: 'governance_complaint',
      resourceId: complaint._id,
      details: { action: 'Viewed', details: auditEntry.details },
      req,
    });

    redactAnonymousComplaint(complaint, req.user);

    res.json({ success: true, data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Public tracking ───────────────────────────────────────────────────────────

// GET /api/governance-complaints/track/:trackingId?phone=
const trackComplaint = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findOne({
      trackingId: { $regex: `^${escapeRegex(req.params.trackingId)}$`, $options: 'i' },
    })
      .populate('assignedTo', 'fullName role')
      .lean();
    if (!complaint) return res.status(404).json({ success: false, message: 'No complaint found with that tracking ID.' });

    const phone = String(req.query.phone || '').replace(/\s+/g, '');
    const normalized = String(complaint.reporterPhone || '').replace(/\s+/g, '');
    if (!phone || !normalized || phone !== normalized) {
      return res.status(403).json({ success: false, message: 'Please enter the phone number used to submit this complaint.' });
    }

    const canReopen = CLOSED_STATUSES.includes(complaint.status) &&
      !(complaint.reopenedAt && complaint.reopenedAt.getTime() > (complaint.resolvedAt || complaint.rejectedAt || new Date(0)).getTime()) &&
      complaint.reopenedCount < 2 &&
      isWithinReopenWindow(complaint);

    const data = {
      _id: complaint._id,
      trackingId: complaint.trackingId,
      category: complaint.category,
      description: complaint.description,
      incidentDate: complaint.incidentDate,
      incidentTime: complaint.incidentTime,
      subcity: complaint.subcity,
      woredaName: complaint.woredaName,
      office: complaint.office,
      status: complaint.status,
      displayStatus: displayStatusFor(complaint),
      isAnonymous: complaint.isAnonymous,
      isOverdue: complaint.isOverdue,
      createdAt: complaint.createdAt,
      resolvedAt: complaint.resolvedAt,
      resolutionNote: complaint.resolutionNote,
      rejectionReason: complaint.rejectionReason,
      reopenedAt: complaint.reopenedAt,
      escalatedAt: complaint.escalatedAt,
      assignedToOffice: complaint.assignedToOffice,
      assignedTo: complaint.assignedTo,
      evidenceFiles: complaint.evidenceFiles,
      officialDocuments: complaint.officialDocuments,
      timeline: complaint.timeline,
      officerResponses: complaint.officerResponses,
      auditTrail: complaint.auditTrail,
      woredaRequests: complaint.woredaRequests,
      canReopen,
    };

    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const isWithinReopenWindow = (complaint) => {
  const base = complaint.resolvedAt || complaint.rejectedAt || complaint.closedAt;
  if (!base) return false;
  return Date.now() - new Date(base).getTime() <= REOPEN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
};

// ── Public reopen (tracking) ──────────────────────────────────────────────────

// POST /api/governance-complaints/reopen-by-tracking  { trackingId, phone, reason }
const reopenByTracking = async (req, res) => {
  try {
    const { trackingId, phone, reason } = req.body;
    const complaint = await GovernanceComplaint.findOne({
      trackingId: { $regex: `^${escapeRegex(trackingId)}$`, $options: 'i' },
    });
    if (!complaint) return res.status(404).json({ success: false, message: 'No complaint found with that tracking ID.' });

    const normalized = String(phone || '').replace(/\s+/g, '');
    const stored = String(complaint.reporterPhone || '').replace(/\s+/g, '');
    if (!normalized || !stored || normalized !== stored) {
      return res.status(403).json({ success: false, message: 'Please enter the phone number used to submit this complaint.' });
    }
    if (!CLOSED_STATUSES.includes(complaint.status)) {
      return res.status(400).json({ success: false, message: `Only closed complaints can be reopened (current: ${complaint.status}).` });
    }
    if (complaint.reopenedCount >= 2) {
      return res.status(400).json({ success: false, message: 'This complaint has already been reopened twice.' });
    }
    if (!isWithinReopenWindow(complaint)) {
      return res.status(400).json({ success: false, message: `Complaints can only be reopened within ${REOPEN_WINDOW_DAYS} days of resolution.` });
    }

    const previousStatus = complaint.status;
    complaint.reopenedCount = (complaint.reopenedCount || 0) + 1;
    complaint.status = 'Reopened';
    complaint.reopenedAt = new Date();
    complaint.reopenedByName = complaint.reporterName || 'Citizen';
    complaint.isOverdue = false;
    await recordAudit(req, complaint, 'Reopened', null, `Complaint reopened by citizen (was ${previousStatus})`, { oldStatus: previousStatus, newStatus: 'Reopened' });
    pushTimeline(complaint, 'Reopened', 'Complaint Reopened', String(reason || 'The citizen requested the complaint be reopened.').trim(), null);

    await complaint.save();

    const io = getIO(req);
    const officeOfficers = complaint.officeId ? await findOfficeOfficers(complaint.officeId) : [];
    await dispatchGovernanceNotification(io, complaint, officeOfficers, {
      event: 'Reopened',
      title: `Complaint ${complaint.trackingId} reopened`,
      message: `${complaint.reporterName || 'The reporter'} reopened this public complaint.`,
      type: 'governance_reopened',
    });

    const confirm = `Your complaint ${complaint.trackingId} has been reopened and is back under review.`;
    complaint.notificationHistory.push({ event: 'Reopened', title: `Complaint ${complaint.trackingId} reopened`, message: confirm, channels: 'sms' });
    await sendSms({ to: complaint.reporterPhone, message: confirm });
    if (complaint.reporterEmail) await sendEmail({ to: complaint.reporterEmail, subject: `Complaint ${complaint.trackingId} reopened`, text: confirm });

    await complaint.save();
    emitUpdate(io, complaint);

    res.json({ success: true, message: 'Complaint reopened', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Officer: generic status update ────────────────────────────────────────────

// POST /api/governance-complaints/:id/status
const updateStatus = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised to update this complaint.' });
    }
    if (!GOVERNANCE_MANAGER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorised to update complaints.' });
    }

    const allowed = [
      'Submitted', 'Under Review', 'Need More Information', 'In Progress',
      'Investigation in Progress',
      'Awaiting Woreda Response', 'Action Taken', 'Resolved', 'Rejected', 'Closed',
    ];
    const status = req.body.status;
    if (!allowed.includes(status)) {
      return res.status(400).json({ success: false, message: `Invalid status transition: ${status}.` });
    }
    if (status === complaint.status) {
      return res.status(400).json({ success: false, message: 'Complaint is already in that status.' });
    }

    const previous = complaint.status;
    complaint.status = status;
    if (status === 'Resolved') {
      complaint.resolvedAt = new Date();
      complaint.resolvedBy = req.user._id;
      complaint.resolvedByName = req.user.fullName;
      complaint.resolutionNote = String(req.body.resolutionNote || req.body.note || complaint.resolutionNote || '').trim();
    }
    if (status === 'Rejected') {
      if (!String(req.body.rejectionReason || req.body.note || '').trim()) {
        return res.status(400).json({ success: false, message: 'A rejection reason is required.' });
      }
      complaint.rejectedAt = new Date();
      complaint.rejectedBy = req.user._id;
      complaint.rejectedByName = req.user.fullName;
      complaint.rejectionReason = String(req.body.rejectionReason || req.body.note || '').trim();
    }
    if (status === 'Closed') {
      complaint.closedAt = new Date();
      complaint.closedBy = req.user._id;
      complaint.closedByName = req.user.fullName;
    }

    await recordAudit(req, complaint, 'Status Changed', req.user, `${previous} → ${status}`, { oldStatus: previous, newStatus: status });
    pushTimeline(complaint, status, `Status changed to ${status}`, String(req.body.note || '').trim(), req.user);

    await complaint.save();
    await notifyStatusChange(complaint, req, { previous, status });
    emitUpdate(getIO(req), complaint);

    res.json({ success: true, message: 'Complaint status updated', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const notifyStatusChange = async (complaint, req, { previous, status }) => {
  const io = getIO(req);
  const eventMap = {
    'Under Review': { event: 'Under Review', type: 'governance_status', message: 'Your public complaint is now under review.' },
    'Need More Information': { event: 'Information Requested', type: 'governance_info_requested', message: 'The office needs more information on your public complaint.' },
    'In Progress': { event: 'In Progress', type: 'governance_status', message: 'Work has started on your public complaint.' },
    'Investigation in Progress': { event: 'Investigation Started', type: 'governance_status', message: 'An investigation has started on your public complaint.' },
    'Action Taken': { event: 'Action Taken', type: 'governance_action_taken', message: 'Administrative action has been taken on your public complaint.' },
    'Resolved': { event: 'Resolved', type: 'governance_resolved', message: `Your public complaint has been resolved.${complaint.resolutionNote ? ` Note: ${complaint.resolutionNote}` : ''}` },
    'Rejected': { event: 'Rejected', type: 'governance_rejected', message: `Your public complaint was not accepted. Reason: ${complaint.rejectionReason}` },
    'Closed': { event: 'Closed', type: 'governance_closed', message: 'Your public complaint has been officially closed.' },
  };
  const spec = eventMap[status];
  if (!spec) return;
  const title = `${complaint.trackingId} — ${status}`;
  // The citizen is the sole recipient of officer-driven status changes — the
  // acting officer is excluded, and subcity admins get no per-message noise.
  const actorId = req?.user?._id || null;

  if (complaint.reporter) {
    const reporter = await User.findById(complaint.reporter).select('-password').lean();
    if (reporter) {
      await dispatchGovernanceNotification(io, complaint, [{ ...reporter, smsNotifications: true, emailNotifications: true }], {
        ...spec,
        title,
        message: spec.message,
        type: spec.type,
        actorId,
      });
    }
  } else if (complaint.reporterPhone) {
    complaint.notificationHistory.push({ event: spec.event, title, message: spec.message, channels: 'sms' });
    await sendSms({ to: complaint.reporterPhone, message: spec.message });
    if (complaint.reporterEmail) await sendEmail({ to: complaint.reporterEmail, subject: title, text: spec.message });
    await complaint.save();
  }
};

// ── Officer assignment ────────────────────────────────────────────────────────

// GET /api/governance-complaints/:id/assignable-officers
// Officers eligible to handle a complaint: members of the complaint's
// GovernmentOffice, falling back to active governance staff of the subcity.
const getAssignableOfficers = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id).lean();
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (!SUB_CITY_OFFICER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorised to assign officers.' });
    }
    let officers;
    if (complaint.officeId) {
      officers = await findOfficeOfficers(complaint.officeId);
    } else {
      officers = await User.find({
        subcity: ciRegex(complaint.subcity || ''),
        role: { $in: ['GOVERNANCE_OFFICER', 'OFFICE_SUPERVISOR', ...ALL_SUB_CITY_ROLES] },
        isActive: true,
      }).select('-password').sort('fullName').lean();
    }
    res.json({
      success: true,
      data: officers.map((o) => ({
        _id: o._id,
        fullName: o.fullName,
        email: o.email,
        phone: o.phone,
        role: o.role,
        governmentOfficeName: o.governmentOfficeName || '—',
      })),
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/governance-complaints/:id/assign  { officerId, note }
const assignOfficer = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (!SUB_CITY_OFFICER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorised to assign officers.' });
    }
    const officer = await User.findById(req.body.officerId).select('-password');
    if (!officer || !officer.isActive) {
      return res.status(400).json({ success: false, message: 'The selected officer is not available.' });
    }
    if (complaint.subcity && officer.subcity && complaint.subcity !== officer.subcity) {
      return res.status(400).json({ success: false, message: 'The officer does not belong to this subcity.' });
    }
    if (complaint.officeId && officer.governmentOfficeId && String(officer.governmentOfficeId) !== String(complaint.officeId)) {
      return res.status(400).json({ success: false, message: 'The officer is not assigned to this complaint\'s office.' });
    }

    const previousAssignee = complaint.assignedTo ? String(complaint.assignedTo) : null;
    const wasSubmitted = complaint.status === 'Submitted';
    complaint.assignedTo = officer._id;
    complaint.assignedAt = new Date();
    complaint.assignedBy = req.user._id;
    complaint.assignedByName = req.user.fullName;
    if (officer.governmentOfficeName) complaint.assignedToOffice = officer.governmentOfficeName;
    if (wasSubmitted) complaint.status = 'Under Review';

    const note = String(req.body.note || '').trim();
    await recordAudit(
      req,
      complaint,
      'Officer Assigned',
      req.user,
      `Complaint assigned to ${officer.fullName}${note ? `: ${note}` : ''}${previousAssignee ? ` (reassigned from ${previousAssignee})` : ''}`,
      { oldStatus: wasSubmitted ? 'Submitted' : undefined, newStatus: complaint.status }
    );
    pushTimeline(complaint, 'Assigned', 'Officer assigned', `${officer.fullName} has been assigned${note ? ` — ${note}` : ''}.`, req.user);

    await complaint.save();
    emitUpdate(getIO(req), complaint);

    const io = getIO(req);
    const supervisors = await findOfficeSupervisors(complaint.officeId);
    await dispatchGovernanceNotification(io, complaint, [officer, ...supervisors], {
      event: 'Assigned',
      title: `New assignment: ${complaint.trackingId}`,
      message: `You have been assigned to handle complaint ${complaint.trackingId} (${complaint.category}).`,
      type: 'governance_status',
      actorId: req.user._id,
    });

    res.json({ success: true, message: `Complaint assigned to ${officer.fullName}`, data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/governance-complaints/:id/confirm-resolution
const confirmResolution = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (complaint.status !== 'Resolved') {
      return res.status(400).json({ success: false, message: 'Only resolved complaints can be confirmed.' });
    }
    const isReporter = complaint.reporter && String(complaint.reporter) === String(req.user._id);
    const isPhoneMatch = !complaint.reporter && req.user.phone &&
      String(complaint.reporterPhone || '').replace(/\s+/g, '') === String(req.user.phone).replace(/\s+/g, '');
    if (!isReporter && !isPhoneMatch) {
      return res.status(403).json({ success: false, message: 'Only the reporter can confirm resolution.' });
    }
    if (complaint.confirmedByCitizen) {
      return res.status(400).json({ success: false, message: 'Resolution has already been confirmed.' });
    }

    complaint.confirmedByCitizen = true;
    complaint.confirmedAt = new Date();
    await recordAudit(req, complaint, 'Resolution Confirmed', req.user, 'Resolution confirmed by the citizen reporter', { newStatus: complaint.status });
    pushTimeline(complaint, 'Confirmed', 'Resolution confirmed by citizen', 'The reporter confirmed that the complaint has been resolved.', req.user);

    await complaint.save();
    emitUpdate(getIO(req), complaint);
    res.json({ success: true, message: 'Resolution confirmed', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Officer responses + additional-information requests ───────────────────────

// POST /api/governance-complaints/:id/respond  (upload.array('evidence', 8))
// Posts a citizen-facing response from the assigned office. The message is
// recorded as a formal response, appended to the timeline, and the reporter is
// notified (in-app + SMS/email when a channel is available).
const respondToCitizen = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (!GOVERNANCE_MANAGER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorised to respond to complaints.' });
    }
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'A response message is required.' });

    const urls = fileUrls(req);
    complaint.officerResponses.push({
      message,
      files: urls,
      user: req.user._id,
      userName: req.user.fullName,
      role: req.user.role,
    });
    await recordAudit(req, complaint, 'Response Posted', req.user, `Officer responded to the citizen: ${message}`);
    pushTimeline(complaint, 'Officer Response', 'Response from the office', message, req.user, urls);

    await complaint.save();

    const io = getIO(req);
    const responseMessage = `The ${complaint.office} responded to your complaint ${complaint.trackingId}. ${message}`;
    const responseTitle = `Response on ${complaint.trackingId}`;
    if (complaint.reporter) {
      const reporter = await User.findById(complaint.reporter).select('-password').lean();
      if (reporter) {
        await dispatchGovernanceNotification(io, complaint, [reporter], {
          event: 'Officer Response',
          title: responseTitle,
          message: responseMessage,
          type: 'governance_status',
          actorId: req.user._id,
        });
      }
    } else if (complaint.reporterPhone) {
      complaint.notificationHistory.push({ event: 'Officer Response', title: responseTitle, message: responseMessage, channels: 'sms' });
      await sendSms({ to: complaint.reporterPhone, message: responseMessage });
      if (complaint.reporterEmail) await sendEmail({ to: complaint.reporterEmail, subject: responseTitle, text: responseMessage });
      await complaint.save();
    }

    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Response sent to the citizen', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/governance-complaints/:id/request-info  { message }
// Requests additional information from the reporter and moves the complaint to
// the "Need More Information" status so the reporter knows action is required.
const requestMoreInfo = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (!GOVERNANCE_MANAGER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorised to request information.' });
    }
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'A message explaining what information is needed is required.' });

    const previous = complaint.status;
    complaint.status = 'Need More Information';
    complaint.officerResponses.push({
      message: `Additional information requested: ${message}`,
      files: [],
      user: req.user._id,
      userName: req.user.fullName,
      role: req.user.role,
    });
    await recordAudit(req, complaint, 'Information Requested', req.user, `Additional information requested from the reporter: ${message}`, { oldStatus: previous, newStatus: 'Need More Information' });
    pushTimeline(complaint, 'Information Requested', 'Additional information requested', message, req.user);

    await complaint.save();
    await notifyStatusChange(complaint, req, { previous, status: 'Need More Information' });
    emitUpdate(getIO(req), complaint);

    res.json({ success: true, message: 'Additional information requested from the citizen', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Woreda coordination ───────────────────────────────────────────────────────

// POST /api/governance-complaints/:id/request-woreda
const requestWoredaInfo = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (!SUB_CITY_OFFICER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only Subcity Governance officers can request woreda information.' });
    }
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'A message is required.' });

    const dueAt = new Date(Date.now() + WOREDA_REQUEST_DAYS * 24 * 60 * 60 * 1000);
    complaint.woredaRequests.push({
      message,
      requestedBy: req.user._id,
      requestedByName: req.user.fullName,
      requestedAt: new Date(),
      dueAt,
      status: 'Pending',
    });
    complaint.status = 'Awaiting Woreda Response';
    await recordAudit(req, complaint, 'Woreda Contacted', req.user, `Official request sent to the woreda (due ${dueAt.toLocaleDateString()})`, { newStatus: 'Awaiting Woreda Response' });
    pushTimeline(complaint, 'Woreda Contacted', 'Information requested from Woreda', message, req.user);

    await complaint.save();

    const io = getIO(req);
    const woredaOfficers = await findWoredaOfficers(complaint.woredaId);
    await dispatchGovernanceNotification(io, complaint, woredaOfficers, {
      event: 'Woreda Contacted',
      title: `Official request on ${complaint.trackingId}`,
      message: `${complaint.subcity} Subcity Governance requested information about "${complaint.office}". Due: ${dueAt.toLocaleDateString()}.`,
      type: 'governance_info_requested',
      actorId: req.user._id,
    });

    if (complaint.reporter) {
      const reporter = await User.findById(complaint.reporter).select('-password').lean();
      if (reporter) {
        await dispatchGovernanceNotification(io, complaint, [reporter], {
          event: 'Woreda Contacted',
          title: `Update on ${complaint.trackingId}`,
          message: 'The Subcity Governance Office is coordinating with the woreda on your complaint.',
          type: 'governance_status',
          actorId: req.user._id,
        });
      }
    }

    await complaint.save();
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Request sent to the woreda', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/governance-complaints/:id/respond-woreda  { requestId, response }
const respondToWoredaRequest = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (!WOREDA_OFFICER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only woreda officers can respond to woreda requests.' });
    }

    const request = complaint.woredaRequests.id(req.body.requestId);
    if (!request) return res.status(404).json({ success: false, message: 'Request not found.' });
    if (request.status !== 'Pending') {
      return res.status(400).json({ success: false, message: `This request has already been ${request.status.toLowerCase()}.` });
    }
    const response = String(req.body.response || '').trim();
    if (!response) return res.status(400).json({ success: false, message: 'A response message is required.' });

    request.response = response;
    request.responseFiles = fileUrls(req);
    request.status = 'Responded';
    request.respondedAt = new Date();
    request.respondedBy = req.user._id;
    request.respondedByName = req.user.fullName;

    complaint.status = 'Investigation in Progress';
    await recordAudit(req, complaint, 'Woreda Responded', req.user, 'Woreda submitted its response to the request', { newStatus: 'Investigation in Progress' });
    pushTimeline(complaint, 'Woreda Responded', 'Woreda response received', response, req.user, request.responseFiles);

    await complaint.save();

    const io = getIO(req);
    const requester = request.requestedBy
      ? await User.findById(request.requestedBy).select('-password').lean()
      : null;
    await dispatchGovernanceNotification(io, complaint, requester ? [requester] : [], {
      event: 'Woreda Responded',
      title: `Woreda response on ${complaint.trackingId}`,
      message: `${req.user.fullName} responded to the information request.`,
      type: 'governance_status',
      actorId: req.user._id,
    });
    await complaint.save();
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Response submitted', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Investigation tools ───────────────────────────────────────────────────────

// POST /api/governance-complaints/:id/notes
const addInvestigationNote = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (!GOVERNANCE_MANAGER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorised to add notes.' });
    }
    const note = String(req.body.note || '').trim();
    if (!note) return res.status(400).json({ success: false, message: 'A note is required.' });

    complaint.investigationNotes.push({
      note,
      user: req.user._id,
      userName: req.user.fullName,
      role: req.user.role,
    });
    await recordAudit(req, complaint, 'Note Added', req.user, 'Investigation note added');
    pushTimeline(complaint, 'Note Added', 'Investigation note added', note, req.user);

    await complaint.save();
    res.json({ success: true, message: 'Note added', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/governance-complaints/:id/documents  (upload.array('documents', 8))
const uploadOfficialDocument = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (!GOVERNANCE_MANAGER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorised to upload documents.' });
    }
    const urls = fileUrls(req);
    if (!urls.length) return res.status(400).json({ success: false, message: 'No documents uploaded.' });

    complaint.officialDocuments.push(...urls);
    await recordAudit(req, complaint, 'Document Uploaded', req.user, `${urls.length} official document(s) attached`);
    pushTimeline(complaint, 'Document Uploaded', 'Official documents attached', `${urls.length} document(s) uploaded`, req.user, urls);

    await complaint.save();
    res.json({ success: true, message: 'Documents uploaded', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/governance-complaints/:id/administrative-action
const recordAdministrativeAction = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (!GOVERNANCE_MANAGER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorised to record administrative actions.' });
    }
    const action = req.body.action;
    if (!ADMIN_ACTIONS.includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid administrative action.' });
    }

    complaint.adminActions.push({
      action,
      note: String(req.body.note || '').trim(),
      files: fileUrls(req),
      recordedBy: req.user._id,
      recordedByName: req.user.fullName,
      recordedAt: new Date(),
    });
    complaint.status = 'Action Taken';
    await recordAudit(req, complaint, 'Admin Action Recorded', req.user, `Administrative action recorded: ${action}`, { newStatus: 'Action Taken' });
    pushTimeline(complaint, 'Action Taken', `Administrative action: ${action}`, String(req.body.note || '').trim(), req.user);

    await complaint.save();
    const io = getIO(req);
    await notifyStatusChange(complaint, req, { previous: 'Investigation in Progress', status: 'Action Taken' });
    emitUpdate(io, complaint);

    res.json({ success: true, message: 'Administrative action recorded', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/governance-complaints/:id/resolve
const resolveComplaint = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (!GOVERNANCE_MANAGER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorised to resolve complaints.' });
    }
    const resolutionNote = String(req.body.resolutionNote || '').trim();
    if (!resolutionNote) return res.status(400).json({ success: false, message: 'A resolution note is required.' });

    const previous = complaint.status;
    complaint.status = 'Resolved';
    complaint.resolvedAt = new Date();
    complaint.resolvedBy = req.user._id;
    complaint.resolvedByName = req.user.fullName;
    complaint.resolutionNote = resolutionNote;
    complaint.isOverdue = false;
    await recordAudit(req, complaint, 'Resolved', req.user, `Complaint resolved: ${resolutionNote}`, { oldStatus: previous, newStatus: 'Resolved' });
    pushTimeline(complaint, 'Resolved', 'Complaint resolved', resolutionNote, req.user);

    await complaint.save();
    await notifyStatusChange(complaint, req, { previous, status: 'Resolved' });
    emitUpdate(getIO(req), complaint);
    res.json({ success: true, message: 'Complaint resolved', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/governance-complaints/:id/reject
const rejectComplaint = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (!GOVERNANCE_MANAGER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorised to reject complaints.' });
    }
    const rejectionReason = String(req.body.rejectionReason || '').trim();
    if (!rejectionReason) return res.status(400).json({ success: false, message: 'A rejection reason is required.' });

    const previous = complaint.status;
    complaint.status = 'Rejected';
    complaint.rejectedAt = new Date();
    complaint.rejectedBy = req.user._id;
    complaint.rejectedByName = req.user.fullName;
    complaint.rejectionReason = rejectionReason;
    await recordAudit(req, complaint, 'Rejected', req.user, `Complaint rejected: ${rejectionReason}`, { oldStatus: previous, newStatus: 'Rejected' });
    pushTimeline(complaint, 'Rejected', 'Complaint rejected', rejectionReason, req.user);

    await complaint.save();
    await notifyStatusChange(complaint, req, { previous, status: 'Rejected' });
    emitUpdate(getIO(req), complaint);
    res.json({ success: true, message: 'Complaint rejected', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/governance-complaints/:id/escalate
const escalateComplaint = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (!GOVERNANCE_MANAGER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorised to escalate complaints.' });
    }
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'An escalation reason is required.' });

    complaint.escalated = true;
    complaint.escalatedTo = req.body.escalatedTo === 'Regional Bureau' ? 'Regional Bureau' : 'Subcity Administrator';
    complaint.escalatedAt = new Date();
    complaint.escalationReason = reason;
    complaint.escalatedBy = req.user._id;
    complaint.escalatedByName = req.user.fullName;
    complaint.status = 'Escalated';
    await recordAudit(req, complaint, 'Escalated', req.user, `Escalated to ${complaint.escalatedTo}: ${reason}`, { newStatus: 'Escalated' });
    pushTimeline(complaint, 'Escalated', `Escalated to ${complaint.escalatedTo}`, reason, req.user);

    await complaint.save();

    const io = getIO(req);
    const subcityAdmins = await findSubcityAdmins(complaint.subcity);
    await dispatchGovernanceNotification(io, complaint, subcityAdmins, {
      event: 'Escalated',
      title: `Complaint ${complaint.trackingId} escalated`,
      message: `Escalated to ${complaint.escalatedTo}. Reason: ${reason}`,
      type: 'governance_escalated',
      actorId: req.user._id,
    });

    if (complaint.reporter) {
      const reporter = await User.findById(complaint.reporter).select('-password').lean();
      if (reporter) {
        await dispatchGovernanceNotification(io, complaint, [reporter], {
          event: 'Escalated',
          title: `Update on ${complaint.trackingId}`,
          message: 'Your public complaint has been escalated to a higher authority.',
          type: 'governance_escalated',
          actorId: req.user._id,
        });
      }
    }

    await complaint.save();
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Complaint escalated', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Citizen actions ───────────────────────────────────────────────────────────

// POST /api/governance-complaints/:id/reopen  (citizen reporter or officer)
const reopenComplaint = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (!CLOSED_STATUSES.includes(complaint.status)) {
      return res.status(400).json({ success: false, message: `Only closed complaints can be reopened (current: ${complaint.status}).` });
    }
    if (req.user.role === 'citizen' && complaint.reopenedCount >= 2) {
      return res.status(400).json({ success: false, message: 'This complaint has already been reopened twice.' });
    }

    const previousStatus = complaint.status;
    complaint.reopenedCount = (complaint.reopenedCount || 0) + 1;
    complaint.status = 'Reopened';
    complaint.reopenedAt = new Date();
    complaint.reopenedBy = req.user._id;
    complaint.reopenedByName = req.user.fullName;
    complaint.isOverdue = false;
    await recordAudit(req, complaint, 'Reopened', req.user, `Complaint reopened (was ${previousStatus})`, { oldStatus: previousStatus, newStatus: 'Reopened' });

    await complaint.save();

    const io = getIO(req);
    const recipients = await findAssignmentRecipients(complaint);
    await dispatchGovernanceNotification(io, complaint, recipients, {
      event: 'Reopened',
      title: `Complaint ${complaint.trackingId} reopened`,
      message: `${req.user.fullName} reopened this public complaint.`,
      type: 'governance_reopened',
      actorId: req.user._id,
    });
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Complaint reopened', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/governance-complaints/:id/evidence  (upload.array('evidence', 8))
const addEvidence = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (req.user.role === 'citizen' && String(complaint.reporter) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only the reporter can add evidence.' });
    }
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    const urls = fileUrls(req);
    if (!urls.length) return res.status(400).json({ success: false, message: 'No files uploaded.' });

    complaint.evidenceFiles.push(...urls);
    await recordAudit(req, complaint, 'Evidence Added', req.user, `${urls.length} additional evidence file(s) attached`);
    pushTimeline(complaint, 'Evidence Added', 'Additional evidence attached', `${urls.length} file(s) uploaded by the reporter`, req.user, urls);

    await complaint.save();

    const io = getIO(req);
    const recipients = await findAssignmentRecipients(complaint);
    await dispatchGovernanceNotification(io, complaint, recipients, {
      event: 'Evidence Added',
      title: `New evidence on ${complaint.trackingId}`,
      message: 'The reporter uploaded additional evidence.',
      type: 'governance_status',
      actorId: req.user._id,
    });
    await complaint.save();
    res.json({ success: true, message: 'Evidence added', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/governance-complaints/:id/citizen-reply  (citizen reporter)
// Lets the reporter answer a "Need More Information" request (or any follow-up)
// with a text message and optional files. Replying to a complaint that is
// awaiting information moves it back to "Under Review" so the office knows the
// reporter has responded.
const sendCitizenReply = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (String(complaint.reporter) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only the reporter can reply to this complaint.' });
    }
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'A reply message is required.' });

    const urls = fileUrls(req);
    complaint.citizenReplies.push({
      message,
      files: urls,
      user: req.user._id,
      userName: req.user.fullName || req.user.role,
    });

    let previous = complaint.status;
    if (complaint.status === 'Need More Information') {
      complaint.status = 'Under Review';
      complaint.isOverdue = false;
    }
    await recordAudit(req, complaint, 'Citizen Replied', req.user, `Reporter replied: ${message}`, { oldStatus: previous, newStatus: complaint.status });
    pushTimeline(complaint, 'Citizen Replied', 'Citizen replied', message, req.user, urls);

    await complaint.save();

    const io = getIO(req);
    const recipients = await findAssignmentRecipients(complaint);
    await dispatchGovernanceNotification(io, complaint, recipients, {
      event: 'Citizen Replied',
      title: `Reporter replied on ${complaint.trackingId}`,
      message: 'The citizen replied to your request for more information.',
      type: 'governance_status',
      actorId: req.user._id,
    });

    await complaint.save();
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Reply sent to the office', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/governance-complaints/:id/feedback  (citizen reporter)
// Service rating (1-5) + optional comment once the complaint is resolved.
const submitFeedback = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (String(complaint.reporter) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only the reporter can submit feedback.' });
    }
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (!['Resolved', 'Closed'].includes(complaint.status)) {
      return res.status(400).json({ success: false, message: 'Feedback is only available after the complaint is resolved.' });
    }
    if (complaint.citizenFeedback && complaint.citizenFeedback.rating) {
      return res.status(400).json({ success: false, message: 'Feedback already submitted.' });
    }
    const rating = parseInt(req.body.rating, 10);
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ success: false, message: 'Rating must be between 1 and 5.' });
    }
    complaint.citizenFeedback = {
      rating,
      comment: String(req.body.comment || '').trim(),
      at: new Date(),
    };
    await recordAudit(req, complaint, 'Feedback', req.user, `Citizen feedback: ${rating}/5`);
    pushTimeline(complaint, 'Feedback', 'Citizen feedback', `${rating}/5 ${complaint.citizenFeedback.comment ? '— ' + complaint.citizenFeedback.comment : ''}`, req.user);

    await complaint.save();

    const io = getIO(req);
    const recipients = await findAssignmentRecipients(complaint);
    await dispatchGovernanceNotification(io, complaint, recipients, {
      event: 'Citizen feedback',
      title: `Feedback on ${complaint.trackingId}: ${rating}/5`,
      message: `${req.user.fullName} rated their experience ${rating}/5.`,
      type: 'governance_status',
      actorId: req.user._id,
    });
    await complaint.save();
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Feedback submitted', data: withDisplay(complaint) });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/governance-complaints/:id/acknowledgment
const downloadAcknowledgment = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id).lean();
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    generateAcknowledgmentPDF(complaint, res);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Audit trail ───────────────────────────────────────────────────────────────

// GET /api/governance-complaints/:id/audit
const getAuditTrail = async (req, res) => {
  try {
    const complaint = await GovernanceComplaint.findById(req.params.id).select('trackingId auditTrail').lean();
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (!isComplaintInScope(req.user, complaint)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    res.json({ success: true, data: complaint.auditTrail || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Stats / widgets ───────────────────────────────────────────────────────────

// GET /api/governance-complaints/stats
const getStats = async (req, res) => {
  try {
    const scope = buildGovernanceScope(req.user);
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [
      total, submitted, underReview, inProgress, needMoreInfo, awaitingWoreda,
      resolvedToday, escalated, resolved, reopened, byStatus, overdue,
    ] = await Promise.all([
      GovernanceComplaint.countDocuments(scope),
      GovernanceComplaint.countDocuments({ ...scope, status: 'Submitted' }),
      GovernanceComplaint.countDocuments({ ...scope, status: 'Under Review' }),
      GovernanceComplaint.countDocuments({ ...scope, status: { $in: ['Investigation in Progress', 'In Progress'] } }),
      GovernanceComplaint.countDocuments({ ...scope, status: 'Need More Information' }),
      GovernanceComplaint.countDocuments({ ...scope, status: 'Awaiting Woreda Response' }),
      GovernanceComplaint.countDocuments({ ...scope, status: 'Resolved', resolvedAt: { $gte: startOfToday } }),
      GovernanceComplaint.countDocuments({ ...scope, escalated: true }),
      GovernanceComplaint.countDocuments({ ...scope, status: 'Resolved' }),
      GovernanceComplaint.countDocuments({ ...scope, status: 'Reopened' }),
      GovernanceComplaint.aggregate([
        { $match: scope },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      GovernanceComplaint.countDocuments({
        ...scope,
        $or: [
          { slaDueAt: { $lte: now }, status: { $in: ACTIVE_STATUSES } },
          { 'woredaRequests.status': 'Overdue' },
        ],
      }),
    ]);

    const statusDistribution = {};
    byStatus.forEach((s) => { statusDistribution[s._id] = s.count; });

    const isCitizen = ['citizen', 'CITIZEN'].includes(req.user.role);
    res.json({
      success: true,
      data: {
        total,
        submitted,
        underReview,
        inProgress,
        needMoreInfo,
        awaitingWoreda,
        resolvedToday,
        escalated,
        resolved,
        reopened,
        active: ACTIVE_STATUSES.reduce((acc, s) => acc + (statusDistribution[s] || 0), 0),
        statusDistribution,
        overdue,
        isCitizen,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Analytics ─────────────────────────────────────────────────────────────────

// GET /api/governance-complaints/analytics
const getAnalytics = async (req, res) => {
  try {
    const scope = buildGovernanceScope(req.user);
    const now = new Date();

    const [
      byCategory, byWoreda, topOffices, resolutionTime, escalationRate, corruptionStats, monthlyTrend,
      pendingByStatus, overdueComplaints, firstResponseTime, officerPerformance, slaCompliance,
    ] = await Promise.all([
      GovernanceComplaint.aggregate([
        { $match: scope },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      GovernanceComplaint.aggregate([
        { $match: scope },
        { $group: { _id: '$woredaName', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      GovernanceComplaint.aggregate([
        { $match: scope },
        { $group: { _id: '$office', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 },
      ]),
      GovernanceComplaint.aggregate([
        { $match: { ...scope, resolvedAt: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: null,
            avgHours: { $avg: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600000] } },
          },
        },
      ]),
      GovernanceComplaint.aggregate([
        { $match: scope },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            escalated: { $sum: { $cond: [{ $eq: ['$escalated', true] }, 1, 0] } },
          },
        },
      ]),
      GovernanceComplaint.aggregate([
        { $match: scope },
        {
          $group: {
            _id: null,
            corruption: { $sum: { $cond: [{ $eq: ['$category', 'Corruption / Bribery'] }, 1, 0] } },
            antiCorruptionReferrals: {
              $sum: { $cond: [{ $in: ['Anti-Corruption Referral', { $ifNull: ['$adminActions.action', []] }] }, 1, 0] },
            },
          },
        },
      ]),
      GovernanceComplaint.aggregate([
        { $match: scope },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            count: { $sum: 1 },
          },
        },
        { $sort: { _id: 1 } },
      ]),
      // Complaints still awaiting action, grouped by status.
      GovernanceComplaint.aggregate([
        { $match: { ...scope, status: { $nin: CLOSED_STATUSES } } },
        { $group: { _id: '$status', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      // Overdue + soon-due complaints.
      GovernanceComplaint.find({
        ...scope,
        status: { $nin: CLOSED_STATUSES },
        $or: [{ isOverdue: true }, { slaDueAt: { $lte: new Date(now.getTime() + 24 * 3600000) } }],
      })
        .select('trackingId status office subcity slaDueAt isOverdue createdAt')
        .sort({ slaDueAt: 1 })
        .limit(100)
        .lean(),
      // Average time from creation to first officer response (timeline entry
      // with event 'Officer Response').
      GovernanceComplaint.aggregate([
        { $match: scope },
        { $match: { 'timeline.event': 'Officer Response' } },
        { $unwind: '$timeline' },
        { $match: { 'timeline.event': 'Officer Response' } },
        {
          $group: {
            _id: null,
            avgHours: {
              $avg: { $divide: [{ $subtract: ['$timeline.createdAt', '$createdAt'] }, 3600000] },
            },
          },
        },
      ]),
      // Per-officer performance: resolved count + avg resolution hours.
      GovernanceComplaint.aggregate([
        {
          $match: {
            ...scope,
            $or: [{ status: { $in: ['Resolved', 'Closed'] } }, { resolvedAt: { $exists: true, $ne: null } }],
          },
        },
        { $unwind: '$officerResponses' },
        {
          $group: {
            _id: '$officerResponses.userName',
            responses: { $sum: 1 },
          },
        },
        { $sort: { responses: -1 } },
        { $limit: 10 },
      ]),
      // SLA compliance: resolved/closed complaints resolved at or before slaDueAt.
      GovernanceComplaint.aggregate([
        {
          $match: {
            ...scope,
            status: { $in: ['Resolved', 'Closed'] },
            slaDueAt: { $exists: true, $ne: null },
          },
        },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            compliant: { $sum: { $cond: [{ $lte: ['$resolvedAt', '$slaDueAt'] }, 1, 0] } },
          },
        },
      ]),
    ]);

    const round = (n) => (n == null ? null : Math.round(n * 100) / 100);
    const escalation = escalationRate[0];
    const corrupt = corruptionStats[0];
    const sla = slaCompliance[0];
    const pendingTotal = pendingByStatus.reduce((sum, row) => sum + row.count, 0);

    res.json({
      success: true,
      data: {
        byCategory,
        byWoreda,
        topOffices,
        averageResolutionHours: resolutionTime[0] ? round(resolutionTime[0].avgHours) : null,
        averageFirstResponseHours: firstResponseTime[0] ? round(firstResponseTime[0].avgHours) : null,
        total: escalation?.total || 0,
        escalatedCount: escalation?.escalated || 0,
        escalationRate: escalation && escalation.total ? round((escalation.escalated / escalation.total) * 100) : 0,
        corruptionCount: corrupt?.corruption || 0,
        antiCorruptionReferrals: corrupt?.antiCorruptionReferrals || 0,
        monthlyTrend,
        pendingByStatus,
        pendingTotal,
        overdueComplaints,
        officerPerformance,
        slaComplianceRate: sla && sla.total ? round((sla.compliant / sla.total) * 100) : null,
        slaCompliantCount: sla?.compliant || 0,
        slaTotalCount: sla?.total || 0,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Exports ───────────────────────────────────────────────────────────────────

// GET /api/governance-complaints/export/pdf | /export/excel
const exportComplaints = async (req, res) => {
  try {
    const scope = buildGovernanceScope(req.user);
    const filter = { ...scope };

    if (req.query.status) filter.status = req.query.status;
    if (req.query.category) filter.category = req.query.category;
    if (req.query.office) filter.office = ciRegex(req.query.office);
    if (req.query.subcity) filter.subcity = ciRegex(req.query.subcity);

    const complaints = await GovernanceComplaint.find(filter)
      .sort({ createdAt: -1 })
      .limit(2000)
      .lean();

    if (req.path.includes('/excel')) {
      res.setHeader('Content-Type', 'application/vnd.ms-excel');
      res.setHeader('Content-Disposition', `attachment; filename=governance-complaints-${Date.now()}.xls`);
      return res.send(generateGovernanceExcel(complaints));
    }
    return generateGovernancePDF(complaints, res);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Escalation scheduler pass ─────────────────────────────────────────────────

const runGovernanceEscalationPass = async (io) => {
  const now = new Date();

  // Mark overdue woreda requests + flag complaints whose SLA has passed.
  const overdueComplaints = await GovernanceComplaint.find({
    status: { $nin: CLOSED_STATUSES },
    $or: [
      { slaDueAt: { $lte: now }, isOverdue: { $ne: true } },
      { 'woredaRequests.status': 'Pending', 'woredaRequests.dueAt': { $lte: now } },
    ],
  });

  for (const complaint of overdueComplaints) {
    let changed = false;
    complaint.woredaRequests.forEach((request) => {
      if (request.status === 'Pending' && request.dueAt && request.dueAt <= now) {
        request.status = 'Overdue';
        changed = true;
      }
    });
    if (complaint.slaDueAt && complaint.slaDueAt <= now) {
      complaint.isOverdue = true;
      complaint.overdueSince = complaint.overdueSince || now;
      changed = true;
    }
    if (!changed) continue;

    complaint.overdueNotifiedAt = now;
    await recordAudit(null, complaint, 'Overdue', null, 'Complaint flagged as overdue');
    await complaint.save();

    const subcityAdmins = await findSubcityAdmins(complaint.subcity);
    await dispatchGovernanceNotification(io, complaint, subcityAdmins, {
      event: 'Overdue',
      title: `Complaint ${complaint.trackingId} overdue`,
      message: 'This public complaint has passed its response deadline or has an overdue woreda request.',
      type: 'governance_status',
    });

    const officeOfficers = complaint.officeId
      ? await findOfficeOfficers(complaint.officeId)
      : [];
    const supervisors = officeOfficers.filter((o) => o.role === 'OFFICE_SUPERVISOR');
    const assignedOfficer = complaint.assignedTo
      ? await User.findById(complaint.assignedTo).select('-password').lean()
      : null;
    await dispatchGovernanceNotification(io, complaint, supervisors, {
      event: 'Overdue',
      title: `Complaint ${complaint.trackingId} overdue`,
      message: 'An assigned complaint has passed its response deadline and needs urgent attention.',
      type: 'governance_status',
    });
    if (assignedOfficer) {
      await dispatchGovernanceNotification(io, complaint, [assignedOfficer], {
        event: 'Overdue',
        title: `Complaint ${complaint.trackingId} overdue`,
        message: 'A complaint assigned to you has passed its response deadline.',
        type: 'governance_status',
      });
    }
    console.log(`[Escalation] Governance complaint flagged overdue: ${complaint.trackingId}`);
  }
};

module.exports = {
  ADMIN_ACTIONS,
  SUB_CITY_OFFICER_ROLES,
  WOREDA_OFFICER_ROLES,
  GOVERNANCE_MANAGER_ROLES,
  GOVERNANCE_VIEWER_ROLES,
  createComplaint,
  getComplaints,
  getComplaintById,
  trackComplaint,
  reopenByTracking,
  updateStatus,
  getAssignableOfficers,
  assignOfficer,
  confirmResolution,
  requestWoredaInfo,
  respondToWoredaRequest,
  respondToCitizen,
  requestMoreInfo,
  addInvestigationNote,
  uploadOfficialDocument,
  recordAdministrativeAction,
  resolveComplaint,
  rejectComplaint,
  escalateComplaint,
  reopenComplaint,
  addEvidence,
  sendCitizenReply,
  submitFeedback,
  downloadAcknowledgment,
  getAuditTrail,
  getStats,
  getAnalytics,
  exportComplaints,
  runGovernanceEscalationPass,
  buildGovernanceScope,
  isComplaintInScope,
  STATUS_ALIASES,
  displayStatusFor,
  withDisplay,
};
