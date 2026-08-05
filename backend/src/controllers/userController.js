const User = require('../models/User');
const PublicComplaint = require('../models/PublicComplaint');
const { normalizeDepartmentName } = require('../utils/departmentNames');

// ── Strict role allow-lists ───────────────────────────────────────────────────
// These lists are the ONLY source of truth for who may appear in each assignment
// dropdown. No admin / manager / citizen / head roles are ever returned.
const OFFICER_ROLES = ['OFFICER'];
const TECHNICIAN_ROLES = ['TECHNICIAN', 'CONTRACTOR'];

const SELECT_FIELDS =
  '_id fullName email phone role department departmentId subcity subcityId woredaId woredaName';

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Builds the location part of the user query so only users covering the
// complaint's own department / subcity / woreda are returned.
//
// Matching rules (mirrors the officer/technician provisioning rules):
//   • woreda      — match the complaint's woredaId when present; also accept a
//                   legacy account that predates woredaId but whose stored
//                   woredaName equals the complaint's (name-only fallback).
//   • subcity     — prefer the live Subcity id resolved from complaint.subcity;
//                   fall back to the stored name string for legacy accounts.
//   • department  — prefer complaint.departmentId (resolved against the live
//                   Department collection, subcity-scoped first, then
//                   woreda-scoped); fall back to the complaint.department name
//                   matched case-insensitively.
// Every clause must hold at once. Returns null when the complaint is missing.
const buildComplaintFilter = async (complaintId) => {
  const complaint = await PublicComplaint.findById(complaintId)
    .select('department subcity subcityId woredaId woredaName departmentId')
    .lean();
  if (!complaint) return null;

  const clauses = [];

  // Woreda — by live id; legacy accounts without a woredaId are still matched
  // through their stored woredaName (woreda names repeat across subcities, so
  // the name fallback is restricted to accounts that carry no woredaId at all).
  const woredaAlternatives = [];
  if (complaint.woredaId) woredaAlternatives.push({ woredaId: complaint.woredaId });
  if (complaint.woredaName) {
    woredaAlternatives.push({
      woredaId: null, // matches documents where woredaId is null or missing
      woredaName: { $regex: `^${escapeRegex(complaint.woredaName)}$`, $options: 'i' },
    });
  }
  if (woredaAlternatives.length) clauses.push({ $or: woredaAlternatives });

  // Subcity — by live id when available, otherwise by name (case-insensitive).
  const subcityAlternatives = [];
  let resolvedSubcityId = complaint.subcityId || null;
  if (complaint.subcityId) subcityAlternatives.push({ subcityId: complaint.subcityId });
  if (complaint.subcity) {
    const Subcity = require('../models/Subcity');
    const sc = await Subcity.findOne({
      nameLower: String(complaint.subcity).trim().toLowerCase(),
    }).select('_id').lean();
    if (sc) {
      resolvedSubcityId = sc._id;
      subcityAlternatives.push({ subcityId: sc._id });
    }
    subcityAlternatives.push({
      subcity: { $regex: `^${escapeRegex(complaint.subcity)}$`, $options: 'i' },
    });
  }
  if (subcityAlternatives.length) clauses.push({ $or: subcityAlternatives });

  // Department — by live id when available, otherwise by name (case-insensitive).
  // Department records are stored per-subcity (subcityId) with an optional
  // woredaId; try the subcity scope first, then fall back to a woreda scope for
  // older records, so officers holding either departmentId resolve correctly.
  const deptAlternatives = [];
  if (complaint.departmentId) deptAlternatives.push({ departmentId: complaint.departmentId });
  if (complaint.department) {
    const Department = require('../models/Department');
    const normalized = normalizeDepartmentName(complaint.department);
    let dept = null;
    if (resolvedSubcityId) {
      dept = await Department.findOne({
        subcityId: resolvedSubcityId,
        normalizedDepartmentName: normalized,
      }).select('_id').lean();
    }
    if (!dept && complaint.woredaId) {
      dept = await Department.findOne({
        woredaId: complaint.woredaId,
        normalizedDepartmentName: normalized,
      }).select('_id').lean();
    }
    if (dept) deptAlternatives.push({ departmentId: dept._id });
    deptAlternatives.push({
      department: { $regex: `^${escapeRegex(complaint.department)}$`, $options: 'i' },
    });
  }
  if (deptAlternatives.length) clauses.push({ $or: deptAlternatives });

  return clauses.length ? { $and: clauses } : {};
};

// Merges an optional complaintId scope with explicit location query params.
const buildLocationFilter = async (req) => {
  const { complaintId, departmentId, subcityId, woredaId } = req.query;

  if (complaintId) {
    return await buildComplaintFilter(complaintId);
  }

  const filter = {};
  if (departmentId) filter.departmentId = departmentId;
  if (subcityId) filter.subcityId = subcityId;
  if (woredaId) filter.woredaId = woredaId;
  return filter;
};

const runList = async (req, res, roles, key) => {
  try {
    const locationFilter = await buildLocationFilter(req);
    if (locationFilter === null) {
      return res.status(404).json({ success: false, message: 'Complaint not found' });
    }

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
// @route GET /api/users/officers?complaintId=<id>
// @access Complaint managers
const getOfficers = (req, res) => runList(req, res, OFFICER_ROLES, 'officers');

// @desc  List users eligible to be assigned as a technician / contractor
// @route GET /api/users/technicians?complaintId=<id>
// @access Complaint managers
const getTechnicians = (req, res) => runList(req, res, TECHNICIAN_ROLES, 'technicians');

module.exports = {
  getOfficers,
  getTechnicians,
  buildComplaintFilter,
  OFFICER_ROLES,
  TECHNICIAN_ROLES,
};
