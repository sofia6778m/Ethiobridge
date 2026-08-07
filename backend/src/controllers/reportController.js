/**
 * reportController.js
 * ────────────────────
 * Unified public submission endpoints that guarantee each report is stored
 * under the correct collection with the correct report_type, regardless of
 * whether the submitter is logged in:
 *
 *   POST /api/reports/infrastructure   → InfrastructureReport (report_type='infrastructure')
 *
 * Accepts anonymous submissions (optional auth). A logged-in citizen is
 * linked to the report via citizen_id / submittedBy, but authentication status
 * never changes the report_type or the destination collection.
 */
const User = require('../models/User');
const Woreda = require('../models/Woreda');
const Department = require('../models/Department');
const createNotification = require('../utils/createNotification');
const { createInfrastructureReport } = require('../utils/reportIdGenerator');
const { resolveDepartment } = require('../config/departmentRouting');
const { normalizeDepartmentName } = require('../utils/departmentNames');
const { findDepartmentRecipients } = require('../utils/departmentRecipients');

const getIo = (req) => (req.app?.get && req.app.get('io')) || null;

// Derives the classic infrastructure category from the chosen department so
// existing stats / filters keep working; anything unknown falls back to 'other'.
const CATEGORY_BY_DEPT = {
  Electricity: 'electricity_issue',
  Road:        'road_issue',
  Water:       'water_supply_issue',
};

const CATEGORY_ORG_MAP = {
  'road_issue':         resolveDepartment('infrastructure', 'road_issue'),
  'electricity_issue':  resolveDepartment('infrastructure', 'electricity_issue'),
  'water_supply_issue': resolveDepartment('infrastructure', 'water_supply_issue'),
};

const escapeRegex = (s) => String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Normalises any subcity label into the canonical scope keys used by the
// role-based dashboard filters (e.g. "Lemmi Kura" → "LEMMI_KURA").
const canonicalSubcity = (raw) =>
  String(raw || '').trim().toUpperCase().replace(/\s+/g, '_');

const subcityRegex = (subcity) =>
  new RegExp(`^${canonicalSubcity(subcity).replace(/[ _]+/g, '[ _]')}$`, 'i');

const findWoreda = async (woredaId, woredaName, subcity) => {
  if (woredaId) {
    return Woreda.findById(woredaId).select('_id name subcity subcityId departments');
  }
  if (woredaName) {
    const nameRe = new RegExp(`^${escapeRegex(String(woredaName).trim())}$`, 'i');
    const filter = { name: nameRe };
    if (subcity) filter.subcity = subcityRegex(subcity);
    return Woreda.findOne(filter).select('_id name subcity subcityId departments');
  }
  return null;
};

// Resolves the live Department record for an infrastructure report so role
// scoping (e.g. the department_officer role) can match on departmentId. Prefers
// the woreda-level record, then falls back to the subcity-level record with the
// same name.
const findDepartmentRef = async (woredaDoc, deptName) => {
  if (!deptName || !woredaDoc || !woredaDoc.subcityId) return null;
  const nameRe = new RegExp(`^${escapeRegex(normalizeDepartmentName(deptName))}$`, 'i');
  const base = { status: 'Active', subcityId: woredaDoc.subcityId, $or: [{ normalizedDepartmentName: nameRe }, { name: nameRe }] };
  let department = await Department.findOne({ ...base, woredaId: woredaDoc._id }).select('_id').lean();
  if (!department) {
    department = await Department.findOne({ ...base, woredaId: null }).select('_id').lean();
  }
  return department;
};

// @desc  Submit an infrastructure report (anonymous allowed)
// @route POST /api/reports/infrastructure
// @access Public (optional auth)
const createInfrastructure = async (req, res) => {
  try {
    const {
      title, description, category, severityLevel, region, zone, woreda,
      kebele, city, subcity, woredaId, woredaName, department,
      specificLocation, latitude, longitude, address, incidentDate,
      reporterName, reporterPhone, reporterEmail,
    } = req.body;

    if (!title || !description || !region) {
      return res.status(400).json({
        success: false,
        message: 'Title, description, and region are required.',
      });
    }

    const isAnonymous = !req.user;

    // ── Routing scope resolution ────────────────────────────────────────────
    const normalizedSubcity = subcity ? canonicalSubcity(subcity) : '';
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

    // Normalise the department against the woreda's own department list (the
    // same source used when provisioning department accounts).
    let dept = String(department || '').trim();
    if (woredaDoc && Array.isArray(woredaDoc.departments) && woredaDoc.departments.length) {
      const wanted = dept.toLowerCase();
      const match = woredaDoc.departments.find((d) => String(d).toLowerCase() === wanted);
      if (match) dept = match;
    }

    const deptName = dept || CATEGORY_ORG_MAP[category] || 'General Services';
    const reportCategory = category
      || CATEGORY_BY_DEPT[deptName]
      || {
        Electricity: 'electricity_issue',
        Road:        'road_issue',
        Water:       'water_supply_issue',
      }[deptName]
      || 'other';

    // Live subcity/department references so dashboards and role scoping can
    // match on ObjectIds (mirrors the public-complaint submission flow).
    const departmentRef = await findDepartmentRef(woredaDoc, deptName);
    const subcityId = woredaDoc ? woredaDoc.subcityId || undefined : undefined;
    const departmentId = departmentRef ? departmentRef._id : undefined;

    const photos = (req.files || []).filter((f) => f.mimetype.startsWith('image/')).map((f) => f.path);
    const videos = (req.files || []).filter((f) => f.mimetype.startsWith('video/')).map((f) => f.path);

    const citizenId = req.user?._id || null;

    // reportId is assigned atomically by the counters collection.
    const report = await createInfrastructureReport({
      report_type: 'infrastructure',
      title, description,
      category: reportCategory,
      severityLevel: severityLevel || 'Medium',
      region, zone, woreda, kebele, city,
      subcity: normalizedSubcity || subcity || undefined,
      specificLocation, address,
      latitude: latitude ? Number(latitude) : undefined,
      longitude: longitude ? Number(longitude) : undefined,
      incidentDate: incidentDate ? new Date(incidentDate) : undefined,
      photos, videos,
      submittedBy: citizenId,
      citizen_id: citizenId,
      reporterName: reporterName || (isAnonymous ? '' : req.user.fullName || ''),
      reporterEmail: reporterEmail || (isAnonymous ? '' : req.user.email || ''),
      reporterPhone: reporterPhone || (isAnonymous ? '' : req.user.phone || ''),
      woredaId: woredaDoc ? woredaDoc._id : undefined,
      woredaName: woredaDoc ? woredaDoc.name : (woredaName || ''),
      subcityId,
      departmentId,
      department: deptName,
      autoAssignedOrganization: deptName,
      currentLevel: 'kebele',
      status: 'Submitted',
      timeline: [{
        action: 'created',
        description: `Report "${title}" submitted and routed to ${deptName}`,
        performedBy: citizenId || undefined,
        performedByName: isAnonymous ? '' : (req.user.fullName || ''),
        performedByRole: isAnonymous ? 'public' : req.user.role,
      }],
    });

    await report.save();

    const io = getIo(req);

    // Notify the department account(s) matching this exact woreda + department —
    // this is what makes the report appear on the department dashboard. Both the
    // legacy `department` role and the canonical `department_officer` role are
    // notified, matching on departmentId (when present) or the department name
    // case-insensitively so casing differences never drop a recipient.
    if (woredaDoc && deptName) {
      const deptUsers = await findDepartmentRecipients({ woredaId: woredaDoc._id, department: deptName, departmentId: report.departmentId });
      for (const u of deptUsers) {
        await createNotification({
          recipient: u._id,
          actorId: req.user._id,
          title: 'New Infrastructure Report for Your Department',
          message: `New ${deptName} report: "${title}"`,
          type: 'new_report',
          relatedReport: report._id,
          relatedReportType: 'infrastructure',
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
          actorId: req.user._id,
          title: 'New Infrastructure Report in Your Woreda',
          message: `New ${deptName} report: "${title}"`,
          type: 'new_report',
          relatedReport: report._id,
          relatedReportType: 'infrastructure',
          io,
        });
      }
    }

    // Notify admins.
    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const admin of admins) {
      await createNotification({
        recipient: admin._id,
        actorId: req.user._id,
        title: 'New Infrastructure Report',
        message: `New report "${title}" (${reportCategory}) submitted from ${region}.`,
        type: 'new_report',
        relatedReport: report._id,
        relatedReportType: 'infrastructure',
        io,
      });
    }

    if (io) io.emit('report:created', { reportId: report.reportId, title: report.title, category: report.category, region: report.region, status: report.status });

    res.status(201).json({
      success: true,
      message: 'Infrastructure report submitted successfully',
      data: {
        reportId: report.reportId,
        report: {
          _id: report._id,
          reportId: report.reportId,
          report_type: report.report_type,
          title: report.title,
          status: report.status,
          department: report.department,
        },
      },
    });
  } catch (error) {
    console.error('[Report] Create infrastructure error:', error);
    res.status(500).json({ success: false, message: 'Failed to submit infrastructure report' });
  }
};

module.exports = {
  createInfrastructure,
};
