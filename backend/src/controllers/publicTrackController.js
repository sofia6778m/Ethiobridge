/**
 * publicTrackController.js
 * ──────────────────────────
 * POST /api/public-track — unauthenticated complaint tracking.
 *
 * A citizen looks up their own complaint using the tracking id + the phone
 * number they registered it with. The response is strictly redacted:
 *   • no reporter identity (name / phone / email),
 *   • no internal notes, audit trails, notification history or escalation
 *     internals — only what the reporter is entitled to see,
 *   • a generic 404 is returned whenever the tracking id OR phone does not
 *     match, so wrong phone numbers never reveal whether an id exists.
 */
const GovernanceComplaint = require('../models/GovernanceComplaint');
const MunicipalComplaint = require('../models/MunicipalComplaint');
const InfrastructureReport = require('../models/InfrastructureReport');

// Citizen-facing status vocabulary for public complaints (mirrors publicRoutes).
const PUBLIC_STATUS_ALIASES = {
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

const displayStatusFor = (record) => {
  if (record.status === 'Under Review' && (record.assignedTo || record.assignedToOffice)) return 'Assigned';
  return PUBLIC_STATUS_ALIASES[record.status] || record.status;
};

// Compare phone numbers leniently: strip everything that is not a digit, drop
// leading zeros, and drop the +251 country code when present (both the local
// 09xx and international +251 9xx forms should match the same record).
const normalizePhone = (phone) => {
  let digits = String(phone || '').replace(/\D/g, '').replace(/^0+/, '');
  if (digits.startsWith('251') && digits.length > 10) digits = digits.slice(3);
  return digits;
};

// ── Record lookup ─────────────────────────────────────────────────────────────

const resolveRecord = async (trackingId) => {
  const id = String(trackingId || '').trim().toUpperCase();

  if (id.startsWith('GOV-')) {
    const record = await GovernanceComplaint.findOne({ trackingId: id }).lean();
    return record ? { type: 'Public Complaint', record } : null;
  }
  if (id.startsWith('CMP-')) {
    const record = await MunicipalComplaint.findOne({ trackingId: id }).lean();
    return record ? { type: 'Municipal Complaint', record } : null;
  }
  if (id.startsWith('IR-')) {
    const record = await InfrastructureReport.findOne({ reportId: id }).lean();
    return record ? { type: 'Infrastructure Report', record } : null;
  }

  // Unknown prefix — search every trackable collection so a tracking id is
  // still resolved regardless of format.
  const [gov, mun, inf] = await Promise.all([
    GovernanceComplaint.findOne({ trackingId: id }).lean(),
    MunicipalComplaint.findOne({ trackingId: id }).lean(),
    InfrastructureReport.findOne({ reportId: id }).lean(),
  ]);
  if (gov) return { type: 'Public Complaint', record: gov };
  if (mun) return { type: 'Municipal Complaint', record: mun };
  if (inf) return { type: 'Infrastructure Report', record: inf };
  return null;
};

// ── Redacted history builders ─────────────────────────────────────────────────

const governanceHistory = (record) => {
  const timeline = (record.timeline || []).map((e) => ({
    date: e.at,
    title: e.title || e.action,
    message: e.message || '',
    byName: e.performedByName || '',
    role: e.performedByRole || '',
  }));
  const responses = (record.officerResponses || []).map((r) => ({
    date: r.at,
    title: 'Officer Response',
    message: r.message,
    byName: r.userName || '',
  }));
  return [...timeline, ...responses].sort((a, b) => new Date(a.date) - new Date(b.date));
};

const infrastructureHistory = (record) =>
  (record.timeline || []).map((e) => ({
    date: e.timestamp || e.createdAt,
    title: e.action,
    message: e.description || e.note || '',
    byName: e.performedByName || '',
    role: e.performedByRole || '',
  }));

const municipalHistory = (record) => {
  const audit = (record.auditTrail || []).map((e) => ({
    date: e.at,
    title: e.action,
    message: e.details || '',
    byName: e.userName || '',
    role: e.role || '',
  }));
  const responses = (record.responses || []).map((r) => ({
    date: r.at,
    title: 'Officer Response',
    message: r.message,
    byName: r.officerName || '',
  }));
  return [...audit, ...responses].sort((a, b) => new Date(a.date) - new Date(b.date));
};

const latestResponseFor = (record) => {
  if (record.officerResponses && record.officerResponses.length) {
    const last = record.officerResponses[record.officerResponses.length - 1];
    return { date: last.at, message: last.message, byName: last.userName || '' };
  }
  if (record.responses && record.responses.length) {
    const last = record.responses[record.responses.length - 1];
    return { date: last.at, message: last.message, byName: last.officerName || '' };
  }
  return null;
};

// ── Handler ───────────────────────────────────────────────────────────────────

const publicTrack = async (req, res) => {
  try {
    const { trackingId, phone } = req.body || {};

    if (!trackingId || !phone) {
      return res.status(400).json({ success: false, message: 'Tracking ID and phone number are required.' });
    }

    const resolved = await resolveRecord(trackingId);
    if (!resolved) {
      return res.status(404).json({ success: false, message: 'No record found for the provided tracking ID and phone number.' });
    }

    const { type, record } = resolved;
    const submittedPhone = normalizePhone(record.reporterPhone);
    const providedPhone = normalizePhone(phone);

    // Deliberately the same generic message as the not-found case — a wrong
    // phone number must never confirm that a tracking id exists.
    if (!submittedPhone || submittedPhone !== providedPhone) {
      return res.status(404).json({ success: false, message: 'No record found for the provided tracking ID and phone number.' });
    }

    const timeline = type === 'Public Complaint'
      ? governanceHistory(record)
      : type === 'Municipal Complaint'
        ? municipalHistory(record)
        : infrastructureHistory(record);

    const status = record.status || '';
    const displayStatus = type === 'Public Complaint' ? displayStatusFor(record) : status;

    res.json({
      success: true,
      data: {
        trackingId: record.trackingId || record.reportId,
        type,
        title: record.title || 'Untitled',
        status,
        displayStatus,
        subcity: record.subcity || '',
        woreda: record.woredaName || record.woreda || '',
        office: type === 'Public Complaint' ? record.office || '' : '',
        department: record.department || record.category || '',
        submittedDate: record.createdAt,
        lastUpdated: record.updatedAt || record.createdAt,
        latestResponse: latestResponseFor(record),
        timeline,
      },
    });
  } catch (error) {
    console.error('[PublicTrack] error:', error.message);
    res.status(500).json({ success: false, message: 'Unable to process the tracking request.' });
  }
};

module.exports = { publicTrack, normalizePhone, resolveRecord };
