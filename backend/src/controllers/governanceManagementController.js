const mongoose = require('mongoose');
const GovernmentOffice = require('../models/GovernmentOffice');
const ComplaintCategory = require('../models/ComplaintCategory');
const GovernanceComplaint = require('../models/GovernanceComplaint');
const Subcity = require('../models/Subcity');
const Woreda = require('../models/Woreda');
const SlaRule = require('../models/SlaRule');
const User = require('../models/User');
const { hashPassword } = require('../utils/password');

// ── Roles ─────────────────────────────────────────────────────────────────────
//
// Who may manage governance master data (offices / categories / officers).
// Derived subcity-admin roles (subcity_bole, subcity_koye, …) are allowed via
// the authorize() wildcard, so listing them here covers every subcity.
// NOTE: platform admins (admin/ADMIN/government) are intentionally excluded from
// write operations — they have read-only access via the /api/governance-management
// routes. Writes are exclusively owned by subcity admins.
const GOVERNANCE_MANAGEMENT_ROLES = [
  'subcity_admin', 'SUBCITY_ADMIN', 'SUBCITY_HEAD',
];

// Roles that have READ access to governance data (used only for summary/list
// endpoints that platform admins are allowed to call).
const GOVERNANCE_READ_ROLES = [
  'admin', 'government', 'ADMIN', 'SUBCITY_HEAD',
  'subcity_admin', 'SUBCITY_ADMIN',
];

// ── Small helpers ─────────────────────────────────────────────────────────────

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const ciRegex = (s) => ({ $regex: `^${escapeRegex(s)}$`, $options: 'i' });

const isAdmin = (user) => ['admin', 'government', 'ADMIN'].includes(user?.role);

// Returns true if the user is a subcity admin (write-capable role).
// Platform admins are READ-ONLY for governance master data.
const isSubcityRole = (user) => {
  if (!user) return false;
  return ['subcity_admin', 'SUBCITY_ADMIN', 'SUBCITY_HEAD'].includes(user.role) ||
    (typeof user.role === 'string' && user.role.startsWith('subcity_'));
};

const isSubcityManager = (user) => {
  if (!user) return false;
  if (isAdmin(user)) return true;
  return ['subcity_admin', 'SUBCITY_ADMIN', 'SUBCITY_HEAD'].includes(user.role) ||
    (typeof user.role === 'string' && user.role.startsWith('subcity_'));
};

// Resolve the subcity name a user is scoped to ('' for platform admins).
const resolveScopeSubcity = async (user) => {
  if (!user) return '';
  if (isAdmin(user)) return '';
  if (user.subcity) return String(user.subcity).trim();
  if (user.subcityId) {
    const s = await Subcity.findById(user.subcityId).lean();
    if (s) return s.name;
  }
  if (user.woredaId) {
    const w = await Woreda.findById(user.woredaId).lean();
    if (w) return w.subcity;
  }
  return '';
};

const assertSubcityScope = async (req, subcity) => {
  if (isAdmin(req.user)) return true;
  const mine = await resolveScopeSubcity(req.user);
  return !!mine && String(subcity).trim().toLowerCase() === String(mine).trim().toLowerCase();
};

const findSubcityRecord = (subcity) =>
  Subcity.findOne({
    $or: [{ name: ciRegex(subcity) }, { nameLower: ciRegex(subcity) }],
  }).lean();

// ── Government Offices ────────────────────────────────────────────────────────

// GET /api/governance-management/offices?subcity=X&all=true
// Public read (protectOptional): returns active offices for a subcity. Subcity
// managers get all offices of their own subcity; platform admins may pass
// `all=true` to list every subcity's offices.
const getOffices = async (req, res) => {
  try {
    const filter = {};
    if (isSubcityManager(req.user)) {
      const sub = await resolveScopeSubcity(req.user);
      if (!sub) return res.status(403).json({ success: false, message: 'No subcity is assigned to your account.' });
      if (req.query.subcity && String(req.query.subcity).trim().toLowerCase() !== sub.toLowerCase()) {
        return res.status(403).json({ success: false, message: 'You may only view offices in your own subcity.' });
      }
      filter.subcity = ciRegex(sub);
    } else if (isAdmin(req.user)) {
      if (req.query.subcity) filter.subcity = ciRegex(req.query.subcity);
      if (req.query.subcityId) filter.subcityId = req.query.subcityId;
      // platform admins see everything unless a subcity is requested
    } else {
      // Public / unauthenticated — require a subcity (name or id) and only
      // expose active offices.
      if (req.query.subcityId) {
        const sc = await Subcity.findById(req.query.subcityId).lean();
        if (!sc) return res.status(404).json({ success: false, message: 'Subcity not found.' });
        filter.subcityId = sc._id;
      } else if (req.query.subcity) {
        filter.subcity = ciRegex(req.query.subcity);
      } else {
        return res.status(400).json({ success: false, message: 'A subcity (id or name) is required.' });
      }
      filter.isActive = true;
    }

    const offices = await GovernmentOffice.find(filter)
      .sort({ displayOrder: 1, name: 1 })
      .select('-__v')
      .lean();

    res.json({ success: true, data: { offices } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/governance-management/offices
// POST /api/government-offices
// Simplified payload: { subcityId, officeName, status } — the optional extra
// fields (description, address, phone, email, headName, displayOrder, isActive)
// are intentionally ignored so only the required subcity + office name remain.
const createOffice = async (req, res) => {
  try {
    // Platform admins (admin/ADMIN/government) may not write governance master data.
    if (isAdmin(req.user)) {
      return res.status(403).json({ success: false, message: 'System admins cannot create governance offices. This action belongs to the Subcity Admin.' });
    }

    const name = String(req.body.officeName ?? req.body.name ?? '').trim();
    let subcityId = req.body.subcityId;
    // Auto-fill subcity from the authenticated user's token when not provided.
    // This means subcity admins never need to pass subcity in the request body —
    // they can only ever create offices in their own subcity.
    let subcity = String(req.body.subcity || '').trim();
    if (!subcityId && !subcity) {
      subcity = await resolveScopeSubcity(req.user);
    }

    if (!name) return res.status(400).json({ success: false, message: 'Office name is required.' });

    let subcityRecord = null;
    if (subcityId) {
      subcityRecord = await Subcity.findById(subcityId).lean();
      if (!subcityRecord) return res.status(400).json({ success: false, message: 'Selected subcity does not exist.' });
    } else {
      subcityRecord = subcity ? await findSubcityRecord(subcity) : null;
      if (!subcityRecord) {
        return res.status(400).json({ success: false, message: 'A subcity is required (or your account has no subcity assigned).' });
      }
    }

    if (!(await assertSubcityScope(req, subcityRecord.name))) {
      return res.status(403).json({ success: false, message: 'You may only create offices in your own subcity.' });
    }

    const existing = await GovernmentOffice.findOne({ subcityId: subcityRecord._id, name: ciRegex(name) }).lean();
    if (existing) return res.status(409).json({ success: false, message: `An office named "${name}" already exists in ${subcityRecord.name}.` });

    const status = String(req.body.status || 'active').toLowerCase();
    const office = await GovernmentOffice.create({
      name,
      subcity: subcityRecord.name,
      subcityId: subcityRecord._id,
      isActive: status === 'inactive' ? false : true,
    });

    res.status(201).json({ success: true, message: 'Government office created', data: office });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'An office with this name already exists in this subcity.' });
    res.status(500).json({ success: false, message: err.message });
  }
};

const findScopedOffice = async (req) => {
  const office = await GovernmentOffice.findById(req.params.id);
  if (!office) return null;
  if (!(await assertSubcityScope(req, office.subcity))) return null;
  return office;
};

// PUT /api/governance-management/offices/:id
const updateOffice = async (req, res) => {
  try {
    if (isAdmin(req.user)) return res.status(403).json({ success: false, message: 'System admins cannot edit governance offices.' });
    const office = await findScopedOffice(req);
    if (!office) return res.status(404).json({ success: false, message: 'Office not found or not in your scope.' });

    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ success: false, message: 'Office name cannot be empty.' });
      const dup = await GovernmentOffice.findOne({
        _id: { $ne: office._id },
        subcityId: office.subcityId,
        name: ciRegex(name),
      }).lean();
      if (dup) return res.status(409).json({ success: false, message: `An office named "${name}" already exists in this subcity.` });
      office.name = name;
    }
    ['description', 'address', 'phone', 'email', 'headName'].forEach((f) => {
      if (req.body[f] !== undefined) office[f] = String(req.body[f] || '').trim();
    });
    if (req.body.displayOrder !== undefined) {
      office.displayOrder = Number.isFinite(Number(req.body.displayOrder)) ? Number(req.body.displayOrder) : 0;
    }
    if (req.body.isActive !== undefined) office.isActive = req.body.isActive === true || req.body.isActive === 'true';

    // Move the office to another subcity (subcity admins may only move it
    // within their own subcity — enforced by assertSubcityScope).
    if (req.body.subcityId !== undefined && String(req.body.subcityId) !== String(office.subcityId || '')) {
      const target = await Subcity.findById(req.body.subcityId).lean();
      if (!target) return res.status(400).json({ success: false, message: 'Selected subcity does not exist.' });
      if (!(await assertSubcityScope(req, target.name))) {
        return res.status(403).json({ success: false, message: 'You may only move offices within your own subcity.' });
      }
      const dup = await GovernmentOffice.findOne({
        _id: { $ne: office._id },
        subcityId: target._id,
        name: ciRegex(office.name),
      }).lean();
      if (dup) return res.status(409).json({ success: false, message: `An office named "${office.name}" already exists in ${target.name}.` });
      office.subcityId = target._id;
      office.subcity = target.name;
    }

    await office.save();
    res.json({ success: true, message: 'Government office updated', data: office });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'An office with this name already exists in this subcity.' });
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/government-offices/:id
// Read a single government office. Subcity managers may only read offices in
// their own subcity; platform admins may read any; anonymous visitors can read
// active offices (used by the public complaint form).
const getOffice = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) {
      return res.status(404).json({ success: false, message: 'Government office not found.' });
    }
    const office = await GovernmentOffice.findById(req.params.id).select('-__v').lean();
    if (!office) return res.status(404).json({ success: false, message: 'Government office not found.' });

    if (isAdmin(req.user)) {
      return res.json({ success: true, data: { office } });
    }
    if (isSubcityManager(req.user)) {
      if (!(await assertSubcityScope(req, office.subcity))) {
        return res.status(403).json({ success: false, message: 'You may only view offices in your own subcity.' });
      }
      return res.json({ success: true, data: { office } });
    }
    // Public — inactive offices are never exposed to anonymous visitors.
    if (office.isActive === false) {
      return res.status(404).json({ success: false, message: 'Government office not found.' });
    }
    res.json({ success: true, data: { office } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/government-offices/by-subcity/:subcityId
// Drives the dynamic "Government Office" dropdown in the officer form. Returns
// the active offices of exactly one subcity. A subcity manager may only load
// offices of their own subcity (403 otherwise) — no cross-subcity offices leak.
const getOfficesBySubcityId = async (req, res) => {
  try {
    const { subcityId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(String(subcityId))) {
      return res.status(400).json({ success: false, message: 'Invalid subcity id.' });
    }
    const subcityRecord = await Subcity.findById(subcityId).lean();
    if (!subcityRecord) return res.status(404).json({ success: false, message: 'Subcity not found.' });

    if (isSubcityManager(req.user) && !isAdmin(req.user)) {
      const mine = await resolveScopeSubcity(req.user);
      if (!mine || String(subcityRecord.name).trim().toLowerCase() !== String(mine).trim().toLowerCase()) {
        return res.status(403).json({ success: false, message: 'You may only access offices in your own subcity.' });
      }
    }

    const offices = await GovernmentOffice.find({ subcityId: subcityRecord._id, isActive: true })
      .sort({ displayOrder: 1, name: 1 })
      .select('-__v')
      .lean();
    res.json({ success: true, data: { offices } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/governance-management/offices/:id/toggle
const toggleOffice = async (req, res) => {
  try {
    if (isAdmin(req.user)) return res.status(403).json({ success: false, message: 'System admins cannot toggle governance offices.' });
    const office = await findScopedOffice(req);
    if (!office) return res.status(404).json({ success: false, message: 'Office not found or not in your scope.' });
    office.isActive = !office.isActive;
    await office.save();
    res.json({ success: true, message: `Office ${office.isActive ? 'activated' : 'deactivated'}`, data: office });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/governance-management/offices/:id
const deleteOffice = async (req, res) => {
  try {
    if (isAdmin(req.user)) return res.status(403).json({ success: false, message: 'System admins cannot delete governance offices.' });
    const office = await findScopedOffice(req);
    if (!office) return res.status(404).json({ success: false, message: 'Office not found or not in your scope.' });

    const inUse = await GovernanceComplaint.countDocuments({ officeId: office._id });
    if (inUse > 0) {
      return res.status(409).json({
        success: false,
        message: `This office has ${inUse} complaint(s) linked to it. Deactivate the office instead to keep the audit trail.`,
      });
    }
    const linkedOfficers = await User.countDocuments({ governmentOfficeId: office._id, isActive: true });
    if (linkedOfficers > 0) {
      return res.status(409).json({
        success: false,
        message: `This office has ${linkedOfficers} active officer account(s) assigned to it. Reassign or deactivate them before deleting the office.`,
      });
    }
    await ComplaintCategory.deleteMany({ officeId: office._id });
    await office.deleteOne();
    res.json({ success: true, message: 'Government office deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Complaint Categories ──────────────────────────────────────────────────────

// GET /api/governance-management/categories?officeId=X
const getCategories = async (req, res) => {
  try {
    if (!req.query.officeId) {
      return res.status(400).json({ success: false, message: 'officeId is required.' });
    }
    const office = await GovernmentOffice.findById(req.query.officeId).lean();
    if (!office) return res.status(404).json({ success: false, message: 'Office not found.' });

    if (!isSubcityManager(req.user) && !(await assertSubcityScope(req, office.subcity))) {
      // Public read — only active categories.
      const categories = await ComplaintCategory.find({ officeId: office._id, isActive: true })
        .sort({ displayOrder: 1, name: 1 })
        .select('-__v')
        .lean();
      return res.json({ success: true, data: { categories } });
    }

    const filter = { officeId: office._id };
    if (req.query.active === 'true') filter.isActive = true;
    const categories = await ComplaintCategory.find(filter)
      .sort({ displayOrder: 1, name: 1 })
      .select('-__v')
      .lean();
    res.json({ success: true, data: { categories } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const findScopedCategoryOffice = async (officeId, req) => {
  const office = await GovernmentOffice.findById(officeId).lean();
  if (!office) return null;
  if (!(await assertSubcityScope(req, office.subcity))) return null;
  return office;
};

// POST /api/governance-management/categories
const createCategory = async (req, res) => {
  try {
    if (isAdmin(req.user)) return res.status(403).json({ success: false, message: 'System admins cannot create complaint categories.' });
    const name = String(req.body.name || '').trim();
    if (!name) return res.status(400).json({ success: false, message: 'Category name is required.' });
    if (!req.body.officeId) return res.status(400).json({ success: false, message: 'officeId is required.' });

    const office = await findScopedCategoryOffice(req.body.officeId, req);
    if (!office) return res.status(404).json({ success: false, message: 'Office not found or not in your scope.' });

    const dup = await ComplaintCategory.findOne({ officeId: office._id, name: ciRegex(name) }).lean();
    if (dup) return res.status(409).json({ success: false, message: `A category named "${name}" already exists for this office.` });

    const category = await ComplaintCategory.create({
      name,
      officeId: office._id,
      description: String(req.body.description || '').trim(),
      displayOrder: Number.isFinite(Number(req.body.displayOrder)) ? Number(req.body.displayOrder) : 0,
      isActive: req.body.isActive === false ? false : true,
    });
    res.status(201).json({ success: true, message: 'Complaint category created', data: category });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'A category with this name already exists for this office.' });
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/governance-management/categories/:id
const updateCategory = async (req, res) => {
  try {
    if (isAdmin(req.user)) return res.status(403).json({ success: false, message: 'System admins cannot edit complaint categories.' });
    const category = await ComplaintCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found.' });
    const office = await findScopedCategoryOffice(category.officeId, req);
    if (!office) return res.status(403).json({ success: false, message: 'Not authorised to edit this category.' });

    if (req.body.name !== undefined) {
      const name = String(req.body.name || '').trim();
      if (!name) return res.status(400).json({ success: false, message: 'Category name cannot be empty.' });
      const dup = await ComplaintCategory.findOne({
        _id: { $ne: category._id },
        officeId: category.officeId,
        name: ciRegex(name),
      }).lean();
      if (dup) return res.status(409).json({ success: false, message: `A category named "${name}" already exists for this office.` });
      category.name = name;
    }
    if (req.body.description !== undefined) category.description = String(req.body.description || '').trim();
    if (req.body.displayOrder !== undefined) {
      category.displayOrder = Number.isFinite(Number(req.body.displayOrder)) ? Number(req.body.displayOrder) : 0;
    }
    if (req.body.isActive !== undefined) category.isActive = req.body.isActive === true || req.body.isActive === 'true';

    await category.save();
    res.json({ success: true, message: 'Complaint category updated', data: category });
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ success: false, message: 'A category with this name already exists for this office.' });
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/governance-management/categories/:id/toggle
const toggleCategory = async (req, res) => {
  try {
    if (isAdmin(req.user)) return res.status(403).json({ success: false, message: 'System admins cannot toggle complaint categories.' });
    const category = await ComplaintCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found.' });
    const office = await findScopedCategoryOffice(category.officeId, req);
    if (!office) return res.status(403).json({ success: false, message: 'Not authorised to edit this category.' });
    category.isActive = !category.isActive;
    await category.save();
    res.json({ success: true, message: `Category ${category.isActive ? 'activated' : 'deactivated'}`, data: category });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/governance-management/categories/:id
const deleteCategory = async (req, res) => {
  try {
    if (isAdmin(req.user)) return res.status(403).json({ success: false, message: 'System admins cannot delete complaint categories.' });
    const category = await ComplaintCategory.findById(req.params.id);
    if (!category) return res.status(404).json({ success: false, message: 'Category not found.' });
    const office = await findScopedCategoryOffice(category.officeId, req);
    if (!office) return res.status(403).json({ success: false, message: 'Not authorised to delete this category.' });

    const inUse = await GovernanceComplaint.countDocuments({ categoryId: category._id });
    if (inUse > 0) {
      return res.status(409).json({ success: false, message: `This category is used by ${inUse} complaint(s). Deactivate it instead.` });
    }
    await category.deleteOne();
    res.json({ success: true, message: 'Complaint category deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Governance Officers (User management) ─────────────────────────────────────

// Roles managed inside this module. GOVERNANCE_OFFICER handles complaints for a
// single office; OFFICE_SUPERVISOR oversees the same office (same scope, same
// dashboard) and is provisioned by the Subcity Admin too.
const GOVERNANCE_STAFF_ROLES = ['GOVERNANCE_OFFICER', 'OFFICE_SUPERVISOR'];

// GET /api/governance-management/officers
const getOfficers = async (req, res) => {
  try {
    const filter = { role: { $in: GOVERNANCE_STAFF_ROLES } };
    if (!isAdmin(req.user)) {
      const sub = await resolveScopeSubcity(req.user);
      if (!sub) return res.status(403).json({ success: false, message: 'No subcity is assigned to your account.' });
      filter.subcity = ciRegex(sub);
    } else if (req.query.subcity) {
      filter.subcity = ciRegex(req.query.subcity);
    }
    if (req.query.role) filter.role = req.query.role;

    const officers = await User.find(filter)
      .populate('governmentOfficeId', 'name subcity')
      .select('-password -resetPasswordToken -resetPasswordExpire')
      .sort({ createdAt: -1 })
      .lean();

    res.json({ success: true, data: { officers } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const PHONE_RE = /^(\+?251|0)?9\d{8}$/;

// POST /api/governance-management/officers
// POST /api/governance-users
// Simplified payload: { fullName, email, password, phoneNumber, subcityId,
// governmentOfficeId, role, status }. The office must belong to the selected
// subcity — enforced on the server so no cross-subcity offices can be assigned.
const createOfficer = async (req, res) => {
  try {
    if (isAdmin(req.user)) return res.status(403).json({ success: false, message: 'System admins cannot create governance officers.' });
    const fullName = String(req.body.fullName || '').trim();
    const email = String(req.body.email || '').toLowerCase().trim();
    const phone = String(req.body.phoneNumber ?? req.body.phone ?? '').replace(/\s+/g, '').trim();
    const password = String(req.body.password || '');
    const officeId = req.body.governmentOfficeId || req.body.officeId;
    const subcityId = req.body.subcityId;
    // The public role name is 'governance_officer' (lowercase); the internal
    // canonical value used across the dashboards is 'GOVERNANCE_OFFICER'.
    // The role is always set on the server — clients cannot pick another
    // staff role when creating an account through this single endpoint.
    const role = 'GOVERNANCE_OFFICER';

    if (!fullName) return res.status(400).json({ success: false, message: 'Full name is required.' });
    if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ success: false, message: 'A valid email is required.' });
    if (!password || password.length < 8) return res.status(400).json({ success: false, message: 'Password must be at least 8 characters.' });
    if (!phone) return res.status(400).json({ success: false, message: 'Phone number is required.' });
    if (!PHONE_RE.test(phone)) return res.status(400).json({ success: false, message: 'Enter a valid 09XXXXXXXX phone number.' });
    if (!officeId) return res.status(400).json({ success: false, message: 'Please select a government office.' });

    const office = await GovernmentOffice.findById(officeId).lean();
    if (!office) return res.status(404).json({ success: false, message: 'Selected government office does not exist.' });

    // Resolve the selected subcity and confirm the office belongs to it.
    let subcityRecord = null;
    if (subcityId) {
      subcityRecord = await Subcity.findById(subcityId).lean();
      if (!subcityRecord) return res.status(400).json({ success: false, message: 'Selected subcity does not exist.' });
      if (String(office.subcityId) !== String(subcityRecord._id)) {
        return res.status(400).json({ success: false, message: 'The selected office does not belong to the selected subcity.' });
      }
    } else {
      subcityRecord = { _id: office.subcityId, name: office.subcity };
    }

    if (!(await assertSubcityScope(req, subcityRecord.name))) {
      return res.status(403).json({ success: false, message: 'You may only create officers for offices in your own subcity.' });
    }

    const existingEmail = await User.findOne({ email: ciRegex(email) }).lean();
    if (existingEmail) return res.status(409).json({ success: false, message: 'An account with this email already exists.' });

    const status = String(req.body.status || 'active').toLowerCase();
    const officer = await User.create({
      fullName,
      email,
      phone,
      password,
      role,
      subcity: subcityRecord.name,
      subcityId: subcityRecord._id,
      governmentOfficeId: office._id,
      isActive: status === 'inactive' ? false : true,
      isApproved: true,
    });

    res.status(201).json({
      success: true,
      message: 'Governance officer created',
      data: {
        _id: officer._id,
        fullName: officer.fullName,
        email: officer.email,
        phoneNumber: officer.phone,
        phone: officer.phone,
        role: officer.role,
        subcity: officer.subcity,
        subcityId: officer.subcityId,
        governmentOfficeId: officer.governmentOfficeId,
        status: officer.isActive ? 'active' : 'inactive',
        isActive: officer.isActive,
        createdAt: officer.createdAt,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

const findScopedOfficer = async (req) => {
  const officer = await User.findById(req.params.id).select('-password');
  if (!officer) return null;
  if (!GOVERNANCE_STAFF_ROLES.includes(officer.role)) return null;
  if (isAdmin(req.user)) return officer;
  if (!(await assertSubcityScope(req, officer.subcity))) return null;
  return officer;
};

// PUT /api/governance-management/officers/:id
const updateOfficer = async (req, res) => {
  try {
    if (isAdmin(req.user)) return res.status(403).json({ success: false, message: 'System admins cannot edit governance officers.' });
    const officer = await findScopedOfficer(req);
    if (!officer) return res.status(404).json({ success: false, message: 'Officer not found or not in your scope.' });

    if (req.body.fullName !== undefined) {
      const fullName = String(req.body.fullName || '').trim();
      if (!fullName) return res.status(400).json({ success: false, message: 'Full name cannot be empty.' });
      officer.fullName = fullName;
    }
    if (req.body.email !== undefined) {
      const email = String(req.body.email || '').toLowerCase().trim();
      if (!email || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ success: false, message: 'A valid email is required.' });
      const dup = await User.findOne({ email: ciRegex(email), _id: { $ne: officer._id } }).lean();
      if (dup) return res.status(409).json({ success: false, message: 'An account with this email already exists.' });
      officer.email = email;
    }
    if (req.body.phone !== undefined || req.body.phoneNumber !== undefined) {
      const phone = String(req.body.phone ?? req.body.phoneNumber ?? '').replace(/\s+/g, '').trim();
      if (phone && !PHONE_RE.test(phone)) return res.status(400).json({ success: false, message: 'Enter a valid 09XXXXXXXX phone number.' });
      officer.phone = phone;
    }
    if (req.body.role !== undefined) {
      if (!GOVERNANCE_STAFF_ROLES.includes(req.body.role)) {
        return res.status(400).json({ success: false, message: 'Role must be Governance Officer or Office Supervisor.' });
      }
      officer.role = req.body.role;
    }
    // Accept either `status` ('active'|'inactive') or `isActive` (boolean).
    if (req.body.status !== undefined) {
      const status = String(req.body.status).toLowerCase();
      if (!['active', 'inactive'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Status must be active or inactive.' });
      }
      officer.isActive = status === 'active';
    } else if (req.body.isActive !== undefined) {
      officer.isActive = req.body.isActive === true || req.body.isActive === 'true';
    }
    if (req.body.officeId !== undefined) {
      const office = await GovernmentOffice.findById(req.body.officeId).lean();
      if (!office) return res.status(404).json({ success: false, message: 'Selected government office does not exist.' });
      if (!(await assertSubcityScope(req, office.subcity))) {
        return res.status(403).json({ success: false, message: 'You may only assign officers to offices in your own subcity.' });
      }
      officer.governmentOfficeId = office._id;
      officer.subcity = office.subcity;
      officer.subcityId = office.subcityId;
    }

    await officer.save();
    const fresh = await User.findById(officer._id)
      .populate('governmentOfficeId', 'name subcity')
      .select('-password -resetPasswordToken -resetPasswordExpire')
      .lean();
    res.json({ success: true, message: 'Governance officer updated', data: fresh });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// GET /api/governance-management/officers/:id
const getOfficer = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(String(req.params.id))) {
      return res.status(404).json({ success: false, message: 'Officer not found or not in your scope.' });
    }
    const officer = await User.findById(req.params.id)
      .populate('governmentOfficeId', 'name subcity')
      .select('-password -resetPasswordToken -resetPasswordExpire')
      .lean();
    if (!officer || !GOVERNANCE_STAFF_ROLES.includes(officer.role)) {
      return res.status(404).json({ success: false, message: 'Officer not found or not in your scope.' });
    }
    if (!isAdmin(req.user) && !(await assertSubcityScope(req, officer.subcity))) {
      return res.status(403).json({ success: false, message: 'You may only view officers in your own subcity.' });
    }
    res.json({ success: true, data: { officer } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/governance-management/officers/:id
const deleteOfficer = async (req, res) => {
  try {
    if (isAdmin(req.user)) return res.status(403).json({ success: false, message: 'System admins cannot delete governance officers.' });
    const officer = await findScopedOfficer(req);
    if (!officer) return res.status(404).json({ success: false, message: 'Officer not found or not in your scope.' });

    const assigned = await GovernanceComplaint.countDocuments({ assignedTo: officer._id });
    if (assigned > 0) {
      return res.status(409).json({
        success: false,
        message: `This officer is assigned to ${assigned} complaint(s). Deactivate the account instead to keep the audit trail.`,
      });
    }

    await officer.deleteOne();
    res.json({ success: true, message: 'Governance officer deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PATCH /api/governance-management/officers/:id/toggle
const toggleOfficer = async (req, res) => {
  try {
    if (isAdmin(req.user)) return res.status(403).json({ success: false, message: 'System admins cannot toggle governance officers.' });
    const officer = await findScopedOfficer(req);
    if (!officer) return res.status(404).json({ success: false, message: 'Officer not found or not in your scope.' });
    officer.isActive = !officer.isActive;
    await officer.save();
    res.json({ success: true, message: `Officer ${officer.isActive ? 'activated' : 'deactivated'}`, data: { _id: officer._id, isActive: officer.isActive } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// PUT /api/governance-management/officers/:id/reset-password
const resetOfficerPassword = async (req, res) => {
  try {
    if (isAdmin(req.user)) return res.status(403).json({ success: false, message: 'System admins cannot reset governance officer passwords.' });
    const officer = await findScopedOfficer(req);
    if (!officer) return res.status(404).json({ success: false, message: 'Officer not found or not in your scope.' });
    const password = String(req.body.password || '');
    if (!password || password.length < 8) {
      return res.status(400).json({ success: false, message: 'New password must be at least 8 characters.' });
    }
    officer.password = await hashPassword(password);
    await officer.save();
    res.json({ success: true, message: 'Password reset' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Summary for the management module ─────────────────────────────────────────

// GET /api/governance-management/summary
const getManagementSummary = async (req, res) => {
  try {
    const filter = {};
    if (!isAdmin(req.user)) {
      const sub = await resolveScopeSubcity(req.user);
      if (!sub) return res.status(403).json({ success: false, message: 'No subcity is assigned to your account.' });
      filter.subcity = ciRegex(sub);
    } else if (req.query.subcity) {
      filter.subcity = ciRegex(req.query.subcity);
    }

    const [offices, activeOffices, categories, activeCategories, officers, activeOfficers, complaints] = await Promise.all([
      GovernmentOffice.countDocuments(filter),
      GovernmentOffice.countDocuments({ ...filter, isActive: true }),
      ComplaintCategory.countDocuments(),
      ComplaintCategory.countDocuments({ isActive: true }),
      User.countDocuments({ role: { $in: GOVERNANCE_STAFF_ROLES }, ...filter }),
      User.countDocuments({ role: { $in: GOVERNANCE_STAFF_ROLES }, ...filter, isActive: true }),
      GovernanceComplaint.countDocuments(filter),
    ]);

    res.json({
      success: true,
      data: {
        offices,
        activeOffices,
        categories,
        activeCategories,
        officers,
        activeOfficers,
        complaints,
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// ── Auto-provisioning ─────────────────────────────────────────────────────────

// Default governance workspace created whenever a new subcity is added: a set
// of standard GovernmentOffices, each with ComplaintCategories. Idempotent for
// the given subcity (skips offices that already exist by name).
const DEFAULT_OFFICE_PLAN = [
  {
    name: 'General Governance',
    description: 'General service-delivery and conduct complaints across municipal services.',
    categories: [
      'Service Delivery Delay',
      'Staff Misconduct',
      'Unprofessional Conduct',
      'Request for Information',
    ],
  },
  {
    name: 'Corruption & Ethics',
    description: 'Corruption, bribery, fraud, and conflict-of-interest complaints.',
    categories: [
      'Corruption / Bribery',
      'Conflict of Interest',
      'Fraud',
      'Misuse of Office',
    ],
  },
  {
    name: 'Land & Housing',
    description: 'Land administration, registration, permits, and housing allocation complaints.',
    categories: [
      'Illegal Land Transfer',
      'Land Registration Delay',
      'Building Permit Issue',
      'Housing / Condominium Allocation',
    ],
  },
  {
    name: 'Trade & Market',
    description: 'Market licence, pricing, counterfeit-goods, and trade-practice complaints.',
    categories: [
      'Counterfeit Goods',
      'Price Gouging',
      'Market Licence Issue',
      'Faulty Weights & Measures',
    ],
  },
  {
    name: 'Transport & Traffic',
    description: 'Transport licensing, traffic enforcement, and public-transport complaints.',
    categories: [
      'Corrupt Traffic Officer',
      'Illegal Fares',
      'Licence Issue',
      'Traffic Signal / Road Issue',
    ],
  },
  {
    name: 'Revenue & Tax',
    description: 'Taxation, fees, and municipal revenue-office complaints.',
    categories: [
      'Illegal Taxation',
      'Tax Invoice Refusal',
      'Corrupt Tax Officer',
      'Fee Dispute',
    ],
  },
  {
    name: 'Construction & Permit',
    description: 'Construction permits, illegal construction, and contractor complaints.',
    categories: [
      'Permit Delay',
      'Illegal Construction',
      'Contractor Fraud',
      'Safety Violation',
    ],
  },
  {
    name: 'Education',
    description: 'School, teacher, and education-administration complaints.',
    categories: [
      'Teacher Absenteeism',
      'School Fee Issue',
      'Exam Irregularity',
      'Facility Neglect',
    ],
  },
  {
    name: 'Health',
    description: 'Health-facility, staff, and public-health complaints.',
    categories: [
      'Negligence',
      'Drug Supply Issue',
      'Facility Hygiene',
      'Billing Irregularity',
    ],
  },
  {
    name: 'Sanitation & Waste',
    description: 'Solid-waste collection, illegal dumping, and drainage complaints.',
    categories: [
      'Uncollected Waste',
      'Illegal Dumping',
      'Blocked Drainage',
      'Billing Irregularity',
    ],
  },
];

// Creates the default governance workspace for a Subcity record. Returns a
// summary of what was provisioned. Never throws — provisioning failures are
// logged and reported back so the caller can decide how to surface them.
const provisionGovernanceWorkspace = async (subcity) => {
  const result = { offices: 0, categories: 0, skippedOffices: 0, errors: [] };
  try {
    if (!subcity || !subcity._id || !subcity.name) {
      result.errors.push('No valid subcity record supplied.');
      return result;
    }
    const name = String(subcity.name).trim();
    let order = 0;
    for (const plan of DEFAULT_OFFICE_PLAN) {
      const existing = await GovernmentOffice.findOne({ subcityId: subcity._id, name: ciRegex(plan.name) }).lean();
      if (existing) {
        result.skippedOffices += 1;
        continue;
      }
      const office = await GovernmentOffice.create({
        name: plan.name,
        subcity: name,
        subcityId: subcity._id,
        description: plan.description,
        displayOrder: order,
        isActive: true,
      });
      result.offices += 1;
      order += 1;

      for (const categoryName of plan.categories) {
        const dup = await ComplaintCategory.findOne({ officeId: office._id, name: ciRegex(categoryName) }).lean();
        if (dup) continue;
        await ComplaintCategory.create({
          name: categoryName,
          officeId: office._id,
          description: '',
          displayOrder: 0,
          isActive: true,
        });
        result.categories += 1;
      }
    }
  } catch (err) {
    result.errors.push(err.message);
    console.error('[Governance] Provisioning failed for', subcity?.name, err);
  }
  return result;
};

// ── SLA Rules (category-based response deadlines) ─────────────────────────────

// Rules apply at two scopes:
//   global (subcityId null) — seeded defaults (corruption 3d, delay 7d,
//                             unprofessional conduct 5d, default 48h)
//   subcity (subcityId set) — overrides managed by that subcity's admin
// Both platform admins and subcity admins may manage SLA rules; subcity admins
// are restricted to their own subcity scope.

// GET /api/governance-management/sla-rules
const getSlaRules = async (req, res) => {
  try {
    const filter = {};
    if (!isAdmin(req.user)) {
      const sub = await resolveScopeSubcity(req.user);
      if (!sub) return res.status(403).json({ success: false, message: 'No subcity is assigned to your account.' });
      const subcity = await findSubcityRecord(sub);
      filter.$or = [{ subcityId: null }, subcity ? { subcityId: subcity._id } : { subcityId: { $exists: false } }];
    }
    const rules = await SlaRule.find(filter).sort({ key: 1 }).lean();
    res.json({ success: true, data: { rules } });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// POST /api/governance-management/sla-rules  (upsert by categoryName + scope)
const upsertSlaRule = async (req, res) => {
  try {
    const categoryName = String(req.body.categoryName || '').trim();
    if (!categoryName) return res.status(400).json({ success: false, message: 'A category name is required.' });
    const responseDays = Number(req.body.responseDays);
    if (!Number.isFinite(responseDays) || responseDays < 1 || responseDays > 365) {
      return res.status(400).json({ success: false, message: 'Response days must be a number between 1 and 365.' });
    }
    const description = String(req.body.description || '').trim();

    let subcityId = req.body.subcityId || null;
    if (req.body.scope === 'global' && isAdmin(req.user)) subcityId = null;
    if (!isAdmin(req.user)) {
      // Subcity admins may only maintain rules for their own subcity.
      const sub = await resolveScopeSubcity(req.user);
      if (!sub) return res.status(403).json({ success: false, message: 'No subcity is assigned to your account.' });
      if (req.body.scope === 'global') {
        return res.status(403).json({ success: false, message: 'Only system admins can edit global SLA rules.' });
      }
      const subcity = await findSubcityRecord(sub);
      if (!subcity) return res.status(400).json({ success: false, message: 'Your subcity record could not be found.' });
      subcityId = subcity._id;
    }
    if (subcityId) {
      const subcityExists = await Subcity.findById(subcityId).lean();
      if (!subcityExists) return res.status(400).json({ success: false, message: 'Selected subcity does not exist.' });
    }

    const key = categoryName.toLowerCase();
    const existing = await SlaRule.findOne({ key, subcityId: subcityId || null });
    let rule;
    if (existing) {
      existing.categoryName = categoryName;
      existing.responseDays = responseDays;
      existing.description = description;
      existing.isActive = req.body.isActive === false ? false : true;
      await existing.save();
      rule = existing;
    } else {
      rule = await SlaRule.create({ categoryName, key, subcityId: subcityId || null, responseDays, description, isActive: true });
    }
    res.json({ success: true, message: 'SLA rule saved', data: rule });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

// DELETE /api/governance-management/sla-rules/:id
const deleteSlaRule = async (req, res) => {
  try {
    const rule = await SlaRule.findById(req.params.id);
    if (!rule) return res.status(404).json({ success: false, message: 'SLA rule not found.' });
    if (!isAdmin(req.user)) {
      const sub = await resolveScopeSubcity(req.user);
      const subcity = sub ? await findSubcityRecord(sub) : null;
      const own = rule.subcityId && subcity && String(rule.subcityId) === String(subcity._id);
      if (!own) {
        return res.status(403).json({ success: false, message: 'You may only delete SLA rules that belong to your subcity.' });
      }
    }
    await rule.deleteOne();
    res.json({ success: true, message: 'SLA rule deleted' });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

module.exports = {
  GOVERNANCE_MANAGEMENT_ROLES,
  GOVERNANCE_READ_ROLES,
  GOVERNANCE_STAFF_ROLES,
  getOffices,
  getOffice,
  getOfficesBySubcityId,
  createOffice,
  updateOffice,
  toggleOffice,
  deleteOffice,
  getCategories,
  createCategory,
  updateCategory,
  toggleCategory,
  deleteCategory,
  getOfficers,
  getOfficer,
  createOfficer,
  updateOfficer,
  toggleOfficer,
  deleteOfficer,
  resetOfficerPassword,
  getSlaRules,
  upsertSlaRule,
  deleteSlaRule,
  getManagementSummary,
  resolveScopeSubcity,
  assertSubcityScope,
  provisionGovernanceWorkspace,
};
