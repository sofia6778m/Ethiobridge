const mongoose = require('mongoose');
const Subcity = require('../models/Subcity');
const Woreda = require('../models/Woreda');
const Department = require('../models/Department');
const IssueType = require('../models/IssueType');

// Case-insensitive regex that tolerates underscore/space spelling differences
// (e.g. "LEMMI_KURA" matches "Lemmi Kura", "lemmi_kura", "Lemmi_Kura").
const subcityRegex = (subcity) => {
  const canonical = String(subcity || '').trim().toUpperCase().replace(/\s+/g, '_');
  const pattern = canonical.replace(/[ _]+/g, '[ _]');
  return new RegExp(`^${pattern}$`, 'i');
};

// Escapes regex metacharacters so user-provided names can be matched literally.
const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Resolves a subcity by Mongo id OR by name (case/underscore tolerant). Used so
// the dropdown endpoints work for callers that only carry the subcity name.
const resolveSubcity = async (subcityId, subcityName) => {
  if (subcityId && mongoose.Types.ObjectId.isValid(String(subcityId))) {
    const sc = await Subcity.findById(subcityId).lean();
    if (sc) return sc;
  }
  if (subcityName) {
    const name = String(subcityName).trim();
    if (!name) return null;
    const sc = await Subcity.findOne({
      $or: [
        { nameLower: name.toLowerCase().trim() },
        { name: subcityRegex(name) },
      ],
    }).lean();
    if (sc) return sc;
  }
  return null;
};

// @desc  Active subcity list for dependent dropdowns
// @route GET /api/subcities
// @access Public
const getSubcities = async (req, res) => {
  try {
    const subcities = await Subcity.find({ status: 'Active' })
      .select('_id name description')
      .sort({ name: 1 })
      .lean();
    res.json({ success: true, data: subcities });
  } catch (error) {
    console.error('[Dropdown] getSubcities error:', error);
    res.status(500).json({ success: false, message: 'Unable to load subcities' });
  }
};

// @desc  Woredas for a subcity (drives the woreda dropdown)
// @route GET /api/woredas?subcityId=<id>   (also accepts ?subcity=<name>)
// @access Public
// When neither id nor name is supplied the request falls through to the
// admin-protected woreda routes mounted at the same prefix.
const getWoredas = async (req, res, next) => {
  try {
    const { subcityId, subcity } = req.query;
    if (!subcityId && !subcity) return next();

    const sc = await resolveSubcity(subcityId, subcity);
    if (!sc) return res.status(404).json({ success: false, message: 'Subcity not found' });

    // Match both new woreda docs (subcityId set) and legacy docs (only the
    // subcity name field) so no woreda is hidden from the dropdown.
    const woredas = await Woreda.find({
      status: 'Active',
      $or: [
        { subcityId: sc._id },
        { subcity: subcityRegex(sc.name) },
      ],
    }).select('_id name code departments').sort({ name: 1 }).lean();

    res.json({ success: true, data: woredas });
  } catch (error) {
    console.error('[Dropdown] getWoredas error:', error);
    res.status(500).json({ success: false, message: 'Unable to load woredas' });
  }
};

// @desc  Departments for a woreda (drives the department dropdown)
// @route GET /api/departments?woredaId=<id>   (also accepts ?subcityId=<id>)
// @access Public
// When no id is supplied the request falls through to the admin-protected
// department routes mounted at the same prefix.
const getDepartments = async (req, res, next) => {
  try {
    const { woredaId, subcityId } = req.query;
    if (!woredaId && !subcityId) return next();

    if (woredaId) {
      const woreda = await Woreda.findById(woredaId).lean();
      if (!woreda) return res.status(404).json({ success: false, message: 'Woreda not found' });

      const deptDocs = await Department.find({ woredaId: woreda._id, status: 'Active' })
        .select('_id name')
        .sort({ name: 1 })
        .lean();
      if (deptDocs.length) return res.json({ success: true, data: deptDocs });

      // Legacy woredas only carry a static departments string array.
      const names = Array.isArray(woreda.departments) ? woreda.departments : [];
      return res.json({ success: true, data: names.map((n) => ({ name: n })) });
    }

    if (subcityId) {
      const sc = await Subcity.findById(subcityId).lean();
      if (!sc) return res.status(404).json({ success: false, message: 'Subcity not found' });
      const deptDocs = await Department.find({ subcityId: sc._id, status: 'Active' })
        .select('_id name')
        .sort({ name: 1 })
        .lean();
      return res.json({ success: true, data: deptDocs });
    }

    return res.status(400).json({ success: false, message: 'A woredaId query parameter is required' });
  } catch (error) {
    console.error('[Dropdown] getDepartments error:', error);
    res.status(500).json({ success: false, message: 'Unable to load departments' });
  }
};

// @desc  Active issue types for a subcity (drives the issue-type dropdown)
// @route GET /api/public-issues?subcityId=<id>   (optional ?department=<name>)
// @access Public
const getPublicIssues = async (req, res) => {
  try {
    const { subcityId, department } = req.query;
    if (!subcityId) {
      return res.status(400).json({ success: false, message: 'A subcityId query parameter is required' });
    }
    const sc = await Subcity.findById(subcityId).lean();
    if (!sc) return res.status(404).json({ success: false, message: 'Subcity not found' });

    const filter = { isActive: true, subcity: subcityRegex(sc.name) };
    if (department) {
      const name = String(department).trim();
      filter.department = { $regex: `^${escapeRegex(name)}$`, $options: 'i' };
    }

    const issues = await IssueType.find(filter).sort({ department: 1, name: 1 }).lean();
    res.json({ success: true, data: issues });
  } catch (error) {
    console.error('[Dropdown] getPublicIssues error:', error);
    res.status(500).json({ success: false, message: 'Unable to load issue types' });
  }
};

module.exports = { getSubcities, getWoredas, getDepartments, getPublicIssues };
