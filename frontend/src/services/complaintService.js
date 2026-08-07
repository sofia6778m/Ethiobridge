import { getWithRetry } from '../utils/requestUtils';

/**
 * complaintService.js
 * ────────────────────
 * Single reusable complaint service for the citizen dashboard.
 *
 * It is the ONLY place that knows how to load a citizen's complaints and a
 * single complaint's details. The list merges the complaint collections the
 * citizen can own into one unified, newest-first result:
 *
 *   GET /api/infrastructure/my/reports  → InfrastructureReport  (reportId)
 *   GET /api/governance-complaints      → GovernanceComplaint   (trackingId)
 *
 * Both endpoints are DB-backed and server-scoped to the logged-in citizen
 * (submittedBy / reporter), so the merged list always reflects what the
 * database holds for the current user.
 *
 * Submission forms call `notifyComplaintsChanged()` after a successful create
 * so an open "My Complaints" page refetches and shows the new record
 * immediately — without a manual refresh.
 */

export const TYPE_LABELS = {
  infrastructure: 'Infrastructure',
  governance: 'Public Complaint',
};

export const TYPE_KEYS = {
  Infrastructure: 'infrastructure',
  infrastructure: 'infrastructure',
  'Public Complaint': 'governance',
  Public: 'governance',
  public: 'governance',
  Governance: 'governance',
  governance: 'governance',
};

const LIST_LIMIT = 100;
const LIST_TIMEOUT_MS = 15000;

// ── Normalizers: every record is shaped into one unified item ────────────────

const normalizeInfrastructure = (r) => {
  const assigned = typeof r.assignedTo === 'object' && r.assignedTo
    ? (r.assignedTo.fullName || r.assignedTo.organizationName || '')
    : (typeof r.assignedTo === 'string' ? r.assignedTo : '');
  return {
    key: `infrastructure-${r._id}`,
    typeKey: 'infrastructure',
    type: TYPE_LABELS.infrastructure,
    id: r._id,
    title: r.title || 'Untitled report',
    refId: r.reportId || r._id,
    description: r.description || '',
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt || r.createdAt,
    location: [r.region, r.subcity, r.woredaName].filter(Boolean).join(' / ') || '—',
    category: r.category || '—',
    office: r.department || '—',
    subcity: r.subcity || '—',
    woredaName: r.woredaName || '—',
    priority: r.severityLevel || '—',
    assignedTo: assigned || '—',
    raw: r,
  };
};

const normalizeGovernance = (c) => {
  const assigned = (typeof c.assignedTo === 'object' && c.assignedTo ? c.assignedTo.fullName : '')
    || c.assignedToOffice || '';
  return {
    key: `governance-${c._id}`,
    typeKey: 'governance',
    type: TYPE_LABELS.governance,
    id: c._id,
    title: [c.category, c.title].filter(Boolean).join(' — ') || 'Untitled complaint',
    refId: c.trackingId || c._id,
    description: c.description || '',
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt || c.createdAt,
    location: [c.subcity, c.woredaName, c.office].filter(Boolean).join(' / ') || '—',
    category: c.category || '—',
    office: c.office || '—',
    subcity: c.subcity || '—',
    woredaName: c.woredaName || '—',
    priority: c.urgencyLevel || c.priority || '—',
    assignedTo: assigned || '—',
    raw: c,
  };
};

// ── Timeline normalization ───────────────────────────────────────────────────

/**
 * Turns a raw per-type timeline into one unified shape consumed by
 * <ComplaintTimeline />. Handles both schemas:
 *   infrastructure → { action, description, note, previousStatus, newStatus,
 *                      performedByName, performedByRole, createdAt/updatedAt }
 *   governance     → { action, title, message, performedByRole,
 *                      performedByName, at }
 */
const TIMELINE_ACTIONS = {
  created: 'Submitted',
  officer_assigned: 'Officer assigned',
  technician_assigned: 'Technician assigned',
  accepted: 'Accepted',
  rejected: 'Rejected',
  closed: 'Closed',
  reopened: 'Reopened',
  escalated_to_subcity: 'Escalated to subcity',
  status_changed: 'Status updated',
  resolved: 'Resolved',
  resolved_by_subcity: 'Resolved by subcity',
  note_added: 'Note added',
  info_requested: 'More information requested',
  response_sent: 'Response sent',
  evidence_added: 'Evidence added',
  request_woreda: 'Woreda coordination requested',
  woreda_responded: 'Woreda responded',
  action_recorded: 'Administrative action recorded',
  document_uploaded: 'Official document uploaded',
  citizen_confirmed: 'Resolution confirmed',
  verified: 'Verified',
  comment_added: 'Comment added',
  media_uploaded: 'Media uploaded',
  feedback_added: 'Feedback added',
  work_started: 'Work started',
  work_completed: 'Work completed',
  forwarded_to_subcity: 'Forwarded to subcity',
  waiting_parts: 'Waiting for parts',
  citizen_replied: 'Citizen replied',
  feedback: 'Feedback added',
  submitted: 'Submitted',
  officer_response: 'Officer responded',
};

export const normalizeTimeline = (typeKey, raw) => {
  const timeline = Array.isArray(raw?.timeline) ? raw.timeline : [];
  return timeline
    .map((entry, i) => {
      const performedBy = typeof entry.performedBy === 'object' && entry.performedBy
        ? entry.performedBy : null;
      const at = entry.at || entry.createdAt || entry.updatedAt || raw.createdAt;
      return {
        id: entry._id || `${typeKey}-${raw._id}-${i}`,
        action: entry.action || 'status_changed',
        title: entry.title || entry.action || TIMELINE_ACTIONS[entry.action] || 'Status update',
        description: entry.message || entry.description || '',
        note: entry.note || '',
        previousStatus: entry.previousStatus || '',
        newStatus: entry.newStatus || '',
        performedByName: entry.performedByName || performedBy?.fullName || '',
        performedByRole: entry.performedByRole || performedBy?.role || '',
        at,
      };
    })
    .filter((e) => e.at)
    .sort((a, b) => new Date(a.at) - new Date(b.at));
};

const normalizeDetail = (typeKey, raw) => {
  const item = {
    infrastructure: normalizeInfrastructure,
    governance: normalizeGovernance,
  }[typeKey](raw);
  return {
    ...item,
    timeline: normalizeTimeline(typeKey, raw),
    raw,
  };
};

// ── List fetcher ─────────────────────────────────────────────────────────────

const extractList = (res, key) => {
  const body = res?.data;
  if (!body || typeof body !== 'object') return [];
  if (Array.isArray(body)) return body;
  if (Array.isArray(body[key])) return body[key];
  const nested = body.data;
  if (nested && typeof nested === 'object') {
    if (Array.isArray(nested)) return nested;
    if (Array.isArray(nested[key])) return nested[key];
    if (Array.isArray(nested.data?.[key])) return nested.data[key];
  }
  return [];
};

/**
 * Loads every complaint the logged-in citizen owns across all collections,
 * merged and sorted newest-first.
 * Returns { items, counts }.
 */
export const fetchMyComplaints = async ({ signal } = {}) => {
  const [infraRes, govRes] = await Promise.all([
    getWithRetry('/infrastructure/my/reports', {
      params: { page: 1, limit: LIST_LIMIT },
      signal,
      timeout: LIST_TIMEOUT_MS,
    }).catch(() => null),
    getWithRetry('/governance-complaints', {
      params: { page: 1, limit: LIST_LIMIT },
      signal,
      timeout: LIST_TIMEOUT_MS,
    }).catch(() => null),
  ]);

  const infra = extractList(infraRes, 'reports').map(normalizeInfrastructure);
  const gov = extractList(govRes, 'complaints').map(normalizeGovernance);

  const items = [...infra, ...gov].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );

  return {
    items,
    counts: {
      All: items.length,
      Infrastructure: infra.length,
      'Public Complaint': gov.length,
    },
  };
};

// ── Detail fetcher ───────────────────────────────────────────────────────────

const DETAIL_ROUTES = {
  infrastructure: '/infrastructure',
  governance: '/governance-complaints',
};

/**
 * Loads a single complaint's full record (including its complete timeline) by
 * type + id. Returns the same unified shape used by the list, plus `timeline`.
 *
 * Governance complaints are first fetched through the authenticated detail
 * route. When the logged-in citizen is NOT the reporter, that route responds
 * with 403, so we transparently fall back to the public detail endpoint —
 * which returns the same summary redacted for community viewing, with
 * `isOwner: false` so the UI can hide reporter-only actions.
 */
export const fetchComplaintDetail = async ({ typeKey, id, signal }) => {
  const route = DETAIL_ROUTES[typeKey];
  if (!route) {
    const err = new Error(`Unknown complaint type: ${typeKey}`);
    err.code = 'ERR_BAD_REQUEST';
    throw err;
  }
  const load = async (url) => {
    const res = await getWithRetry(url, { signal, timeout: LIST_TIMEOUT_MS });
    let raw;
    if (typeKey === 'infrastructure') raw = res?.data?.report;
    else raw = res?.data?.data?.complaint || res?.data?.data;
    return { ...normalizeDetail(typeKey, raw), isOwner: true };
  };
  try {
    return await load(`${route}/${id}`);
  } catch (err) {
    if (typeKey !== 'governance' || err?.response?.status !== 403) throw err;
    const item = await load(`/public/governance-complaints/${id}`);
    item.isOwner = false;
    return item;
  }
};

// ── Change notification (immediate refresh after a submission) ───────────────

const changeListeners = new Set();

/** Call after a citizen submits a new complaint/report so open lists refetch. */
export const notifyComplaintsChanged = () => {
  changeListeners.forEach((fn) => {
    try { fn(); } catch (err) { /* listener errors must never break submission */ }
  });
};

/** Subscribe to complaint changes. Returns an unsubscribe function. */
export const onComplaintsChanged = (fn) => {
  changeListeners.add(fn);
  return () => changeListeners.delete(fn);
};
