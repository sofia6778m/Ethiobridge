const MunicipalComplaint = require('../models/MunicipalComplaint');
const IssueTemplate = require('../models/IssueTemplate');
const Woreda = require('../models/Woreda');
const User = require('../models/User');
const Department = require('../models/Department');
const Subcity = require('../models/Subcity');
const { notifyUser } = require('../services/notificationService');
const { sendEmail } = require('../services/emailService');
const { sendSms } = require('../services/smsService');
const { generateComplaintPDF, generateComplaintExcel, generateResolutionLetterPDF } = require('../utils/complaintExport');
const { verifySubmissionPassword } = require('../utils/verifySubmissionPassword');
const { normalizeDepartmentName } = require('../utils/departmentNames');

// ── Constants ─────────────────────────────────────────────────────────────────

const SUBCITY_ROLE_MAP = {
  subcity_bole: 'BOLE',
  subcity_yeka: 'YEKA',
  subcity_lemmi_kura: 'LEMMI_KURA',
};

const SUB_CITY_ROLES = Object.keys(SUBCITY_ROLE_MAP);

// Canonical subcity-admin role plus every derived subcity_* flavor. These get
// folded into the viewer/manager/officer lists so subcity admins of any subcity
// (including newly-created ones) can read and drive municipal complaints.
const ALL_SUB_CITY_ROLES = [...SUB_CITY_ROLES, 'subcity_admin', 'SUBCITY_ADMIN'];

const MUNICIPAL_VIEWER_ROLES = ['admin', 'government', ...ALL_SUB_CITY_ROLES, 'woreda', 'department', 'inspector', 'technician', 'citizen'];
const MUNICIPAL_MANAGER_ROLES = ['admin', 'government', ...ALL_SUB_CITY_ROLES, 'woreda', 'department'];

// Roles allowed to drive the operational workflow (accept/reject/assign/verify).
const OFFICER_ROLES = ['admin', 'government', ...ALL_SUB_CITY_ROLES, 'woreda', 'department'];

// Statuses that close out a complaint (no further automatic escalation).
const CLOSED_STATUSES = ['Resolved', 'Rejected', 'Closed'];

const ADMIN_TYPES = ['admin', 'government'];

// ── Small helpers ─────────────────────────────────────────────────────────────

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ciRegex = (s) => ({ $regex: `^${escapeRegex(s)}$`, $options: 'i' });

const normalizeSubcity = (s) => String(s || '')
  .trim()
  .toUpperCase()
  .replace(/\s+/g, '_');

// Resolve the subcity a user belongs to (from their profile or their woreda).
const resolveUserSubcity = async (user) => {
  if (!user) return '';
  if (user.subcity) return user.subcity;
  if (user.woredaId) {
    const w = await Woreda.findById(user.woredaId).lean();
    if (w) return w.subcity;
  }
  return '';
};

// Safely pull the socket.io instance off the Express app (absent in unit tests).
const getIO = (req) => {
  if (!req || !req.app || typeof req.app.get !== 'function') return null;
  return req.app.get('io') || null;
};

// Build a Mongo query filter based on the logged-in user's role. Every
// MunicipalComplaint query MUST pass through here (RBAC enforcement).
//   admin/government  -> all complaints
//   subcity_*         -> complaints in their subcity
//   woreda            -> complaints in their woreda
//   department        -> woreda-level complaints for (woreda + department) OR
//                        subcity-level complaints for (subcity + department)
//   citizen           -> complaints they personally submitted
//   SUBCITY_ADMIN     -> complaints in their subcity
//   WOREDA_ADMIN      -> complaints in their woreda
//   OFFICER           -> complaints assigned to them OR in their woreda/department
//   TECHNICIAN        -> work orders assigned to them OR in their woreda/department
const buildMunicipalScope = (user, subcity = '') => {
  if (!user) return { _id: null };

  // Derived subcity-admin roles (subcity_koye, subcity_kolfe, …) are not
  // enumerated — treat every subcity_* role as scoped to its own subcity.
  if (user.role && typeof user.role === 'string' && user.role.startsWith('subcity_')) {
    const sub = user.subcity || SUBCITY_ROLE_MAP[user.role] || subcity;
    return sub ? { subcity: ciRegex(sub) } : { _id: null };
  }

  switch (user.role) {
    case 'admin':
    case 'government':
    case 'ADMIN':
      return {};

    case 'subcity_bole':
    case 'subcity_yeka':
    case 'subcity_lemmi_kura':
    case 'subcity_admin':
    case 'SUBCITY_ADMIN':
    case 'SUBCITY_HEAD': {
      const sub = user.subcity || SUBCITY_ROLE_MAP[user.role] || subcity;
      return { subcity: ciRegex(sub) };
    }

    case 'woreda':
    case 'woreda_admin':
    case 'WOREDA_ADMIN':
      return { woredaId: user.woredaId };

    case 'department':
    case 'department_officer': {
      const sub = user.subcity || subcity;
      const dept = user.department || '';
      const conditions = [{ assignedLevel: 'Woreda', woredaId: user.woredaId, department: ciRegex(dept) }];
      if (sub) conditions.push({ assignedLevel: 'Subcity', subcity: ciRegex(sub), assignedToDepartment: ciRegex(dept) });
      return { $or: conditions };
    }

    case 'citizen':
    case 'CITIZEN':
      return { reporter: user._id };

    case 'inspector': {
      const conditions = [{ inspectorId: user._id }];
      if (user.subcity) conditions.push({ subcity: ciRegex(user.subcity) });
      if (user.woredaId) conditions.push({ woredaId: user.woredaId });
      return conditions.length === 1 ? conditions[0] : { $or: conditions };
    }

    case 'technician': {
      const conditions = [{ technicianId: user._id }];
      if (user.woredaId) {
        conditions.push(user.department
          ? { woredaId: user.woredaId, department: ciRegex(user.department) }
          : { woredaId: user.woredaId });
      }
      return conditions.length === 1 ? conditions[0] : { $or: conditions };
    }

    case 'TECHNICIAN':
    case 'OFFICER': {
      const conditions = [{ assignedTo: user._id }];
      if (user.role === 'TECHNICIAN') conditions.push({ technicianId: user._id });
      if (user.woredaId) {
        conditions.push(user.department
          ? { woredaId: user.woredaId, department: ciRegex(user.department) }
          : { woredaId: user.woredaId });
      }
      return conditions.length === 1 ? conditions[0] : { $or: conditions };
    }

    default:
      return { _id: null };
  }
};

const isComplaintInScope = (user, complaint, subcity = '') => {
  if (!user || !complaint) return false;

  // Generic derived subcity-admin roles scope by subcity name (case-insensitive).
  if (user.role && typeof user.role === 'string' && user.role.startsWith('subcity_')) {
    const sub = (user.subcity || SUBCITY_ROLE_MAP[user.role] || subcity || '').toLowerCase();
    return !!sub && (complaint.subcity || '').toLowerCase() === sub;
  }

  switch (user.role) {
    case 'admin':
    case 'government':
    case 'ADMIN':
      return true;
    case 'subcity_bole':
    case 'subcity_yeka':
    case 'subcity_lemmi_kura':
    case 'subcity_admin':
    case 'SUBCITY_ADMIN':
    case 'SUBCITY_HEAD': {
      const sub = (user.subcity || SUBCITY_ROLE_MAP[user.role] || subcity || '').toLowerCase();
      return (complaint.subcity || '').toLowerCase() === sub;
    }
    case 'woreda':
    case 'woreda_admin':
    case 'WOREDA_ADMIN':
      return String(complaint.woredaId) === String(user.woredaId);
    case 'department':
    case 'department_officer': {
      const deptMatch = (complaint.department || '').toLowerCase() === (user.department || '').toLowerCase();
      if (complaint.assignedLevel === 'Subcity') {
        const sub = (user.subcity || subcity || '').toLowerCase();
        return sub && (complaint.subcity || '').toLowerCase() === sub &&
          (complaint.assignedToDepartment || '').toLowerCase() === (user.department || '').toLowerCase();
      }
      return String(complaint.woredaId) === String(user.woredaId) && deptMatch;
    }
    case 'citizen':
    case 'CITIZEN':
      return String(complaint.reporter) === String(user._id);
    case 'inspector':
      if (String(complaint.inspectorId) === String(user._id)) return true;
      return !!(user.subcity && (complaint.subcity || '').toLowerCase() === String(user.subcity).toLowerCase());
    case 'technician':
      if (String(complaint.technicianId) === String(user._id)) return true;
      if (user.woredaId && String(complaint.woredaId) === String(user.woredaId)) {
        if (user.department) return (complaint.department || '').toLowerCase() === String(user.department).toLowerCase();
        return true;
      }
      return false;
    case 'TECHNICIAN':
    case 'OFFICER': {
      if (String(complaint.assignedTo) === String(user._id)) return true;
      if (String(complaint.technicianId) === String(user._id)) return true;
      if (user.woredaId && String(complaint.woredaId) === String(user.woredaId)) {
        if (user.department) return (complaint.department || '').toLowerCase() === String(user.department).toLowerCase();
        return true;
      }
      return false;
    }
    default:
      return false;
  }
};

// ── Officer lookups ───────────────────────────────────────────────────────────

const findWoredaOfficer = (woredaId) =>
  User.findOne({ role: 'woreda', woredaId, isActive: true }).select('-password').lean();

const findDepartmentOfficers = (woredaId, department) =>
  User.find({ role: { $in: ['department', 'department_officer'] }, woredaId, department: ciRegex(department), isActive: true }).select('-password').lean();

const findSubcityDepartmentOfficers = async (subcity, department) => {
  const woredas = await Woreda.find({ subcity: ciRegex(subcity) }).select('_id').lean();
  const ids = woredas.map((w) => w._id);
  if (!ids.length) return [];
  return User.find({ role: { $in: ['department', 'department_officer'] }, woredaId: { $in: ids }, department: ciRegex(department), isActive: true })
    .select('-password').lean();
};

// Subcity admins exist under several role flavors: the canonical subcity_admin,
// the legacy SUBCITY_ADMIN, and the derived subcity_<name> roles created for
// each live Subcity record. Match them all so escalation notifications always
// reach the right person regardless of how the account was provisioned.
const SUB_CITY_ADMIN_ROLE_MATCH = {
  $or: [
    { role: 'subcity_admin' },
    { role: 'SUBCITY_ADMIN' },
    { role: { $regex: /^subcity_/ } },
  ],
};

const findSubcityAdmins = (subcity) =>
  User.find({ ...SUB_CITY_ADMIN_ROLE_MATCH, subcity: ciRegex(subcity), isActive: true }).select('-password').lean();

// ── Notification dispatch (in-app + socket + prepared SMS/email hooks) ────────

const dispatchNotification = async (io, complaint, targets, { event, title, message, type, actorId }) => {
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
      type: type || 'complaint_status',
      relatedReport: complaint._id,
      relatedReportType: 'municipal_complaint',
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

// ── Audit trail ───────────────────────────────────────────────────────────────

const pushAudit = (complaint, action, user, details = '') => {
  complaint.auditTrail.push({
    action,
    user: user?._id || null,
    userName: user?.fullName || (user ? `${user.role}` : 'System'),
    role: user?.role || 'system',
    details: details || '',
  });
};

const emitUpdate = (io, complaint) => {
  if (io) io.emit('municipal:updated', { trackingId: complaint.trackingId, status: complaint.status });
};

// ── Issue templates ───────────────────────────────────────────────────────────

// GET /api/municipal-complaints/issue-templates?level=&department=
const getIssueTemplates = async (req, res) => {
  try {
    const { level, department } = req.query;
    const filter = { isActive: true };
    if (level && ['Woreda', 'Subcity'].includes(level)) filter.level = level;
    if (department) filter.department = { $regex: `^${escapeRegex(department)}$`, $options: 'i' };
    const templates = await IssueTemplate.find(filter).sort({ sortOrder: 1 }).lean();
    res.json({ success: true, templates });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Create (citizen) ──────────────────────────────────────────────────────────

// POST /api/municipal-complaints  (protect + citizen + upload.array('media', 8))
const createComplaint = async (req, res) => {
  try {
    const {
      title, description, issueType, issueLevel, priority,
      subcity, woredaId, department,
      locationText, latitude, longitude,
      reporterName, reporterPhone, reporterEmail,
    } = req.body;

    if (!title || !description || !subcity || !woredaId || !department) {
      return res.status(400).json({ success: false, message: 'Title, description, subcity, woreda, and department are required.' });
    }

    // Confirm the submitter's password against their account before accepting
    // the complaint. The password is verified, never stored on the complaint.
    try {
      await verifySubmissionPassword(req.user, req.body.password);
    } catch (pErr) {
      return res.status(pErr.status || 400).json({ success: false, message: pErr.message });
    }

    // Validate the woreda actually belongs to the chosen subcity.
    const woreda = await Woreda.findById(woredaId).lean();
    if (!woreda) return res.status(400).json({ success: false, message: 'Selected woreda does not exist.' });
    if (!new RegExp(`^${escapeRegex(subcity)}$`, 'i').test(woreda.subcity)) {
      return res.status(400).json({ success: false, message: 'Selected woreda does not belong to the chosen subcity.' });
    }

    // Validate the department actually belongs to the chosen subcity. If the
    // subcity has department master data (post-migration), the chosen
    // department must exist there — this keeps routing strictly subcity-scoped.
    const subcityRecord = await Subcity.findOne({
      $or: [
        { name: { $regex: `^${escapeRegex(subcity)}$`, $options: 'i' } },
        { nameLower: { $regex: `^${escapeRegex(subcity)}$`, $options: 'i' } },
      ],
    }).lean();
    const normalizedDept = normalizeDepartmentName(department);
    let departmentInSubcity = null;
    if (subcityRecord) {
      const subcityDeptCount = await Department.countDocuments({ subcityId: subcityRecord._id });
      if (subcityDeptCount > 0) {
        departmentInSubcity = await Department.findOne({
          subcityId: subcityRecord._id,
          normalizedDepartmentName: normalizedDept,
          status: 'Active',
        }).lean();
        if (!departmentInSubcity) {
          return res.status(400).json({
            success: false,
            message: `The selected department "${department}" is not available in ${subcityRecord.name} subcity.`,
          });
        }
      }
    }

    const files = req.files || [];
    const photos = files.filter((f) => f.mimetype.startsWith('image/')).map((f) => f.path);
    const videos = files.filter((f) => f.mimetype.startsWith('video/')).map((f) => f.path);

    const template = await IssueTemplate.findOne({ name: issueType, department: ciRegex(department) }).lean();

    // Intelligent routing: Subcity-template issues go straight to the Subcity
    // level; Woreda-template issues start at the Woreda office for assessment.
    const effectiveLevel = issueLevel === 'Subcity' || template?.level === 'Subcity'
      ? 'Subcity'
      : 'Woreda';

    const complaint = new MunicipalComplaint({
      title: String(title).trim(),
      description: String(description).trim(),
      issueType: template?.name || String(issueType || '').trim(),
      issueLevel: effectiveLevel,
      category: template?.department || String(department).trim(),
      subcity: String(subcity).trim(),
      woredaId,
      woredaName: woreda.name,
      department: String(department).trim(),
      priority: ['Low', 'Medium', 'High'].includes(priority) ? priority : 'Medium',
      locationText: String(locationText || '').trim(),
      latitude: latitude && Number.isFinite(Number(latitude)) ? Number(latitude) : undefined,
      longitude: longitude && Number.isFinite(Number(longitude)) ? Number(longitude) : undefined,
      reporter: req.user?._id || null,
      reporterName: String(reporterName || req.user?.fullName || '').trim(),
      reporterPhone: String(reporterPhone || req.user?.phone || '').trim(),
      reporterEmail: String(reporterEmail || req.user?.email || '').trim(),
      photos,
      videos,
      assignedLevel: effectiveLevel,
      assignedToDepartment: String(department).trim(),
      status: 'Submitted',
    });

    pushAudit(complaint, 'Created', req.user, `Complaint submitted (${effectiveLevel} level, ${department})`);

    await complaint.save();

    const io = getIO(req);
    const event = {
      event: 'Report submitted',
      title: `Complaint ${complaint.trackingId} submitted`,
      message: `"${complaint.title}" routed to the ${department} department in ${complaint.subcity} subcity (${effectiveLevel} level).`,
      type: 'complaint_assigned',
    };

    if (effectiveLevel === 'Subcity') {
      const subcityAdmins = await findSubcityAdmins(complaint.subcity);
      const deptOfficers = await findSubcityDepartmentOfficers(complaint.subcity, department);
      if (subcityAdmins.length) complaint.assignedTo = subcityAdmins[0]._id;
      await dispatchNotification(io, complaint, [...subcityAdmins, ...deptOfficers], { ...event, actorId: req.user?._id });
    } else {
      const woredaOfficer = await findWoredaOfficer(complaint.woredaId);
      const deptOfficers = await findDepartmentOfficers(complaint.woredaId, department);
      const candidates = [];
      if (woredaOfficer) candidates.push(woredaOfficer);
      candidates.push(...deptOfficers);
      if (woredaOfficer) complaint.assignedTo = woredaOfficer._id;
      await dispatchNotification(io, complaint, candidates, { ...event, actorId: req.user?._id });
    }

    // Notify the reporter's handling office (routing targets above). The
    // citizen themselves never gets an in-app notification for their own
    // submission — the tracking ID is returned in the submit response.
    const reporter = req.user
      ? [{ _id: req.user._id, email: req.user.email, smsNotifications: req.user.smsNotifications, emailNotifications: req.user.emailNotifications }]
      : [];
    await dispatchNotification(io, complaint, reporter, {
      ...event,
      title: `Complaint submitted: ${complaint.trackingId}`,
      message: `Track your complaint with ID ${complaint.trackingId}. It was routed to the ${complaint.department} department in ${complaint.subcity} subcity.`,
      actorId: req.user?._id,
    });

    await complaint.save();
    emitUpdate(io, complaint);

    res.status(201).json({ success: true, message: 'Complaint submitted', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── List (role-scoped) ────────────────────────────────────────────────────────

// GET /api/municipal-complaints
const getComplaints = async (req, res) => {
  try {
    const userSubcity = await resolveUserSubcity(req.user);
    const scope = buildMunicipalScope(req.user, userSubcity);
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const filter = { ...scope };

    if (req.query.status) filter.status = req.query.status;
    if (req.query.priority) filter.priority = req.query.priority;
    if (req.query.department) filter.category = ciRegex(req.query.department);
    if (req.query.level) filter.assignedLevel = req.query.level;
    if (req.query.subcity) filter.subcity = ciRegex(req.query.subcity);
    if (req.query.woredaId) filter.woredaId = req.query.woredaId;
    if (req.query.overdue === 'true') filter.slaDueAt = { $lte: new Date() };
    if (req.query.from || req.query.to) {
      filter.createdAt = {};
      if (req.query.from) filter.createdAt.$gte = new Date(req.query.from);
      if (req.query.to) filter.createdAt.$lte = new Date(req.query.to);
    }
    if (req.query.search) {
      const s = escapeRegex(req.query.search);
      filter.$or = [
        { trackingId: { $regex: s, $options: 'i' } },
        { title: { $regex: s, $options: 'i' } },
        { issueType: { $regex: s, $options: 'i' } },
        { reporterName: { $regex: s, $options: 'i' } },
        { reporterPhone: { $regex: s, $options: 'i' } },
        { technicianName: { $regex: s, $options: 'i' } },
      ];
    }

    const total = await MunicipalComplaint.countDocuments(filter);
    const complaints = await MunicipalComplaint.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-auditTrail -notificationHistory -internalNotes -responses')
      .lean();

    res.json({
      success: true,
      data: { complaints, total, page, pages: Math.max(1, Math.ceil(total / limit)) },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Detail ────────────────────────────────────────────────────────────────────

// GET /api/municipal-complaints/:id
const getComplaintById = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id)
      .populate('assignedTo', 'fullName email phone role')
      .populate('forwardedBy', 'fullName role')
      .lean();
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised to view this complaint.' });
    }

    // Record the view in the audit trail (computed on the lean doc, then pushed).
    const auditEntry = {
      action: 'Viewed',
      user: req.user._id,
      userName: req.user.fullName || req.user.role,
      role: req.user.role,
      details: `Complaint viewed by ${req.user.role}`,
      at: new Date(),
    };
    await MunicipalComplaint.updateOne({ _id: complaint._id }, { $push: { auditTrail: auditEntry } });
    complaint.auditTrail = complaint.auditTrail || [];
    complaint.auditTrail.push(auditEntry);

    res.json({ success: true, data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Public tracking ───────────────────────────────────────────────────────────

// GET /api/municipal-complaints/track/:trackingId
const trackComplaint = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findOne({
      trackingId: { $regex: `^${escapeRegex(req.params.trackingId)}$`, $options: 'i' },
    })
      .populate('assignedTo', 'fullName role')
      .lean();
    if (!complaint) return res.status(404).json({ success: false, message: 'No complaint found with that tracking ID.' });
    res.json({ success: true, data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Woreda assessment + forward ───────────────────────────────────────────────

// POST /api/municipal-complaints/:id/assess
// Saves the woreda assessment checkboxes. If `forward` is truthy the complaint
// is immediately forwarded to the Subcity department.
const assessComplaint = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised to assess this complaint.' });
    }
    if (!['admin', 'woreda', 'government', ...ALL_SUB_CITY_ROLES].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only woreda / subcity officers can assess complaints.' });
    }

    const flags = ['requiresSpecialEquipment', 'requiresBudgetAboveLimit', 'requiresSubcityApproval',
      'affectsMoreThan50Households', 'publicSafetyRisk', 'requiresMajorInfrastructureReplacement'];

    complaint.assessment = {
      requiresSpecialEquipment: req.body.requiresSpecialEquipment === 'true' || req.body.requiresSpecialEquipment === true,
      requiresBudgetAboveLimit: req.body.requiresBudgetAboveLimit === 'true' || req.body.requiresBudgetAboveLimit === true,
      requiresSubcityApproval: req.body.requiresSubcityApproval === 'true' || req.body.requiresSubcityApproval === true,
      affectsMoreThan50Households: req.body.affectsMoreThan50Households === 'true' || req.body.affectsMoreThan50Households === true,
      publicSafetyRisk: req.body.publicSafetyRisk === 'true' || req.body.publicSafetyRisk === true,
      requiresMajorInfrastructureReplacement: req.body.requiresMajorInfrastructureReplacement === 'true' || req.body.requiresMajorInfrastructureReplacement === true,
      note: String(req.body.note || complaint.assessment?.note || '').trim(),
      assessedBy: req.user._id,
      assessedByName: req.user.fullName,
      assessedAt: new Date(),
    };

    pushAudit(complaint, 'Updated', req.user, 'Woreda assessment recorded');
    if (complaint.status === 'Submitted') complaint.status = 'In Review';
    await complaint.save();

    const shouldForward = req.body.forward === 'true' || req.body.forward === true;
    if (shouldForward) {
      return forwardComplaint(req, res);
    }

    res.json({ success: true, message: 'Assessment saved', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/municipal-complaints/:id/forward
// Manual forward: Woreda officer -> selected Subcity department.
const forwardComplaint = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised to forward this complaint.' });
    }
    if (!['admin', 'woreda', 'government', ...ALL_SUB_CITY_ROLES].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorised to forward complaints.' });
    }
    if (complaint.assignedLevel === 'Subcity' && complaint.escalatedTo === 'Subcity Administrator') {
      return res.status(400).json({ success: false, message: 'Complaint is already with the Subcity Administrator.' });
    }

    const reason = String(req.body.forwardReason || req.body.reason || '').trim();
    if (!reason) {
      return res.status(400).json({ success: false, message: 'A forward reason is required.' });
    }

    const toDepartment = String(req.body.department || complaint.assignedToDepartment || complaint.department).trim();

    const previousLevel = complaint.assignedLevel;
    complaint.assignedLevel = 'Subcity';
    complaint.assignedToDepartment = toDepartment;
    complaint.status = 'Forwarded to Subcity';
    complaint.forwardReason = reason;
    complaint.forwardedBy = req.user._id;
    complaint.forwardedByName = req.user.fullName;
    complaint.forwardedAt = new Date();
    if (!complaint.subcitySlaDueAt) {
      complaint.subcitySlaDueAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
    }
    complaint.escalationHistory.push({
      fromLevel: previousLevel,
      toLevel: 'Subcity Department',
      reason,
      triggeredBy: 'manual',
      triggeredByName: req.user.fullName,
      at: new Date(),
    });
    pushAudit(complaint, 'Forwarded', req.user, `Forwarded to Subcity (${toDepartment}): ${reason}`);

    const io = getIO(req);
    const deptOfficers = await findSubcityDepartmentOfficers(complaint.subcity, toDepartment);
    if (deptOfficers.length) complaint.assignedTo = deptOfficers[0]._id;

    const event = {
      event: 'Forwarded to Subcity',
      title: `Complaint ${complaint.trackingId} forwarded to Subcity`,
      message: `Forwarded to the ${toDepartment} department in ${complaint.subcity} subcity. Reason: ${reason}`,
      type: 'complaint_forwarded',
    };
    await dispatchNotification(io, complaint, deptOfficers, { ...event, actorId: req.user._id });

    const reporter = await User.findById(complaint.reporter).select('-password').lean();
    if (reporter) {
      await dispatchNotification(io, complaint, [reporter], {
        event: 'Forwarded to Subcity',
        title: `Your complaint ${complaint.trackingId} was forwarded`,
        message: `Your complaint was forwarded to the ${toDepartment} department in ${complaint.subcity} subcity. Reason: ${reason}`,
        type: 'complaint_forwarded',
        actorId: req.user._id,
      });
    }

    await complaint.save();
    emitUpdate(io, complaint);

    res.json({ success: true, message: 'Complaint forwarded to Subcity', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Status change + response ──────────────────────────────────────────────────

// POST /api/municipal-complaints/:id/status  (upload.array('evidence', 5))
// Generic status update with optional response message, evidence uploads,
// technician assignment and internal note.
const updateStatus = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });

    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised to update this complaint.' });
    }
    if (!MUNICIPAL_MANAGER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorised to update complaints.' });
    }

    const allowed = ['Submitted', 'In Review', 'Assigned', 'In Progress', 'Resolved', 'Rejected', 'Closed'];
    const newStatus = req.body.status;
    if (!newStatus || !allowed.includes(newStatus)) {
      return res.status(400).json({ success: false, message: `Invalid status. Allowed: ${allowed.join(', ')}` });
    }

    // Reopening a closed complaint increments the counter and is audited.
    if (CLOSED_STATUSES.includes(complaint.status) && !CLOSED_STATUSES.includes(newStatus)) {
      complaint.reopenedCount = (complaint.reopenedCount || 0) + 1;
      pushAudit(complaint, 'Reopened', req.user, `Complaint reopened (was ${complaint.status})`);
    }

    const previousStatus = complaint.status;
    complaint.status = newStatus;

    const responseMessage = String(req.body.responseMessage || '').trim();
    const evidenceFiles = (req.files || []).map((f) => f.path);
    const technicianName = String(req.body.technicianName || '').trim();

    if (responseMessage) {
      complaint.responseMessage = responseMessage;
      complaint.responses.push({
        message: responseMessage,
        officer: req.user._id,
        officerName: req.user.fullName,
        officerRole: req.user.role,
        fromLevel: complaint.assignedLevel,
        evidenceFiles: [...evidenceFiles],
      });
      pushAudit(complaint, 'Responded', req.user, responseMessage.slice(0, 200));
    } else if (evidenceFiles.length) {
      complaint.evidenceFiles.push(...evidenceFiles);
    }
    if (technicianName) {
      complaint.technicianName = technicianName;
      pushAudit(complaint, 'Assigned', req.user, `Technician assigned: ${technicianName}`);
    }
    if (req.body.internalNote) {
      complaint.internalNotes.push({
        note: String(req.body.internalNote).trim(),
        user: req.user._id,
        userName: req.user.fullName,
        role: req.user.role,
      });
    }
    if (req.body.assignedToDepartment) complaint.assignedToDepartment = String(req.body.assignedToDepartment).trim();
    if (req.body.assignedTo && !technicianName) complaint.assignedTo = req.body.assignedTo;

    if (newStatus === 'Resolved' || newStatus === 'Rejected') {
      complaint.resolvedAt = complaint.resolvedAt || new Date();
      complaint.resolvedBy = req.user._id;
      complaint.resolvedByName = req.user.fullName;
      complaint.resolutionNote = responseMessage || String(req.body.resolutionNote || '').trim();
      pushAudit(complaint, newStatus === 'Resolved' ? 'Resolved' : 'Updated', req.user,
        `Complaint ${newStatus.toLowerCase()}${complaint.resolutionNote ? `: ${complaint.resolutionNote.slice(0, 200)}` : ''}`);
    } else {
      pushAudit(complaint, 'Updated', req.user, `Status changed ${previousStatus} → ${newStatus}`);
    }

    await complaint.save();

    const io = getIO(req);
    const reporter = await User.findById(complaint.reporter).select('-password').lean();
    if (reporter) {
      await dispatchNotification(io, complaint, [reporter], {
        event: 'Department responded',
        title: `Complaint ${complaint.trackingId} is now ${newStatus}`,
        message: responseMessage || `Status updated to ${newStatus} by ${req.user.fullName}.`,
        type: CLOSED_STATUSES.includes(newStatus) ? 'complaint_resolved' : 'complaint_status',
        actorId: req.user._id,
      });
    }

    await complaint.save();
    emitUpdate(io, complaint);

    res.json({ success: true, message: 'Complaint updated', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Internal note ─────────────────────────────────────────────────────────────

// POST /api/municipal-complaints/:id/notes
const addInternalNote = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised to add notes to this complaint.' });
    }
    if (!MUNICIPAL_MANAGER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorised to add internal notes.' });
    }
    const note = String(req.body.note || '').trim();
    if (!note) return res.status(400).json({ success: false, message: 'Note text is required.' });

    complaint.internalNotes.push({ note, user: req.user._id, userName: req.user.fullName, role: req.user.role });
    pushAudit(complaint, 'Updated', req.user, 'Internal note added');
    await complaint.save();
    res.json({ success: true, message: 'Note added', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Operational workflow actions ──────────────────────────────────────────────

// GET /api/municipal-complaints/assignable?role=inspector|technician&subcity=&woredaId=
// Lists active inspectors / technicians an officer can assign to a complaint.
const getAssignableUsers = async (req, res) => {
  try {
    const role = req.query.role;
    if (!['inspector', 'technician'].includes(role)) {
      return res.status(400).json({ success: false, message: 'role must be inspector or technician' });
    }
    const filter = { role, isActive: true };
    if (role === 'inspector') {
      if (req.query.subcity) filter.subcity = ciRegex(req.query.subcity);
      if (req.query.woredaId) filter.woredaId = req.query.woredaId;
    } else {
      if (req.query.woredaId) filter.woredaId = req.query.woredaId;
      if (req.query.department) filter.department = ciRegex(req.query.department);
    }
    const users = await User.find(filter)
      .select('fullName phone email subcity woredaId department')
      .sort({ fullName: 1 })
      .lean();
    res.json({ success: true, data: users });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/municipal-complaints/:id/accept
const acceptComplaint = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised to update this complaint.' });
    }
    if (complaint.status !== 'Submitted') {
      return res.status(400).json({ success: false, message: `Only 'Submitted' complaints can be accepted (current: ${complaint.status}).` });
    }

    complaint.status = 'In Review';
    complaint.acceptedAt = new Date();
    complaint.acceptedBy = req.user._id;
    complaint.acceptedByName = req.user.fullName;
    complaint.assignedTo = req.user._id;
    pushAudit(complaint, 'Accepted', req.user, `Complaint accepted by ${req.user.fullName}`);

    await complaint.save();

    const io = getIO(req);
    const reporter = await User.findById(complaint.reporter).select('-password').lean();
    if (reporter) {
      await dispatchNotification(io, complaint, [reporter], {
        event: 'Accepted',
        title: `Complaint ${complaint.trackingId} accepted`,
        message: `Your complaint "${complaint.title}" has been accepted and is now under review.`,
        type: 'complaint_status',
        actorId: req.user._id,
      });
    }
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Complaint accepted', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/municipal-complaints/:id/reject
const rejectComplaint = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised to update this complaint.' });
    }
    if (CLOSED_STATUSES.includes(complaint.status)) {
      return res.status(400).json({ success: false, message: 'This complaint is already closed.' });
    }
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'A rejection reason is required.' });

    complaint.status = 'Rejected';
    complaint.rejectReason = reason;
    complaint.rejectedBy = req.user._id;
    complaint.rejectedByName = req.user.fullName;
    complaint.rejectedAt = new Date();
    complaint.resolvedAt = new Date();
    pushAudit(complaint, 'Rejected', req.user, `Complaint rejected: ${reason.slice(0, 200)}`);

    await complaint.save();

    const io = getIO(req);
    const reporter = await User.findById(complaint.reporter).select('-password').lean();
    if (reporter) {
      await dispatchNotification(io, complaint, [reporter], {
        event: 'Rejected',
        title: `Complaint ${complaint.trackingId} rejected`,
        message: `Your complaint was rejected. Reason: ${reason}`,
        type: 'complaint_rejected',
        actorId: req.user._id,
      });
    }
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Complaint rejected', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/municipal-complaints/:id/assign-inspector
const assignInspector = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised to update this complaint.' });
    }

    const inspectorId = req.body.inspectorId;
    if (!inspectorId) return res.status(400).json({ success: false, message: 'Please select an inspector.' });
    const inspector = await User.findOne({ _id: inspectorId, role: 'inspector', isActive: true }).select('-password').lean();
    if (!inspector) return res.status(404).json({ success: false, message: 'Inspector not found or inactive.' });

    complaint.inspectorId = inspector._id;
    complaint.inspectorName = inspector.fullName;
    complaint.inspectorVisitAt = req.body.visitAt ? new Date(req.body.visitAt) : undefined;
    complaint.inspectorNotes = String(req.body.notes || '').trim();
    if (!['In Progress', 'Completed'].includes(complaint.status)) complaint.status = 'Assigned';
    pushAudit(complaint, 'Assigned', req.user, `Inspector assigned: ${inspector.fullName}`);

    await complaint.save();

    const io = getIO(req);
    await dispatchNotification(io, complaint, [inspector], {
      event: 'Inspector assigned',
      title: `Inspection scheduled — ${complaint.trackingId}`,
      message: `You have been assigned to inspect "${complaint.title}" in ${complaint.subcity}${complaint.inspectorVisitAt ? ` on ${new Date(complaint.inspectorVisitAt).toLocaleString()}` : ''}.`,
      type: 'complaint_assigned',
      actorId: req.user._id,
    });
    const reporter = await User.findById(complaint.reporter).select('-password').lean();
    if (reporter) {
      await dispatchNotification(io, complaint, [reporter], {
        event: 'Inspector assigned',
        title: `Complaint ${complaint.trackingId} assigned to inspector`,
        message: `An inspector has been assigned to investigate your complaint.`,
        type: 'complaint_assigned',
        actorId: req.user._id,
      });
    }
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Inspector assigned', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/municipal-complaints/:id/assign-technician
const assignTechnician = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised to update this complaint.' });
    }

    const technicianId = req.body.technicianId;
    if (!technicianId) return res.status(400).json({ success: false, message: 'Please select a technician.' });
    const technician = await User.findOne({ _id: technicianId, role: 'technician', isActive: true }).select('-password').lean();
    if (!technician) return res.status(404).json({ success: false, message: 'Technician not found or inactive.' });

    complaint.technicianId = technician._id;
    complaint.technicianName = technician.fullName;
    complaint.technicianPriority = ['Low', 'Medium', 'High'].includes(req.body.priority) ? req.body.priority : 'Medium';
    complaint.technicianDueAt = req.body.dueAt ? new Date(req.body.dueAt) : undefined;
    complaint.workOrderNotes = String(req.body.workOrderNotes || '').trim();
    if (!['In Progress', 'Completed'].includes(complaint.status)) complaint.status = 'Assigned';
    pushAudit(complaint, 'Assigned', req.user, `Technician assigned: ${technician.fullName}`);

    await complaint.save();

    const io = getIO(req);
    await dispatchNotification(io, complaint, [technician], {
      event: 'Technician assigned',
      title: `Work order assigned — ${complaint.trackingId}`,
      message: `Work order for "${complaint.title}" (${complaint.department}, ${complaint.subcity}). ${complaint.technicianDueAt ? `Due by ${new Date(complaint.technicianDueAt).toLocaleString()}. ` : ''}${complaint.workOrderNotes || ''}`,
      type: 'complaint_assigned',
      actorId: req.user._id,
    });
    const reporter = await User.findById(complaint.reporter).select('-password').lean();
    if (reporter) {
      await dispatchNotification(io, complaint, [reporter], {
        event: 'Technician assigned',
        title: `Complaint ${complaint.trackingId} assigned to technician`,
        message: `A technician has been assigned to work on your complaint.`,
        type: 'complaint_assigned',
        actorId: req.user._id,
      });
    }
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Technician assigned', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/municipal-complaints/:id/start-work
const startWork = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised to update this complaint.' });
    }
    if (complaint.status !== 'Assigned') {
      return res.status(400).json({ success: false, message: `Only 'Assigned' complaints can be started (current: ${complaint.status}).` });
    }
    // Only the assigned technician, their department, or an officer can start work.
    const isAssignedTechnician = String(complaint.technicianId) === String(req.user._id);
    if (!isAssignedTechnician && !OFFICER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only the assigned technician or an officer can start work.' });
    }

    complaint.status = 'In Progress';
    complaint.startedAt = new Date();
    complaint.startedBy = req.user._id;
    complaint.startedByName = req.user.fullName;
    complaint.workProgress.push({ step: 'started', notes: 'Work started', by: req.user._id, byName: req.user.fullName });
    pushAudit(complaint, 'In Progress', req.user, 'Work started');

    await complaint.save();

    const io = getIO(req);
    const reporter = await User.findById(complaint.reporter).select('-password').lean();
    if (reporter) {
      await dispatchNotification(io, complaint, [reporter], {
        event: 'Work started',
        title: `Work started on ${complaint.trackingId}`,
        message: `Work on your complaint "${complaint.title}" has started.`,
        type: 'complaint_status',
        actorId: req.user._id,
      });
    }
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Work started', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/municipal-complaints/:id/complete-work  (upload.array('photos', 8))
const completeWork = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised to update this complaint.' });
    }
    if (complaint.status !== 'In Progress') {
      return res.status(400).json({ success: false, message: `Only 'In Progress' complaints can be completed (current: ${complaint.status}).` });
    }
    const notes = String(req.body.notes || '').trim();
    if (!notes) return res.status(400).json({ success: false, message: 'Work completion notes are required.' });

    const photos = (req.files || []).map((f) => f.path);

    complaint.status = 'Completed';
    complaint.completedAt = new Date();
    complaint.completedBy = req.user._id;
    complaint.completedByName = req.user.fullName;
    complaint.workProgress.push({
      step: 'completed',
      notes,
      afterPhotos: photos,
      by: req.user._id,
      byName: req.user.fullName,
    });
    pushAudit(complaint, 'Completed', req.user, `Work completed${notes ? `: ${notes.slice(0, 200)}` : ''}`);

    await complaint.save();

    const io = getIO(req);
    const deptOfficers = await findDepartmentOfficers(complaint.woredaId, complaint.assignedToDepartment || complaint.department);
    const woredaOfficer = await findWoredaOfficer(complaint.woredaId);
    await dispatchNotification(io, complaint, [...deptOfficers, ...(woredaOfficer ? [woredaOfficer] : [])], {
      event: 'Work completed',
      title: `Work completed — ${complaint.trackingId} awaiting verification`,
      message: `Technician work on "${complaint.title}" is complete. Please verify the resolution before marking it resolved.`,
      type: 'complaint_status',
      actorId: req.user._id,
    });
    const reporter = await User.findById(complaint.reporter).select('-password').lean();
    if (reporter) {
      await dispatchNotification(io, complaint, [reporter], {
        event: 'Work completed',
        title: `Work completed on ${complaint.trackingId}`,
        message: `Work on your complaint has been completed. It is now being verified by the department officer.`,
        type: 'complaint_status',
        actorId: req.user._id,
      });
    }
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Work completed — pending verification', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/municipal-complaints/:id/verify-resolution
// Department officer verifies completed work; on success the complaint is marked Resolved.
const verifyResolution = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised to update this complaint.' });
    }
    if (!OFFICER_ROLES.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Only department officers can verify resolutions.' });
    }
    if (complaint.status !== 'Completed') {
      return res.status(400).json({ success: false, message: `Only completed work can be verified (current: ${complaint.status}).` });
    }
    const note = String(req.body.note || '').trim();
    if (!note) return res.status(400).json({ success: false, message: 'A verification note is required before resolving.' });

    const verified = req.body.verified !== 'false' && req.body.verified !== false;
    complaint.resolutionVerification = {
      verified,
      verifiedBy: req.user._id,
      verifiedByName: req.user.fullName,
      verifiedAt: new Date(),
      verificationNote: note,
    };

    if (verified) {
      complaint.status = 'Resolved';
      complaint.resolvedAt = new Date();
      complaint.resolvedBy = req.user._id;
      complaint.resolvedByName = req.user.fullName;
      complaint.resolutionNote = note;
      pushAudit(complaint, 'Resolved', req.user, `Resolution verified and complaint resolved: ${note.slice(0, 200)}`);
    } else {
      complaint.status = 'In Progress';
      complaint.workProgress.push({
        step: 'update',
        notes: `Verification rejected: ${note}`,
        by: req.user._id,
        byName: req.user.fullName,
      });
      pushAudit(complaint, 'In Progress', req.user, `Verification rejected — sent back for rework: ${note.slice(0, 200)}`);
    }

    await complaint.save();

    const io = getIO(req);
    const reporter = await User.findById(complaint.reporter).select('-password').lean();
    if (reporter) {
      if (verified) {
        await dispatchNotification(io, complaint, [reporter], {
          event: 'Resolved',
          title: `Complaint ${complaint.trackingId} resolved`,
          message: `Your complaint "${complaint.title}" has been resolved and verified. Please rate your experience.`,
          type: 'complaint_resolved',
          actorId: req.user._id,
        });
      } else {
        await dispatchNotification(io, complaint, [reporter], {
          event: 'Verification rejected',
          title: `Work on ${complaint.trackingId} needs revision`,
          message: 'The department officer could not confirm the resolution; work has been sent back.',
          type: 'complaint_status',
          actorId: req.user._id,
        });
      }
    }
    if (complaint.technicianId) {
      const technician = await User.findById(complaint.technicianId).select('-password').lean();
      if (technician) {
        await dispatchNotification(io, complaint, [technician], {
          event: verified ? 'Resolution verified' : 'Verification rejected',
          title: `Complaint ${complaint.trackingId} ${verified ? 'verified' : 'returned'}`,
          message: verified
            ? 'The department officer verified your completed work. Well done.'
            : `The department officer could not confirm your work: ${note}`,
          type: verified ? 'complaint_resolved' : 'complaint_status',
          actorId: req.user._id,
        });
      }
    }
    emitUpdate(io, complaint);
    res.json({
      success: true,
      message: verified ? 'Resolution verified and complaint resolved' : 'Verification rejected — sent back for rework',
      data: complaint,
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/municipal-complaints/:id/reopen
const reopenComplaint = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised to update this complaint.' });
    }
    if (!CLOSED_STATUSES.includes(complaint.status)) {
      return res.status(400).json({ success: false, message: `Only closed complaints can be reopened (current: ${complaint.status}).` });
    }
    const previousStatus = complaint.status;
    complaint.reopenedCount = (complaint.reopenedCount || 0) + 1;
    complaint.status = 'In Review';
    complaint.isOverdue = false;
    pushAudit(complaint, 'Reopened', req.user, `Complaint reopened (was ${previousStatus})`);

    await complaint.save();

    const io = getIO(req);
    const reporter = await User.findById(complaint.reporter).select('-password').lean();
    if (reporter) {
      await dispatchNotification(io, complaint, [reporter], {
        event: 'Reopened',
        title: `Complaint ${complaint.trackingId} reopened`,
        message: 'Your complaint has been reopened and is back under review.',
        type: 'complaint_status',
        actorId: req.user._id,
      });
    }
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Complaint reopened', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/municipal-complaints/:id/close
const closeComplaint = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised to update this complaint.' });
    }
    if (complaint.status !== 'Resolved') {
      return res.status(400).json({ success: false, message: `Only resolved complaints can be closed (current: ${complaint.status}).` });
    }
    complaint.status = 'Closed';
    pushAudit(complaint, 'Closed', req.user, 'Complaint closed');

    await complaint.save();

    const io = getIO(req);
    const reporter = await User.findById(complaint.reporter).select('-password').lean();
    if (reporter) {
      await dispatchNotification(io, complaint, [reporter], {
        event: 'Closed',
        title: `Complaint ${complaint.trackingId} closed`,
        message: 'Your complaint has been officially closed.',
        type: 'complaint_status',
        actorId: req.user._id,
      });
    }
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Complaint closed', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/municipal-complaints/:id/feedback
const submitFeedback = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (req.user.role === 'citizen' && String(complaint.reporter) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only the reporter can submit feedback.' });
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
    pushAudit(complaint, 'Feedback', req.user, `Citizen feedback: ${rating}/5`);

    await complaint.save();

    const io = getIO(req);
    const targets = complaint.assignedLevel === 'Subcity'
      ? await findSubcityDepartmentOfficers(complaint.subcity, complaint.assignedToDepartment || complaint.department)
      : await findDepartmentOfficers(complaint.woredaId, complaint.assignedToDepartment || complaint.department);
    if (complaint.assignedTo) {
      const assigned = await User.findById(complaint.assignedTo).select('-password').lean();
      if (assigned) targets.push(assigned);
    }
    await dispatchNotification(io, complaint, targets, {
      event: 'Citizen feedback',
      title: `Feedback on ${complaint.trackingId}: ${rating}/5`,
      message: `${complaint.reporterName} rated their experience ${rating}/5.`,
      type: 'complaint_feedback',
      actorId: req.user._id,
    });
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Feedback submitted', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/municipal-complaints/:id/evidence  (citizen reporter or officer)
// Reporter uploads additional evidence after submission. Files land in
// evidenceFiles, get flagged in the audit trail and notify the handling office.
const addCitizenEvidence = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    if (req.user.role === 'citizen' && String(complaint.reporter) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'Only the reporter can add evidence.' });
    }
    const urls = (req.files || []).map((f) => f.path);
    if (!urls.length) return res.status(400).json({ success: false, message: 'No files uploaded.' });

    complaint.evidenceFiles.push(...urls);
    pushAudit(complaint, 'Evidence Added', req.user, `${urls.length} additional evidence file(s) attached by the reporter`);
    complaint.responses.push({
      message: 'Additional evidence uploaded by the reporter.',
      evidenceFiles: urls,
      officer: req.user._id,
      officerName: req.user.fullName || req.user.role,
      officerRole: req.user.role,
      fromLevel: 'Woreda',
    });

    await complaint.save();

    const io = getIO(req);
    const targets = complaint.assignedLevel === 'Subcity'
      ? await findSubcityDepartmentOfficers(complaint.subcity, complaint.assignedToDepartment || complaint.department)
      : await findDepartmentOfficers(complaint.woredaId, complaint.assignedToDepartment || complaint.department);
    if (complaint.assignedTo) {
      const assigned = await User.findById(complaint.assignedTo).select('-password').lean();
      if (assigned) targets.push(assigned);
    }
    await dispatchNotification(io, complaint, targets, {
      event: 'Evidence Added',
      title: `New evidence on ${complaint.trackingId}`,
      message: 'The reporter uploaded additional evidence for their municipal complaint.',
      type: 'complaint_status',
      actorId: req.user._id,
    });
    emitUpdate(io, complaint);
    res.json({ success: true, message: 'Evidence added', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/municipal-complaints/:id/resolution-letter
// Downloads the official resolution letter (PDF) once the complaint is resolved.
const downloadResolutionLetter = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id).lean();
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    generateResolutionLetterPDF(complaint, res);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Manual escalate (officer) ─────────────────────────────────────────────────

// POST /api/municipal-complaints/:id/escalate
// Subcity department -> Subcity Administrator.
const escalateManually = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised to escalate this complaint.' });
    }
    if (!['admin', 'government', ...SUB_CITY_ROLES, 'woreda', 'department'].includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Not authorised to escalate complaints.' });
    }
    if (complaint.escalatedTo === 'Subcity Administrator') {
      return res.status(400).json({ success: false, message: 'Complaint is already escalated to the Subcity Administrator.' });
    }

    const reason = String(req.body.reason || 'Manual escalation').trim();
    const previousLevel = complaint.assignedLevel;

    complaint.status = 'Escalated';
    complaint.assignedLevel = 'Subcity';
    complaint.escalated = true;
    complaint.escalatedTo = 'Subcity Administrator';
    complaint.escalatedAt = new Date();
    complaint.escalationHistory.push({
      fromLevel: `${previousLevel} Department`,
      toLevel: 'Subcity Administrator',
      reason,
      triggeredBy: 'manual',
      triggeredByName: req.user.fullName,
      at: new Date(),
    });
    pushAudit(complaint, 'Escalated', req.user, `Escalated to Subcity Administrator: ${reason}`);

    const io = getIO(req);
    const subcityAdmins = await findSubcityAdmins(complaint.subcity);
    await dispatchNotification(io, complaint, subcityAdmins, {
      event: 'Escalated',
      title: `Complaint ${complaint.trackingId} escalated`,
      message: `${complaint.reporterName}'s complaint was escalated to the Subcity Administrator (${reason}).`,
      type: 'complaint_escalated',
      actorId: req.user._id,
    });

    const reporter = await User.findById(complaint.reporter).select('-password').lean();
    if (reporter) {
      await dispatchNotification(io, complaint, [reporter], {
        event: 'Escalated',
        title: `Complaint ${complaint.trackingId} escalated`,
        message: `Your complaint has been escalated to the Subcity Administrator.`,
        type: 'complaint_escalated',
        actorId: req.user._id,
      });
    }

    await complaint.save();
    emitUpdate(io, complaint);

    res.json({ success: true, message: 'Complaint escalated to Subcity Administrator', data: complaint });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Escalation automation (used by the scheduler) ─────────────────────────────

// Stage 1: Woreda level, no response within 48h -> Subcity Department.
const escalateToSubcityDept = async (complaint, io, trigger = 'sla', reason = '') => {
  if (complaint.assignedLevel !== 'Woreda' || CLOSED_STATUSES.includes(complaint.status)) return;
  if (complaint.escalatedTo === 'Subcity Administrator') return;

  const previousLevel = complaint.assignedLevel;
  complaint.assignedLevel = 'Subcity';
  complaint.status = 'Escalated';
  complaint.escalated = true;
  complaint.escalatedTo = 'Subcity Department';
  complaint.escalatedAt = new Date();
  complaint.subcitySlaDueAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);
  if (!complaint.forwardReason && reason) complaint.forwardReason = reason;
  complaint.escalationHistory.push({
    fromLevel: `${previousLevel} Department`,
    toLevel: 'Subcity Department',
    reason: reason || 'No response within 48-hour SLA',
    triggeredBy: 'sla',
    triggeredByName: 'System',
    at: new Date(),
  });
  pushAudit(complaint, 'Escalated', null, 'Automatic escalation: no response within 48 hours');

  const deptOfficers = await findSubcityDepartmentOfficers(complaint.subcity, complaint.assignedToDepartment || complaint.department);
  const subcityAdmins = await findSubcityAdmins(complaint.subcity);
  if (deptOfficers.length) complaint.assignedTo = deptOfficers[0]._id;

  await dispatchNotification(io, complaint, [...deptOfficers, ...subcityAdmins], {
    event: 'Escalated',
    title: `Complaint ${complaint.trackingId} escalated to Subcity`,
    message: `Automatic escalation (48h SLA): "${complaint.title}" routed to the ${complaint.assignedToDepartment || complaint.department} department in ${complaint.subcity} subcity.`,
    type: 'complaint_escalated',
  });

  const reporter = await User.findById(complaint.reporter).select('-password').lean();
  if (reporter) {
    await dispatchNotification(io, complaint, [reporter], {
      event: 'Escalated',
      title: `Complaint ${complaint.trackingId} escalated`,
      message: `Your complaint has been escalated to the ${complaint.assignedToDepartment || complaint.department} department in ${complaint.subcity} subcity because no response was received within 48 hours.`,
      type: 'complaint_escalated',
    });
  }

  await complaint.save();
  emitUpdate(io, complaint);
};

// Stage 2: Subcity level, no action within 5 days -> Subcity Administrator.
const escalateToSubcityAdmin = async (complaint, io, trigger = 'sla', reason = '') => {
  if (complaint.assignedLevel !== 'Subcity' || CLOSED_STATUSES.includes(complaint.status)) return;
  if (complaint.escalatedTo === 'Subcity Administrator') return;

  complaint.status = 'Escalated';
  complaint.escalated = true;
  complaint.escalatedTo = 'Subcity Administrator';
  complaint.escalatedAt = new Date();
  complaint.escalationHistory.push({
    fromLevel: 'Subcity Department',
    toLevel: 'Subcity Administrator',
    reason: reason || 'No action within 5 days after escalation',
    triggeredBy: 'sla',
    triggeredByName: 'System',
    at: new Date(),
  });
  pushAudit(complaint, 'Escalated', null, 'Automatic escalation: no action within 5 days after escalation');

  const subcityAdmins = await findSubcityAdmins(complaint.subcity);
  await dispatchNotification(io, complaint, subcityAdmins, {
    event: 'Escalated',
    title: `Complaint ${complaint.trackingId} escalated to Administrator`,
    message: `Automatic escalation (5-day SLA): ${complaint.title}`,
    type: 'complaint_escalated',
  });

  const reporter = await User.findById(complaint.reporter).select('-password').lean();
  if (reporter) {
    await dispatchNotification(io, complaint, [reporter], {
      event: 'Escalated',
      title: `Complaint ${complaint.trackingId} escalated`,
      message: 'Your complaint has been escalated to the Subcity Administrator for attention.',
      type: 'complaint_escalated',
    });
  }

  await complaint.save();
  emitUpdate(io, complaint);
};

// Run one escalation pass (called by the 15-minute scheduler + admin endpoint).
const markOverdueComplaints = async (io) => {
  const now = new Date();
  const overdue = await MunicipalComplaint.find({
    status: { $nin: [...CLOSED_STATUSES, 'Completed'] },
    slaDueAt: { $lte: now },
    isOverdue: { $ne: true },
  });
  for (const c of overdue) {
    c.isOverdue = true;
    c.overdueSince = c.overdueSince || now;
    pushAudit(c, 'Overdue', null, 'Marked overdue: first response SLA passed');
    await c.save();
    if (!c.overdueNotifiedAt) {
      c.overdueNotifiedAt = now;
      await c.save();
      const woredaOfficer = await findWoredaOfficer(c.woredaId);
      const deptOfficers = await findDepartmentOfficers(c.woredaId, c.assignedToDepartment || c.department);
      const subcityAdmins = await findSubcityAdmins(c.subcity);
      await dispatchNotification(io, c, [...(woredaOfficer ? [woredaOfficer] : []), ...deptOfficers, ...subcityAdmins], {
        event: 'Overdue',
        title: `Complaint ${c.trackingId} is overdue`,
        message: `"${c.title}" exceeded its 48-hour SLA. Please respond promptly.`,
        type: 'complaint_escalated',
      });
    }
    emitUpdate(io, c);
  }
  return overdue.length;
};

const runEscalationPass = async (io) => {
  const now = new Date();

  // Pass 0: flag overdue complaints (SLA monitoring).
  await markOverdueComplaints(io);

  // Stage 1: overdue first response at Woreda level (48h SLA).
  const stage1 = await MunicipalComplaint.find({
    assignedLevel: 'Woreda',
    escalatedTo: { $ne: 'Subcity Administrator' },
    status: { $nin: [...CLOSED_STATUSES, 'Escalated'] },
    slaDueAt: { $lte: now },
  });
  for (const c of stage1) {
    try {
      await escalateToSubcityDept(c, io, 'sla', 'No response within 48-hour SLA');
      console.log(`[Escalation] Municipal complaint escalated to Subcity: ${c.trackingId}`);
    } catch (err) {
      console.error(`[Escalation] Municipal stage-1 failed for ${c.trackingId}:`, err.message);
    }
  }

  // Stage 2: no action within 5 days after escalation -> Subcity Administrator.
  const stage2 = await MunicipalComplaint.find({
    assignedLevel: 'Subcity',
    escalatedTo: { $ne: 'Subcity Administrator' },
    status: { $nin: [...CLOSED_STATUSES, 'Escalated'] },
    subcitySlaDueAt: { $lte: now },
  });
  for (const c of stage2) {
    try {
      await escalateToSubcityAdmin(c, io, 'sla', 'No action within 5 days after escalation');
      console.log(`[Escalation] Municipal complaint escalated to Administrator: ${c.trackingId}`);
    } catch (err) {
      console.error(`[Escalation] Municipal stage-2 failed for ${c.trackingId}:`, err.message);
    }
  }
};

// ── Stats / widgets ───────────────────────────────────────────────────────────

// GET /api/municipal-complaints/stats
const getStats = async (req, res) => {
  try {
    const userSubcity = await resolveUserSubcity(req.user);
    const scope = buildMunicipalScope(req.user, userSubcity);

    const openFilter = { ...scope, status: { $nin: CLOSED_STATUSES } };
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

    const [total, open, underReview, inProgress, pendingVerification, byStatus, pendingByDept, overdue, escalated, resolvedToday, avgResponse, avgResolution] = await Promise.all([
      MunicipalComplaint.countDocuments(scope),
      MunicipalComplaint.countDocuments({ ...scope, status: 'Submitted' }),
      MunicipalComplaint.countDocuments({ ...scope, status: 'In Review' }),
      MunicipalComplaint.countDocuments({ ...scope, status: 'In Progress' }),
      MunicipalComplaint.countDocuments({ ...scope, status: 'Completed' }),
      MunicipalComplaint.aggregate([
        { $match: scope },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      MunicipalComplaint.aggregate([
        { $match: openFilter },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      MunicipalComplaint.countDocuments({ ...openFilter, slaDueAt: { $lte: now } }),
      MunicipalComplaint.countDocuments({ ...openFilter, escalated: true }),
      MunicipalComplaint.countDocuments({ ...scope, status: 'Resolved', resolvedAt: { $gte: startOfToday } }),
      MunicipalComplaint.aggregate([
        { $match: scope },
        { $unwind: { path: '$responses', preserveNullAndEmptyArrays: false } },
        {
          $group: {
            _id: null,
            avgMinutes: {
              $avg: {
                $divide: [{ $subtract: ['$responses.at', '$createdAt'] }, 60000],
              },
            },
          },
        },
      ]),
      MunicipalComplaint.aggregate([
        { $match: { ...scope, resolvedAt: { $exists: true, $ne: null } } },
        {
          $group: {
            _id: null,
            avgHours: {
              $avg: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 3600000] },
            },
          },
        },
      ]),
    ]);

    const round = (n) => (n == null ? null : Math.round(n * 100) / 100);
    const avgResponseMinutes = avgResponse[0] ? round(avgResponse[0].avgMinutes) : null;
    const avgResolutionHours = avgResolution[0] ? round(avgResolution[0].avgHours) : null;
    const statusDistribution = {};
    byStatus.forEach((s) => { statusDistribution[s._id] = s.count; });

    res.json({
      success: true,
      data: {
        total,
        open,
        underReview,
        inProgress,
        pendingVerification,
        statusDistribution,
        pendingByDepartment: pendingByDept,
        overdue,
        escalated,
        resolvedToday,
        averageResponseMinutes: avgResponseMinutes,
        averageResolutionHours: avgResolutionHours,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Exports (PDF / Excel) ─────────────────────────────────────────────────────

// GET /api/municipal-complaints/export/pdf  and  /export/excel
const exportComplaints = async (req, res) => {
  try {
    const userSubcity = await resolveUserSubcity(req.user);
    const scope = buildMunicipalScope(req.user, userSubcity);
    const filter = { ...scope };

    if (req.query.status) filter.status = req.query.status;
    if (req.query.department) filter.category = ciRegex(req.query.department);
    if (req.query.level) filter.assignedLevel = req.query.level;
    if (req.query.subcity) filter.subcity = ciRegex(req.query.subcity);

    const complaints = await MunicipalComplaint.find(filter)
      .sort({ createdAt: -1 })
      .limit(2000)
      .populate('assignedTo', 'fullName role')
      .lean();

    if (req.path.includes('/excel')) {
      res.setHeader('Content-Type', 'application/vnd.ms-excel');
      res.setHeader('Content-Disposition', `attachment; filename=municipal-complaints-${Date.now()}.xls`);
      return res.send(generateComplaintExcel(complaints));
    }
    return generateComplaintPDF(complaints, res);
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Audit trail for a single complaint ────────────────────────────────────────

// GET /api/municipal-complaints/:id/audit
const getAuditTrail = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id)
      .select('trackingId auditTrail')
      .lean();
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    const userSubcity = await resolveUserSubcity(req.user);
    if (!isComplaintInScope(req.user, complaint, userSubcity)) {
      return res.status(403).json({ success: false, message: 'Not authorised.' });
    }
    res.json({ success: true, data: complaint.auditTrail || [] });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  getIssueTemplates,
  createComplaint,
  getComplaints,
  getComplaintById,
  trackComplaint,
  assessComplaint,
  forwardComplaint,
  updateStatus,
  addInternalNote,
  escalateManually,
  escalateToSubcityDept,
  escalateToSubcityAdmin,
  markOverdueComplaints,
  runEscalationPass,
  getStats,
  exportComplaints,
  getAuditTrail,
  getAssignableUsers,
  acceptComplaint,
  rejectComplaint,
  assignInspector,
  assignTechnician,
  startWork,
  completeWork,
  verifyResolution,
  reopenComplaint,
  closeComplaint,
  submitFeedback,
  addCitizenEvidence,
  downloadResolutionLetter,
  buildMunicipalScope,
  isComplaintInScope,
  getIO,
  dispatchNotification,
};
