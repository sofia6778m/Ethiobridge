const mongoose = require('mongoose');
const PublicAlert = require('../models/PublicAlert');
const AlertDelivery = require('../models/AlertDelivery');
const AlertRecipient = require('../models/AlertRecipient');
const AlertRead = require('../models/AlertRead');
const AlertAnalytics = require('../models/AlertAnalytics');
const User = require('../models/User');
const Subcity = require('../models/Subcity');
const Woreda = require('../models/Woreda');
const AuditLog = require('../models/AuditLog');
const Notification = require('../models/Notification');
const createNotification = require('../utils/createNotification');
const { logAction } = require('../middleware/auditLog');
const { SUBCITY_ROLE_MAP } = require('../utils/scopeFilter');
const {
  CATEGORY_VALUES,
  SEVERITY_VALUES,
  ALERT_STATUSES,
  LIVE_STATUSES,
  safetyInstructionsFor,
  isCriticalSeverity,
} = require('../utils/alertMetadata');
const { validatePublishWindow, parseDate, MESSAGES: ALERT_DATE_MESSAGES } = require('../utils/alertDateUtils');
const PDFDocument = require('pdfkit');

const getIo = (req) => req.app?.get('io') || null;

// `published` and `active` are interchangeable "live" statuses. New alerts are
// always written as `published`; `active` remains for legacy rows.
const isLiveStatus = (s) => LIVE_STATUSES.includes(s);

// scope ('all' | 'subcity' | 'woreda') → scopeType ('city' | 'subcity' | 'woreda')
function mapScopeType(scope) {
  return { all: 'city', subcity: 'subcity', woreda: 'woreda' }[scope] || 'city';
}

// ── Scope helpers ────────────────────────────────────────────────────────────

const SUB_CITY_ADMIN_ROLES = ['subcity_admin', 'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'SUBCITY_HEAD', 'SUBCITY_ADMIN'];
const WOREDA_ADMIN_ROLES = ['woreda', 'woreda_admin', 'WOREDA_HEAD', 'department', 'DEPARTMENT_ADMIN'];
const ALERT_CREATOR_ROLES = ['admin', 'ADMIN', 'government', ...SUB_CITY_ADMIN_ROLES, ...WOREDA_ADMIN_ROLES];
const GLOBAL_ALERT_ROLES = ['admin', 'ADMIN', 'government'];

const esc = (s) => (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Malformed/stale ids arriving from the client must never throw a CastError
// (which would surface as a generic 500 "Failed to create alert"). Only keep
// values that are well-formed ObjectIds for $in lookups.
const isValidObjectId = (id) => mongoose.isValidObjectId(id);
const onlyValidIds = (ids) => (Array.isArray(ids) ? ids.filter(isValidObjectId) : []);

// Map a thrown error to a useful, human-readable response. Known mongoose
// errors become 400s with a `field`; everything else stays a 500 but includes
// the real cause in development builds so it is not hidden behind a generic
// "Failed to create alert".
function alertErrorResponse(res, err, verb) {
  // Custom validation errors thrown by targeting/scope checks carry an explicit
  // status + field so they map straight to a 4xx response instead of a 500.
  if (err && err.statusCode) {
    return res.status(err.statusCode).json({
      success: false,
      message: err.message,
      field: err.field || undefined,
    });
  }
  if (err && err.name === 'CastError') {
    return res.status(400).json({
      success: false,
      message: `Invalid identifier supplied while trying to ${verb} the alert. Please refresh and try again.`,
      field: err.path || undefined,
    });
  }
  if (err && err.name === 'ValidationError') {
    const first = Object.values(err.errors || {})[0];
    return res.status(400).json({
      success: false,
      message: first?.message || 'The alert data is invalid.',
      field: first?.path || undefined,
    });
  }
  if (process.env.NODE_ENV === 'production') {
    return res.status(500).json({ success: false, message: `Failed to ${verb} alert. Please try again.` });
  }
  return res.status(500).json({ success: false, message: `Failed to ${verb} alert: ${err?.message || err}` });
}

// Build a validation error that alertErrorResponse translates into a 4xx
// response carrying a `field` so the UI can highlight the offending control.
function httpError(statusCode, message, field) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.field = field;
  return err;
}

function isGlobalUser(user) {
  return user && GLOBAL_ALERT_ROLES.includes(user.role);
}

function isSubcityUser(user) {
  return (
    user &&
    (SUB_CITY_ADMIN_ROLES.includes(user.role) || (typeof user.role === 'string' && user.role.startsWith('subcity_')))
  );
}

function isWoredaUser(user) {
  return user && WOREDA_ADMIN_ROLES.includes(user.role);
}

function userSubcityName(user) {
  return user?.subcity || SUBCITY_ROLE_MAP[user?.role] || '';
}

// Management-list scope. Admins/government see everything; subcity admins see
// city-wide + their own subcity; woreda officers see city-wide + their woreda.
function buildAlertScope(user) {
  if (!user) return {};
  if (GLOBAL_ALERT_ROLES.includes(user.role)) return {};

  if (isSubcityUser(user)) {
    const name = user.subcity || SUBCITY_ROLE_MAP[user.role] || '';
    const $or = [
      { scope: 'all' },
      { targetType: 'city' },
      { scopeType: 'city' },
    ];
    if (name) {
      $or.push({ subcityName: { $regex: `^${esc(name)}$`, $options: 'i' } });
      $or.push({ subcityNames: { $regex: `^${esc(name)}$`, $options: 'i' } });
    }
    if (user.subcityId) {
      $or.push({ subcityId: user.subcityId });
      $or.push({ subcityIds: user.subcityId });
    }
    return { $or };
  }

  if (isWoredaUser(user)) {
    const $or = [
      { scope: 'all' },
      { targetType: 'city' },
      { scopeType: 'city' },
    ];
    if (user.woredaId) {
      $or.push({ woredaId: user.woredaId });
      $or.push({ woredaIds: user.woredaId });
    }
    if (user.woredaName) {
      $or.push({ woredaName: { $regex: `^${esc(user.woredaName)}$`, $options: 'i' } });
      $or.push({ woredaNames: { $regex: `^${esc(user.woredaName)}$`, $options: 'i' } });
    }
    return { $or };
  }

  return {};
}

function canManageAlert(user, alert) {
  if (!user || !alert) return false;
  if (isGlobalUser(user)) return true;

  if (isSubcityUser(user)) {
    const mine = userSubcityName(user);
    if (!mine && !user.subcityId) return false;
    if (alert.scope === 'all' || alert.targetType === 'city') return true;
    if (alert.subcityName && mine && alert.subcityName.toLowerCase() === mine.toLowerCase()) return true;
    if (Array.isArray(alert.subcityNames) && mine && alert.subcityNames.some((n) => n.toLowerCase() === mine.toLowerCase())) return true;
    if (user.subcityId && alert.subcityId && String(alert.subcityId) === String(user.subcityId)) return true;
    if (user.subcityId && Array.isArray(alert.subcityIds) && alert.subcityIds.some((id) => String(id) === String(user.subcityId))) return true;
    return false;
  }

  if (isWoredaUser(user)) {
    if (alert.scope === 'all' || alert.targetType === 'city') return true;
    if (user.woredaId && alert.woredaId && String(alert.woredaId) === String(user.woredaId)) return true;
    if (user.woredaId && Array.isArray(alert.woredaIds) && alert.woredaIds.some((id) => String(id) === String(user.woredaId))) return true;
    if (user.woredaName && alert.woredaName && alert.woredaName.toLowerCase() === user.woredaName.toLowerCase()) return true;
    if (user.woredaName && Array.isArray(alert.woredaNames) && alert.woredaNames.some((n) => n.toLowerCase() === user.woredaName.toLowerCase())) return true;
    if (user.subcity && alert.subcityName && alert.subcityName.toLowerCase() === user.subcity.toLowerCase()) return true;
    return false;
  }

  return false;
}

// STRICT modification scope for edit/delete. A city-wide alert is visible in a
// subcity/woreda admin's management list but it is NOT "in their assigned
// subcity/woreda", so they may never edit or delete it. Subcity admins may only
// modify alerts that specifically target their own subcity (and, for woreda
// officers, alerts that specifically target their own woreda).
function canModifyAlert(user, alert) {
  if (!user || !alert) return false;
  if (isGlobalUser(user)) return true;

  if (isSubcityUser(user)) {
    if (alert.scope === 'all' || alert.targetType === 'city') return false;
    const mine = userSubcityName(user);
    const mineId = user.subcityId ? String(user.subcityId) : null;
    const targetsMine =
      (Array.isArray(alert.subcityIds) && mineId && alert.subcityIds.some((id) => String(id) === mineId)) ||
      (Array.isArray(alert.subcityNames) && mine && alert.subcityNames.some((n) => n.toLowerCase() === mine.toLowerCase())) ||
      (alert.subcityId && mineId && String(alert.subcityId) === mineId) ||
      (alert.subcityName && mine && alert.subcityName.toLowerCase() === mine.toLowerCase());
    if (!targetsMine) return false;
    if (isWoredaUser(user)) {
      // Woreda officer: the alert must target their specific woreda too.
      const wName = (user.woredaName || '').toLowerCase();
      const wId = user.woredaId ? String(user.woredaId) : null;
      return Boolean(
        (Array.isArray(alert.woredaIds) && wId && alert.woredaIds.some((id) => String(id) === wId)) ||
        (Array.isArray(alert.woredaNames) && wName && alert.woredaNames.some((n) => n.toLowerCase() === wName)) ||
        (alert.woredaId && wId && String(alert.woredaId) === wId) ||
        (alert.woredaName && wName && alert.woredaName.toLowerCase() === wName)
      );
    }
    return true;
  }

  if (isWoredaUser(user)) {
    if (alert.scope === 'all' || alert.targetType === 'city') return false;
    const wName = (user.woredaName || '').toLowerCase();
    const wId = user.woredaId ? String(user.woredaId) : null;
    return Boolean(
      (Array.isArray(alert.woredaIds) && wId && alert.woredaIds.some((id) => String(id) === wId)) ||
      (Array.isArray(alert.woredaNames) && wName && alert.woredaNames.some((n) => n.toLowerCase() === wName)) ||
      (alert.woredaId && wId && String(alert.woredaId) === wId) ||
      (alert.woredaName && wName && alert.woredaName.toLowerCase() === wName)
    );
  }

  return false;
}

// Viewer-relative targeting label (scope isolation). A system-wide admin sees
// the full target list ("Bole, Yeka"); a subcity admin's dashboard shows only
// their own subcity ("Bole Subcity") and a woreda officer's dashboard only
// their woreda name — no matter how wide the alert's real audience is.
function viewerScopeLabel(user, alert) {
  if (!alert) return '';
  const cityWide = alert.scope === 'all' || alert.targetType === 'city' || alert.scopeType === 'city';
  if (cityWide) return 'Addis Ababa (city-wide)';
  if (isSubcityUser(user)) {
    const mine = userSubcityName(user);
    if (mine) return `${mine} Subcity`;
  } else if (isWoredaUser(user)) {
    if (user.woredaName) return user.woredaName;
  }
  return alert.targetLabel || '';
}

// Whether the current viewer created this alert (drives "Created by you" badges
// and the created-by-you-only edit/delete gate on locality dashboards).
function alertCreatedByMe(user, alert) {
  if (!user || !alert || !alert.createdBy) return false;
  return String(alert.createdBy) === String(user._id || user.id);
}

function toObjectWithScopeView(user, alert) {
  const obj = alert.toObject();
  obj.scopeLabel = viewerScopeLabel(user, alert);
  obj.createdByMe = alertCreatedByMe(user, alert);
  return obj;
}

const toArray = (v) => {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (v) return [v];
  return [];
};

function buildTargetLabel(targetType, subcityNames, woredaNames) {
  if (targetType === 'city' || (!subcityNames.length && !woredaNames.length)) return 'Addis Ababa (city-wide)';
  const subs = subcityNames.join(', ');
  if (woredaNames.length) return `${woredaNames.join(', ')} — ${subs}`;
  return subs;
}

// Resolve targeting from the request. Admin/government may pick any subcities
// (optionally woredas within them); a subcity admin is locked to their subcity
// and must pick at least one woreda; a woreda officer is locked to their
// subcity + woreda. Legacy single-target payloads (scope/subcityName/
// woredaName) are also accepted so pre-existing clients keep working.
// Validate that every requested woreda belongs to one of the allowed subcities
// (spec: "Woredas must belong to selected subcities"). Prevented clients from
// attaching a foreign woreda to an alert that targets a different subcity.
// Throws an httpError(400) describing the first offending woreda.
async function assertWoredasBelongToSubcities({ woredaIds, woredaNames, allowedSubcityIds, allowedSubcityNames }) {
  if ((!woredaIds || !woredaIds.length) && (!woredaNames || !woredaNames.length)) return;

  const idSet = new Set((allowedSubcityIds || []).map((id) => String(id)));
  const nameSet = new Set((allowedSubcityNames || []).map((n) => String(n).toLowerCase().trim()));

  // Resolve the woredas the caller actually selected. When ids are present they
  // are authoritative; name-only payloads are resolved by name so they can be
  // checked the same way.
  let docs = [];
  if (woredaIds && woredaIds.length) {
    docs = await Woreda.find({ _id: { $in: woredaIds } }).select('name subcity subcityId').lean();
    if (docs.length !== woredaIds.length) {
      throw httpError(400, 'One or more selected woredas no longer exist. Refresh and try again.', 'targeting');
    }
  } else {
    const names = woredaNames.map((n) => new RegExp(`^${esc(n)}$`, 'i'));
    docs = await Woreda.find({ name: { $in: names } }).select('name subcity subcityId').lean();
  }

  for (const w of docs) {
    const wSubcityId = w.subcityId ? String(w.subcityId) : null;
    const wSubcityName = String(w.subcity || '').toLowerCase().trim();
    const belongsById = wSubcityId && idSet.has(wSubcityId);
    const belongsByName = wSubcityName && nameSet.has(wSubcityName);
    if (!belongsById && !belongsByName) {
      throw httpError(
        400,
        `"${w.name}" is not in a targeted subcity — pick woredas only from the selected subcities.`,
        'targeting'
      );
    }
  }
}

async function resolveTargeting(user, body) {
  const fallback = (targetType, scope) => ({
    targetType,
    scope,
    scopeType: mapScopeType(scope),
    subcityIds: [],
    subcityNames: [],
    woredaIds: [],
    woredaNames: [],
    targetLabel: buildTargetLabel(targetType, [], []),
  });

  if (isGlobalUser(user)) {
    if (!body) return fallback('city', 'all');
    if (body.scope === 'all' && !toArray(body.subcityIds).length && !toArray(body.subcityNames).length && !body.subcityName) {
      return fallback('city', 'all');
    }

    let subcityIds = onlyValidIds(toArray(body.subcityIds));
    let subcityNames = toArray(body.subcityNames);
    let woredaIds = onlyValidIds(toArray(body.woredaIds));
    let woredaNames = toArray(body.woredaNames);

    // Legacy single-target payload.
    if (body.subcityId && !subcityIds.length) subcityIds = onlyValidIds([body.subcityId]);
    if (body.subcityName && !subcityIds.length && !subcityNames.length) subcityNames = [body.subcityName];
    if (body.woredaId && !woredaIds.length) woredaIds = onlyValidIds([body.woredaId]);
    if (body.woredaName && !woredaIds.length && !woredaNames.length) woredaNames = [body.woredaName];

    // Cross-resolve ids ↔ names where possible.
    if (subcityIds.length && !subcityNames.length) {
      const docs = await Subcity.find({ _id: { $in: subcityIds } }).select('name').lean();
      if (docs.length === subcityIds.length) subcityNames = docs.map((d) => d.name);
    } else if (subcityNames.length && !subcityIds.length) {
      const docs = await Subcity.find({ nameLower: { $in: subcityNames.map((n) => String(n).toLowerCase().trim()) } }).select('_id').lean();
      if (docs.length === subcityNames.length) subcityIds = docs.map((d) => d._id);
    }
    if (woredaIds.length && !woredaNames.length) {
      const docs = await Woreda.find({ _id: { $in: woredaIds } }).select('name').lean();
      if (docs.length === woredaIds.length) woredaNames = docs.map((d) => d.name);
    }

    // Woredas must belong to the selected subcities — a woreda from an
    // unselected subcity would mis-broadcast outside the intended audience.
    await assertWoredasBelongToSubcities({
      woredaIds,
      woredaNames,
      allowedSubcityIds: subcityIds,
      allowedSubcityNames: subcityNames,
    });

    const targetType = woredaIds.length || woredaNames.length ? 'woreda' : subcityIds.length || subcityNames.length ? 'subcity' : 'city';
    const scope = targetType === 'city' ? 'all' : targetType === 'woreda' ? 'woreda' : 'subcity';
    return {
      targetType,
      scope,
      scopeType: mapScopeType(scope),
      subcityIds,
      subcityNames,
      woredaIds,
      woredaNames,
      targetLabel: buildTargetLabel(targetType, subcityNames, woredaNames),
    };
  }

  if (isSubcityUser(user)) {
    const mine = userSubcityName(user);
    const subcityIds = user.subcityId ? [user.subcityId] : [];
    const subcityNames = mine ? [mine] : [];
    let woredaIds = onlyValidIds(toArray(body?.woredaIds));
    let woredaNames = toArray(body?.woredaNames);
    if (body?.woredaId && !woredaIds.length) woredaIds = onlyValidIds([body.woredaId]);
    if (body?.woredaName && !woredaIds.length && !woredaNames.length) woredaNames = [body.woredaName];
    if (woredaIds.length && !woredaNames.length) {
      const docs = await Woreda.find({ _id: { $in: woredaIds } }).select('name').lean();
      if (docs.length === woredaIds.length) woredaNames = docs.map((d) => d.name);
    }

    // A subcity admin may only target woredas inside their OWN subcity.
    await assertWoredasBelongToSubcities({
      woredaIds,
      woredaNames,
      allowedSubcityIds: subcityIds,
      allowedSubcityNames: subcityNames,
    });

    const targetType = woredaIds.length || woredaNames.length ? 'woreda' : 'subcity';
    const scope = targetType === 'woreda' ? 'woreda' : 'subcity';
    return {
      targetType,
      scope,
      scopeType: mapScopeType(scope),
      subcityIds,
      subcityNames,
      woredaIds,
      woredaNames,
      targetLabel: buildTargetLabel(targetType, subcityNames, woredaNames),
    };
  }

  if (isWoredaUser(user)) {
    return {
      targetType: 'woreda',
      scope: 'woreda',
      scopeType: 'woreda',
      subcityIds: user.subcityId ? [user.subcityId] : [],
      subcityNames: user.subcity ? [user.subcity] : [],
      woredaIds: user.woredaId ? [user.woredaId] : [],
      woredaNames: user.woredaName ? [user.woredaName] : [],
      targetLabel: buildTargetLabel('woreda', user.subcity ? [user.subcity] : [], user.woredaName ? [user.woredaName] : []),
    };
  }

  return fallback('city', 'all');
}

// ── Analytics helpers ────────────────────────────────────────────────────────

async function upsertAlertAnalytics(alertId, patch) {
  try {
    await AlertAnalytics.updateOne(
      { alert: alertId },
      { $setOnInsert: { alert: alertId }, $inc: patch },
      { upsert: true }
    );
  } catch (err) {
    console.error('[Alert] Analytics upsert error:', err.message);
  }
}

async function refreshClickThroughRate(alertId) {
  const a = await AlertAnalytics.findOne({ alert: alertId }).lean();
  if (!a) return;
  const ctr = a.dashboardViews > 0 ? Math.round((a.reads / a.dashboardViews) * 10000) / 100 : 0;
  await AlertAnalytics.updateOne({ alert: alertId }, { $set: { clickThroughRate: ctr } });
}

// ── Citizen visibility helpers ───────────────────────────────────────────────

// Mongo `$or` clauses for alerts a citizen should see, based on their saved
// location (subcity / woreda).
function citizenVisibilityQuery(user) {
  const clauses = [
    { targetType: 'city' },
    { scopeType: 'city' },
  ];
  if (user.subcity) {
    clauses.push({ subcityNames: { $regex: `^${esc(user.subcity)}$`, $options: 'i' } });
    clauses.push({ subcityName: { $regex: `^${esc(user.subcity)}$`, $options: 'i' } });
  }
  if (user.subcityId) {
    clauses.push({ subcityIds: user.subcityId });
    clauses.push({ subcityId: user.subcityId });
  }
  if (user.woredaName) {
    clauses.push({ woredaNames: { $regex: `^${esc(user.woredaName)}$`, $options: 'i' } });
    clauses.push({ woredaName: { $regex: `^${esc(user.woredaName)}$`, $options: 'i' } });
  }
  if (user.woredaId) {
    clauses.push({ woredaIds: user.woredaId });
    clauses.push({ woredaId: user.woredaId });
  }
  return { $or: clauses };
}

function isAlertVisibleToCitizen(alert, user) {
  if (!alert || !user) return false;
  if (alert.scope === 'all' || alert.targetType === 'city' || alert.scopeType === 'city') return true;
  const scName = (user.subcity || '').toLowerCase();
  const scId = user.subcityId ? String(user.subcityId) : null;
  const wName = (user.woredaName || '').toLowerCase();
  const wId = user.woredaId ? String(user.woredaId) : null;

  if ((alert.subcityIds || []).some((id) => scId && String(id) === scId)) return true;
  if ((alert.subcityNames || []).some((n) => scName && n.toLowerCase() === scName)) return true;
  if ((alert.woredaIds || []).some((id) => wId && String(id) === wId)) return true;
  if ((alert.woredaNames || []).some((n) => wName && n.toLowerCase() === wName)) return true;
  // Legacy singular fields.
  if (alert.subcityId && scId && String(alert.subcityId) === scId) return true;
  if (alert.subcityName && scName && alert.subcityName.toLowerCase() === scName) return true;
  if (alert.woredaId && wId && String(alert.woredaId) === wId) return true;
  if (alert.woredaName && wName && alert.woredaName.toLowerCase() === wName) return true;
  return false;
}

// ── Notification pipeline ────────────────────────────────────────────────────

// Mongo query for citizens located in the alert's targeted area. Shared by the
// initial broadcast (notifyCitizens) and the "alert updated" follow-up
// (notifyAlertUpdated) so the two never drift apart.
function buildCitizenTargetQuery(alert) {
  const userQuery = { role: { $in: ['citizen', 'CITIZEN'] } };
  const targetType = alert.targetType || (alert.scope === 'all' ? 'city' : alert.scope);
  const locClauses = [];
  if (targetType !== 'city' && alert.scope !== 'all') {
    if (Array.isArray(alert.subcityIds) && alert.subcityIds.length) locClauses.push({ subcityId: { $in: alert.subcityIds } });
    if (Array.isArray(alert.subcityNames) && alert.subcityNames.length) {
      locClauses.push({ subcity: { $in: alert.subcityNames.map((n) => new RegExp(`^${esc(n)}$`, 'i')) } });
    }
    if (Array.isArray(alert.woredaIds) && alert.woredaIds.length) locClauses.push({ woredaId: { $in: alert.woredaIds } });
    if (Array.isArray(alert.woredaNames) && alert.woredaNames.length) {
      locClauses.push({ woredaName: { $in: alert.woredaNames.map((n) => new RegExp(`^${esc(n)}$`, 'i')) } });
    }
    // Legacy singular fields.
    if (alert.subcityId) locClauses.push({ subcityId: alert.subcityId });
    if (alert.subcityName) locClauses.push({ subcity: { $regex: `^${esc(alert.subcityName)}$`, $options: 'i' } });
    if (alert.woredaId) locClauses.push({ woredaId: alert.woredaId });
    if (alert.woredaName) locClauses.push({ woredaName: { $regex: `^${esc(alert.woredaName)}$`, $options: 'i' } });
  }
  if (locClauses.length) userQuery.$or = locClauses;
  return userQuery;
}

// Deliver a newly-published alert to matching citizens. Critical/emergency
// alerts are ALWAYS delivered (all channels); other alerts respect each
// citizen's subscription preferences (master toggle + category filter).
// SMS/Email/Push are recorded as delivery rows (placeholders for real
// providers); the in-app channel creates a Notification so it appears in the
// bell immediately.
async function notifyCitizens(alert, io, actorId) {
  const userQuery = buildCitizenTargetQuery(alert);
  const isEmergency = isCriticalSeverity(alert.severity);

  const matches = [];
  const cursor = User.find(userQuery).select(
    '_id fullName email emailNotifications smsNotifications pushNotifications alertSubscriptions'
  ).cursor();

  for await (const user of cursor) {
    const sub = user.alertSubscriptions || {};
    if (!isEmergency && sub.enabled === false) continue;
    const cats = Array.isArray(sub.categories) ? sub.categories : [];
    // Category-based opt-out only applies to alerts carrying a known,
    // subscribable category. Free-text or empty categories have no predefined
    // value to match against, so they are delivered like an all-categories
    // alert instead of silently suppressing the notification.
    if (!isEmergency && cats.length > 0 && alert.category && CATEGORY_VALUES.includes(alert.category) && !cats.includes(alert.category)) continue;

    let channels;
    if (isEmergency) {
      channels = { inApp: true, email: true, sms: true, push: true };
    } else {
      const ch = sub.channels || {};
      channels = {
        inApp: ch.inApp !== false,
        email: !!(ch.email ?? user.emailNotifications ?? false),
        sms: !!(ch.sms ?? user.smsNotifications ?? false),
        push: !!(ch.push ?? user.pushNotifications ?? false),
      };
    }

    const activeChannels = [];
    if (channels.inApp) activeChannels.push('inApp');
    if (channels.email) activeChannels.push('email');
    if (channels.sms) activeChannels.push('sms');
    if (channels.push) activeChannels.push('push');

    matches.push({ user, activeChannels });
  }

  const deliveryOps = [];
  const recipientOps = [];
  const notifPromises = [];
  let inAppCount = 0;
  let emailCount = 0;
  let smsCount = 0;
  let pushCount = 0;

  for (const { user, activeChannels } of matches) {
    const row = {
      channels: activeChannels,
      status: 'delivered',
      deliveredAt: new Date(),
    };
    deliveryOps.push({
      updateOne: {
        filter: { alert: alert._id, user: user._id },
        update: { $setOnInsert: { alert: alert._id, user: user._id }, $set: row },
        upsert: true,
      },
    });
    recipientOps.push({
      updateOne: {
        filter: { alert: alert._id, user: user._id },
        update: {
          $setOnInsert: { alert: alert._id, user: user._id },
          $set: { ...row, smsSent: activeChannels.includes('sms'), emailSent: activeChannels.includes('email') },
        },
        upsert: true,
      },
    });

    for (const ch of activeChannels) {
      if (ch === 'inApp') inAppCount += 1;
      if (ch === 'email') emailCount += 1;
      if (ch === 'sms') smsCount += 1;
      if (ch === 'push') pushCount += 1;
    }

    if (activeChannels.includes('inApp')) {
      notifPromises.push(
        createNotification({
          recipient: user._id,
          actorId,
          title: `${isEmergency ? '🚨 ' : ''}${alert.title}`,
          message: `${severityLabel(alert.severity)} — ${alert.description.slice(0, 180)}`,
          type: isEmergency ? 'emergency_alert' : 'public_alert',
          alertId: alert._id,
          io,
        })
      );
    }
  }

  if (deliveryOps.length) {
    await AlertDelivery.bulkWrite(deliveryOps);
    await AlertRecipient.bulkWrite(recipientOps);
  }
  await Promise.all(notifPromises);

  const stats = {
    notifiedCitizens: matches.length,
    inApp: inAppCount,
    email: emailCount,
    sms: smsCount,
    push: pushCount,
  };
  if (matches.length > 0) {
    await PublicAlert.updateOne({ _id: alert._id }, { $set: { deliveryStats: stats } });
    await upsertAlertAnalytics(alert._id, {
      totalRecipients: matches.length,
      inAppDelivered: inAppCount,
      emailDelivered: emailCount,
      smsDelivered: smsCount,
    });
  }
  console.log(
    `[Alert] notifyCitizens → alert="${alert.title}" (id=${alert._id}, target=${alert.targetType || alert.scope}) notified ${matches.length} citizen(s) — inApp=${inAppCount}, email=${emailCount}, sms=${smsCount}, push=${pushCount}`
  );
  return stats;
}

// Follow-up in-app notification when a LIVE alert is edited. Uses the exact
// same audience as the original broadcast so "affected citizens" match, while
// respecting the same subscription rules. Unlike notifyCitizens it does NOT
// create delivery/recipient rows or bump deliveryStats — an edit is a
// correction, not a re-broadcast.
async function notifyAlertUpdated(alert, io, actorId) {
  const userQuery = buildCitizenTargetQuery(alert);
  const isEmergency = isCriticalSeverity(alert.severity);

  const notifPromises = [];
  let count = 0;

  const cursor = User.find(userQuery).select('_id alertSubscriptions').cursor();
  for await (const user of cursor) {
    if (String(user._id) === String(actorId)) continue;
    const sub = user.alertSubscriptions || {};
    if (!isEmergency && sub.enabled === false) continue;
    const ch = sub.channels || {};
    if (!isEmergency && ch.inApp === false) continue;
    const cats = Array.isArray(sub.categories) ? sub.categories : [];
    if (!isEmergency && cats.length > 0 && alert.category && CATEGORY_VALUES.includes(alert.category) && !cats.includes(alert.category)) continue;

    notifPromises.push(
      createNotification({
        recipient: user._id,
        actorId,
        title: `✏️ Updated: ${alert.title}`,
        message: `${severityLabel(alert.severity)} — ${alert.description.slice(0, 180)}`,
        type: 'public_alert',
        alertId: alert._id,
        io,
      })
    );
    count += 1;
  }

  await Promise.all(notifPromises);
  if (count > 0) {
    await upsertAlertAnalytics(alert._id, { updateNotifications: count });
  }
  console.log(`[Alert] notifyAlertUpdated → alert="${alert.title}" (id=${alert._id}) notified ${count} citizen(s)`);
  return count;
}

// In-app notification to the RESPONSIBLE OFFICES for an alert: the subcity
// admins of every targeted subcity and the woreda officers of every targeted
// woreda. City-wide alerts reach every subcity/woreda office. Best-effort —
// never fails the caller.
async function notifyOffices(alert, io, actorId) {
  try {
    const officeRoles = [...SUB_CITY_ADMIN_ROLES, ...WOREDA_ADMIN_ROLES];
    const roleClauses = [
      { role: { $in: officeRoles } },
      { role: { $regex: '^subcity_' } },
    ];
    const q = { $or: roleClauses };

    if (alert.scope !== 'all' && alert.targetType !== 'city') {
      const locClauses = [];
      if (Array.isArray(alert.subcityNames) && alert.subcityNames.length) {
        locClauses.push({ subcity: { $in: alert.subcityNames.map((n) => new RegExp(`^${esc(n)}$`, 'i')) } });
      }
      if (alert.subcityName) locClauses.push({ subcity: { $regex: `^${esc(alert.subcityName)}$`, $options: 'i' } });
      if (Array.isArray(alert.woredaNames) && alert.woredaNames.length) {
        locClauses.push({ woredaName: { $in: alert.woredaNames.map((n) => new RegExp(`^${esc(n)}$`, 'i')) } });
      }
      if (alert.woredaName) locClauses.push({ woredaName: { $regex: `^${esc(alert.woredaName)}$`, $options: 'i' } });
      // An office is responsible when its subcity OR its woreda is targeted.
      if (locClauses.length) q.$and = [{ $or: locClauses }];
    }

    const isEmergency = isCriticalSeverity(alert.severity);
    const notifPromises = [];
    let count = 0;

    const cursor = User.find(q).select('_id').cursor();
    for await (const user of cursor) {
      if (String(user._id) === String(actorId)) continue;
      notifPromises.push(
        createNotification({
          recipient: user._id,
          actorId,
          title: `${isEmergency ? '🚨 ' : '📢 '}Office: ${alert.title}`,
          message: `${severityLabel(alert.severity)} — target: ${alert.targetLabel || alert.targetType || 'city-wide'}`,
          type: isEmergency ? 'emergency_alert' : 'public_alert',
          alertId: alert._id,
          io,
        })
      );
      count += 1;
    }

    await Promise.all(notifPromises);
    console.log(`[Alert] notifyOffices → alert="${alert.title}" (id=${alert._id}) notified ${count} office account(s)`);
  } catch (err) {
    console.error(`[Alert] notifyOffices failed for "${alert.title}":`, err.message);
  }
}

function severityLabel(severity) {
  const map = { critical: 'Critical', high: 'High', medium: 'Medium', low: 'Low', information: 'Information', warning: 'Warning', emergency: 'Emergency' };
  return map[severity] || 'Information';
}

function emitAlert(req, event, payload) {
  const io = getIo(req);
  if (io) io.emit(event, payload);
}

function toSocketPayload(alert) {
  return {
    _id: alert._id,
    title: alert.title,
    category: alert.category,
    customCategory: alert.customCategory,
    severity: alert.severity,
    description: alert.description,
    targetType: alert.targetType,
    targetLabel: alert.targetLabel,
    subcityNames: alert.subcityNames || [],
    woredaNames: alert.woredaNames || [],
    scope: alert.scope,
    subcityName: alert.subcityName,
    woredaName: alert.woredaName,
    status: alert.status,
    isPublished: alert.isPublished,
    pinned: alert.pinned,
    publishedAt: alert.publishedAt,
    expiresAt: alert.expiresAt,
    attachments: alert.attachments || [],
    createdBy: alert.createdBy,
    createdByRole: alert.createdByRole,
    createdByName: alert.createdByName,
    createdByOrg: alert.createdByOrg,
    createdAt: alert.createdAt,
  };
}

function buildAttachments(req) {
  const fromFiles = (req.files || []).map((f) => ({
    url: f.path,
    publicId: f.filename,
    fileName: f.originalname || f.filename,
    mimeType: f.mimetype || '',
    size: f.size || 0,
  }));
  const fromBody = Array.isArray(req.body && req.body.attachments) ? req.body.attachments : [];
  return [...fromFiles, ...fromBody].slice(0, 3);
}

// @desc  Create an alert (draft / scheduled / published)
// @route POST /api/alerts
const createAlert = async (req, res) => {
  try {
    const user = req.user;
    if (!ALERT_CREATOR_ROLES.includes(user.role)) {
      return res.status(403).json({ success: false, message: 'You are not allowed to create alerts.' });
    }

    const {
      title, category, alertCategory, customCategory, severity, description,
      startAt, endAt, scheduledAt, expiresAt,
      emergencyContact, sourceAuthority, status: requestedStatus,
    } = req.body;

    // Category is OPTIONAL and free-text: null / "" / undefined are all valid
    // and stored as null; any non-empty string (e.g. "Flood Warning") is kept
    // verbatim. `alertCategory` is the canonical form-field name; the legacy
    // `category` field is still accepted so existing API callers keep working.
    const rawCategoryInput = alertCategory !== undefined ? alertCategory : category;
    const rawCategory = typeof rawCategoryInput === 'string' ? rawCategoryInput.trim() : rawCategoryInput;
    const normalizedCategory = rawCategory || null;

    if (!title || !title.trim() || title.trim().length > 200) {
      return res.status(400).json({ success: false, message: 'A title (max 200 chars) is required.' });
    }
    if (normalizedCategory && normalizedCategory.length > 120) {
      return res.status(400).json({ success: false, message: 'Category must be under 120 characters.' });
    }
    if (!SEVERITY_VALUES.includes(severity)) {
      return res.status(400).json({ success: false, message: 'A valid severity level is required.' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, message: 'A description is required.' });
    }

    const targeting = await resolveTargeting(user, req.body);

    // Role-based targeting guards.
    if (isGlobalUser(user) && targeting.targetType !== 'city' && targeting.subcityIds.length === 0 && targeting.subcityNames.length === 0) {
      return res.status(400).json({ success: false, message: 'Select at least one target subcity.' });
    }
    if (isSubcityUser(user) && !targeting.woredaIds.length && !targeting.woredaNames.length && !targeting.subcityNames.length && !targeting.subcityIds.length) {
      return res.status(400).json({
        success: false,
        message: 'Choose a target for this alert — your whole subcity or at least one woreda within it.',
        field: 'targeting',
      });
    }
    if (!isGlobalUser(user) && !isSubcityUser(user) && !isWoredaUser(user)) {
      return res.status(403).json({ success: false, message: 'Only city-wide, subcity or woreda administrators can create alerts.' });
    }

    const now = new Date();

    // Resolve the publish/expiry window using the shared validation utility so
    // the backend and the frontend enforce identical rules. Drafts bypass the
    // window checks (they may be saved without dates and completed later).
    let publishWindow = null;
    if (requestedStatus !== 'draft') {
      const startRaw = startAt !== undefined ? startAt : scheduledAt;
      const endRaw = endAt !== undefined ? endAt : expiresAt;
      publishWindow = validatePublishWindow({
        publishMode: req.body.publishMode,
        startAt: startRaw,
        endAt: endRaw,
        now,
      });
      if (publishWindow.errors.length) {
        const first = publishWindow.errors[0];
        return res.status(400).json({ success: false, message: first.message, field: first.field });
      }
    }

    const start = publishWindow ? publishWindow.start : parseDate(startAt ?? scheduledAt);
    const end = publishWindow ? publishWindow.end : parseDate(endAt ?? expiresAt);
    let status = requestedStatus === 'draft' ? 'draft' : publishWindow.mode === 'schedule' ? 'scheduled' : 'published';

    const alert = await PublicAlert.create({
      title: title.trim(),
      category: normalizedCategory,
      customCategory: normalizedCategory === 'other' ? customCategory.trim() : undefined,
      severity,
      description: description.trim(),
      safetyInstructions: safetyInstructionsFor(normalizedCategory),
      targetType: targeting.targetType,
      scope: targeting.scope,
      scopeType: targeting.scopeType,
      subcityIds: targeting.subcityIds,
      subcityNames: targeting.subcityNames,
      woredaIds: targeting.woredaIds,
      woredaNames: targeting.woredaNames,
      targetLabel: targeting.targetLabel,
      subcityId: targeting.subcityIds[0] || undefined,
      subcityName: targeting.subcityNames[0] || undefined,
      woredaId: targeting.woredaIds[0] || undefined,
      woredaName: targeting.woredaNames[0] || undefined,
      schedule: { startAt: start || undefined, endAt: end || undefined },
      emergencyContact: emergencyContact || undefined,
      sourceAuthority: sourceAuthority || undefined,
      attachments: buildAttachments(req),
      status,
      scheduledAt: start || undefined,
      publishedAt: status === 'published' ? now : undefined,
      expiresAt: end || undefined,
      pinned: isCriticalSeverity(severity),
      createdBy: user._id,
      createdByName: user.fullName || '',
      createdByRole: user.role,
      roleCreatedBy: user.role,
      createdByOrg: user.organizationName || '',
      source: 'manual',
      auditHistory: [{ action: status, userName: user.fullName || '', userRole: user.role, at: now }],
    });

    if (status === 'published') {
      // The alert is already saved above — a delivery/notification failure must
      // never turn a successful create into a "Failed to create alert". Deliver
      // best-effort and surface the problem in the log instead.
      try {
        const stats = await notifyCitizens(alert, getIo(req), user._id);
        alert.deliveryStats = stats;
        await alert.save();
      } catch (notifyErr) {
        console.error(`[Alert] Notification delivery failed for "${alert.title}" (id=${alert._id}):`, notifyErr);
        alert.deliveryStats = { notifiedCitizens: 0, inApp: 0, email: 0, sms: 0, push: 0 };
      }
      await notifyOffices(alert, getIo(req), user._id);
      emitAlert(req, 'alert:new', toSocketPayload(alert));
      console.log(
        `[Alert] PUBLISHED "${alert.title}" (id=${alert._id}, target=${alert.targetType}, targetLabel="${alert.targetLabel}", by=${user.fullName || user.role})`
      );
    } else {
      console.log(
        `[Alert] ${status.toUpperCase()} "${alert.title}" (id=${alert._id}, targetLabel="${alert.targetLabel}")${status === 'scheduled' ? ` — publishes at ${alert.scheduledAt.toISOString()}` : ''}`
      );
    }

    logAction({ user, action: 'alert_create', resource: 'alert', resourceId: alert._id, details: { title: alert.title, severity: alert.severity, target: alert.targetType, status: alert.status }, req });

    res.status(201).json({ success: true, message: 'Alert created successfully', data: { alert } });
  } catch (err) {
    console.error('[Alert] Create error:', err);
    return alertErrorResponse(res, err, 'create');
  }
};

// @desc  Update an alert (scheduled/draft alerts can be edited; live limited fields)
// @route PUT /api/alerts/:id
const updateAlert = async (req, res) => {
  try {
    const alert = await PublicAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    if (!canModifyAlert(req.user, alert)) {
      return res.status(403).json({ success: false, message: 'You cannot modify this alert.' });
    }

    const {
      title, category, alertCategory, description, severity, customCategory, safetyInstructions,
      startAt, endAt, scheduledAt, expiresAt,
      emergencyContact, sourceAuthority, status,
    } = req.body;

    if (title !== undefined) {
      if (!title.trim() || title.trim().length > 200) return res.status(400).json({ success: false, message: 'Title must be between 1 and 200 characters.' });
      alert.title = title.trim();
    }
    // Category is optional and free-text — null / "" / undefined all mean
    // "no category", any other string is stored as-is. `alertCategory` is the
    // canonical field name; `category` remains accepted for old callers.
    const categoryInput = alertCategory !== undefined ? alertCategory : category;
    if (categoryInput !== undefined) {
      const normalized = typeof categoryInput === 'string' ? categoryInput.trim() : categoryInput;
      if (normalized && normalized.length > 120) return res.status(400).json({ success: false, message: 'Category must be under 120 characters.' });
      alert.category = normalized || null;
    }
    if (description !== undefined) alert.description = description.trim();
    if (severity !== undefined) {
      if (!SEVERITY_VALUES.includes(severity)) return res.status(400).json({ success: false, message: 'Invalid severity.' });
      alert.severity = severity;
      alert.pinned = isCriticalSeverity(severity);
    }
    if (customCategory !== undefined) alert.customCategory = customCategory;
    if (Array.isArray(safetyInstructions)) alert.safetyInstructions = safetyInstructions;

    const wantsTargeting =
      req.body.scope !== undefined ||
      req.body.subcityIds !== undefined ||
      req.body.subcityNames !== undefined ||
      req.body.subcityName !== undefined ||
      req.body.woredaIds !== undefined ||
      req.body.woredaNames !== undefined ||
      req.body.woredaName !== undefined;
    if (wantsTargeting) {
      const t = await resolveTargeting(req.user, req.body);
      alert.targetType = t.targetType;
      alert.scope = t.scope;
      alert.scopeType = t.scopeType;
      alert.subcityIds = t.subcityIds;
      alert.subcityNames = t.subcityNames;
      alert.woredaIds = t.woredaIds;
      alert.woredaNames = t.woredaNames;
      alert.targetLabel = t.targetLabel;
      alert.subcityId = t.subcityIds[0] || null;
      alert.subcityName = t.subcityNames[0] || null;
      alert.woredaId = t.woredaIds[0] || null;
      alert.woredaName = t.woredaNames[0] || null;
    }

    const hasScheduleEdit = startAt !== undefined || endAt !== undefined || scheduledAt !== undefined || expiresAt !== undefined;
    if (hasScheduleEdit) {
      const now = new Date();
      const currentStart = alert.schedule?.startAt || alert.scheduledAt || null;
      const currentEnd = alert.schedule?.endAt || alert.expiresAt || null;
      const startRaw = startAt !== undefined ? startAt : scheduledAt;
      const endRaw = endAt !== undefined ? endAt : expiresAt;

      if (startRaw !== undefined) {
        const parsed = startRaw === '' || startRaw === null ? null : parseDate(startRaw);
        if (startRaw !== '' && startRaw !== null && parsed === null) {
          return res.status(400).json({ success: false, message: ALERT_DATE_MESSAGES.invalidStartAt, field: 'startAt' });
        }
        alert.schedule = { ...alert.schedule, startAt: parsed || undefined };
        alert.scheduledAt = parsed || undefined;
      }
      if (endRaw !== undefined) {
        const parsed = endRaw === '' || endRaw === null ? null : parseDate(endRaw);
        if (endRaw !== '' && endRaw !== null && parsed === null) {
          return res.status(400).json({ success: false, message: ALERT_DATE_MESSAGES.invalidEndAt, field: 'endAt' });
        }
        alert.schedule = { ...alert.schedule, endAt: parsed || undefined };
        alert.expiresAt = parsed || undefined;
      }

      // Validate the resulting window with the same rules as create (expiry
      // stays optional on update so clearing a legacy expiry keeps working).
      if (alert.status !== 'draft') {
        const nextStart = alert.schedule?.startAt || alert.scheduledAt || null;
        const nextEnd = alert.schedule?.endAt || alert.expiresAt || null;
        const window = validatePublishWindow({
          startAt: nextStart,
          endAt: nextEnd,
          now,
          strict: false,
        });
        if (window.errors.length) {
          const first = window.errors[0];
          return res.status(400).json({ success: false, message: first.message, field: first.field });
        }
      }
    }

    if (emergencyContact !== undefined) alert.emergencyContact = emergencyContact;
    if (sourceAuthority !== undefined) alert.sourceAuthority = sourceAuthority;

    const newAttachments = buildAttachments(req);
    if (newAttachments.length) alert.attachments = newAttachments;

    if (status !== undefined) {
      if (!ALERT_STATUSES.includes(status)) return res.status(400).json({ success: false, message: 'Invalid status.' });
      alert.status = status;
    }

    alert.auditHistory.push({ action: 'updated', userName: req.user.fullName || '', userRole: req.user.role, at: new Date() });
    await alert.save();

    // Real-time: every dashboard/public banner refreshes immediately.
    emitAlert(req, 'alert:updated', toSocketPayload(alert));

    // Editing a LIVE alert re-notifies the affected citizens so corrections
    // reach the same audience as the original broadcast. Best-effort — an edit
    // must never fail because a follow-up notification could not be sent.
    if (isLiveStatus(alert.status)) {
      try {
        await notifyAlertUpdated(alert, getIo(req), req.user?._id);
      } catch (notifyErr) {
        console.error(`[Alert] Update notification failed for "${alert.title}" (id=${alert._id}):`, notifyErr);
      }
    }

    logAction({ user: req.user, action: 'alert_update', resource: 'alert', resourceId: alert._id, details: { title: alert.title }, req });
    res.json({ success: true, message: 'Alert updated', data: { alert } });
  } catch (err) {
    console.error('[Alert] Update error:', err);
    return alertErrorResponse(res, err, 'update');
  }
};

// @desc  Publish a draft/scheduled alert immediately (or schedule when startAt
//        is still in the future)
// @route POST /api/alerts/:id/publish
const publishAlert = async (req, res) => {
  try {
    const alert = await PublicAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    if (!canModifyAlert(req.user, alert)) {
      return res.status(403).json({ success: false, message: 'You cannot publish this alert.' });
    }

    const now = new Date();
    const start = alert.schedule?.startAt || alert.scheduledAt || null;
    const isFuture = start && start > now;

    if (isLiveStatus(alert.status)) {
      return res.json({ success: true, message: 'Alert is already live', data: { alert } });
    }

    if (isFuture && alert.status === 'draft') {
      alert.status = 'scheduled';
      alert.auditHistory.push({ action: 'scheduled', userName: req.user.fullName || '', userRole: req.user.role, at: now });
      await alert.save();
      emitAlert(req, 'alert:statusUpdate', { _id: alert._id, status: 'scheduled', severity: alert.severity });
      logAction({ user: req.user, action: 'alert_scheduled', resource: 'alert', resourceId: alert._id, details: { title: alert.title }, req });
      return res.json({ success: true, message: 'Alert scheduled', data: { alert } });
    }

    alert.status = 'published';
    alert.isPublished = true;
    alert.publishedAt = now;
    alert.auditHistory.push({ action: 'published', userName: req.user.fullName || '', userRole: req.user.role, at: now });
    await alert.save();

    try {
      const stats = await notifyCitizens(alert, getIo(req), req.user?._id);
      alert.deliveryStats = stats;
      await alert.save();
    } catch (notifyErr) {
      console.error(`[Alert] Notification delivery failed for "${alert.title}" (id=${alert._id}):`, notifyErr);
      alert.deliveryStats = { notifiedCitizens: 0, inApp: 0, email: 0, sms: 0, push: 0 };
    }
    await notifyOffices(alert, getIo(req), req.user?._id);

    emitAlert(req, 'alert:new', toSocketPayload(alert));
    logAction({ user: req.user, action: 'alert_publish', resource: 'alert', resourceId: alert._id, details: { title: alert.title }, req });
    console.log(`[Alert] PUBLISHED "${alert.title}" (id=${alert._id}) via /publish`);
    res.json({ success: true, message: 'Alert published', data: { alert } });
  } catch (err) {
    console.error('[Alert] Publish error:', err);
    return alertErrorResponse(res, err, 'publish');
  }
};

// @desc  Archive an alert (hidden from citizens, kept for records)
// @route POST /api/alerts/:id/archive
const archiveAlert = async (req, res) => {
  try {
    const alert = await PublicAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    if (!canModifyAlert(req.user, alert)) {
      return res.status(403).json({ success: false, message: 'You cannot archive this alert.' });
    }

    alert.status = 'archived';
    alert.isPublished = false;
    alert.auditHistory.push({ action: 'archived', userName: req.user.fullName || '', userRole: req.user.role, at: new Date() });
    await alert.save();

    emitAlert(req, 'alert:statusUpdate', { _id: alert._id, status: 'archived', severity: alert.severity });
    logAction({ user: req.user, action: 'alert_archive', resource: 'alert', resourceId: alert._id, details: { title: alert.title }, req });
    res.json({ success: true, message: 'Alert archived', data: { alert } });
  } catch (err) {
    console.error('[Alert] Archive error:', err);
    res.status(500).json({ success: false, message: 'Failed to archive alert' });
  }
};

// @desc  List alerts for dashboards (role-scoped) with filters
// @route GET /api/alerts/manage
const getAlerts = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, category, severity, scope } = req.query;
    const query = buildAlertScope(req.user);
    if (status) query.status = status;
    // Free-text category: case-insensitive substring match.
    if (category) query.category = { $regex: esc(category), $options: 'i' };
    if (severity) query.severity = severity;
    if (scope) query.scope = scope;

    const total = await PublicAlert.countDocuments(query);
    const alerts = await PublicAlert.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const items = alerts.map((a) => toObjectWithScopeView(req.user, a));

    res.json({ success: true, data: { alerts: items, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    console.error('[Alert] Manage list error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch alerts' });
  }
};

// @desc  Get a single alert for management
// @route GET /api/alerts/manage/:id
const getManagedAlert = async (req, res) => {
  try {
    const alert = await PublicAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    if (!canManageAlert(req.user, alert)) {
      return res.status(403).json({ success: false, message: 'You cannot view this alert.' });
    }
    res.json({ success: true, data: { alert: toObjectWithScopeView(req.user, alert) } });
  } catch (err) {
    console.error('[Alert] Manage get error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch alert' });
  }
};

// @desc  List active alerts (public website)
// @route GET /api/alerts
const getPublicAlerts = async (req, res) => {
  try {
    const { page = 1, limit = 20, category, severity, subcity, woreda, q } = req.query;
    const query = { status: { $in: LIVE_STATUSES }, isPublished: true };

    query.$or = [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }];

    // Free-text category: case-insensitive substring match.
    if (category) query.category = { $regex: esc(category), $options: 'i' };
    if (severity) query.severity = severity;
    if (q && q.trim()) {
      query.title = { $regex: esc(q.trim()), $options: 'i' };
    }
    const locationClauses = [
      ...(subcity ? [{ $or: [{ subcityName: { $regex: `^${esc(subcity)}$`, $options: 'i' } }, { subcityNames: { $regex: `^${esc(subcity)}$`, $options: 'i' } }, { scope: 'all' }] }] : []),
      ...(woreda ? [{ $or: [{ woredaName: { $regex: `^${esc(woreda)}$`, $options: 'i' } }, { woredaNames: { $regex: `^${esc(woreda)}$`, $options: 'i' } }, { scope: 'all' }] }] : []),
    ];
    if (locationClauses.length) query.$and = locationClauses;

    const total = await PublicAlert.countDocuments(query);
    const alerts = await PublicAlert.find(query)
      .sort({ pinned: -1, publishedAt: -1, createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { alerts, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    console.error('[Alert] Public list error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch alerts' });
  }
};

// @desc  Distinct categories actually used by existing alerts. The filter
//        dropdowns (public site + management dashboards) are populated from
//        here instead of a hardcoded taxonomy. `scope=live` narrows the values
//        to categories present on currently-live alerts (public page); without
//        it the full, role-scoped alert set is used (dashboards).
// @route GET /api/alerts/categories
const getAlertCategories = async (req, res) => {
  try {
    const query = buildAlertScope(req.user);
    query.category = { $nin: [null, ''] };
    if (req.query.scope === 'live') {
      query.status = { $in: LIVE_STATUSES };
      query.isPublished = true;
      query.$or = [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }];
    }
    const values = await PublicAlert.distinct('category', query);
    const categories = values.filter(Boolean).sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { categories } });
  } catch (err) {
    console.error('[Alert] Categories error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch categories' });
  }
};

// @desc  Get an active alert by ID (public) — increments views + analytics clicks
// @route GET /api/alerts/:id
const getPublicAlertById = async (req, res) => {
  try {
    const alert = await PublicAlert.findById(req.params.id);
    if (!alert || !isLiveStatus(alert.status) || !alert.isPublished) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }
    if (alert.expiresAt && alert.expiresAt < new Date()) {
      return res.status(404).json({ success: false, message: 'Alert has expired' });
    }

    alert.views += 1;
    await alert.save();
    await upsertAlertAnalytics(alert._id, { clicks: 1 });

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { alert } });
  } catch (err) {
    console.error('[Alert] Public get error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch alert' });
  }
};

// @desc  Alerts relevant to the logged-in citizen's location
// @route GET /api/alerts/my
const getMyAlerts = async (req, res) => {
  try {
    const user = req.user;
    const { page = 1, limit = 20, category, severity } = req.query;
    const query = { status: { $in: LIVE_STATUSES }, isPublished: true };

    query.$or = [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }];
    query.$and = [citizenVisibilityQuery(user)];

    // Free-text category: case-insensitive substring match.
    if (category) query.category = { $regex: esc(category), $options: 'i' };
    if (severity) query.severity = severity;

    const total = await PublicAlert.countDocuments(query);
    const alerts = await PublicAlert.find(query)
      .sort({ pinned: -1, publishedAt: -1, createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    // Count each dashboard view (only the first page so pagination does not
    // inflate the analytics figure on every page flip).
    if (parseInt(page) === 1 && alerts.length) {
      const ids = alerts.map((a) => a._id);
      await AlertAnalytics.updateMany({ alert: { $in: ids } }, { $inc: { dashboardViews: 1 } }).catch(() => {});
    }

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { alerts, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
  } catch (err) {
    console.error('[Alert] Citizen list error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch alerts' });
  }
};

// @desc  Alerts within the logged-in user's own administrative scope — the
//        unified "my scope" endpoint. Management roles get their role-scoped
//        set (any status, filterable — same visibility as the dashboards);
//        citizens get live alerts matched to their registered subcity/woreda.
// @route GET /api/alerts/my-scope
const getMyScopeAlerts = async (req, res) => {
  try {
    const user = req.user;
    const isCitizen = user && (user.role === 'citizen' || user.role === 'CITIZEN');

    // Only scoped roles may list "my scope": city/subcity/woreda admins see
    // their management scope; citizens see live location-matched alerts.
    if (!isCitizen && !isGlobalUser(user) && !isSubcityUser(user) && !isWoredaUser(user)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view alerts in this scope.' });
    }

    if (isCitizen) {
      const { page = 1, limit = 20, category, severity } = req.query;
      const query = { status: { $in: LIVE_STATUSES }, isPublished: true };
      query.$or = [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }];
      query.$and = [citizenVisibilityQuery(user)];
      if (category) query.category = { $regex: esc(category), $options: 'i' };
      if (severity) query.severity = severity;

      const total = await PublicAlert.countDocuments(query);
      const alerts = await PublicAlert.find(query)
        .sort({ pinned: -1, publishedAt: -1, createdAt: -1 })
        .skip((parseInt(page) - 1) * parseInt(limit))
        .limit(parseInt(limit));

      res.set('Cache-Control', 'no-store');
      return res.json({
        success: true,
        data: { alerts, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), scope: 'citizen' },
      });
    }

    const { page = 1, limit = 20, status, category, severity, scope } = req.query;
    const query = buildAlertScope(user);
    if (status) query.status = status;
    if (category) query.category = { $regex: esc(category), $options: 'i' };
    if (severity) query.severity = severity;
    if (scope) query.scope = scope;

    const total = await PublicAlert.countDocuments(query);
    const alerts = await PublicAlert.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    const items = alerts.map((a) => toObjectWithScopeView(user, a));

    res.set('Cache-Control', 'no-store');
    res.json({
      success: true,
      data: { alerts: items, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)), scope: 'admin' },
    });
  } catch (err) {
    console.error('[Alert] My-scope list error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch alerts' });
  }
};

// @desc  Unread count for the citizen alert badge
// @route GET /api/alerts/my/unread-count
const getUnreadAlertCount = async (req, res) => {
  try {
    const user = req.user;
    const query = {
      status: { $in: LIVE_STATUSES },
      isPublished: true,
      $and: [citizenVisibilityQuery(user)],
      $or: [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }],
    };

    const visible = await PublicAlert.find(query).select('_id').lean();
    const ids = visible.map((a) => a._id);
    if (!ids.length) return res.json({ success: true, data: { unread: 0 } });

    const read = await AlertRead.find({ user: user._id, alert: { $in: ids } }).select('alert').lean();
    const readSet = new Set(read.map((r) => String(r.alert)));
    const unread = ids.filter((id) => !readSet.has(String(id))).length;

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { unread } });
  } catch (err) {
    console.error('[Alert] Unread count error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch unread count' });
  }
};

// @desc  Mark an alert as read for the logged-in citizen
// @route POST /api/alerts/:id/read
const markAlertRead = async (req, res) => {
  try {
    const user = req.user;
    const alert = await PublicAlert.findById(req.params.id);
    if (!alert || !isLiveStatus(alert.status) || !alert.isPublished) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }
    if (alert.expiresAt && alert.expiresAt < new Date()) {
      return res.status(404).json({ success: false, message: 'Alert has expired' });
    }
    if (!isAlertVisibleToCitizen(alert, user)) {
      return res.status(404).json({ success: false, message: 'Alert not found' });
    }

    const now = new Date();
    const existing = await AlertRead.findOne({ alert: alert._id, user: user._id }).lean();
    const isFirst = !existing;

    await AlertRead.updateOne(
      { alert: alert._id, user: user._id },
      {
        $setOnInsert: { alert: alert._id, user: user._id },
        $inc: { readCount: 1 },
        $set: { lastReadAt: now, ...(isFirst ? { firstReadAt: now } : {}) },
      },
      { upsert: true }
    );

    await upsertAlertAnalytics(alert._id, { reads: 1, ...(isFirst ? { uniqueReaders: 1 } : {}) });
    await refreshClickThroughRate(alert._id);

    res.json({ success: true, data: { read: true } });
  } catch (err) {
    console.error('[Alert] Mark read error:', err);
    res.status(500).json({ success: false, message: 'Failed to mark alert as read' });
  }
};

// @desc  Change alert status / publish a scheduled alert
// @route PATCH /api/alerts/:id/status
const updateAlertStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!ALERT_STATUSES.includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid status' });
    }

    const alert = await PublicAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    if (!canModifyAlert(req.user, alert)) {
      return res.status(403).json({ success: false, message: 'You cannot modify this alert.' });
    }

    const now = new Date();
    const prev = alert.status;
    const target = status === 'active' ? 'published' : status;

    if (target === 'published') {
      alert.publishedAt = now;
      alert.isPublished = true;
    } else {
      alert.isPublished = false;
    }
    if (target === 'expired') alert.expiresAt = now;

    alert.status = target;
    alert.auditHistory.push({ action: target, userName: req.user.fullName || '', userRole: req.user.role, at: now });
    await alert.save();

    if (target === 'published' && (prev === 'scheduled' || prev === 'expired' || prev === 'archived' || prev === 'draft')) {
      const stats = await notifyCitizens(alert, getIo(req), req.user?._id);
      alert.deliveryStats = stats;
      await alert.save();
      await notifyOffices(alert, getIo(req), req.user?._id);
      const fresh = await PublicAlert.findById(alert._id);
      emitAlert(req, 'alert:new', toSocketPayload(fresh));
      console.log(`[Alert] STATUS → published "${alert.title}" (id=${alert._id}, from=${prev}, isPublished=true)`);
    } else {
      emitAlert(req, 'alert:statusUpdate', { _id: alert._id, status: alert.status, severity: alert.severity });
      console.log(`[Alert] STATUS → ${target} "${alert.title}" (id=${alert._id}, from=${prev})`);
    }

    logAction({ user: req.user, action: `alert_${target}`, resource: 'alert', resourceId: alert._id, details: { from: prev, to: target }, req });
    res.json({ success: true, message: `Alert ${target}`, data: { alert } });
  } catch (err) {
    console.error('[Alert] Status update error:', err);
    res.status(500).json({ success: false, message: 'Failed to update alert status' });
  }
};

// @desc  Delete an alert (role-scoped via canModifyAlert)
// @route DELETE /api/alerts/:id
const deleteAlert = async (req, res) => {
  try {
    const alert = await PublicAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    if (!canModifyAlert(req.user, alert)) {
      return res.status(403).json({ success: false, message: 'You cannot delete this alert.' });
    }

    const id = alert._id;
    await alert.deleteOne();
    await AlertDelivery.deleteMany({ alert: id });
    await AlertRecipient.deleteMany({ alert: id });
    await AlertRead.deleteMany({ alert: id });
    await AlertAnalytics.deleteMany({ alert: id });
    // Remove every citizen bell notification for this alert so deleted alerts
    // vanish from notification centers immediately.
    await Notification.deleteMany({ alertId: id });

    emitAlert(req, 'alert:deleted', { _id: id });
    logAction({ user: req.user, action: 'alert_delete', resource: 'alert', resourceId: id, details: { title: alert.title }, req });
    res.json({ success: true, message: 'Alert deleted' });
  } catch (err) {
    console.error('[Alert] Delete error:', err);
    res.status(500).json({ success: false, message: 'Failed to delete alert' });
  }
};

// @desc  Aggregated stats (dashboards)
// @route GET /api/alerts/stats
const getAlertStats = async (req, res) => {
  try {
    const scope = buildAlertScope(req.user);
    const [statusCounts, categoryCounts, severityCounts, scopeCounts, total, activeCritical] = await Promise.all([
      PublicAlert.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      PublicAlert.aggregate([{ $match: scope }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
      PublicAlert.aggregate([{ $match: scope }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
      PublicAlert.aggregate([{ $match: scope }, { $group: { _id: '$scope', count: { $sum: 1 } } }]),
      PublicAlert.countDocuments(scope),
      PublicAlert.countDocuments({ ...scope, status: { $in: LIVE_STATUSES }, severity: { $in: ['critical', 'emergency'] } }),
    ]);

    const byStatus = {}, byCategory = {}, bySeverity = {}, byScope = {};
    statusCounts.forEach((s) => { byStatus[s._id] = s.count; });
    byStatus.active = (byStatus.published || 0) + (byStatus.active || 0);
    categoryCounts.forEach((c) => { byCategory[c._id] = c.count; });
    severityCounts.forEach((s) => { bySeverity[s._id] = s.count; });
    scopeCounts.forEach((s) => { byScope[s._id] = s.count; });

    res.json({ success: true, data: { total, byStatus, byCategory, bySeverity, byScope, activeEmergency: activeCritical } });
  } catch (err) {
    console.error('[Alert] Stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
};

// @desc  Analytics: per-alert performance + trend + breakdowns + delivery stats
// @route GET /api/alerts/analytics
const getAlertAnalytics = async (req, res) => {
  try {
    const scope = buildAlertScope(req.user);
    const alerts = await PublicAlert.find(scope).select(
      'title category severity status scope targetLabel subcityNames woredaNames views deliveryStats createdAt publishedAt expiresAt source clusterLabel pinned'
    ).sort({ createdAt: -1 }).lean();

    const ids = alerts.map((a) => a._id);
    const anaDocs = await AlertAnalytics.find({ alert: { $in: ids } }).lean();
    const anaById = new Map(anaDocs.map((a) => [String(a.alert), a]));

    const since = new Date();
    since.setDate(since.getDate() - 30);

    const createdByDay = await PublicAlert.aggregate([
      { $match: { ...scope, createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          count: { $sum: 1 },
          views: { $sum: '$views' },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const sum = (key) => anaDocs.reduce((acc, a) => acc + (a[key] || 0), 0);

    res.json({
      success: true,
      data: {
        alerts: alerts.map((a) => ({ ...a, analytics: anaById.get(String(a._id)) || null })),
        totals: {
          views: alerts.reduce((acc, c) => acc + (c.views || 0), 0),
          notified: alerts.reduce((acc, c) => acc + (c.deliveryStats?.notifiedCitizens || 0), 0),
          totalRecipients: sum('totalRecipients'),
          smsDelivered: sum('smsDelivered'),
          emailDelivered: sum('emailDelivered'),
          dashboardViews: sum('dashboardViews'),
          clicks: sum('clicks'),
          reads: sum('reads'),
          uniqueReaders: sum('uniqueReaders'),
        },
        trend: createdByDay,
        severityBreakdown: alerts.reduce((acc, a) => {
          acc[a.severity] = (acc[a.severity] || 0) + 1;
          return acc;
        }, {}),
        categoryBreakdown: alerts.reduce((acc, a) => {
          acc[a.category] = (acc[a.category] || 0) + 1;
          return acc;
        }, {}),
      },
    });
  } catch (err) {
    console.error('[Alert] Analytics error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
  }
};

// @desc  Export alerts as CSV or PDF (role-scoped)
// @route GET /api/alerts/export?format=csv|pdf
const exportAlerts = async (req, res) => {
  try {
    const format = req.query.format === 'pdf' ? 'pdf' : 'csv';
    const query = buildAlertScope(req.user);
    if (req.query.status) query.status = req.query.status;
    // Free-text category: case-insensitive substring match.
    if (req.query.category) query.category = { $regex: esc(req.query.category), $options: 'i' };
    if (req.query.severity) query.severity = req.query.severity;

    const alerts = await PublicAlert.find(query)
      .sort({ createdAt: -1 })
      .select('title category severity status scope targetLabel subcityNames woredaNames createdByName views deliveryStats publishedAt createdAt expiresAt')
      .lean();

    const stamp = new Date().toISOString().slice(0, 10);
    const targetOf = (a) => a.targetLabel || [a.subcityNames || a.subcityName, a.woredaNames || a.woredaName].filter(Boolean).join(' — ') || 'Addis Ababa (city-wide)';

    if (format === 'csv') {
      const header = 'Title,Category,Severity,Status,Target,Published By,Views,Notified,Published At,Expires At,Created At';
      const rows = alerts.map((a) => [
        `"${(a.title || '').replace(/"/g, '""')}"`,
        a.category || '',
        a.severity || '',
        a.status || '',
        `"${targetOf(a).replace(/"/g, '""')}"`,
        `"${(a.createdByName || '').replace(/"/g, '""')}"`,
        a.views || 0,
        a.deliveryStats?.notifiedCitizens || 0,
        a.publishedAt ? new Date(a.publishedAt).toISOString() : '',
        a.expiresAt ? new Date(a.expiresAt).toISOString() : '',
        a.createdAt ? new Date(a.createdAt).toISOString() : '',
      ].join(','));
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="alerts-${stamp}.csv"`);
      return res.send([header, ...rows].join('\n'));
    }

    const doc = new PDFDocument({ size: 'A4', margin: 40 });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="alerts-${stamp}.pdf"`);
    doc.pipe(res);

    doc.fontSize(18).text('EthioBridge — Public Alerts Report', { align: 'center' });
    doc.fontSize(10).text(`Generated ${new Date().toLocaleString()} — ${alerts.length} alerts`, { align: 'center' });
    doc.moveDown(1);

    const svc = (s) => (s || '').toString();

    for (const a of alerts) {
      doc.fontSize(11).fillColor(a.severity === 'critical' || a.severity === 'emergency' ? '#dc2626' : a.severity === 'high' || a.severity === 'warning' ? '#d97706' : '#1d4ed8')
        .text(`[${(a.status || '').toUpperCase()}] ${a.title}`);
      doc.fillColor('#111827');
      doc.fontSize(9).text(`${svc(a.category)} • ${svc(a.severity)} • Target: ${targetOf(a)}`);
      doc.fontSize(9).text(
        `By ${svc(a.createdByName)} • ${a.publishedAt ? `Published ${new Date(a.publishedAt).toLocaleString()}` : 'Not published'}${a.expiresAt ? ` • Expires ${new Date(a.expiresAt).toLocaleString()}` : ''}`
      );
      doc.fontSize(9).fillColor('#6b7280').text(`Views: ${a.views || 0} • Notified: ${a.deliveryStats?.notifiedCitizens || 0}`);
      doc.fillColor('#111827').moveDown(0.6);
    }

    doc.end();
  } catch (err) {
    console.error('[Alert] Export error:', err);
    res.status(500).json({ success: false, message: 'Failed to export alerts' });
  }
};

// @desc  Get the current user's alert subscription preferences
// @route GET /api/alerts/subscriptions/me
const getSubscriptions = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select('alertSubscriptions');
    res.json({
      success: true,
      data: { subscriptions: user?.alertSubscriptions || { enabled: true, categories: [], channels: { inApp: true, email: false, sms: false, push: false } } },
    });
  } catch (err) {
    console.error('[Alert] Get subscriptions error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch subscriptions' });
  }
};

// @desc  Update the current user's alert subscription preferences
// @route PUT /api/alerts/subscriptions/me
const updateSubscriptions = async (req, res) => {
  try {
    const { enabled, categories, channels } = req.body || {};
    const current = await User.findById(req.user._id).select('alertSubscriptions');
    const existing = current?.alertSubscriptions || {};
    const merged = {
      enabled: typeof enabled === 'boolean' ? enabled : existing.enabled,
      // Categories are free-text now, so any non-empty string is kept (trimmed
      // and deduped) instead of being filtered against a hardcoded list.
      categories: Array.isArray(categories)
        ? [...new Set(categories.map((c) => String(c || '').trim()).filter(Boolean))].slice(0, 200)
        : (existing.categories || []),
      channels: {
        inApp: channels?.inApp ?? existing.channels?.inApp ?? true,
        email: channels?.email ?? existing.channels?.email ?? false,
        sms: channels?.sms ?? existing.channels?.sms ?? false,
        push: channels?.push ?? existing.channels?.push ?? false,
      },
    };

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: { alertSubscriptions: merged } },
      { new: true }
    ).select('alertSubscriptions');

    res.json({ success: true, message: 'Alert subscriptions updated', data: { subscriptions: user.alertSubscriptions } });
  } catch (err) {
    console.error('[Alert] Update subscriptions error:', err);
    res.status(500).json({ success: false, message: 'Failed to update subscriptions' });
  }
};

// @desc  Alert audit trail (role-scoped to the alerts the user can manage)
// @route GET /api/alerts/audit
const getAlertAuditLog = async (req, res) => {
  try {
    const scope = buildAlertScope(req.user);
    const alerts = await PublicAlert.find(scope).select('_id').lean();
    const ids = alerts.map((a) => a._id);

    const query = { resource: 'alert' };
    if (ids.length > 0) query.resourceId = { $in: ids };

    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .limit(parseInt(req.query.limit || '50', 10))
      .lean();

    res.json({ success: true, data: { logs, total: logs.length } });
  } catch (err) {
    console.error('[Alert] Audit log error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch audit log' });
  }
};

module.exports = {
  createAlert,
  updateAlert,
  publishAlert,
  archiveAlert,
  getAlerts,
  getManagedAlert,
  getPublicAlerts,
  getPublicAlertById,
  getAlertCategories,
  getMyAlerts,
  getMyScopeAlerts,
  getUnreadAlertCount,
  markAlertRead,
  updateAlertStatus,
  deleteAlert,
  getAlertStats,
  getAlertAnalytics,
  exportAlerts,
  getSubscriptions,
  updateSubscriptions,
  getAlertAuditLog,
  buildAlertScope,
  canManageAlert,
  canModifyAlert,
  notifyCitizens,
  notifyAlertUpdated,
  notifyOffices,
  resolveTargeting,
  isAlertVisibleToCitizen,
};
