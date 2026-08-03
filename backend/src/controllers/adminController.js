const User = require('../models/User');
const InfrastructureReport = require('../models/InfrastructureReport');
const EmergencyReport = require('../models/EmergencyReport');
const PublicComplaint = require('../models/PublicComplaint');
const Department = require('../models/Department');
const Subcity = require('../models/Subcity');
const AuditLog = require('../models/AuditLog');
const createNotification = require('../utils/createNotification');
const { SUBCITY_ROLE_MAP, DEPARTMENTS } = require('../utils/scopeFilter');
const { isCanonicalAdminUser, isCanonicalAdminEmail } = require('../utils/adminAccount');
const { logAction } = require('../middleware/auditLog');
const { normalizeDepartmentName, escapeRegExp } = require('../utils/departmentNames');
const mongoose = require('mongoose');


// Every role that a system administrator may provision. Only the admin role
// can create accounts — enforced by the admin route middleware (authorize('admin')).
const PROVISIONABLE_ROLES = [
  'citizen', 'government', 'ngo', 'volunteer', 'admin',
  'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura',
  'woreda', 'department',
  'ADMIN', 'SUBCITY_HEAD', 'WOREDA_HEAD', 'DEPARTMENT_ADMIN', 'OFFICER', 'TECHNICIAN', 'CITIZEN', 'CONTRACTOR',
];

// Roles whose uniqueness is enforced per-location at the application layer
// (in addition to the DB partial indexes) so we can return a human-readable
// 409 message before Mongoose ever throws an 11000 error.
const SUBCITY_SCOPED_ROLES = ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'SUBCITY_HEAD'];

// Roles that require a woreda selection.
const WOREDA_SCOPED_ROLES = ['woreda', 'WOREDA_HEAD', 'department', 'DEPARTMENT_ADMIN', 'OFFICER', 'TECHNICIAN', 'CONTRACTOR'];

// Roles that require a department selection.
const DEPARTMENT_SCOPED_ROLES = ['department', 'DEPARTMENT_ADMIN', 'OFFICER', 'TECHNICIAN', 'CONTRACTOR'];

// One account per woreda (woreda manager / woreda head).
const UNIQUE_WOREDA_ROLES = ['woreda', 'WOREDA_HEAD'];

// One account per woreda + department (department manager / department admin).
const UNIQUE_DEPARTMENT_ROLES = ['department', 'DEPARTMENT_ADMIN'];

/**
 * Check for a duplicate subcity-admin account.
 * Returns the conflicting user or null.
 * excludeId: ObjectId string — used on edit to ignore the record being updated.
 */
const findSubcityConflict = (role, subcity, excludeId = null) => {
  if (!SUBCITY_SCOPED_ROLES.includes(role)) return Promise.resolve(null);
  const filter = { role, subcity };
  if (excludeId) filter._id = { $ne: excludeId };
  return User.findOne(filter).select('fullName email').lean();
};

/**
 * Check for a duplicate woreda-scoped account.
 * For woreda/WOREDA_HEAD roles: unique per woredaId.
 * For department/DEPARTMENT_ADMIN roles: unique per woredaId + department.
 * OFFICER and TECHNICIAN are intentionally NOT unique — a woreda department
 * can have many officers and technicians.
 */
const findWoredaConflict = (role, woredaId, department, excludeId = null) => {
  if (!WOREDA_SCOPED_ROLES.includes(role)) return Promise.resolve(null);
  const filter = { role, woredaId };
  if (UNIQUE_DEPARTMENT_ROLES.includes(role) && department) filter.department = department;
  if (excludeId) filter._id = { $ne: excludeId };
  return User.findOne(filter).select('fullName email').lean();
};

// All woreda records allowed for the given subcity, formatted for dropdowns.
// DB records include their _id (needed when provisioning woreda/department
// accounts); static fallback names (no _id yet) are kept for display only.
const getWoredaOptions = async (subcity) => {
  const Woreda = require('../models/Woreda');
  // Return name, _id, and departments so the frontend can populate the
  // department dropdown from the selected woreda's own department list.
  const records = await Woreda.find({ subcity, status: 'Active' })
    .select('name _id departments')
    .sort({ name: 1 });
  return records.map((r) => ({
    _id: r._id,
    name: r.name,
    departments: r.departments && r.departments.length ? r.departments : DEPARTMENTS,
  }));
};

// @desc  Get platform-wide statistics
// @route GET /api/admin/stats
// @access Private (admin)
const getStats = async (req, res) => {
  try {
    const [
      totalUsers, citizens, govOrgs, ngos, volunteers,
      totalInfra, activeInfra, resolvedInfra, pendingInfra,
      totalEmergency, activeEmergency, resolvedEmergency, pendingEmergency,
      totalPublicComplaints, activePublicComplaints, pendingPublicComplaints, resolvedPublicComplaints,
      pendingApprovals,
    ] = await Promise.all([
      User.countDocuments({ isActive: true }),
      User.countDocuments({ role: 'citizen', isActive: true }),
      User.countDocuments({ role: 'government', isActive: true }),
      User.countDocuments({ role: 'ngo', isActive: true }),
      User.countDocuments({ role: 'volunteer', isActive: true }),
      InfrastructureReport.countDocuments(),
      InfrastructureReport.countDocuments({ status: { $in: ['Under Review', 'In Progress', 'Assigned'] } }),
      InfrastructureReport.countDocuments({ status: 'Resolved' }),
      InfrastructureReport.countDocuments({ status: 'Pending' }),
      EmergencyReport.countDocuments(),
      EmergencyReport.countDocuments({ status: { $in: ['Active', 'In Progress'] } }),
      EmergencyReport.countDocuments({ status: 'Resolved' }),
      EmergencyReport.countDocuments({ status: 'Pending' }),
      PublicComplaint.countDocuments(),
      PublicComplaint.countDocuments({ status: { $in: ['Pending', 'Submitted', 'Under Review', 'Assigned', 'In Progress'] } }),
      PublicComplaint.countDocuments({ status: 'Pending' }),
      PublicComplaint.countDocuments({ status: 'Resolved' }),
      User.countDocuments({ isApproved: false, role: { $in: ['government', 'ngo'] } }),
    ]);

    res.json({
      success: true,
      stats: {
        users: { total: totalUsers, citizens, govOrgs, ngos, volunteers },
        infrastructure: { total: totalInfra, active: activeInfra, resolved: resolvedInfra, pending: pendingInfra },
        emergency: { total: totalEmergency, active: activeEmergency, resolved: resolvedEmergency, pending: pendingEmergency },
        publicComplaints: totalPublicComplaints,
        publicComplaintStats: {
          total: totalPublicComplaints,
          active: activePublicComplaints,
          pending: pendingPublicComplaints,
          resolved: resolvedPublicComplaints,
        },
        pendingApprovals,
        pendingReports: pendingInfra + pendingEmergency,
        resolvedReports: resolvedInfra + resolvedEmergency,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Create a new user (admin only)
// @route POST /api/admin/users
// @access Private (admin)
const createUser = async (req, res) => {
  try {
    const {
      fullName, email, password, phone, role,
      organizationName, organizationType,
      skills, subcity, woredaId, woredaName, department,
      employeeId, subcityId, departmentId,
    } = req.body;

    if (!fullName || !email || !password) {
      return res.status(400).json({ success: false, message: 'Full name, email, and password are required' });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    if (phone && !/^09\d{8}$/.test(phone)) {
      return res.status(400).json({ success: false, message: 'Phone number must start with 09 and contain 10 digits' });
    }

    const existingUser = await User.findOne({ email: email.toLowerCase().trim() });
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const finalRole = PROVISIONABLE_ROLES.includes(role) ? role : 'citizen';

    // Subcity-admin roles derive their subcity from the role itself.
    let subcityValue = subcity;
    if (SUBCITY_ROLE_MAP[finalRole]) subcityValue = SUBCITY_ROLE_MAP[finalRole];

    // ── Location field requirements ──────────────────────────────────────────
    if (WOREDA_SCOPED_ROLES.includes(finalRole) && !woredaId) {
      return res.status(400).json({ success: false, message: 'A woreda must be selected for woreda, department, officer and technician accounts' });
    }
    if (DEPARTMENT_SCOPED_ROLES.includes(finalRole) && !department) {
      return res.status(400).json({ success: false, message: 'A department must be selected for department, officer and technician accounts' });
    }

    // ── Validate subcity against the live Subcity collection ────────────────
    // Subcity-role accounts derive their subcity from their role and are always
    // valid; only explicitly supplied subcityValues need DB checking.
    let subcityIdValue = subcityId || null;
    if (subcityValue && !SUBCITY_ROLE_MAP[finalRole]) {
      const Subcity = require('../models/Subcity');
      const scRecord = await Subcity.findOne({ nameLower: subcityValue.trim().toLowerCase() });
      if (!scRecord) {
        const allSubcities = await Subcity.find().sort({ name: 1 }).select('name');
        const names = allSubcities.map((s) => s.name).join(', ') || 'none created yet';
        return res.status(400).json({
          success: false,
          message: `Invalid subcity "${subcityValue}". Available subcities: ${names}`,
        });
      }
      subcityValue = scRecord.name; // Normalise to canonical casing
      subcityIdValue = scRecord._id;
    }

    // ── Validate department against the woreda's own department list ─────────
    // For department-scoped accounts we fetch the woreda up-front; this also
    // serves as the "woreda exists" check and is reused in the conflict block.
    let woredaDocForDept = null;
    let departmentIdValue = departmentId || null;
    if (DEPARTMENT_SCOPED_ROLES.includes(finalRole)) {
      const Woreda = require('../models/Woreda');
      woredaDocForDept = await Woreda.findById(woredaId).select('name subcity departments').lean();
      if (!woredaDocForDept) {
        return res.status(400).json({ success: false, message: 'Selected woreda not found' });
      }
      const allowedDepts = woredaDocForDept.departments && woredaDocForDept.departments.length
        ? woredaDocForDept.departments
        : DEPARTMENTS;
      // Case-insensitive match — normalise both sides to lower-case.
      const deptLower = (department || '').trim().toLowerCase();
      const matched   = allowedDepts.find((d) => d.toLowerCase() === deptLower);
      if (!matched) {
        return res.status(400).json({
          success: false,
          message: `Invalid department "${department}" for ${woredaDocForDept.name}. Available: ${allowedDepts.join(', ')}`,
        });
      }
      // Normalise to the canonical casing stored in the woreda record.
      req.body.department = matched;
      // Capture the live Department record id when one exists for this woreda.
      const Department = require('../models/Department');
      const deptRec = await Department.findOne({ woredaId: new mongoose.Types.ObjectId(woredaId), name: matched }).select('_id').lean();
      if (deptRec) departmentIdValue = deptRec._id;
    }

    // ── Duplicate checks (application layer — 409 before 11000) ─────────────

    // Rule 1: one subcity-admin per subcity
    if (SUBCITY_SCOPED_ROLES.includes(finalRole)) {
      const conflict = await findSubcityConflict(finalRole, subcityValue);
      if (conflict) {
        return res.status(409).json({
          success: false,
          message: `A user already exists for ${subcityValue} Subcity`,
        });
      }
    }

    // Rule 2: one woreda-role user per woreda; one department user per woreda+department
    if (WOREDA_SCOPED_ROLES.includes(finalRole)) {
      const Woreda = require('../models/Woreda');
      // Use the pre-fetched doc for department role; fetch now for woreda role.
      const woredaDoc = woredaDocForDept || await Woreda.findById(woredaId).select('name subcity').lean();
      if (!woredaDoc) {
        return res.status(400).json({ success: false, message: 'Selected woreda not found' });
      }
      const conflict = await findWoredaConflict(finalRole, woredaId, department);
      if (conflict) {
        const label = UNIQUE_DEPARTMENT_ROLES.includes(finalRole)
          ? `A ${department} department account`
          : 'A woreda manager account';
        return res.status(409).json({
          success: false,
          message: `${label} already exists for ${woredaDoc.subcity} - ${woredaDoc.name}`,
        });
      }
    }

    const user = await User.create({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password,
      phone: phone || '',
      role: finalRole,
      organizationName: organizationName || '',
      organizationType: organizationType || '',
      subcity: subcityValue || undefined,
      subcityId: subcityIdValue || undefined,
      woredaId: woredaId || undefined,
      woredaName: woredaName || '',
      department: department || undefined,
      departmentId: departmentIdValue || undefined,
      employeeId: employeeId || undefined,
      skills: skills || [],
      isActive: true,
      isApproved: true,
    });

    console.log(`[ADMIN] Created user: ${user.email} (role: ${user.role}, _id: ${user._id})`);

    res.status(201).json({
      success: true,
      message: 'User created successfully. The user can login immediately.',
      user: { _id: user._id, fullName: user.fullName, email: user.email, role: user.role },
    });
  } catch (error) {
    console.error('[ADMIN] createUser error:', error.message);
    if (error.code === 11000) {
      // DB-level unique constraint fired — build a readable message from keyPattern.
      const kp = error.keyPattern || {};
      if (kp.subcity) {
        return res.status(409).json({ success: false, message: 'A user already exists for this subcity' });
      }
      if (kp.woredaId && kp.department) {
        return res.status(409).json({ success: false, message: 'A department user already exists for this woreda and department' });
      }
      if (kp.woredaId) {
        return res.status(409).json({ success: false, message: 'A user already exists for this woreda' });
      }
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Update user details (admin only)
// @route PUT /api/admin/users/:id
// @access Private (admin)
const updateUser = async (req, res) => {
  try {
    const {
      fullName, email, phone, role,
      organizationName, organizationType,
      isApproved, isActive, subcity, woredaId, woredaName, department,
      employeeId, subcityId, departmentId,
    } = req.body;

    if (phone && !/^09\d{8}$/.test(phone)) {
      return res.status(400).json({ success: false, message: 'Phone number must start with 09 and contain 10 digits' });
    }

    const updateFields = {};
    if (fullName       !== undefined) updateFields.fullName       = fullName;
    if (email          !== undefined) updateFields.email          = email;
    if (phone          !== undefined) updateFields.phone          = phone;
    if (role           !== undefined) updateFields.role           = role;
    if (organizationName !== undefined) updateFields.organizationName = organizationName;
    if (organizationType !== undefined) updateFields.organizationType = organizationType;
    if (isApproved !== undefined) updateFields.isApproved = isApproved;
    if (isActive       !== undefined) updateFields.isActive       = isActive;
    if (subcity        !== undefined) updateFields.subcity        = subcity;
    if (woredaId       !== undefined) updateFields.woredaId       = woredaId;
    if (woredaName     !== undefined) updateFields.woredaName     = woredaName;
    if (department     !== undefined) {
      updateFields.department = department || null;
    }
    if (employeeId     !== undefined) updateFields.employeeId     = employeeId || null;
    if (subcityId      !== undefined) updateFields.subcityId      = subcityId || null;
    if (departmentId   !== undefined) updateFields.departmentId   = departmentId || null;

    // ── Duplicate checks on edit (merge incoming fields with current document) ─
    // Fetch the current record once; we need it for merging missing fields.
    const currentUser = await User.findById(req.params.id).select('role subcity woredaId department email isActive').lean();
    if (!currentUser) return res.status(404).json({ success: false, message: 'User not found' });

    // ── Default admin protection ─────────────────────────────────────────────
    // The reserved admin account can never be deactivated, demoted, or renamed,
    // otherwise the whole platform can be locked out unintentionally.
    const isDefaultAdmin = isCanonicalAdminUser(currentUser);
    if (isDefaultAdmin && updateFields.isActive === false) {
      return res.status(400).json({ success: false, message: 'The default administrator account cannot be deactivated.' });
    }
    if (isDefaultAdmin && updateFields.role && updateFields.role !== 'admin') {
      return res.status(400).json({ success: false, message: 'The default administrator account cannot be changed away from the admin role.' });
    }
    if (isDefaultAdmin && updateFields.email && !isCanonicalAdminEmail(updateFields.email)) {
      return res.status(400).json({ success: false, message: 'The default administrator email cannot be changed.' });
    }
    // Never deactivate the last remaining active admin.
    if (currentUser.role === 'admin' && currentUser.isActive && updateFields.isActive === false) {
      const activeAdmins = await User.countDocuments({ role: 'admin', isActive: true });
      if (activeAdmins <= 1) {
        return res.status(400).json({ success: false, message: 'Cannot deactivate the last active System Admin account. Create another admin first.' });
      }
    }

    const effectiveRole     = updateFields.role       !== undefined ? updateFields.role       : currentUser.role;
    const effectiveSubcity  = updateFields.subcity    !== undefined ? updateFields.subcity    : currentUser.subcity;
    const effectiveWoredaId = updateFields.woredaId   !== undefined ? updateFields.woredaId   : currentUser.woredaId;
    const effectiveDept     = updateFields.department !== undefined ? updateFields.department  : currentUser.department;

    // Validate department against the effective woreda's own department list.
    if (DEPARTMENT_SCOPED_ROLES.includes(effectiveRole) && effectiveDept && effectiveWoredaId) {
      const Woreda = require('../models/Woreda');
      const woredaForValidation = await Woreda.findById(effectiveWoredaId).select('name subcity departments').lean();
      if (woredaForValidation) {
        const allowedDepts = woredaForValidation.departments && woredaForValidation.departments.length
          ? woredaForValidation.departments
          : DEPARTMENTS;
        // Case-insensitive match
        const deptLower = (effectiveDept || '').trim().toLowerCase();
        const matched   = allowedDepts.find((d) => d.toLowerCase() === deptLower);
        if (!matched) {
          return res.status(400).json({
            success: false,
            message: `Invalid department "${effectiveDept}" for ${woredaForValidation.name}. Available: ${allowedDepts.join(', ')}`,
          });
        }
        // Normalise to canonical casing and write it back into updateFields
        updateFields.department = matched;
        const Department = require('../models/Department');
        const deptRec = await Department.findOne({ woredaId: effectiveWoredaId, name: matched }).select('_id').lean();
        if (deptRec) updateFields.departmentId = deptRec._id;
      }
    }

    // Rule 1: one subcity-admin per subcity
    if (SUBCITY_SCOPED_ROLES.includes(effectiveRole)) {
      const conflict = await findSubcityConflict(effectiveRole, effectiveSubcity, req.params.id);
      if (conflict) {
        return res.status(409).json({
          success: false,
          message: `A user already exists for ${effectiveSubcity} Subcity`,
        });
      }
    }

    // Rule 2: one woreda/department user per woreda (+ department for dept role)
    if (WOREDA_SCOPED_ROLES.includes(effectiveRole)) {
      const conflict = await findWoredaConflict(effectiveRole, effectiveWoredaId, effectiveDept, req.params.id);
      if (conflict) {
        const Woreda = require('../models/Woreda');
        const woredaDoc = await Woreda.findById(effectiveWoredaId).select('name subcity').lean();
        const location = woredaDoc ? `${woredaDoc.subcity} - ${woredaDoc.name}` : String(effectiveWoredaId);
        const label = UNIQUE_DEPARTMENT_ROLES.includes(effectiveRole) ? `A ${effectiveDept} department account` : 'A woreda manager account';
        return res.status(409).json({
          success: false,
          message: `${label} already exists for ${location}`,
        });
      }
    }

    const user = await User.findByIdAndUpdate(req.params.id, updateFields, { new: true, runValidators: true }).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    res.json({ success: true, message: 'User updated successfully', user });
  } catch (error) {
    if (error.code === 11000) {
      const kp = error.keyPattern || {};
      if (kp.subcity) {
        return res.status(409).json({ success: false, message: 'A user already exists for this subcity' });
      }
      if (kp.woredaId && kp.department) {
        return res.status(409).json({ success: false, message: 'A department user already exists for this woreda and department' });
      }
      if (kp.woredaId) {
        return res.status(409).json({ success: false, message: 'A user already exists for this woreda' });
      }
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get activity logs (audit trail)
// @route GET /api/admin/activity-logs
// @access Private (admin)
const getActivityLogs = async (req, res) => {
  try {
    const { action, user: userId, page = 1, limit = 20 } = req.query;
    const query = {};
    if (action) query.action = action;
    if (userId) query.user = userId;

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .populate('user', 'fullName email role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), logs });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get department master data with search/status/subcity/pagination.
// @route GET /api/admin/departments
// @access Private (admin)
const getDepartments = async (req, res) => {
  try {
    const { search, status, subcity, page = 1, limit = 10 } = req.query;
    const query = {};

    if (search) query.name = { $regex: search.trim(), $options: 'i' };
    if (status) query.status = status;
    if (subcity) {
      // Accept a subcity ObjectId or a subcity name. Subcity-filtered lists only
      // show departments that belong to that subcity.
      if (mongoose.isValidObjectId(subcity)) {
        query.subcityId = subcity;
      } else {
        query.subcityName = { $regex: `^${escapeRegExp(subcity)}$`, $options: 'i' };
      }
    }

    const total = await Department.countDocuments(query);
    const departments = await Department.find(query)
      .sort({ name: 1 })
      .skip((page - 1) * Number(limit))
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), departments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Shared duplicate check scoped to a subcity + woreda.
// (subcityId null + woredaId null = legacy/global).
const findScopedDepartmentDup = (subcityId, woredaId, normalizedName, excludeId) => {
  const scope = subcityId || null;
  const woredaScope = woredaId || null;
  const filter = {
    subcityId: scope,
    woredaId: woredaScope,
    $or: [
      { normalizedDepartmentName: normalizedName },
      // Fall back to a regex on `name` so records created before the
      // normalizedDepartmentName backfill are still caught.
      { name: { $regex: `^${escapeRegExp(normalizedName)}$`, $options: 'i' } },
    ],
  };
  if (excludeId) filter._id = { $ne: excludeId };
  return Department.findOne(filter);
};

// @desc  Create a department (admin only). Any department name is accepted.
//        Optional subcityId assigns the department to a subcity; an optional
//        woredaId (which requires a subcity) assigns it to a woreda. Duplicates
//        are enforced per (subcity, woreda) scope.
// @route POST /api/admin/departments
// @access Private (admin)
const createDepartment = async (req, res) => {
  try {
    const { name, description, status, subcityId, woredaId } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Department name is required' });
    }

    const normalizedName = normalizeDepartmentName(name);
    if (normalizedName.length > 100) {
      return res.status(400).json({ success: false, message: 'Department name must be 100 characters or fewer' });
    }

    let subcity = null;
    if (subcityId) {
      if (!mongoose.isValidObjectId(subcityId)) {
        return res.status(400).json({ success: false, message: 'Invalid subcity id' });
      }
      subcity = await Subcity.findById(subcityId).lean();
      if (!subcity) return res.status(404).json({ success: false, message: 'Subcity not found' });
    }

    let woreda = null;
    if (woredaId) {
      if (!subcity) {
        return res.status(400).json({ success: false, message: 'Please select a Subcity when selecting a Woreda.' });
      }
      if (!mongoose.isValidObjectId(woredaId)) {
        return res.status(400).json({ success: false, message: 'Invalid woreda id' });
      }
      const Woreda = require('../models/Woreda');
      woreda = await Woreda.findById(woredaId).lean();
      if (!woreda) return res.status(404).json({ success: false, message: 'Woreda not found' });
      if (String(woreda.subcity || '').trim().toLowerCase() !== String(subcity.name || '').trim().toLowerCase()) {
        return res.status(400).json({
          success: false,
          message: `The selected woreda does not belong to ${subcity.name} Subcity.`,
        });
      }
    }

    const existing = await findScopedDepartmentDup(subcity?._id || null, woreda?._id || null, normalizedName);
    if (existing) {
      if (existing.status === 'Inactive') {
        // Deactivated copy exists — offer reactivation instead of a duplicate.
        return res.status(409).json({
          success: false,
          code: 'DEPARTMENT_EXISTS_INACTIVE',
          message: `A department named "${existing.name}" already exists${subcity ? ` in ${subcity.name}` : ''} but is inactive. Reactivate it instead of creating a duplicate.`,
          department: { _id: existing._id, name: existing.name, status: existing.status, subcityId: existing.subcityId, subcityName: existing.subcityName, woredaId: existing.woredaId, woredaName: existing.woredaName },
        });
      }
      return res.status(409).json({
        success: false,
        code: 'DEPARTMENT_NAME_EXISTS',
        message: `A department named "${existing.name}" already exists${subcity ? ` in ${subcity.name}` : ''}`,
        department: { _id: existing._id, name: existing.name, status: existing.status, subcityId: existing.subcityId, subcityName: existing.subcityName, woredaId: existing.woredaId, woredaName: existing.woredaName },
      });
    }

    const department = await Department.create({
      name: normalizedName,
      normalizedDepartmentName: normalizedName,
      subcityId: subcity?._id || null,
      subcityName: subcity?.name || '',
      woredaId: woreda?._id || null,
      woredaName: woreda?.name || '',
      createdByAdmin: req.user?._id || undefined,
      description: (description || '').trim(),
      status: status === 'Inactive' ? 'Inactive' : 'Active',
    });

    res.status(201).json({ success: true, message: 'Department created successfully', department });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        code: 'DEPARTMENT_NAME_EXISTS',
        message: 'A department with this name already exists in this subcity',
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Update a department (admin only)
// @route PUT /api/admin/departments/:id
// @access Private (admin)
const updateDepartment = async (req, res) => {
  try {
    const { name, description, status, subcityId, woredaId } = req.body;
    const updateFields = {};

    const current = await Department.findById(req.params.id);
    if (!current) return res.status(404).json({ success: false, message: 'Department not found' });

    // ── Resolve the (subcity, woreda) scope the department ends up with ───────
    // undefined → leave unchanged (e.g. reactivate/status-only calls).
    // '' or null → clear (general department).
    // ObjectId   → validate + assign.
    let targetSubcityId = current.subcityId || null;
    if (subcityId !== undefined && subcityId !== null && subcityId !== '') {
      if (!mongoose.isValidObjectId(subcityId)) {
        return res.status(400).json({ success: false, message: 'Invalid subcity id' });
      }
      const subcity = await Subcity.findById(subcityId).lean();
      if (!subcity) return res.status(404).json({ success: false, message: 'Subcity not found' });
      targetSubcityId = subcity._id;
      updateFields.subcityId = subcity._id;
      updateFields.subcityName = subcity.name;
    } else if (subcityId !== undefined) {
      targetSubcityId = null;
      updateFields.subcityId = null;
      updateFields.subcityName = '';
    }

    let targetWoredaId = current.woredaId || null;
    if (woredaId !== undefined && woredaId !== null && woredaId !== '') {
      if (!targetSubcityId) {
        return res.status(400).json({ success: false, message: 'Please select a Subcity when selecting a Woreda.' });
      }
      if (!mongoose.isValidObjectId(woredaId)) {
        return res.status(400).json({ success: false, message: 'Invalid woreda id' });
      }
      const Woreda = require('../models/Woreda');
      const woreda = await Woreda.findById(woredaId).lean();
      if (!woreda) return res.status(404).json({ success: false, message: 'Woreda not found' });
      const subcity = await Subcity.findById(targetSubcityId).lean();
      if (subcity && String(woreda.subcity || '').trim().toLowerCase() !== String(subcity.name || '').trim().toLowerCase()) {
        return res.status(400).json({
          success: false,
          message: `The selected woreda does not belong to ${subcity.name} Subcity.`,
        });
      }
      targetWoredaId = woreda._id;
      updateFields.woredaId = woreda._id;
      updateFields.woredaName = woreda.name;
    } else if (woredaId !== undefined) {
      targetWoredaId = null;
      updateFields.woredaId = null;
      updateFields.woredaName = '';
    }

    if (name !== undefined) {
      const normalizedName = normalizeDepartmentName(name);
      if (!normalizedName) {
        return res.status(400).json({ success: false, message: 'Department name is required' });
      }
      if (normalizedName.length > 100) {
        return res.status(400).json({ success: false, message: 'Department name must be 100 characters or fewer' });
      }
      // Case- and whitespace-insensitive duplicate check excluding this record,
      // scoped to the department's (new) subcity + woreda.
      const existing = await findScopedDepartmentDup(targetSubcityId, targetWoredaId, normalizedName, req.params.id);
      if (existing) {
        return res.status(409).json({
          success: false,
          code: 'DEPARTMENT_NAME_EXISTS',
          message: `A department named "${existing.name}" already exists${targetSubcityId ? ' in this subcity' : ''}`,
          department: { _id: existing._id, name: existing.name, status: existing.status },
        });
      }
      updateFields.name = normalizedName;
      updateFields.normalizedDepartmentName = normalizedName;
    }

    if (description !== undefined) updateFields.description = String(description).trim();
    if (status      !== undefined) updateFields.status      = status === 'Inactive' ? 'Inactive' : 'Active';

    const department = await Department.findByIdAndUpdate(req.params.id, updateFields, { new: true, runValidators: true });
    if (!department) return res.status(404).json({ success: false, message: 'Department not found' });

    res.json({ success: true, message: 'Department updated successfully', department });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        code: 'DEPARTMENT_NAME_EXISTS',
        message: 'A department with this name already exists in this subcity',
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Delete a department (admin only)
// @route DELETE /api/admin/departments/:id
// @access Private (admin)
const deleteDepartment = async (req, res) => {
  try {
    const department = await Department.findByIdAndDelete(req.params.id);
    if (!department) return res.status(404).json({ success: false, message: 'Department not found' });

    res.json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get location structure for user provisioning (admin only)
// @route GET /api/admin/locations
// @access Private (admin)
const getLocations = async (req, res) => {
  try {
    const Subcity = require('../models/Subcity');

    // Run all three independent queries in parallel for speed.
    const [subcityRecords, liveDepartments] = await Promise.all([
      Subcity.find({ status: 'Active' }).sort({ name: 1 }),
      // Pull the live Department collection so newly created departments
      // appear immediately without any server restart or code change.
      Department.find({ status: 'Active' }).select('name').sort({ name: 1 }).lean(),
    ]);

    const subcities = await Promise.all(
      subcityRecords.map(async (sc) => {
        const woredas = await getWoredaOptions(sc.name);
        return { name: sc.name, woredas };
      })
    );

    // departments is now a live array of name strings from the DB.
    const departments = liveDepartments.map((d) => d.name);

    res.json({ success: true, subcities, departments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get all users with filters
// @route GET /api/admin/users
// @access Private (admin)
const getUsers = async (req, res) => {
  try {
    const { role, isActive, isApproved, search, subcity, woredaId, department, page = 1, limit = 15 } = req.query;
    const query = {};

    if (role) query.role = role;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (isApproved !== undefined) query.isApproved = isApproved === 'true';
    if (subcity) query.subcity = subcity;
    if (woredaId) query.woredaId = woredaId;
    if (department) query.department = department;
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
        { organizationName: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('-password')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Approve or reject organization registration
// @route PUT /api/admin/users/:id/approve
// @access Private (admin)
const approveUser = async (req, res) => {
  try {
    const { action, note } = req.body;
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // The default admin can never be rejected/deactivated via the approval flow.
    if (action === 'reject' && isCanonicalAdminUser(user)) {
      return res.status(400).json({ success: false, message: 'The default administrator account cannot be rejected or deactivated.' });
    }

    user.isApproved = action === 'approve';
    if (action === 'reject') user.isActive = false;
    await user.save();

    await createNotification({
      recipient: user._id,
      title: `Account ${action === 'approve' ? 'Approved' : 'Rejected'}`,
      message: `Your ${user.role} account has been ${action === 'approve' ? 'approved. You can now log in.' : `rejected. ${note || ''}`}`,
      type: 'system',
    });

    res.json({ success: true, message: `User ${action}d successfully`, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Activate or deactivate user account
// @route PUT /api/admin/users/:id/toggle-active
// @access Private (admin)
const toggleUserActive = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    // The default admin is the platform's lifeline — never deactivate it.
    if (user.isActive && isCanonicalAdminUser(user)) {
      return res.status(400).json({
        success: false,
        message: 'The default administrator account cannot be deactivated. It is automatically reactivated on login and server restart.',
      });
    }

    // Never deactivate the last remaining active admin (locks everyone out).
    if (user.isActive && user.role === 'admin') {
      const activeAdmins = await User.countDocuments({ role: 'admin', isActive: true });
      if (activeAdmins <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot deactivate the last active System Admin account. Create another admin first.',
        });
      }
    }

    user.isActive = !user.isActive;
    await user.save();

    // Audit every activation/deactivation (the default admin path is blocked
    // above, so the action enum below is always accurate).
    await logAction({
      user: req.user,
      action: user.isActive ? 'user_reactivated' : 'user_deactivated',
      resource: 'User',
      resourceId: user._id,
      details: { target: user.email, role: user.role, by: req.user?.email },
      req,
    });

    res.json({ success: true, message: `User ${user.isActive ? 'activated' : 'deactivated'}`, user });
  } catch (error) {
    if (error.message === 'The default administrator account cannot be deactivated.') {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Delete user
// @route DELETE /api/admin/users/:id
// @access Private (admin)
const deleteUser = async (req, res) => {
  try {
    const target = await User.findById(req.params.id).select('role email');
    if (!target) return res.status(404).json({ success: false, message: 'User not found' });

    // The default admin account is the platform's lifeline — never delete it.
    if (isCanonicalAdminUser(target)) {
      return res.status(400).json({
        success: false,
        message: 'The default administrator account cannot be deleted.',
      });
    }

    // Never delete the last admin account — it would lock everyone out
    if (target.role === 'admin') {
      const adminCount = await User.countDocuments({ role: 'admin' });
      if (adminCount <= 1) {
        return res.status(400).json({
          success: false,
          message: 'Cannot delete the last System Admin account. Create another admin first.',
        });
      }
    }

    // Prevent self-deletion
    if (req.user && req.user._id.toString() === req.params.id) {
      return res.status(400).json({
        success: false,
        message: 'You cannot delete your own account while logged in.',
      });
    }

    await User.findByIdAndDelete(req.params.id);
    console.log(`[ADMIN] Deleted user: ${target.email} (role: ${target.role}) by ${req.user?.email}`);
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get pending approvals (gov/ngo accounts)
// @route GET /api/admin/pending-approvals
// @access Private (admin)
const getPendingApprovals = async (req, res) => {
  try {
    const users = await User.find({ isApproved: false, role: { $in: ['government', 'ngo'] } })
      .select('-password')
      .sort({ createdAt: -1 });
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get region-based risk statistics for map
// @route GET /api/admin/region-stats
// @access Public
const getRegionStats = async (req, res) => {
  try {
    const regions = [
      'Addis Ababa', 'Oromia', 'Amhara', 'Tigray', 'Somali', 'Afar',
      'Sidama', 'Central Ethiopia', 'South Ethiopia', 'Southwest Ethiopia',
      'Gambella', 'Benishangul-Gumuz', 'Harari', 'Dire Dawa',
    ];

    const regionStats = await Promise.all(
      regions.map(async (region) => {
        const [infra, emergency, resolved] = await Promise.all([
          InfrastructureReport.countDocuments({ region }),
          EmergencyReport.countDocuments({ region, status: { $in: ['Active', 'In Progress'] } }),
          InfrastructureReport.countDocuments({ region, status: 'Resolved' }),
        ]);

        const total = infra + emergency;
        let riskLevel = 'Low';
        if (total >= 20 || emergency >= 5) riskLevel = 'Critical';
        else if (total >= 10 || emergency >= 3) riskLevel = 'High';
        else if (total >= 5) riskLevel = 'Moderate';

        return { region, infra, emergency, resolved, total, riskLevel };
      })
    );

    res.json({ success: true, regionStats });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get woreda master data with search/subcity/status/pagination
// @route GET /api/admin/woredas
// @access Private (admin)
const getAdminWoredas = async (req, res) => {
  try {
    const Woreda = require('../models/Woreda');
    const { search, subcity, status, page = 1, limit = 10 } = req.query;
    const query = {};

    if (search) query.name = { $regex: search, $options: 'i' };
    if (subcity) {
      // Case-insensitive so woredas seeded/created under any casing (e.g.
      // 'BOLE' vs 'Bole') are all found for a subcity dropdown.
      query.subcity = { $regex: `^${escapeRegExp(subcity)}$`, $options: 'i' };
    }
    if (status) query.status = status;

    const total = await Woreda.countDocuments(query);
    const woredas = await Woreda.find(query)
      .sort({ subcity: 1, name: 1 })
      .skip((page - 1) * Number(limit))
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), woredas });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Create a woreda (admin only). Master data only — never creates user accounts.
// @route POST /api/admin/woredas
// @access Private (admin)
const createWoreda = async (req, res) => {
  try {
    const Woreda  = require('../models/Woreda');
    const Subcity = require('../models/Subcity');
    const { name, subcity, description, status } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Woreda name is required' });
    }
    if (!subcity || !subcity.trim()) {
      return res.status(400).json({ success: false, message: 'Subcity is required' });
    }

    // Validate subcity against live DB records (case-insensitive)
    const subcityRecord = await Subcity.findOne({ nameLower: subcity.trim().toLowerCase() });
    if (!subcityRecord) {
      return res.status(400).json({ success: false, message: `Subcity "${subcity}" does not exist. Create it in Subcity Management first.` });
    }
    // Use the canonical casing stored in the DB
    const canonicalSubcity = subcityRecord.name;

    const existing = await Woreda.findOne({ name: name.trim(), subcity: canonicalSubcity });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A woreda with this name already exists in this subcity' });
    }

    const active = status !== 'Inactive';
    const woreda = await Woreda.create({
      name: name.trim(),
      subcity: canonicalSubcity,
      description: description || '',
      status: active ? 'Active' : 'Inactive',
      isActive: active,
      subcityId: null,
      departments: DEPARTMENTS,
    });

    res.status(201).json({ success: true, message: 'Woreda created successfully', woreda });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A woreda with this name already exists in this subcity' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Update a woreda (admin only)
// @route PUT /api/admin/woredas/:id
// @access Private (admin)
const updateWoreda = async (req, res) => {
  try {
    const Woreda = require('../models/Woreda');
    const { name, subcity, description, status } = req.body;

    const woreda = await Woreda.findById(req.params.id);
    if (!woreda) return res.status(404).json({ success: false, message: 'Woreda not found' });

    const updateFields = {};
    if (name !== undefined) updateFields.name = name.trim();
    if (subcity !== undefined) {
      const Subcity = require('../models/Subcity');
      const subcityRecord = await Subcity.findOne({ nameLower: subcity.trim().toLowerCase() });
      if (!subcityRecord) {
        return res.status(400).json({ success: false, message: `Subcity "${subcity}" does not exist. Create it in Subcity Management first.` });
      }
      updateFields.subcity = subcityRecord.name;
    }
    if (description !== undefined) updateFields.description = description;
    if (status !== undefined) {
      updateFields.status = status === 'Inactive' ? 'Inactive' : 'Active';
      updateFields.isActive = status === 'Active';
    }

    const finalName = updateFields.name || woreda.name;
    const finalSubcity = updateFields.subcity || woreda.subcity;
    const existing = await Woreda.findOne({ name: finalName, subcity: finalSubcity, _id: { $ne: woreda._id } });
    if (existing) {
      return res.status(400).json({ success: false, message: 'A woreda with this name already exists in this subcity' });
    }

    const updated = await Woreda.findByIdAndUpdate(woreda._id, updateFields, { new: true, runValidators: true });

    res.json({ success: true, message: 'Woreda updated successfully', woreda: updated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A woreda with this name already exists in this subcity' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get all dependency counts for a woreda before deletion
// @route GET /api/admin/woredas/:id/deps
// @access Private (admin)
const getWoredaDeps = async (req, res) => {
  try {
    const Woreda = require('../models/Woreda');
    const WorkflowComplaint = require('../models/WorkflowComplaint');

    const woreda = await Woreda.findById(req.params.id).lean();
    if (!woreda) return res.status(404).json({ success: false, message: 'Woreda not found' });

    const [
      userCount,
      infraCount,
      emergencyCount,
      publicComplaintCount,
      workflowComplaintCount,
    ] = await Promise.all([
      User.countDocuments({ woredaId: woreda._id }),
      InfrastructureReport.countDocuments({ woredaId: woreda._id }),
      EmergencyReport.countDocuments({ woredaId: woreda._id }),
      PublicComplaint.countDocuments({ woredaId: woreda._id }),
      WorkflowComplaint.countDocuments({ woredaId: woreda._id }),
    ]);

    const total = userCount + infraCount + emergencyCount + publicComplaintCount + workflowComplaintCount;

    res.json({
      success: true,
      woreda: { _id: woreda._id, name: woreda.name, subcity: woreda.subcity },
      deps: {
        users:             userCount,
        infraReports:      infraCount,
        emergencyReports:  emergencyCount,
        publicComplaints:  publicComplaintCount,
        workflowComplaints: workflowComplaintCount,
        total,
      },
      canDeleteSafely: total === 0,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Delete a woreda
//        ?force=true  → cascade: nullify references on dependent records, then delete
//        (default)    → safe-delete only when no dependencies exist
// @route DELETE /api/admin/woredas/:id
// @access Private (admin)
const deleteWoreda = async (req, res) => {
  try {
    const Woreda = require('../models/Woreda');
    const WorkflowComplaint = require('../models/WorkflowComplaint');

    const woreda = await Woreda.findById(req.params.id);
    if (!woreda) return res.status(404).json({ success: false, message: 'Woreda not found' });

    const [userCount, infraCount, emergencyCount, publicComplaintCount, workflowComplaintCount] = await Promise.all([
      User.countDocuments({ woredaId: woreda._id }),
      InfrastructureReport.countDocuments({ woredaId: woreda._id }),
      EmergencyReport.countDocuments({ woredaId: woreda._id }),
      PublicComplaint.countDocuments({ woredaId: woreda._id }),
      WorkflowComplaint.countDocuments({ woredaId: woreda._id }),
    ]);

    const total = userCount + infraCount + emergencyCount + publicComplaintCount + workflowComplaintCount;

    // ── Safe delete: no dependencies ─────────────────────────────────────────
    if (total === 0) {
      await Woreda.findByIdAndDelete(woreda._id);
      return res.json({ success: true, message: 'Woreda deleted successfully' });
    }

    // ── Force delete: cascade-nullify then delete ─────────────────────────────
    if (req.query.force === 'true') {
      const nullWoreda = {
        $unset: { woredaId: '', woredaName: '' },
      };
      const nullWoredaUsers = {
        $unset: { woredaId: '', woredaName: '', department: '' },
      };

      await Promise.all([
        // Users: clear location fields; preserve the account itself
        User.updateMany({ woredaId: woreda._id }, nullWoredaUsers),
        // Infrastructure reports: keep report, just remove the woreda reference
        InfrastructureReport.updateMany({ woredaId: woreda._id }, { $unset: { woredaId: '' } }),
        // Emergency reports
        EmergencyReport.updateMany({ woredaId: woreda._id }, { $unset: { woredaId: '' } }),
        // Public complaints: clear routing fields but keep the complaint record
        PublicComplaint.updateMany(
          { woredaId: woreda._id },
          { $unset: { woredaId: '' }, $set: { woredaName: `[Deleted: ${woreda.name}]` } }
        ),
        // Workflow complaints: same treatment
        WorkflowComplaint.updateMany(
          { woredaId: woreda._id },
          { $unset: { woredaId: '' }, $set: { woredaName: `[Deleted: ${woreda.name}]` } }
        ),
      ]);

      await Woreda.findByIdAndDelete(woreda._id);

      return res.json({
        success: true,
        message: `Woreda "${woreda.name}" deleted. ${userCount} user(s), ${infraCount + emergencyCount} report(s), and ${publicComplaintCount + workflowComplaintCount} complaint(s) had their woreda reference cleared.`,
        cleared: { users: userCount, reports: infraCount + emergencyCount, complaints: publicComplaintCount + workflowComplaintCount },
      });
    }

    // ── Blocked: dependencies exist and force not requested ──────────────────
    return res.status(400).json({
      success: false,
      message: `Cannot delete — this woreda has ${userCount} user(s), ${infraCount + emergencyCount} report(s), and ${publicComplaintCount + workflowComplaintCount} complaint(s) linked to it.`,
      deps: {
        users: userCount,
        infraReports: infraCount,
        emergencyReports: emergencyCount,
        publicComplaints: publicComplaintCount,
        workflowComplaints: workflowComplaintCount,
        total,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Subcity master-data CRUD ─────────────────────────────────────────────────
// These endpoints manage Subcity *records* only — never user accounts.

// @desc  List all subcity records, newest first
// @route GET /api/admin/subcities
// @access Private (admin)
const getAdminSubcities = async (req, res) => {
  try {
    const Subcity = require('../models/Subcity');
    const subcities = await Subcity.find().sort({ createdAt: -1 });
    res.json({ success: true, subcities, total: subcities.length });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Create a new subcity record
// @route POST /api/admin/subcities
// @access Private (admin)
const createSubcity = async (req, res) => {
  try {
    const Subcity = require('../models/Subcity');
    const { name, description, status } = req.body;

    const trimmed = (name || '').trim();
    if (!trimmed) {
      return res.status(400).json({ success: false, message: 'Subcity name is required.' });
    }

    // Case-insensitive duplicate check via the nameLower field
    const existing = await Subcity.findOne({ nameLower: trimmed.toLowerCase() });
    if (existing) {
      return res.status(400).json({
        success: false,
        message: `A subcity named "${existing.name}" already exists.`,
      });
    }

    const subcity = await Subcity.create({
      name: trimmed,
      description: (description || '').trim(),
      status: status === 'Inactive' ? 'Inactive' : 'Active',
    });

    res.status(201).json({
      success: true,
      message: 'Subcity created successfully',
      data: { id: subcity._id, name: subcity.name },
      subcity,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A subcity with this name already exists.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Update a subcity record (name, description, status)
// @route PUT /api/admin/subcities/:id
// @access Private (admin)
const updateSubcity = async (req, res) => {
  try {
    const Subcity = require('../models/Subcity');
    const { name, description, status } = req.body;

    const subcity = await Subcity.findById(req.params.id);
    if (!subcity) return res.status(404).json({ success: false, message: 'Subcity not found.' });

    if (name !== undefined) {
      const trimmed = name.trim();
      if (!trimmed) {
        return res.status(400).json({ success: false, message: 'Subcity name is required.' });
      }
      // Duplicate check excluding this record
      const dup = await Subcity.findOne({ nameLower: trimmed.toLowerCase(), _id: { $ne: subcity._id } });
      if (dup) {
        return res.status(400).json({
          success: false,
          message: `A subcity named "${dup.name}" already exists.`,
        });
      }
      subcity.name = trimmed;
    }
    if (description !== undefined) subcity.description = description.trim();
    if (status !== undefined) subcity.status = status === 'Inactive' ? 'Inactive' : 'Active';

    await subcity.save();
    res.json({ success: true, message: 'Subcity updated successfully', subcity });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'A subcity with this name already exists.' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Delete a subcity record
// @route DELETE /api/admin/subcities/:id
// @access Private (admin)
const deleteSubcity = async (req, res) => {
  try {
    const Subcity = require('../models/Subcity');
    const subcity = await Subcity.findByIdAndDelete(req.params.id);
    if (!subcity) return res.status(404).json({ success: false, message: 'Subcity not found.' });
    // Departments belong to the subcity, so removing it cleans up its
    // department master data too. Complaint/report records reference departments
    // by name (plain strings), so nothing is orphaned.
    await Department.deleteMany({ subcityId: subcity._id });
    res.json({ success: true, message: 'Subcity deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const resetUserPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    }
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    user.password = newPassword;
    await user.save();
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  getStats, getUsers, createUser, updateUser, approveUser, toggleUserActive, deleteUser,
  getPendingApprovals,
  getRegionStats, getActivityLogs, getDepartments, getLocations, resetUserPassword,
  createDepartment, updateDepartment, deleteDepartment,
  getAdminWoredas, createWoreda, updateWoreda, deleteWoreda, getWoredaDeps,
  getAdminSubcities, createSubcity, updateSubcity, deleteSubcity,
};

// ── IssueType CRUD ────────────────────────────────────────────────────────────

const IssueType = require('../models/IssueType');

// Issue types are no longer restricted to the original 3 departments / 3
// subcities — validation now runs against the live Department and Subcity
// collections so master data created in the admin UI works immediately.
const canonicalSubcityName = (name) =>
  String(name || '').trim().toUpperCase().replace(/\s+/g, '_');

const activeDepartmentNames = async () => {
  const deps = await Department.find({ status: 'Active' }).select('name');
  return deps.map((d) => String(d.name || '').trim()).filter(Boolean);
};

const activeSubcityKeys = async () => {
  const Subcity = require('../models/Subcity');
  const subs = await Subcity.find({ status: 'Active' }).select('name');
  return subs.map((s) => canonicalSubcityName(s.name)).filter(Boolean);
};

// @desc  List all issue types with optional filters
// @route GET /api/admin/issue-types
// @access Private (admin)
const getIssueTypes = async (req, res) => {
  try {
    const { department, subcity, isActive, search, page = 1, limit = 50 } = req.query;
    const query = {};
    if (department) query.department = department;
    if (subcity)    query.subcity    = subcity;
    if (isActive !== undefined) query.isActive = isActive === 'true';
    if (search) query.name = { $regex: search.trim(), $options: 'i' };

    const total = await IssueType.countDocuments(query);
    const issueTypes = await IssueType.find(query)
      .sort({ subcity: 1, department: 1, name: 1 })
      .skip((page - 1) * Number(limit))
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / Number(limit)), issueTypes });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Create an issue type
// @route POST /api/admin/issue-types
// @access Private (admin)
const createIssueType = async (req, res) => {
  try {
    const { name, department, subcity, description, isActive } = req.body;

    if (!name || !name.trim())
      return res.status(400).json({ success: false, message: 'Issue type name is required.' });

    const departmentNames = await activeDepartmentNames();
    const subcityKeys = await activeSubcityKeys();
    const deptName = (department || '').trim();
    const subcityKey = canonicalSubcityName(subcity);

    if (!departmentNames.some((d) => d.toLowerCase() === deptName.toLowerCase()))
      return res.status(400).json({ success: false, message: `department must be one of: ${departmentNames.join(', ')}` });
    if (!subcityKeys.includes(subcityKey))
      return res.status(400).json({ success: false, message: `subcity must be one of: ${subcityKeys.join(', ')}` });

    const existing = await IssueType.findOne({
      name: { $regex: `^${name.trim()}$`, $options: 'i' },
      department: deptName,
      subcity: subcityKey,
    });
    if (existing)
      return res.status(400).json({ success: false, message: `An issue type named "${existing.name}" already exists for ${deptName} in ${subcityKey}.` });

    const issueType = await IssueType.create({
      name: name.trim(),
      department: deptName,
      subcity: subcityKey,
      description: (description || '').trim(),
      isActive: isActive !== false,
    });

    res.status(201).json({ success: true, message: 'Issue type created successfully', issueType });
  } catch (err) {
    if (err.code === 11000)
      return res.status(400).json({ success: false, message: 'An issue type with this name already exists for this department and subcity.' });
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Update an issue type
// @route PUT /api/admin/issue-types/:id
// @access Private (admin)
const updateIssueType = async (req, res) => {
  try {
    const { name, department, subcity, description, isActive } = req.body;
    const updates = {};

    if (name        !== undefined) updates.name        = name.trim();
    if (department  !== undefined) {
      const deptName = (department || '').trim();
      const departmentNames = await activeDepartmentNames();
      if (!departmentNames.some((d) => d.toLowerCase() === deptName.toLowerCase()))
        return res.status(400).json({ success: false, message: `department must be one of: ${departmentNames.join(', ')}` });
      updates.department = deptName;
    }
    if (subcity !== undefined) {
      const subcityKey = canonicalSubcityName(subcity);
      const subcityKeys = await activeSubcityKeys();
      if (!subcityKeys.includes(subcityKey))
        return res.status(400).json({ success: false, message: `subcity must be one of: ${subcityKeys.join(', ')}` });
      updates.subcity = subcityKey;
    }
    if (description !== undefined) updates.description = description.trim();
    if (isActive    !== undefined) updates.isActive    = Boolean(isActive);

    // Duplicate check with updated values
    const existing = await IssueType.findById(req.params.id);
    if (!existing) return res.status(404).json({ success: false, message: 'Issue type not found.' });

    const checkName = updates.name       || existing.name;
    const checkDept = updates.department || existing.department;
    const checkSC   = updates.subcity    || existing.subcity;

    const dup = await IssueType.findOne({
      name: { $regex: `^${checkName}$`, $options: 'i' },
      department: checkDept,
      subcity: checkSC,
      _id: { $ne: req.params.id },
    });
    if (dup)
      return res.status(400).json({ success: false, message: `An issue type named "${dup.name}" already exists for ${checkDept} in ${checkSC}.` });

    const issueType = await IssueType.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    res.json({ success: true, message: 'Issue type updated successfully', issueType });
  } catch (err) {
    if (err.code === 11000)
      return res.status(400).json({ success: false, message: 'An issue type with this name already exists for this department and subcity.' });
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Delete an issue type (blocked if linked to active complaints)
// @route DELETE /api/admin/issue-types/:id
// @access Private (admin)
const deleteIssueType = async (req, res) => {
  try {
    const WorkflowComplaint = require('../models/WorkflowComplaint');
    const linked = await WorkflowComplaint.countDocuments({ issueTypeId: req.params.id });
    if (linked > 0)
      return res.status(400).json({ success: false, message: `Cannot delete — ${linked} complaint(s) reference this issue type.` });

    const issueType = await IssueType.findByIdAndDelete(req.params.id);
    if (!issueType) return res.status(404).json({ success: false, message: 'Issue type not found.' });

    res.json({ success: true, message: 'Issue type deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Toggle isActive for a single issue type
// @route PATCH /api/admin/issue-types/:id/toggle
// @access Private (admin)
const toggleIssueType = async (req, res) => {
  try {
    const issueType = await IssueType.findById(req.params.id);
    if (!issueType) return res.status(404).json({ success: false, message: 'Issue type not found.' });

    issueType.isActive = !issueType.isActive;
    await issueType.save();
    res.json({ success: true, message: `Issue type ${issueType.isActive ? 'activated' : 'deactivated'}.`, issueType });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// @desc  Seed the 45 predefined issue types (idempotent — skips existing)
// @route POST /api/admin/issue-types/seed
// @access Private (admin)
const seedIssueTypes = async (req, res) => {
  try {
    const SEED_DATA = [
      // ── BOLE ─────────────────────────────────────────────────────────────
      // Electricity
      { name: 'Power Outage',             department: 'Electricity', subcity: 'BOLE' },
      { name: 'Faulty Street Light',      department: 'Electricity', subcity: 'BOLE' },
      { name: 'Illegal Connection',       department: 'Electricity', subcity: 'BOLE' },
      { name: 'Exposed Wiring Hazard',    department: 'Electricity', subcity: 'BOLE' },
      { name: 'Voltage Fluctuation',      department: 'Electricity', subcity: 'BOLE' },
      // Road
      { name: 'Pothole on Main Road',     department: 'Road', subcity: 'BOLE' },
      { name: 'Broken Sidewalk',          department: 'Road', subcity: 'BOLE' },
      { name: 'Flooded Road',             department: 'Road', subcity: 'BOLE' },
      { name: 'Missing Road Sign',        department: 'Road', subcity: 'BOLE' },
      { name: 'Road Debris Obstruction',  department: 'Road', subcity: 'BOLE' },
      // Water
      { name: 'No Water Supply',          department: 'Water', subcity: 'BOLE' },
      { name: 'Pipe Burst',               department: 'Water', subcity: 'BOLE' },
      { name: 'Water Contamination',      department: 'Water', subcity: 'BOLE' },
      { name: 'Low Water Pressure',       department: 'Water', subcity: 'BOLE' },
      { name: 'Sewage Overflow',          department: 'Water', subcity: 'BOLE' },

      // ── YEKA ─────────────────────────────────────────────────────────────
      // Electricity
      { name: 'Power Outage',             department: 'Electricity', subcity: 'YEKA' },
      { name: 'Faulty Street Light',      department: 'Electricity', subcity: 'YEKA' },
      { name: 'Illegal Connection',       department: 'Electricity', subcity: 'YEKA' },
      { name: 'Exposed Wiring Hazard',    department: 'Electricity', subcity: 'YEKA' },
      { name: 'Voltage Fluctuation',      department: 'Electricity', subcity: 'YEKA' },
      // Road
      { name: 'Pothole on Main Road',     department: 'Road', subcity: 'YEKA' },
      { name: 'Broken Sidewalk',          department: 'Road', subcity: 'YEKA' },
      { name: 'Flooded Road',             department: 'Road', subcity: 'YEKA' },
      { name: 'Missing Road Sign',        department: 'Road', subcity: 'YEKA' },
      { name: 'Road Debris Obstruction',  department: 'Road', subcity: 'YEKA' },
      // Water
      { name: 'No Water Supply',          department: 'Water', subcity: 'YEKA' },
      { name: 'Pipe Burst',               department: 'Water', subcity: 'YEKA' },
      { name: 'Water Contamination',      department: 'Water', subcity: 'YEKA' },
      { name: 'Low Water Pressure',       department: 'Water', subcity: 'YEKA' },
      { name: 'Sewage Overflow',          department: 'Water', subcity: 'YEKA' },

      // ── LEMMI_KURA ────────────────────────────────────────────────────────
      // Electricity
      { name: 'Power Outage',             department: 'Electricity', subcity: 'LEMMI_KURA' },
      { name: 'Faulty Street Light',      department: 'Electricity', subcity: 'LEMMI_KURA' },
      { name: 'Illegal Connection',       department: 'Electricity', subcity: 'LEMMI_KURA' },
      { name: 'Exposed Wiring Hazard',    department: 'Electricity', subcity: 'LEMMI_KURA' },
      { name: 'Voltage Fluctuation',      department: 'Electricity', subcity: 'LEMMI_KURA' },
      // Road
      { name: 'Pothole on Main Road',     department: 'Road', subcity: 'LEMMI_KURA' },
      { name: 'Broken Sidewalk',          department: 'Road', subcity: 'LEMMI_KURA' },
      { name: 'Flooded Road',             department: 'Road', subcity: 'LEMMI_KURA' },
      { name: 'Missing Road Sign',        department: 'Road', subcity: 'LEMMI_KURA' },
      { name: 'Road Debris Obstruction',  department: 'Road', subcity: 'LEMMI_KURA' },
      // Water
      { name: 'No Water Supply',          department: 'Water', subcity: 'LEMMI_KURA' },
      { name: 'Pipe Burst',               department: 'Water', subcity: 'LEMMI_KURA' },
      { name: 'Water Contamination',      department: 'Water', subcity: 'LEMMI_KURA' },
      { name: 'Low Water Pressure',       department: 'Water', subcity: 'LEMMI_KURA' },
      { name: 'Sewage Overflow',          department: 'Water', subcity: 'LEMMI_KURA' },
    ];

    let created = 0;
    let skipped = 0;
    for (const item of SEED_DATA) {
      const exists = await IssueType.findOne({ name: item.name, department: item.department, subcity: item.subcity });
      if (exists) { skipped++; continue; }
      await IssueType.create({ ...item, isActive: true });
      created++;
    }

    res.json({ success: true, message: `Seed complete. Created: ${created}, Skipped (already existed): ${skipped}.`, created, skipped });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// Re-export everything including new IssueType functions
// (Node caches the module — the new exports are appended via module.exports reassignment below)
Object.assign(module.exports, {
  getIssueTypes,
  createIssueType,
  updateIssueType,
  deleteIssueType,
  toggleIssueType,
  seedIssueTypes,
});
