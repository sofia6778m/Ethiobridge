const mongoose = require('mongoose');
const User = require('../models/User');
const Subcity = require('../models/Subcity');
const Woreda = require('../models/Woreda');
const Department = require('../models/Department');
const MunicipalComplaint = require('../models/MunicipalComplaint');
const { normalizeDepartmentName } = require('../utils/departmentNames');
const { logAction } = require('../middleware/auditLog');

// ── Shared helpers ─────────────────────────────────────────────────────────────

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ciRegex = (s) => ({ $regex: `^${escapeRegex(s)}$`, $options: 'i' });

// Resolve the Subcity record a SUBCITY_ADMIN belongs to.
const resolveSubcityForAdmin = async (user) => {
  if (!user) return null;
  if (user.subcityId) {
    const sc = await Subcity.findById(user.subcityId).lean();
    if (sc) return sc;
  }
  if (user.subcity) {
    const sc = await Subcity.findOne({ nameLower: String(user.subcity).trim().toLowerCase() }).lean();
    if (sc) return sc;
  }
  return null;
};

// Resolve the Woreda record a WOREDA_ADMIN / OFFICER / TECHNICIAN belongs to.
const resolveWoredaForUser = async (user) => {
  if (!user || !user.woredaId) return null;
  return Woreda.findById(user.woredaId).lean();
};

const normalizePhone = (phone) => {
  if (!phone) return '';
  const digits = String(phone).replace(/\D/g, '');
  return digits.length === 10 ? digits : String(phone).trim();
};

const validPhone = (phone) => /^09\d{8}$/.test(phone || '');

// Sanitized user shape for admin/staff listings (never leaks passwords).
const publicUser = (u) => ({
  _id: u._id,
  fullName: u.fullName,
  email: u.email,
  phone: u.phone,
  role: u.role,
  subcity: u.subcity,
  subcityId: u.subcityId,
  woredaId: u.woredaId,
  woredaName: u.woredaName,
  department: u.department,
  departmentId: u.departmentId,
  employeeId: u.employeeId,
  isActive: u.isActive,
  isApproved: u.isApproved,
  profileImage: u.profileImage,
  createdAt: u.createdAt,
});

const audit = (req, action, resource, resourceId, details) => {
  try {
    logAction({
      user: req.user,
      action,
      resource,
      resourceId,
      details: details || {},
      req,
    });
  } catch (e) {
    console.warn('[HIERARCHY] audit log failed:', e.message);
  }
};

// ── SUBCITY_ADMIN ──────────────────────────────────────────────────────────────

// GET /api/hierarchy/subcity/me
const getSubcityAdminProfile = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });
    const woredaCount = await Woreda.countDocuments({ subcityId: subcity._id });
    const admin = await User.findOne({ subcityId: subcity._id, role: { $in: ['SUBCITY_ADMIN', 'subcity_admin'] }, isActive: true })
      .select('-password').lean();
    res.json({
      success: true,
      data: {
        subcity: { _id: subcity._id, name: subcity.name, description: subcity.description, status: subcity.status },
        woredaCount,
        admin,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/hierarchy/subcity/stats
const getSubcityAdminStats = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const [woredas, activeWoredas, departments, complaints, pendingComplaints, resolvedComplaints] = await Promise.all([
      Woreda.countDocuments({ subcityId: subcity._id }),
      Woreda.countDocuments({ subcityId: subcity._id, status: 'Active' }),
      Department.countDocuments({ subcityId: subcity._id }),
      MunicipalComplaint.countDocuments({ subcity: ciRegex(subcity.name) }),
      MunicipalComplaint.countDocuments({ subcity: ciRegex(subcity.name), status: { $in: ['Submitted', 'In Review', 'Assigned', 'In Progress'] } }),
      MunicipalComplaint.countDocuments({ subcity: ciRegex(subcity.name), status: { $in: ['Resolved', 'Closed'] } }),
    ]);

    res.json({
      success: true,
      data: {
        subcity: subcity.name,
        woredas,
        activeWoredas,
        departments,
        complaints,
        pendingComplaints,
        resolvedComplaints,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/hierarchy/subcity/woredas
const getSubcityWoredas = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const query = { subcityId: subcity._id };
    if (req.query.status) query.status = req.query.status;
    if (req.query.search) query.name = { $regex: escapeRegex(req.query.search), $options: 'i' };

    const woredas = await Woreda.find(query).sort({ name: 1 }).lean();

    // Attach each woreda's WOREDA_ADMIN so the UI can show / manage the admin.
    const adminIds = woredas.map((w) => w.adminId).filter(Boolean);
    const admins = await User.find({ _id: { $in: adminIds }, role: 'WOREDA_ADMIN' })
      .select('fullName email isActive phone').lean();
    const adminMap = new Map(admins.map((a) => [String(a._id), a]));

    const data = woredas.map((w) => ({
      _id: w._id,
      name: w.name,
      description: w.description,
      status: w.status,
      subcityId: w.subcityId,
      subcity: w.subcity,
      departments: w.departments || [],
      admin: w.adminId ? adminMap.get(String(w.adminId)) || null : null,
      createdAt: w.createdAt,
    }));

    res.json({ success: true, data });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/hierarchy/subcity/woredas
const createSubcityWoreda = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const { name, description, status } = req.body;
    const trimmed = String(name || '').trim();
    if (!trimmed) return res.status(400).json({ success: false, message: 'Woreda name is required.' });

    const dup = await Woreda.findOne({ subcityId: subcity._id, name: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' } });
    if (dup) return res.status(409).json({ success: false, message: `A woreda named "${dup.name}" already exists in ${subcity.name}.` });

    const active = status !== 'Inactive';
    const woreda = await Woreda.create({
      name: trimmed,
      subcity: subcity.name,
      subcityId: subcity._id,
      description: String(description || '').trim(),
      status: active ? 'Active' : 'Inactive',
      isActive: active,
    });

    audit(req, 'woreda_created', 'Woreda', woreda._id, { name: woreda.name, subcity: subcity.name });
    res.status(201).json({ success: true, message: 'Woreda created successfully', data: woreda });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'A woreda with this name already exists in this subcity.' });
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/hierarchy/subcity/woredas/:id
const updateSubcityWoreda = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const woreda = await Woreda.findById(req.params.id);
    if (!woreda) return res.status(404).json({ success: false, message: 'Woreda not found.' });
    if (String(woreda.subcityId) !== String(subcity._id)) {
      return res.status(403).json({ success: false, message: 'This woreda does not belong to your subcity.' });
    }

    const { name, description, status } = req.body;
    if (name !== undefined) {
      const trimmed = String(name).trim();
      if (!trimmed) return res.status(400).json({ success: false, message: 'Woreda name is required.' });
      const dup = await Woreda.findOne({
        subcityId: subcity._id,
        name: { $regex: `^${escapeRegex(trimmed)}$`, $options: 'i' },
        _id: { $ne: woreda._id },
      });
      if (dup) return res.status(409).json({ success: false, message: `A woreda named "${dup.name}" already exists in ${subcity.name}.` });
      woreda.name = trimmed;
    }
    if (description !== undefined) woreda.description = String(description).trim();
    if (status !== undefined) {
      woreda.status = status === 'Inactive' ? 'Inactive' : 'Active';
      woreda.isActive = status === 'Active';
    }

    await woreda.save();
    audit(req, 'woreda_updated', 'Woreda', woreda._id, { name: woreda.name });
    res.json({ success: true, message: 'Woreda updated successfully', data: woreda });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'A woreda with this name already exists in this subcity.' });
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/hierarchy/subcity/woredas/:id
const deleteSubcityWoreda = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const woreda = await Woreda.findById(req.params.id);
    if (!woreda) return res.status(404).json({ success: false, message: 'Woreda not found.' });
    if (String(woreda.subcityId) !== String(subcity._id)) {
      return res.status(403).json({ success: false, message: 'This woreda does not belong to your subcity.' });
    }

    const [userCount, deptCount, complaintCount] = await Promise.all([
      User.countDocuments({ woredaId: woreda._id }),
      Department.countDocuments({ woredaId: woreda._id }),
      MunicipalComplaint.countDocuments({ woredaId: woreda._id }),
    ]);
    if (userCount + deptCount + complaintCount > 0) {
      return res.status(400).json({
        success: false,
        message: `Cannot delete — this woreda has ${userCount} user(s), ${deptCount} department(s), and ${complaintCount} complaint(s). Deactivate it instead.`,
      });
    }

    await Woreda.findByIdAndDelete(woreda._id);
    audit(req, 'woreda_deleted', 'Woreda', woreda._id, { name: woreda.name });
    res.json({ success: true, message: 'Woreda deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/hierarchy/subcity/woreda-admins
// Create a WOREDA_ADMIN account for a woreda in this subcity.
const createWoredaAdmin = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const { woredaId, fullName, email, password, phone } = req.body;
    if (!woredaId || !fullName || !email || !password) {
      return res.status(400).json({ success: false, message: 'Woreda, full name, email, and password are required.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    if (phone && !validPhone(normalizePhone(phone))) {
      return res.status(400).json({ success: false, message: 'Phone number must start with 09 and contain 10 digits.' });
    }

    const woreda = await Woreda.findById(woredaId);
    if (!woreda) return res.status(404).json({ success: false, message: 'Woreda not found.' });
    if (String(woreda.subcityId) !== String(subcity._id)) {
      return res.status(403).json({ success: false, message: 'This woreda does not belong to your subcity.' });
    }

    const existingEmail = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existingEmail) return res.status(400).json({ success: false, message: 'Email already registered.' });

    const existingAdmin = await User.findOne({ woredaId: woreda._id, role: 'WOREDA_ADMIN' }).select('fullName email').lean();
    if (existingAdmin) {
      return res.status(409).json({ success: false, message: `A woreda admin (${existingAdmin.fullName}) already exists for ${woreda.name}.` });
    }

    const user = await User.create({
      fullName: String(fullName).trim(),
      email: String(email).toLowerCase().trim(),
      password,
      phone: normalizePhone(phone),
      role: 'WOREDA_ADMIN',
      subcity: subcity.name,
      subcityId: subcity._id,
      woredaId: woreda._id,
      woredaName: woreda.name,
      isActive: true,
      isApproved: true,
    });

    woreda.adminId = user._id;
    await woreda.save();

    audit(req, 'user_created', 'User', user._id, { email: user.email, role: user.role, woreda: woreda.name });
    res.status(201).json({ success: true, message: 'Woreda admin account created successfully', data: publicUser(user.toObject()) });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Email already registered.' });
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/hierarchy/subcity/woreda-admins/:id/reset-password
const resetWoredaAdminPassword = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const { newPassword } = req.body;
    if (!newPassword || String(newPassword).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (user.role !== 'WOREDA_ADMIN') return res.status(400).json({ success: false, message: 'Account is not a woreda admin.' });
    if (String(user.subcityId) !== String(subcity._id)) {
      return res.status(403).json({ success: false, message: 'This account does not belong to your subcity.' });
    }

    user.password = newPassword;
    await user.save();
    audit(req, 'password_reset', 'User', user._id, { email: user.email, role: user.role });
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/hierarchy/subcity/complaints
const getSubcityAdminComplaints = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const filter = { subcity: ciRegex(subcity.name) };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.woredaId) filter.woredaId = req.query.woredaId;
    if (req.query.department) filter.department = ciRegex(req.query.department);

    const total = await MunicipalComplaint.countDocuments(filter);
    const complaints = await MunicipalComplaint.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-auditTrail -notificationHistory -internalNotes -responses -workProgress')
      .lean();

    res.json({ success: true, data: { complaints, total, page, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/hierarchy/subcity/analytics
const getSubcityAnalytics = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const base = { subcity: ciRegex(subcity.name) };
    const [total, byStatus, byDepartment, recent] = await Promise.all([
      MunicipalComplaint.countDocuments(base),
      MunicipalComplaint.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      MunicipalComplaint.aggregate([{ $match: base }, { $group: { _id: '$department', count: { $sum: 1 } } }]),
      MunicipalComplaint.find(base).sort({ createdAt: -1 }).limit(5).select('title trackingId status subcity createdAt department').lean(),
    ]);

    res.json({
      success: true,
      data: {
        total,
        byStatus,
        byDepartment,
        recent,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/hierarchy/subcity/departments
// All departments that belong to the subcity (both subcity-level and the
// woreda-level copies that WOREDA_ADMIN accounts create inside this subcity).
const getSubcityDepartments = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const query = { subcityId: subcity._id };
    if (req.query.status) query.status = req.query.status;
    if (req.query.woredaId) query.woredaId = req.query.woredaId;
    if (req.query.search) query.name = { $regex: escapeRegex(req.query.search), $options: 'i' };

    const departments = await Department.find(query).sort({ woredaName: 1, name: 1 }).lean();
    res.json({ success: true, data: departments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/hierarchy/subcity/departments
// Creates a department for the subcity. An optional woredaId links the
// department to a specific woreda; without one the department is subcity-wide.
const createSubcityDepartment = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const { name, description, status, woredaId } = req.body;
    const normalized = normalizeDepartmentName(name);
    if (!normalized) return res.status(400).json({ success: false, message: 'Department name is required.' });
    if (normalized.length > 100) return res.status(400).json({ success: false, message: 'Department name must be 100 characters or fewer.' });

    let woreda = null;
    if (woredaId) {
      woreda = await Woreda.findById(woredaId);
      if (!woreda) return res.status(404).json({ success: false, message: 'Woreda not found.' });
      if (String(woreda.subcityId) !== String(subcity._id)) {
        return res.status(403).json({ success: false, message: 'This woreda does not belong to your subcity.' });
      }
    }

    const dup = await Department.findOne({
      subcityId: subcity._id,
      woredaId: woreda ? woreda._id : null,
      $or: [
        { normalizedDepartmentName: normalized },
        { name: { $regex: `^${escapeRegex(normalized)}$`, $options: 'i' } },
      ],
    });
    if (dup) {
      return res.status(409).json({
        success: false,
        code: 'DEPARTMENT_NAME_EXISTS',
        message: `A department named "${dup.name}" already exists${woreda ? ` in ${woreda.name}` : ' in your subcity'}.`,
      });
    }

    const department = await Department.create({
      name: normalized,
      normalizedDepartmentName: normalized,
      subcityId: subcity._id,
      subcityName: subcity.name,
      woredaId: woreda ? woreda._id : null,
      woredaName: woreda ? woreda.name : '',
      description: String(description || '').trim(),
      status: status === 'Inactive' ? 'Inactive' : 'Active',
      createdByAdmin: req.user._id,
    });

    audit(req, 'department_created', 'Department', department._id, { name: department.name, subcity: subcity.name, woreda: department.woredaName });
    res.status(201).json({ success: true, message: 'Department created successfully', data: department });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'A department with this name already exists in this scope.' });
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/hierarchy/subcity/departments/:id
const updateSubcityDepartment = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const department = await Department.findById(req.params.id);
    if (!department) return res.status(404).json({ success: false, message: 'Department not found.' });
    if (String(department.subcityId) !== String(subcity._id)) {
      return res.status(403).json({ success: false, message: 'This department does not belong to your subcity.' });
    }

    const { name, description, status, woredaId } = req.body;

    let targetWoredaId = department.woredaId || null;
    if (woredaId !== undefined) {
      if (!woredaId) {
        targetWoredaId = null;
        department.woredaId = null;
        department.woredaName = '';
      } else {
        const woreda = await Woreda.findById(woredaId);
        if (!woreda) return res.status(404).json({ success: false, message: 'Woreda not found.' });
        if (String(woreda.subcityId) !== String(subcity._id)) {
          return res.status(403).json({ success: false, message: 'This woreda does not belong to your subcity.' });
        }
        targetWoredaId = woreda._id;
        department.woredaId = woreda._id;
        department.woredaName = woreda.name;
      }
    }

    if (name !== undefined) {
      const normalized = normalizeDepartmentName(name);
      if (!normalized) return res.status(400).json({ success: false, message: 'Department name is required.' });
      if (normalized.length > 100) return res.status(400).json({ success: false, message: 'Department name must be 100 characters or fewer.' });
      const dup = await Department.findOne({
        subcityId: subcity._id,
        woredaId: targetWoredaId,
        $or: [
          { normalizedDepartmentName: normalized },
          { name: { $regex: `^${escapeRegex(normalized)}$`, $options: 'i' } },
        ],
        _id: { $ne: department._id },
      });
      if (dup) return res.status(409).json({ success: false, message: `A department named "${dup.name}" already exists${dup.woredaName ? ` in ${dup.woredaName}` : ' in your subcity'}.` });
      department.name = normalized;
      department.normalizedDepartmentName = normalized;
    }
    if (description !== undefined) department.description = String(description).trim();
    if (status !== undefined) department.status = status === 'Inactive' ? 'Inactive' : 'Active';

    await department.save();
    audit(req, 'department_updated', 'Department', department._id, { name: department.name });
    res.json({ success: true, message: 'Department updated successfully', data: department });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'A department with this name already exists in this scope.' });
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/hierarchy/subcity/departments/:id
const deleteSubcityDepartment = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const department = await Department.findById(req.params.id);
    if (!department) return res.status(404).json({ success: false, message: 'Department not found.' });
    if (String(department.subcityId) !== String(subcity._id)) {
      return res.status(403).json({ success: false, message: 'This department does not belong to your subcity.' });
    }

    const staffCount = await User.countDocuments({ departmentId: department._id, role: { $in: ['OFFICER', 'TECHNICIAN'] } });
    if (staffCount > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete — ${staffCount} staff member(s) belong to this department. Deactivate it instead.` });
    }

    await Department.findByIdAndDelete(department._id);
    audit(req, 'department_deleted', 'Department', department._id, { name: department.name });
    res.json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Roles a SUBCITY_ADMIN can provision for woredas in their subcity.
const SUBCITY_USER_ROLES = ['WOREDA_ADMIN', 'OFFICER', 'TECHNICIAN'];

// GET /api/hierarchy/subcity/users
const getSubcityUsers = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const query = { subcityId: subcity._id, role: { $in: SUBCITY_USER_ROLES } };
    if (req.query.role) query.role = req.query.role;
    if (req.query.woredaId) query.woredaId = req.query.woredaId;
    if (req.query.departmentId) query.departmentId = req.query.departmentId;
    if (req.query.isActive !== undefined) query.isActive = req.query.isActive === 'true';
    if (req.query.search) {
      query.$or = [
        { fullName: { $regex: escapeRegex(req.query.search), $options: 'i' } },
        { email: { $regex: escapeRegex(req.query.search), $options: 'i' } },
        { employeeId: { $regex: escapeRegex(req.query.search), $options: 'i' } },
      ];
    }

    const users = await User.find(query).sort({ createdAt: -1 }).select('-password').lean();
    res.json({ success: true, data: users.map(publicUser) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/hierarchy/subcity/users
// Creates WOREDA_ADMIN / OFFICER / TECHNICIAN accounts. subcityId is inherited
// automatically; the woreda (and optional department) must belong to the subcity.
const createSubcityUser = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const { fullName, email, password, phone, role, woredaId, departmentId, employeeId, status } = req.body;
    const finalRole = SUBCITY_USER_ROLES.includes(role) ? role : null;
    if (!finalRole) {
      return res.status(400).json({ success: false, message: 'Role must be WOREDA_ADMIN, OFFICER, or TECHNICIAN.' });
    }
    if (!fullName || !email || !password) {
      return res.status(400).json({ success: false, message: 'Full name, email, and password are required.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    if (phone && !validPhone(normalizePhone(phone))) {
      return res.status(400).json({ success: false, message: 'Phone number must start with 09 and contain 10 digits.' });
    }
    if (!woredaId) {
      return res.status(400).json({ success: false, message: 'Please select a woreda.' });
    }

    const woreda = await Woreda.findById(woredaId);
    if (!woreda) return res.status(404).json({ success: false, message: 'Woreda not found.' });
    if (String(woreda.subcityId) !== String(subcity._id)) {
      return res.status(403).json({ success: false, message: 'This woreda does not belong to your subcity.' });
    }

    let department = null;
    let departmentName = '';
    if (departmentId) {
      department = await Department.findById(departmentId);
      if (!department) return res.status(404).json({ success: false, message: 'Selected department not found.' });
      if (String(department.subcityId) !== String(subcity._id)) {
        return res.status(403).json({ success: false, message: 'Selected department does not belong to your subcity.' });
      }
      if (department.woredaId && String(department.woredaId) !== String(woreda._id)) {
        return res.status(400).json({ success: false, message: `This department belongs to ${department.woredaName}, not ${woreda.name}.` });
      }
      departmentName = department.name;
    }

    const existingEmail = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existingEmail) return res.status(400).json({ success: false, message: 'Email already registered.' });

    if (finalRole === 'WOREDA_ADMIN') {
      const existingAdmin = await User.findOne({ woredaId: woreda._id, role: 'WOREDA_ADMIN' }).select('fullName email').lean();
      if (existingAdmin) {
        return res.status(409).json({ success: false, message: `A woreda admin (${existingAdmin.fullName}) already exists for ${woreda.name}.` });
      }
    }

    const user = await User.create({
      fullName: String(fullName).trim(),
      email: String(email).toLowerCase().trim(),
      password,
      phone: normalizePhone(phone),
      role: finalRole,
      subcity: subcity.name,
      subcityId: subcity._id,
      woredaId: woreda._id,
      woredaName: woreda.name,
      department: departmentName || '',
      departmentId: department ? department._id : null,
      employeeId: String(employeeId || '').trim() || undefined,
      isActive: status !== 'Inactive',
      isApproved: true,
    });

    if (finalRole === 'WOREDA_ADMIN') {
      woreda.adminId = user._id;
      await woreda.save();
    }

    audit(req, 'user_created', 'User', user._id, { email: user.email, role: user.role, woreda: woreda.name });
    res.status(201).json({ success: true, message: `${finalRole === 'WOREDA_ADMIN' ? 'Woreda admin' : finalRole === 'OFFICER' ? 'Officer' : 'Technician'} account created successfully`, data: publicUser(user.toObject()) });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Email already registered.' });
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/hierarchy/subcity/users/:id
const updateSubcityUser = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!SUBCITY_USER_ROLES.includes(user.role)) {
      return res.status(400).json({ success: false, message: 'Account is not managed at subcity level.' });
    }
    if (String(user.subcityId) !== String(subcity._id)) {
      return res.status(403).json({ success: false, message: 'This account does not belong to your subcity.' });
    }

    const { fullName, phone, role, woredaId, departmentId, status } = req.body;
    if (phone && !validPhone(normalizePhone(phone))) {
      return res.status(400).json({ success: false, message: 'Phone number must start with 09 and contain 10 digits.' });
    }
    if (role !== undefined && !SUBCITY_USER_ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be WOREDA_ADMIN, OFFICER, or TECHNICIAN.' });
    }

    if (woredaId !== undefined) {
      if (!woredaId) return res.status(400).json({ success: false, message: 'A woreda is required.' });
      const woreda = await Woreda.findById(woredaId);
      if (!woreda) return res.status(404).json({ success: false, message: 'Woreda not found.' });
      if (String(woreda.subcityId) !== String(subcity._id)) {
        return res.status(403).json({ success: false, message: 'This woreda does not belong to your subcity.' });
      }
      if (user.role === 'WOREDA_ADMIN' && user.woredaId && String(user.woredaId) !== String(woreda._id)) {
        await Woreda.updateOne({ _id: user.woredaId, adminId: user._id }, { $set: { adminId: null } });
        const existingAdmin = await User.findOne({ woredaId: woreda._id, role: 'WOREDA_ADMIN', _id: { $ne: user._id } }).select('fullName').lean();
        if (existingAdmin) return res.status(409).json({ success: false, message: `A woreda admin (${existingAdmin.fullName}) already exists for ${woreda.name}.` });
        woreda.adminId = user._id;
        await woreda.save();
      }
      user.woredaId = woreda._id;
      user.woredaName = woreda.name;
    }

    if (departmentId !== undefined) {
      if (!departmentId) {
        user.department = '';
        user.departmentId = null;
      } else {
        const department = await Department.findById(departmentId);
        if (!department) return res.status(404).json({ success: false, message: 'Selected department not found.' });
        if (String(department.subcityId) !== String(subcity._id)) {
          return res.status(403).json({ success: false, message: 'Selected department does not belong to your subcity.' });
        }
        user.department = department.name;
        user.departmentId = department._id;
      }
    }

    if (fullName !== undefined) user.fullName = String(fullName).trim();
    if (phone !== undefined) user.phone = normalizePhone(phone);
    if (role !== undefined) user.role = role;
    if (status !== undefined) user.isActive = status !== 'Inactive';

    await user.save();
    audit(req, 'user_updated', 'User', user._id, { email: user.email, role: user.role });
    res.json({ success: true, message: 'User updated successfully', data: publicUser(user.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/hierarchy/subcity/users/:id/toggle-active
const toggleSubcityUserActive = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!SUBCITY_USER_ROLES.includes(user.role)) {
      return res.status(400).json({ success: false, message: 'Account is not managed at subcity level.' });
    }
    if (String(user.subcityId) !== String(subcity._id)) {
      return res.status(403).json({ success: false, message: 'This account does not belong to your subcity.' });
    }
    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You cannot deactivate your own account.' });
    }

    user.isActive = !user.isActive;
    await user.save();
    audit(req, user.isActive ? 'user_reactivated' : 'user_deactivated', 'User', user._id, { email: user.email });
    res.json({ success: true, message: `User ${user.isActive ? 'activated' : 'deactivated'}.`, data: publicUser(user.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/hierarchy/subcity/users/:id
const deleteSubcityUser = async (req, res) => {
  try {
    const subcity = await resolveSubcityForAdmin(req.user);
    if (!subcity) return res.status(400).json({ success: false, message: 'No subcity is linked to your account.' });

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found.' });
    if (!SUBCITY_USER_ROLES.includes(user.role)) {
      return res.status(400).json({ success: false, message: 'Account is not managed at subcity level.' });
    }
    if (String(user.subcityId) !== String(subcity._id)) {
      return res.status(403).json({ success: false, message: 'This account does not belong to your subcity.' });
    }
    if (String(user._id) === String(req.user._id)) {
      return res.status(400).json({ success: false, message: 'You cannot delete your own account.' });
    }

    if (user.role === 'WOREDA_ADMIN' && user.woredaId) {
      await Woreda.updateOne({ _id: user.woredaId, adminId: user._id }, { $set: { adminId: null } });
    }

    await User.findByIdAndDelete(user._id);
    audit(req, 'user_deleted', 'User', user._id, { email: user.email, role: user.role });
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── WOREDA_ADMIN ───────────────────────────────────────────────────────────────

// GET /api/hierarchy/woreda/me
const getWoredaAdminProfile = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });
    const deptCount = await Department.countDocuments({ woredaId: woreda._id });
    const staffCount = await User.countDocuments({ woredaId: woreda._id, role: { $in: ['OFFICER', 'TECHNICIAN'] }, isActive: true });
    res.json({
      success: true,
      data: {
        woreda: { _id: woreda._id, name: woreda.name, description: woreda.description, status: woreda.status, subcity: woreda.subcity, subcityId: woreda.subcityId },
        deptCount,
        staffCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/hierarchy/woreda/stats
const getWoredaAdminStats = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const [departments, activeDepartments, officers, technicians, complaints, pendingComplaints, resolvedComplaints] = await Promise.all([
      Department.countDocuments({ woredaId: woreda._id }),
      Department.countDocuments({ woredaId: woreda._id, status: 'Active' }),
      User.countDocuments({ woredaId: woreda._id, role: 'OFFICER', isActive: true }),
      User.countDocuments({ woredaId: woreda._id, role: 'TECHNICIAN', isActive: true }),
      MunicipalComplaint.countDocuments({ woredaId: woreda._id }),
      MunicipalComplaint.countDocuments({ woredaId: woreda._id, status: { $in: ['Submitted', 'In Review', 'Assigned', 'In Progress'] } }),
      MunicipalComplaint.countDocuments({ woredaId: woreda._id, status: { $in: ['Resolved', 'Closed'] } }),
    ]);

    res.json({
      success: true,
      data: {
        woreda: woreda.name,
        subcity: woreda.subcity,
        departments,
        activeDepartments,
        officers,
        technicians,
        complaints,
        pendingComplaints,
        resolvedComplaints,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/hierarchy/woreda/departments
const getWoredaDepartments = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const query = { woredaId: woreda._id };
    if (req.query.status) query.status = req.query.status;
    if (req.query.search) query.name = { $regex: escapeRegex(req.query.search), $options: 'i' };

    const departments = await Department.find(query).sort({ name: 1 }).lean();
    res.json({ success: true, data: departments });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/hierarchy/woreda/departments
// Inherits subcityId + woredaId automatically from the logged-in woreda admin.
const createWoredaDepartment = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const { name, description, status } = req.body;
    const normalized = normalizeDepartmentName(name);
    if (!normalized) return res.status(400).json({ success: false, message: 'Department name is required.' });
    if (normalized.length > 100) return res.status(400).json({ success: false, message: 'Department name must be 100 characters or fewer.' });

    const dup = await Department.findOne({
      woredaId: woreda._id,
      $or: [
        { normalizedDepartmentName: normalized },
        { name: { $regex: `^${escapeRegex(normalized)}$`, $options: 'i' } },
      ],
    });
    if (dup) {
      return res.status(409).json({
        success: false,
        code: 'DEPARTMENT_NAME_EXISTS',
        message: `A department named "${dup.name}" already exists in ${woreda.name} Woreda.`,
      });
    }

    const department = await Department.create({
      name: normalized,
      normalizedDepartmentName: normalized,
      subcityId: woreda.subcityId || null,
      subcityName: woreda.subcity || '',
      woredaId: woreda._id,
      woredaName: woreda.name,
      description: String(description || '').trim(),
      status: status === 'Inactive' ? 'Inactive' : 'Active',
      createdByAdmin: req.user._id,
    });

    audit(req, 'department_created', 'Department', department._id, { name: department.name, woreda: woreda.name });
    res.status(201).json({ success: true, message: 'Department created successfully', data: department });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'A department with this name already exists in this woreda.' });
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/hierarchy/woreda/departments/:id
const updateWoredaDepartment = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const department = await Department.findById(req.params.id);
    if (!department) return res.status(404).json({ success: false, message: 'Department not found.' });
    if (String(department.woredaId) !== String(woreda._id)) {
      return res.status(403).json({ success: false, message: 'This department does not belong to your woreda.' });
    }

    const { name, description, status } = req.body;
    if (name !== undefined) {
      const normalized = normalizeDepartmentName(name);
      if (!normalized) return res.status(400).json({ success: false, message: 'Department name is required.' });
      if (normalized.length > 100) return res.status(400).json({ success: false, message: 'Department name must be 100 characters or fewer.' });
      const dup = await Department.findOne({
        woredaId: woreda._id,
        $or: [
          { normalizedDepartmentName: normalized },
          { name: { $regex: `^${escapeRegex(normalized)}$`, $options: 'i' } },
        ],
        _id: { $ne: department._id },
      });
      if (dup) return res.status(409).json({ success: false, message: `A department named "${dup.name}" already exists in ${woreda.name} Woreda.` });
      department.name = normalized;
      department.normalizedDepartmentName = normalized;
    }
    if (description !== undefined) department.description = String(description).trim();
    if (status !== undefined) department.status = status === 'Inactive' ? 'Inactive' : 'Active';

    await department.save();
    audit(req, 'department_updated', 'Department', department._id, { name: department.name });
    res.json({ success: true, message: 'Department updated successfully', data: department });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ success: false, message: 'A department with this name already exists in this woreda.' });
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/hierarchy/woreda/departments/:id
const deleteWoredaDepartment = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const department = await Department.findById(req.params.id);
    if (!department) return res.status(404).json({ success: false, message: 'Department not found.' });
    if (String(department.woredaId) !== String(woreda._id)) {
      return res.status(403).json({ success: false, message: 'This department does not belong to your woreda.' });
    }

    const staffCount = await User.countDocuments({ departmentId: department._id, role: { $in: ['OFFICER', 'TECHNICIAN'] } });
    if (staffCount > 0) {
      return res.status(400).json({ success: false, message: `Cannot delete — ${staffCount} staff member(s) belong to this department. Deactivate it instead.` });
    }

    await Department.findByIdAndDelete(department._id);
    audit(req, 'department_deleted', 'Department', department._id, { name: department.name });
    res.json({ success: true, message: 'Department deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/hierarchy/woreda/staff
const getWoredaStaff = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const query = { woredaId: woreda._id, role: { $in: ['OFFICER', 'TECHNICIAN'] } };
    if (req.query.role) query.role = req.query.role;
    if (req.query.departmentId) query.departmentId = req.query.departmentId;
    if (req.query.isActive !== undefined) query.isActive = req.query.isActive === 'true';
    if (req.query.search) {
      query.$or = [
        { fullName: { $regex: escapeRegex(req.query.search), $options: 'i' } },
        { email: { $regex: escapeRegex(req.query.search), $options: 'i' } },
        { employeeId: { $regex: escapeRegex(req.query.search), $options: 'i' } },
      ];
    }

    const staff = await User.find(query).sort({ createdAt: -1 }).select('-password').lean();
    res.json({ success: true, data: staff.map(publicUser) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/hierarchy/woreda/staff
// Create OFFICER / TECHNICIAN. subcityId + woredaId inherited automatically.
const createWoredaStaff = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const { fullName, email, password, phone, role, departmentId, employeeId, status } = req.body;
    const finalRole = role === 'TECHNICIAN' ? 'TECHNICIAN' : 'OFFICER';

    if (!fullName || !email || !password) {
      return res.status(400).json({ success: false, message: 'Full name, email, and password are required.' });
    }
    if (String(password).length < 6) {
      return res.status(400).json({ success: false, message: 'Password must be at least 6 characters.' });
    }
    if (phone && !validPhone(normalizePhone(phone))) {
      return res.status(400).json({ success: false, message: 'Phone number must start with 09 and contain 10 digits.' });
    }

    let department = null;
    let departmentName = '';
    if (departmentId) {
      department = await Department.findById(departmentId);
      if (!department) return res.status(404).json({ success: false, message: 'Selected department not found.' });
      if (String(department.woredaId) !== String(woreda._id)) {
        return res.status(403).json({ success: false, message: 'Selected department does not belong to your woreda.' });
      }
      departmentName = department.name;
    }

    const existingEmail = await User.findOne({ email: String(email).toLowerCase().trim() });
    if (existingEmail) return res.status(400).json({ success: false, message: 'Email already registered.' });

    const user = await User.create({
      fullName: String(fullName).trim(),
      email: String(email).toLowerCase().trim(),
      password,
      phone: normalizePhone(phone),
      role: finalRole,
      subcity: woreda.subcity || '',
      subcityId: woreda.subcityId || null,
      woredaId: woreda._id,
      woredaName: woreda.name,
      department: departmentName || '',
      departmentId: department ? department._id : null,
      employeeId: String(employeeId || '').trim() || undefined,
      isActive: status !== 'Inactive',
      isApproved: true,
    });

    audit(req, 'user_created', 'User', user._id, { email: user.email, role: user.role, woreda: woreda.name });
    res.status(201).json({ success: true, message: `${finalRole === 'OFFICER' ? 'Officer' : 'Technician'} account created successfully`, data: publicUser(user.toObject()) });
  } catch (error) {
    if (error.code === 11000) return res.status(400).json({ success: false, message: 'Email already registered.' });
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/hierarchy/woreda/staff/:id
const updateWoredaStaff = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const staff = await User.findById(req.params.id);
    if (!staff) return res.status(404).json({ success: false, message: 'Staff member not found.' });
    if (!['OFFICER', 'TECHNICIAN'].includes(staff.role)) {
      return res.status(400).json({ success: false, message: 'Account is not a staff member.' });
    }
    if (String(staff.woredaId) !== String(woreda._id)) {
      return res.status(403).json({ success: false, message: 'This staff member does not belong to your woreda.' });
    }

    const { fullName, phone, role, departmentId, employeeId, status } = req.body;
    if (phone && !validPhone(normalizePhone(phone))) {
      return res.status(400).json({ success: false, message: 'Phone number must start with 09 and contain 10 digits.' });
    }
    if (role !== undefined && !['OFFICER', 'TECHNICIAN'].includes(role)) {
      return res.status(400).json({ success: false, message: 'Role must be OFFICER or TECHNICIAN.' });
    }

    let departmentName = staff.department || '';
    if (departmentId !== undefined) {
      if (!departmentId) {
        departmentName = '';
        staff.departmentId = null;
      } else {
        const department = await Department.findById(departmentId);
        if (!department) return res.status(404).json({ success: false, message: 'Selected department not found.' });
        if (String(department.woredaId) !== String(woreda._id)) {
          return res.status(403).json({ success: false, message: 'Selected department does not belong to your woreda.' });
        }
        departmentName = department.name;
        staff.departmentId = department._id;
      }
      staff.department = departmentName;
    }

    if (fullName !== undefined) staff.fullName = String(fullName).trim();
    if (phone !== undefined) staff.phone = normalizePhone(phone);
    if (role !== undefined) staff.role = role;
    if (employeeId !== undefined) staff.employeeId = String(employeeId || '').trim() || null;
    if (status !== undefined) staff.isActive = status !== 'Inactive';

    await staff.save();
    audit(req, 'user_updated', 'User', staff._id, { email: staff.email, role: staff.role });
    res.json({ success: true, message: 'Staff member updated successfully', data: publicUser(staff.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/hierarchy/woreda/staff/:id/toggle-active
const toggleWoredaStaffActive = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const staff = await User.findById(req.params.id);
    if (!staff) return res.status(404).json({ success: false, message: 'Staff member not found.' });
    if (!['OFFICER', 'TECHNICIAN'].includes(staff.role)) {
      return res.status(400).json({ success: false, message: 'Account is not a staff member.' });
    }
    if (String(staff.woredaId) !== String(woreda._id)) {
      return res.status(403).json({ success: false, message: 'This staff member does not belong to your woreda.' });
    }

    staff.isActive = !staff.isActive;
    await staff.save();
    audit(req, staff.isActive ? 'user_reactivated' : 'user_deactivated', 'User', staff._id, { email: staff.email });
    res.json({ success: true, message: `Staff member ${staff.isActive ? 'activated' : 'deactivated'}.`, data: publicUser(staff.toObject()) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// DELETE /api/hierarchy/woreda/staff/:id
const deleteWoredaStaff = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const staff = await User.findById(req.params.id);
    if (!staff) return res.status(404).json({ success: false, message: 'Staff member not found.' });
    if (!['OFFICER', 'TECHNICIAN'].includes(staff.role)) {
      return res.status(400).json({ success: false, message: 'Account is not a staff member.' });
    }
    if (String(staff.woredaId) !== String(woreda._id)) {
      return res.status(403).json({ success: false, message: 'This staff member does not belong to your woreda.' });
    }

    await User.findByIdAndDelete(staff._id);
    audit(req, 'user_deleted', 'User', staff._id, { email: staff.email });
    res.json({ success: true, message: 'Staff member deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/hierarchy/woreda/complaints
const getWoredaAdminComplaints = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 10));
    const filter = { woredaId: woreda._id };
    if (req.query.status) filter.status = req.query.status;
    if (req.query.department) filter.department = ciRegex(req.query.department);
    if (req.query.search) {
      const s = escapeRegex(req.query.search);
      filter.$or = [
        { trackingId: { $regex: s, $options: 'i' } },
        { title: { $regex: s, $options: 'i' } },
        { issueType: { $regex: s, $options: 'i' } },
        { reporterName: { $regex: s, $options: 'i' } },
        { reporterPhone: { $regex: s, $options: 'i' } },
      ];
    }

    const total = await MunicipalComplaint.countDocuments(filter);
    const complaints = await MunicipalComplaint.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .select('-auditTrail -notificationHistory -internalNotes -responses -workProgress')
      .lean();

    res.json({ success: true, data: { complaints, total, page, pages: Math.max(1, Math.ceil(total / limit)) } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/hierarchy/woreda/complaints/:id/assign-officer
const assignOfficerToComplaint = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (String(complaint.woredaId) !== String(woreda._id)) {
      return res.status(403).json({ success: false, message: 'This complaint does not belong to your woreda.' });
    }

    const officerId = req.body.officerId;
    if (!officerId) return res.status(400).json({ success: false, message: 'Please select an officer.' });
    const officer = await User.findOne({ _id: officerId, role: 'OFFICER', isActive: true }).select('-password').lean();
    if (!officer) return res.status(404).json({ success: false, message: 'Officer not found or inactive.' });

    complaint.assignedTo = officer._id;
    complaint.assignedAt = new Date();
    if (complaint.status === 'Submitted') complaint.status = 'Assigned';
    complaint.auditTrail.push({
      action: 'Assigned',
      user: req.user._id,
      userName: req.user.fullName,
      role: req.user.role,
      details: `Officer assigned: ${officer.fullName}`,
    });
    await complaint.save();

    const createNotification = require('../utils/createNotification');
    await createNotification({
      recipient: officer._id,
      title: `Complaint ${complaint.trackingId} assigned to you`,
      message: `"${complaint.title}" (${complaint.department}, ${woreda.name}). Please review and act.`,
      type: 'complaint_assigned',
      relatedReport: complaint._id,
      relatedReportType: 'municipal_complaint',
      io: req.app.get('io'),
    });

    res.json({ success: true, message: 'Officer assigned', data: complaint });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/hierarchy/woreda/complaints/:id/assign-technician
const assignTechnicianToComplaint = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (String(complaint.woredaId) !== String(woreda._id)) {
      return res.status(403).json({ success: false, message: 'This complaint does not belong to your woreda.' });
    }

    const technicianId = req.body.technicianId;
    if (!technicianId) return res.status(400).json({ success: false, message: 'Please select a technician.' });
    const technician = await User.findOne({ _id: technicianId, role: 'TECHNICIAN', isActive: true }).select('-password').lean();
    if (!technician) return res.status(404).json({ success: false, message: 'Technician not found or inactive.' });

    complaint.technicianId = technician._id;
    complaint.technicianName = technician.fullName;
    if (req.body.workOrderNotes) complaint.workOrderNotes = String(req.body.workOrderNotes).trim();
    if (req.body.dueAt) complaint.technicianDueAt = new Date(req.body.dueAt);
    if (['Submitted', 'In Review'].includes(complaint.status)) complaint.status = 'Assigned';
    complaint.auditTrail.push({
      action: 'Assigned',
      user: req.user._id,
      userName: req.user.fullName,
      role: req.user.role,
      details: `Technician assigned: ${technician.fullName}`,
    });
    await complaint.save();

    const createNotification = require('../utils/createNotification');
    await createNotification({
      recipient: technician._id,
      title: `Work order assigned — ${complaint.trackingId}`,
      message: `Work order for "${complaint.title}" (${complaint.department}, ${woreda.name}). ${complaint.workOrderNotes || ''}`,
      type: 'complaint_assigned',
      relatedReport: complaint._id,
      relatedReportType: 'municipal_complaint',
      io: req.app.get('io'),
    });

    res.json({ success: true, message: 'Technician assigned', data: complaint });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/hierarchy/woreda/complaints/:id/escalate
const escalateComplaint = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (String(complaint.woredaId) !== String(woreda._id)) {
      return res.status(403).json({ success: false, message: 'This complaint does not belong to your woreda.' });
    }
    if (complaint.assignedLevel === 'Subcity') {
      return res.status(400).json({ success: false, message: 'This complaint is already with the Subcity level.' });
    }

    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'An escalation reason is required.' });

    const previousLevel = complaint.assignedLevel;
    complaint.assignedLevel = 'Subcity';
    complaint.status = 'Forwarded to Subcity';
    complaint.forwardReason = reason;
    complaint.forwardedBy = req.user._id;
    complaint.forwardedByName = req.user.fullName;
    complaint.forwardedAt = new Date();
    complaint.escalationHistory.push({
      fromLevel: previousLevel,
      toLevel: 'Subcity Department',
      reason,
      triggeredBy: 'manual',
      triggeredByName: req.user.fullName,
      at: new Date(),
    });
    complaint.auditTrail.push({
      action: 'Escalated',
      user: req.user._id,
      userName: req.user.fullName,
      role: req.user.role,
      details: `Escalated to Subcity: ${reason}`,
    });
    await complaint.save();

    res.json({ success: true, message: 'Complaint escalated to Subcity', data: complaint });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// POST /api/hierarchy/woreda/complaints/:id/close
const closeComplaint = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (String(complaint.woredaId) !== String(woreda._id)) {
      return res.status(403).json({ success: false, message: 'This complaint does not belong to your woreda.' });
    }

    complaint.status = 'Closed';
    complaint.resolvedAt = complaint.resolvedAt || new Date();
    complaint.resolvedBy = req.user._id;
    complaint.resolvedByName = req.user.fullName;
    complaint.auditTrail.push({
      action: 'Closed',
      user: req.user._id,
      userName: req.user.fullName,
      role: req.user.role,
      details: 'Complaint closed by woreda admin',
    });
    await complaint.save();

    res.json({ success: true, message: 'Complaint closed', data: complaint });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/hierarchy/woreda/analytics
const getWoredaAnalytics = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    if (!woreda) return res.status(400).json({ success: false, message: 'No woreda is linked to your account.' });

    const base = { woredaId: woreda._id };
    const [total, byStatus, byDepartment, byOfficer, recent] = await Promise.all([
      MunicipalComplaint.countDocuments(base),
      MunicipalComplaint.aggregate([{ $match: base }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      MunicipalComplaint.aggregate([{ $match: base }, { $group: { _id: '$department', count: { $sum: 1 } } }]),
      MunicipalComplaint.aggregate([
        { $match: base },
        { $group: { _id: '$assignedTo', count: { $sum: 1 } } },
        { $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'user' } },
        { $project: { count: 1, name: { $arrayElemAt: ['$user.fullName', 0] } } },
      ]),
      MunicipalComplaint.find(base).sort({ createdAt: -1 }).limit(5).select('title trackingId status department createdAt').lean(),
    ]);

    res.json({
      success: true,
      data: { total, byStatus, byDepartment, byOfficer, recent },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── OFFICER ────────────────────────────────────────────────────────────────────

// GET /api/hierarchy/officer/me
const getOfficerProfile = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    res.json({
      success: true,
      data: {
        department: req.user.department || '',
        woreda: woreda ? { _id: woreda._id, name: woreda.name, subcity: woreda.subcity } : null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/hierarchy/officer/stats
const getOfficerStats = async (req, res) => {
  try {
    const conditions = [{ assignedTo: req.user._id }];
    if (req.user.woredaId) {
      const base = { woredaId: req.user.woredaId };
      if (req.user.department) base.department = ciRegex(req.user.department);
      conditions.push(base);
    }
    const match = { $or: conditions };

    const [assigned, inProgress, resolved, completed, pendingVerify] = await Promise.all([
      MunicipalComplaint.countDocuments({ $or: conditions, status: { $in: ['Assigned', 'In Review'] } }),
      MunicipalComplaint.countDocuments({ $or: conditions, status: 'In Progress' }),
      MunicipalComplaint.countDocuments({ $or: conditions, status: { $in: ['Resolved', 'Closed'] } }),
      MunicipalComplaint.countDocuments({ $or: conditions, status: 'Completed' }),
      MunicipalComplaint.countDocuments({ $or: conditions, status: 'Completed' }),
    ]);

    res.json({ success: true, data: { assigned, inProgress, resolved, completed, pendingVerify } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/hierarchy/officer/complaints
const getOfficerComplaints = async (req, res) => {
  try {
    const conditions = [{ assignedTo: req.user._id }];
    if (req.user.woredaId) {
      const base = { woredaId: req.user.woredaId };
      if (req.user.department) base.department = ciRegex(req.user.department);
      conditions.push(base);
    }
    const filter = { $or: conditions };
    if (req.query.status) filter.status = req.query.status;

    const complaints = await MunicipalComplaint.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .select('-auditTrail -notificationHistory -internalNotes -responses -workProgress')
      .lean();

    res.json({ success: true, data: complaints });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/hierarchy/officer/complaints/:id/verify
const officerVerifyComplaint = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (String(complaint.woredaId) !== String(req.user.woredaId)) {
      return res.status(403).json({ success: false, message: 'This complaint is not in your woreda.' });
    }
    if (complaint.status !== 'Completed') {
      return res.status(400).json({ success: false, message: `Only completed work can be verified (current: ${complaint.status}).` });
    }

    const note = String(req.body.note || '').trim();
    if (!note) return res.status(400).json({ success: false, message: 'A verification note is required.' });

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
    } else {
      complaint.status = 'In Progress';
      complaint.workProgress.push({
        step: 'update',
        notes: `Verification rejected: ${note}`,
        by: req.user._id,
        byName: req.user.fullName,
      });
    }
    complaint.auditTrail.push({
      action: verified ? 'Resolved' : 'In Progress',
      user: req.user._id,
      userName: req.user.fullName,
      role: req.user.role,
      details: `Verification ${verified ? 'passed' : 'rejected'}: ${note.slice(0, 200)}`,
    });
    await complaint.save();

    res.json({
      success: true,
      message: verified ? 'Complaint resolved' : 'Complaint sent back for rework',
      data: complaint,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/hierarchy/officer/complaints/:id/assign-technician
const officerAssignTechnician = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Complaint not found.' });
    if (String(complaint.woredaId) !== String(req.user.woredaId)) {
      return res.status(403).json({ success: false, message: 'This complaint is not in your woreda.' });
    }

    const technicianId = req.body.technicianId;
    if (!technicianId) return res.status(400).json({ success: false, message: 'Please select a technician.' });
    const technician = await User.findOne({ _id: technicianId, role: 'TECHNICIAN', isActive: true }).select('-password').lean();
    if (!technician) return res.status(404).json({ success: false, message: 'Technician not found or inactive.' });

    complaint.technicianId = technician._id;
    complaint.technicianName = technician.fullName;
    if (req.body.workOrderNotes) complaint.workOrderNotes = String(req.body.workOrderNotes).trim();
    if (req.body.dueAt) complaint.technicianDueAt = new Date(req.body.dueAt);
    if (['Submitted', 'In Review'].includes(complaint.status)) complaint.status = 'Assigned';
    complaint.auditTrail.push({
      action: 'Assigned',
      user: req.user._id,
      userName: req.user.fullName,
      role: req.user.role,
      details: `Technician assigned: ${technician.fullName}`,
    });
    await complaint.save();

    const createNotification = require('../utils/createNotification');
    await createNotification({
      recipient: technician._id,
      title: `Work order assigned — ${complaint.trackingId}`,
      message: `Work order for "${complaint.title}" (${complaint.department}). ${complaint.workOrderNotes || ''}`,
      type: 'complaint_assigned',
      relatedReport: complaint._id,
      relatedReportType: 'municipal_complaint',
      io: req.app.get('io'),
    });

    res.json({ success: true, message: 'Technician assigned', data: complaint });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/hierarchy/officer/technicians
const getOfficerTechnicians = async (req, res) => {
  try {
    const filter = { role: 'TECHNICIAN', isActive: true, woredaId: req.user.woredaId || null };
    if (req.user.department) filter.department = ciRegex(req.user.department);
    const technicians = await User.find(filter).select('fullName phone email department employeeId').sort({ fullName: 1 }).lean();
    res.json({ success: true, data: technicians });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── TECHNICIAN ─────────────────────────────────────────────────────────────────

// GET /api/hierarchy/technician/me
const getTechnicianProfile = async (req, res) => {
  try {
    const woreda = await resolveWoredaForUser(req.user);
    res.json({
      success: true,
      data: {
        department: req.user.department || '',
        woreda: woreda ? { _id: woreda._id, name: woreda.name, subcity: woreda.subcity } : null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/hierarchy/technician/stats
const getTechnicianStats = async (req, res) => {
  try {
    const [open, inProgress, completed, total] = await Promise.all([
      MunicipalComplaint.countDocuments({ technicianId: req.user._id, status: 'Assigned' }),
      MunicipalComplaint.countDocuments({ technicianId: req.user._id, status: 'In Progress' }),
      MunicipalComplaint.countDocuments({ technicianId: req.user._id, status: 'Completed' }),
      MunicipalComplaint.countDocuments({ technicianId: req.user._id }),
    ]);
    res.json({ success: true, data: { open, inProgress, completed, total } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// GET /api/hierarchy/technician/work-orders
const getTechnicianWorkOrders = async (req, res) => {
  try {
    const filter = { technicianId: req.user._id };
    if (req.query.status) filter.status = req.query.status;
    const workOrders = await MunicipalComplaint.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .select('-auditTrail -notificationHistory -internalNotes -responses -workProgress')
      .lean();
    res.json({ success: true, data: workOrders });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/hierarchy/technician/work-orders/:id/start
const technicianStartWork = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Work order not found.' });
    if (String(complaint.technicianId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'This work order is not assigned to you.' });
    }
    if (complaint.status !== 'Assigned') {
      return res.status(400).json({ success: false, message: `Only 'Assigned' work orders can be started (current: ${complaint.status}).` });
    }

    complaint.status = 'In Progress';
    complaint.startedAt = new Date();
    complaint.startedBy = req.user._id;
    complaint.startedByName = req.user.fullName;
    complaint.workProgress.push({ step: 'started', notes: 'Work started', by: req.user._id, byName: req.user.fullName });
    complaint.auditTrail.push({
      action: 'In Progress',
      user: req.user._id,
      userName: req.user.fullName,
      role: req.user.role,
      details: 'Technician started work',
    });
    await complaint.save();
    res.json({ success: true, message: 'Work started', data: complaint });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// PUT /api/hierarchy/technician/work-orders/:id/complete
const technicianCompleteWork = async (req, res) => {
  try {
    const complaint = await MunicipalComplaint.findById(req.params.id);
    if (!complaint) return res.status(404).json({ success: false, message: 'Work order not found.' });
    if (String(complaint.technicianId) !== String(req.user._id)) {
      return res.status(403).json({ success: false, message: 'This work order is not assigned to you.' });
    }
    if (complaint.status !== 'In Progress') {
      return res.status(400).json({ success: false, message: `Only 'In Progress' work orders can be completed (current: ${complaint.status}).` });
    }
    const notes = String(req.body.notes || '').trim();
    if (!notes) return res.status(400).json({ success: false, message: 'Work completion notes are required.' });

    complaint.status = 'Completed';
    complaint.completedAt = new Date();
    complaint.completedBy = req.user._id;
    complaint.completedByName = req.user.fullName;
    complaint.workProgress.push({ step: 'completed', notes, by: req.user._id, byName: req.user.fullName });
    complaint.auditTrail.push({
      action: 'Completed',
      user: req.user._id,
      userName: req.user.fullName,
      role: req.user.role,
      details: `Work completed${notes ? `: ${notes.slice(0, 200)}` : ''}`,
    });
    await complaint.save();

    const createNotification = require('../utils/createNotification');
    if (complaint.assignedTo) {
      await createNotification({
        recipient: complaint.assignedTo,
        title: `Work completed — ${complaint.trackingId}`,
        message: `Technician work on "${complaint.title}" is complete. Please verify the resolution.`,
        type: 'complaint_status',
        relatedReport: complaint._id,
        relatedReportType: 'municipal_complaint',
        io: req.app.get('io'),
      });
    }

    res.json({ success: true, message: 'Work completed — pending officer verification', data: complaint });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = {
  // Subcity admin
  getSubcityAdminProfile,
  getSubcityAdminStats,
  getSubcityWoredas,
  createSubcityWoreda,
  updateSubcityWoreda,
  deleteSubcityWoreda,
  createWoredaAdmin,
  resetWoredaAdminPassword,
  getSubcityAdminComplaints,
  getSubcityAnalytics,
  getSubcityDepartments,
  createSubcityDepartment,
  updateSubcityDepartment,
  deleteSubcityDepartment,
  getSubcityUsers,
  createSubcityUser,
  updateSubcityUser,
  toggleSubcityUserActive,
  deleteSubcityUser,
  // Woreda admin
  getWoredaAdminProfile,
  getWoredaAdminStats,
  getWoredaDepartments,
  createWoredaDepartment,
  updateWoredaDepartment,
  deleteWoredaDepartment,
  getWoredaStaff,
  createWoredaStaff,
  updateWoredaStaff,
  toggleWoredaStaffActive,
  deleteWoredaStaff,
  getWoredaAdminComplaints,
  assignOfficerToComplaint,
  assignTechnicianToComplaint,
  escalateComplaint,
  closeComplaint,
  getWoredaAnalytics,
  // Officer
  getOfficerProfile,
  getOfficerStats,
  getOfficerComplaints,
  officerVerifyComplaint,
  officerAssignTechnician,
  getOfficerTechnicians,
  // Technician
  getTechnicianProfile,
  getTechnicianStats,
  getTechnicianWorkOrders,
  technicianStartWork,
  technicianCompleteWork,
};
