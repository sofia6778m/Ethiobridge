const User = require('../models/User');
const { normalizeDepartmentName } = require('../utils/departmentNames');

// ── Strict role allow-lists ───────────────────────────────────────────────────
// These lists are the ONLY source of truth for who may appear in each assignment
// dropdown. No admin / manager / citizen / head roles are ever returned.
const OFFICER_ROLES = ['OFFICER'];
const TECHNICIAN_ROLES = ['TECHNICIAN', 'CONTRACTOR'];

const SELECT_FIELDS =
  '_id fullName email phone role department departmentId subcity subcityId woredaId woredaName';

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Builds a location filter from explicit query params (subcityId / woredaId /
// departmentId). Used by the officer/technician assignment dropdowns.
const buildLocationFilter = async (req) => {
  const { departmentId, subcityId, woredaId } = req.query;

  const filter = {};
  if (departmentId) filter.departmentId = departmentId;
  if (subcityId) filter.subcityId = subcityId;
  if (woredaId) filter.woredaId = woredaId;
  return filter;
};

const runList = async (req, res, roles, key) => {
  try {
    const locationFilter = await buildLocationFilter(req);

    const users = await User.find({ role: { $in: roles }, isActive: true, ...locationFilter })
      .select(SELECT_FIELDS)
      .sort({ fullName: 1 })
      .lean();

    // Debugging aid — verify every returned user really has the allowed role.
    const summary = users.map((u) => ({ _id: u._id, fullName: u.fullName, role: u.role }));
    console.log(`[Users] ${key} API result (${users.length})`, summary);

    res.json({ success: true, data: { [key]: users } });
  } catch (err) {
    console.error(`[Users] ${key} error:`, err);
    res.status(500).json({ success: false, message: `Failed to load ${key.toLowerCase()}` });
  }
};

// @desc  List users eligible to be assigned as an officer
// @route GET /api/users/officers
// @access Complaint managers
const getOfficers = (req, res) => runList(req, res, OFFICER_ROLES, 'officers');

// @desc  List users eligible to be assigned as a technician / contractor
// @route GET /api/users/technicians
// @access Complaint managers
const getTechnicians = (req, res) => runList(req, res, TECHNICIAN_ROLES, 'technicians');

module.exports = {
  getOfficers,
  getTechnicians,
  OFFICER_ROLES,
  TECHNICIAN_ROLES,
};
