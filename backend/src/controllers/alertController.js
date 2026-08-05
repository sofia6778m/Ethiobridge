const mongoose = require('mongoose');
const PublicAlert = require('../models/PublicAlert');
const AlertDelivery = require('../models/AlertDelivery');
const PublicComplaint = require('../models/PublicComplaint');
const User = require('../models/User');
const AuditLog = require('../models/AuditLog');
const createNotification = require('../utils/createNotification');
const { logAction } = require('../middleware/auditLog');
const { SUBCITY_ROLE_MAP } = require('../utils/scopeFilter');
const {
  CATEGORY_VALUES,
  SEVERITY_VALUES,
  ALERT_STATUSES,
  LIVE_STATUSES,
  safetyInstructionsFor,
} = require('../utils/alertMetadata');
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

const SUB_CITY_ADMIN_ROLES = ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'SUBCITY_HEAD'];
const WOREDA_ADMIN_ROLES = ['woreda', 'WOREDA_HEAD', 'department', 'DEPARTMENT_ADMIN'];
const ALERT_CREATOR_ROLES = ['admin', 'ADMIN', 'government', ...SUB_CITY_ADMIN_ROLES, ...WOREDA_ADMIN_ROLES];
const GLOBAL_ALERT_ROLES = ['admin', 'ADMIN', 'government'];

const esc = (s) => (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// Management-list scope. Admins/government see everything; subcity admins see
// city-wide + their own subcity; woreda officers see city-wide + their woreda.
function buildAlertScope(user) {
  if (!user) return {};
  if (GLOBAL_ALERT_ROLES.includes(user.role)) return {};

  if (SUB_CITY_ADMIN_ROLES.includes(user.role)) {
    const name = user.subcity || SUBCITY_ROLE_MAP[user.role];
    return {
      $or: [
        { scope: 'all' },
        { subcityName: { $regex: `^${esc(name)}$`, $options: 'i' } },
        ...(user.subcityId ? [{ subcityId: user.subcityId }] : []),
      ],
    };
  }

  if (WOREDA_ADMIN_ROLES.includes(user.role)) {
    return {
      $or: [
        { scope: 'all' },
        ...(user.woredaId ? [{ woredaId: user.woredaId }] : []),
        ...(user.woredaName ? [{ woredaName: { $regex: `^${esc(user.woredaName)}$`, $options: 'i' } }] : []),
        ...(user.subcity ? [{ subcityName: { $regex: `^${esc(user.subcity)}$`, $options: 'i' } }] : []),
      ],
    };
  }

  return {};
}

function isGlobalUser(user) {
  return GLOBAL_ALERT_ROLES.includes(user.role);
}

function isSubcityUser(user) {
  return SUB_CITY_ADMIN_ROLES.includes(user.role);
}

function isWoredaUser(user) {
  return WOREDA_ADMIN_ROLES.includes(user.role);
}

function userSubcityName(user) {
  return user.subcity || SUBCITY_ROLE_MAP[user.role] || '';
}

function canManageAlert(user, alert) {
  if (!user || !alert) return false;
  if (isGlobalUser(user)) return true;
  if (isSubcityUser(user)) {
    const mine = userSubcityName(user);
    if (!mine) return false;
    if (alert.scope === 'all') return true;
    if (alert.subcityName && alert.subcityName.toLowerCase() === mine.toLowerCase()) return true;
    if (user.subcityId && alert.subcityId && String(alert.subcityId) === String(user.subcityId)) return true;
    return false;
  }
  if (isWoredaUser(user)) {
    if (alert.scope === 'all') return true;
    if (user.woredaId && alert.woredaId && String(alert.woredaId) === String(user.woredaId)) return true;
    if (user.woredaName && alert.woredaName && alert.woredaName.toLowerCase() === user.woredaName.toLowerCase()) return true;
    if (user.subcity && alert.subcityName && alert.subcityName.toLowerCase() === user.subcity.toLowerCase()) return true;
    return false;
  }
  return false;
}

// Resolve targeting from the request. Admin/government may pick any scope; a
// subcity admin is locked to their subcity (optionally a woreda within it);
// a woreda officer is locked to their woreda.
function resolveTargeting(user, body) {
  if (isGlobalUser(user)) {
    const scope = body.scope || (body.woredaId || body.woredaName ? 'woreda' : body.subcityId || body.subcityName ? 'subcity' : 'all');
    return {
      scope,
      subcityId: body.subcityId || null,
      subcityName: body.subcityName || (body.scope === 'subcity' ? '' : null),
      woredaId: body.woredaId || null,
      woredaName: body.woredaName || null,
    };
  }

  if (isSubcityUser(user)) {
    const mine = userSubcityName(user);
    if (body.woredaId || body.woredaName) {
      return {
        scope: 'woreda',
        subcityId: user.subcityId || null,
        subcityName: mine || null,
        woredaId: body.woredaId || null,
        woredaName: body.woredaName || null,
      };
    }
    return {
      scope: 'subcity',
      subcityId: user.subcityId || null,
      subcityName: mine || null,
      woredaId: null,
      woredaName: null,
    };
  }

  if (isWoredaUser(user)) {
    return {
      scope: 'woreda',
      subcityId: user.subcityId || null,
      subcityName: user.subcity || null,
      woredaId: user.woredaId || null,
      woredaName: user.woredaName || null,
    };
  }

  return { scope: 'all' };
}

// ── Notification pipeline ────────────────────────────────────────────────────

// Deliver a newly-published alert to matching citizens. Emergency alerts are
// always delivered; other alerts respect each citizen's subscription
// preferences (master toggle + category filter). SMS/Email/Push are recorded
// as delivery rows (placeholders for real providers); the in-app channel
// creates a Notification so it appears in the bell immediately.
async function notifyCitizens(alert, io) {
  const userQuery = { role: { $in: ['citizen', 'CITIZEN'] } };
  if (alert.scope === 'subcity' && alert.subcityName) {
    userQuery.$or = [
      { subcity: { $regex: `^${esc(alert.subcityName)}$`, $options: 'i' } },
      ...(alert.subcityId ? [{ subcityId: alert.subcityId }] : []),
    ];
  } else if (alert.scope === 'woreda') {
    userQuery.$or = [
      ...(alert.woredaId ? [{ woredaId: alert.woredaId }] : []),
      ...(alert.woredaName ? [{ woredaName: { $regex: `^${esc(alert.woredaName)}$`, $options: 'i' } }] : []),
      ...(alert.subcityName ? [{ subcity: { $regex: `^${esc(alert.subcityName)}$`, $options: 'i' } }] : []),
    ];
  }

  const isEmergency = alert.severity === 'emergency';
  const isGlobal = alert.scope === 'all';

  const matches = [];
  const cursor = User.find(userQuery).select(
    '_id fullName emailNotifications smsNotifications pushNotifications alertSubscriptions'
  ).cursor();

  for await (const user of cursor) {
    const sub = user.alertSubscriptions || {};
    if (!isEmergency && sub.enabled === false) continue;
    const cats = Array.isArray(sub.categories) ? sub.categories : [];
    if (!isEmergency && cats.length > 0 && !cats.includes(alert.category)) continue;

    const channels = sub.channels || {};
    const email = !!(channels.email ?? user.emailNotifications ?? false);
    const sms = !!(channels.sms ?? user.smsNotifications ?? false);
    const push = !!(channels.push ?? user.pushNotifications ?? false);
    const inApp = channels.inApp !== false;

    const activeChannels = [];
    if (inApp) activeChannels.push('inApp');
    if (email) activeChannels.push('email');
    if (sms) activeChannels.push('sms');
    if (push) activeChannels.push('push');

    matches.push({ user, activeChannels });
  }

  const deliveryOps = [];
  const notifPromises = [];
  let inAppCount = 0;
  let emailCount = 0;
  let smsCount = 0;
  let pushCount = 0;

  for (const { user, activeChannels } of matches) {
    deliveryOps.push({
      updateOne: {
        filter: { alert: alert._id, user: user._id },
        update: {
          $setOnInsert: { alert: alert._id, user: user._id },
          $set: { channels: activeChannels, status: 'delivered', deliveredAt: new Date() },
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
          title: `${isEmergency ? '🚨 ' : ''}${alert.title}`,
          message: `${severityLabel(alert.severity)} — ${alert.description.slice(0, 180)}`,
          type: isEmergency ? 'emergency_alert' : 'public_alert',
          io,
        })
      );
    }
  }

  if (deliveryOps.length) {
    await AlertDelivery.bulkWrite(deliveryOps);
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
  }
  console.log(
    `[Alert] notifyCitizens → alert="${alert.title}" (id=${alert._id}, scope=${alert.scope}) notified ${matches.length} citizen(s) — inApp=${inAppCount}, email=${emailCount}, sms=${smsCount}, push=${pushCount}`
  );
  return stats;
}

function severityLabel(severity) {
  const map = { information: 'Information', warning: 'Warning', emergency: 'Emergency' };
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
    severity: alert.severity,
    description: alert.description,
    scope: alert.scope,
    subcityName: alert.subcityName,
    woredaName: alert.woredaName,
    status: alert.status,
    pinned: alert.pinned,
    publishedAt: alert.publishedAt,
    expiresAt: alert.expiresAt,
    createdByName: alert.createdByName,
    createdAt: alert.createdAt,
  };
}

// @desc  Create a new public alert (admin/government/subcity/woreda)
// @route POST /api/alerts
const createAlert = async (req, res) => {
  try {
    const user = req.user;
    if (!ALERT_CREATOR_ROLES.includes(user.role)) {
      return res.status(403).json({ success: false, message: 'You are not allowed to create alerts.' });
    }

    const {
      title, category, severity, description,
      scheduledAt, expiresAt, subcityId, subcityName, woredaId, woredaName,
      source, relatedComplaintIds, clusterLabel,
    } = req.body;

    if (!title || !title.trim() || title.trim().length > 200) {
      return res.status(400).json({ success: false, message: 'A title (max 200 chars) is required.' });
    }
    if (!CATEGORY_VALUES.includes(category)) {
      return res.status(400).json({ success: false, message: 'A valid alert category is required.' });
    }
    if (!SEVERITY_VALUES.includes(severity)) {
      return res.status(400).json({ success: false, message: 'A valid severity level is required.' });
    }
    if (!description || !description.trim()) {
      return res.status(400).json({ success: false, message: 'A description is required.' });
    }

    const targeting = resolveTargeting(user, { scope: req.body.scope, subcityId, subcityName, woredaId, woredaName });

    // Guard: a subcity/woreda admin cannot quietly target outside their scope.
    if (!isGlobalUser(user) && targeting.scope === 'all') {
      return res.status(403).json({ success: false, message: 'Only city-wide administrators can create city-wide alerts.' });
    }

    const now = new Date();
    const parsedScheduled = scheduledAt ? new Date(scheduledAt) : null;
    const parsedExpires = expiresAt ? new Date(expiresAt) : null;
    const isFuture = parsedScheduled && parsedScheduled > now;
    // Canonical lifecycle: scheduled → published → expired/archived.
    const status = isFuture ? 'scheduled' : 'published';

    // Guard: an immediately-published alert must never be born already expired,
    // otherwise it is invisible everywhere while still looking "published".
    if (!isFuture && parsedExpires && parsedExpires <= now) {
      return res.status(400).json({
        success: false,
        message: 'Expiry must be in the future for an alert that publishes immediately.',
      });
    }

    const alert = await PublicAlert.create({
      title: title.trim(),
      category,
      severity,
      description: description.trim(),
      safetyInstructions: safetyInstructionsFor(category),
      scope: targeting.scope,
      scopeType: mapScopeType(targeting.scope),
      subcityId: targeting.subcityId || undefined,
      subcityName: targeting.subcityName || undefined,
      woredaId: targeting.woredaId || undefined,
      woredaName: targeting.woredaName || undefined,
      status,
      isPublished: status === 'published',
      pinned: severity === 'emergency',
      scheduledAt: parsedScheduled || undefined,
      publishedAt: status === 'published' ? now : undefined,
      expiresAt: parsedExpires || undefined,
      createdBy: user._id,
      createdByName: user.fullName || '',
      createdByRole: user.role,
      createdByOrg: user.organizationName || '',
      source: source === 'complaint_cluster' ? 'complaint_cluster' : 'manual',
      relatedComplaintIds: relatedComplaintIds || [],
      clusterLabel: clusterLabel || undefined,
      auditHistory: [{ action: status === 'scheduled' ? 'scheduled' : 'published', userName: user.fullName || '', userRole: user.role, at: now }],
    });

    if (status === 'published') {
      const stats = await notifyCitizens(alert, getIo(req));
      alert.deliveryStats = stats;
      await alert.save();
      emitAlert(req, 'alert:new', toSocketPayload(alert));
      console.log(
        `[Alert] PUBLISHED "${alert.title}" (id=${alert._id}, status=published, scope=${alert.scope}, scopeType=${alert.scopeType}, publishedAt=${alert.publishedAt.toISOString()}, by=${user.fullName || user.role})`
      );
    } else {
      console.log(
        `[Alert] SCHEDULED "${alert.title}" (id=${alert._id}, scheduledAt=${alert.scheduledAt.toISOString()}) — will auto-publish by scheduler.`
      );
    }

    logAction({ user, action: 'alert_create', resource: 'alert', resourceId: alert._id, details: { title: alert.title, severity: alert.severity, scope: alert.scope, status: alert.status }, req });

    res.status(201).json({ success: true, message: 'Alert created successfully', data: { alert } });
  } catch (err) {
    console.error('[Alert] Create error:', err);
    res.status(500).json({ success: false, message: 'Failed to create alert' });
  }
};

// @desc  Update an alert (scheduled alerts can be edited; active limited fields)
// @route PUT /api/alerts/:id
const updateAlert = async (req, res) => {
  try {
    const alert = await PublicAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    if (!canManageAlert(req.user, alert)) {
      return res.status(403).json({ success: false, message: 'You cannot modify this alert.' });
    }

    const { title, description, severity, expiresAt, scheduledAt, subcityId, subcityName, woredaId, woredaName, safetyInstructions } = req.body;

    if (title) {
      if (!title.trim() || title.trim().length > 200) return res.status(400).json({ success: false, message: 'Title must be between 1 and 200 characters.' });
      alert.title = title.trim();
    }
    if (description) alert.description = description.trim();
    if (severity) {
      if (!SEVERITY_VALUES.includes(severity)) return res.status(400).json({ success: false, message: 'Invalid severity.' });
      alert.severity = severity;
      alert.pinned = severity === 'emergency';
    }
    if (Array.isArray(safetyInstructions)) alert.safetyInstructions = safetyInstructions;
    if (expiresAt !== undefined) alert.expiresAt = expiresAt ? new Date(expiresAt) : null;
    if (scheduledAt !== undefined) alert.scheduledAt = scheduledAt ? new Date(scheduledAt) : null;

    if (isGlobalUser(req.user) && (subcityId || subcityName || woredaId || woredaName || req.body.scope)) {
      const targeting = resolveTargeting(req.user, { scope: req.body.scope, subcityId, subcityName, woredaId, woredaName });
      alert.scope = targeting.scope;
      alert.subcityId = targeting.subcityId || null;
      alert.subcityName = targeting.subcityName || null;
      alert.woredaId = targeting.woredaId || null;
      alert.woredaName = targeting.woredaName || null;
    }

    alert.auditHistory.push({ action: 'updated', userName: req.user.fullName || '', userRole: req.user.role, at: new Date() });
    await alert.save();

    logAction({ user: req.user, action: 'alert_update', resource: 'alert', resourceId: alert._id, details: { title: alert.title }, req });
    res.json({ success: true, message: 'Alert updated', data: { alert } });
  } catch (err) {
    console.error('[Alert] Update error:', err);
    res.status(500).json({ success: false, message: 'Failed to update alert' });
  }
};

// @desc  List alerts for dashboards (role-scoped) with filters
// @route GET /api/alerts/manage
const getAlerts = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, category, severity, scope } = req.query;
    const query = buildAlertScope(req.user);
    if (status) query.status = status;
    if (category) query.category = category;
    if (severity) query.severity = severity;
    if (scope) query.scope = scope;

    const total = await PublicAlert.countDocuments(query);
    const alerts = await PublicAlert.find(query)
      .sort({ createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.json({ success: true, data: { alerts, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
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
    res.json({ success: true, data: { alert } });
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
    // Only published (or legacy 'active') alerts that have not expired.
    const query = { status: { $in: LIVE_STATUSES }, isPublished: true };

    // Past-due alerts that the scheduler has not yet flipped are hidden.
    query.$or = [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }];

    if (category) query.category = category;
    if (severity) query.severity = severity;
    if (q && q.trim()) {
      query.title = { $regex: esc(q.trim()), $options: 'i' };
    }
    const locationClauses = [
      ...(subcity ? [{ $or: [{ subcityName: { $regex: `^${esc(subcity)}$`, $options: 'i' } }, { scope: 'all' }] }] : []),
      ...(woreda ? [{ $or: [{ woredaName: { $regex: `^${esc(woreda)}$`, $options: 'i' } }, { scope: 'all' }] }] : []),
    ];
    if (locationClauses.length) query.$and = locationClauses;

    const total = await PublicAlert.countDocuments(query);
    const alerts = await PublicAlert.find(query)
      .sort({ pinned: -1, publishedAt: -1, createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { alerts, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
    console.log(`[Alert] Public list → ${alerts.length} returned / ${total} total (filters: ${JSON.stringify({ category, severity, subcity, woreda, q })})`);
  } catch (err) {
    console.error('[Alert] Public list error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch alerts' });
  }
};

// @desc  Get an active alert by ID (public) — increments views
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

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { alert } });
  } catch (err) {
    console.error('[Alert] Public get error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch alert' });
  }
};

// @desc  Alerts relevant to the logged-in citizen's location
// @route GET /api/alerts/my
// Visible to a citizen when:
//   • scopeType 'city' (city-wide)        → everyone
//   • scopeType 'subcity'                 → citizens whose subcity matches
//   • scopeType 'woreda'                  → citizens whose woreda matches
const getMyAlerts = async (req, res) => {
  try {
    const user = req.user;
    const { page = 1, limit = 20, category, severity } = req.query;
    const query = { status: { $in: LIVE_STATUSES }, isPublished: true };

    // Not-yet-flipped overdue alerts are hidden.
    query.$or = [{ expiresAt: { $gt: new Date() } }, { expiresAt: null }];

    const locationClauses = [{ scopeType: 'city' }];
    if (user.subcity) {
      locationClauses.push({ subcityName: { $regex: `^${esc(user.subcity)}$`, $options: 'i' } });
    }
    if (user.woredaName) {
      locationClauses.push({ woredaName: { $regex: `^${esc(user.woredaName)}$`, $options: 'i' } });
    }
    if (user.subcityId) {
      locationClauses.push({ subcityId: user.subcityId });
    }
    if (user.woredaId) {
      locationClauses.push({ woredaId: user.woredaId });
    }
    query.$and = [{ $or: locationClauses }];

    if (category) query.category = category;
    if (severity) query.severity = severity;

    const total = await PublicAlert.countDocuments(query);
    const alerts = await PublicAlert.find(query)
      .sort({ pinned: -1, publishedAt: -1, createdAt: -1 })
      .skip((parseInt(page) - 1) * parseInt(limit))
      .limit(parseInt(limit));

    res.set('Cache-Control', 'no-store');
    res.json({ success: true, data: { alerts, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) } });
    console.log(
      `[Alert] Citizen ${user._id} (subcity="${user.subcity || ''}", woreda="${user.woredaName || ''}") → ${alerts.length} location-matched alert(s) of ${total}`
    );
  } catch (err) {
    console.error('[Alert] Citizen list error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch alerts' });
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
    if (!canManageAlert(req.user, alert)) {
      return res.status(403).json({ success: false, message: 'You cannot modify this alert.' });
    }

    const now = new Date();
    const prev = alert.status;
    // Normalize the legacy 'active' status to the canonical 'published'.
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

    // Notify citizens when a scheduled alert is published (or reactivated).
    if (target === 'published' && (prev === 'scheduled' || prev === 'expired' || prev === 'archived')) {
      const stats = await notifyCitizens(alert, getIo(req));
      alert.deliveryStats = stats;
      await alert.save();
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

// @desc  Delete an alert (admin only)
// @route DELETE /api/alerts/:id
const deleteAlert = async (req, res) => {
  try {
    const alert = await PublicAlert.findById(req.params.id);
    if (!alert) return res.status(404).json({ success: false, message: 'Alert not found' });
    if (!isGlobalUser(req.user)) {
      return res.status(403).json({ success: false, message: 'Only city-wide administrators can delete alerts.' });
    }

    const id = alert._id;
    await alert.deleteOne();
    await AlertDelivery.deleteMany({ alert: id });

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
    const [statusCounts, categoryCounts, severityCounts, scopeCounts, total, activeEmergency] = await Promise.all([
      PublicAlert.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      PublicAlert.aggregate([{ $match: scope }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
      PublicAlert.aggregate([{ $match: scope }, { $group: { _id: '$severity', count: { $sum: 1 } } }]),
      PublicAlert.aggregate([{ $match: scope }, { $group: { _id: '$scope', count: { $sum: 1 } } }]),
      PublicAlert.countDocuments(scope),
      PublicAlert.countDocuments({ ...scope, status: { $in: LIVE_STATUSES }, severity: 'emergency' }),
    ]);

    const byStatus = {}, byCategory = {}, bySeverity = {}, byScope = {};
    statusCounts.forEach((s) => { byStatus[s._id] = s.count; });
    // Combined "live" bucket so clients reading `byStatus.active` keep working.
    byStatus.active = (byStatus.published || 0) + (byStatus.active || 0);
    categoryCounts.forEach((c) => { byCategory[c._id] = c.count; });
    severityCounts.forEach((s) => { bySeverity[s._id] = s.count; });
    scopeCounts.forEach((s) => { byScope[s._id] = s.count; });

    res.json({ success: true, data: { total, byStatus, byCategory, bySeverity, byScope, activeEmergency } });
  } catch (err) {
    console.error('[Alert] Stats error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch stats' });
  }
};

// @desc  Analytics: per-alert performance + trend + breakdowns
// @route GET /api/alerts/analytics
const getAlertAnalytics = async (req, res) => {
  try {
    const scope = buildAlertScope(req.user);
    const alerts = await PublicAlert.find(scope).select(
      'title category severity status scope views deliveryStats createdAt publishedAt expiresAt source clusterLabel pinned'
    ).sort({ createdAt: -1 }).lean();

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

    res.json({
      success: true,
      data: {
        alerts,
        totals: {
          views: alerts.reduce((a, c) => a + (c.views || 0), 0),
          notified: alerts.reduce((a, c) => a + (c.deliveryStats?.notifiedCitizens || 0), 0),
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
    if (req.query.category) query.category = req.query.category;
    if (req.query.severity) query.severity = req.query.severity;

    const alerts = await PublicAlert.find(query)
      .sort({ createdAt: -1 })
      .select('title category severity status scope subcityName woredaName createdByName views deliveryStats publishedAt createdAt expiresAt')
      .lean();

    const stamp = new Date().toISOString().slice(0, 10);

    if (format === 'csv') {
      const header = 'Title,Category,Severity,Status,Scope,Subcity,Woreda,Published By,Views,Notified,Published At,Expires At,Created At';
      const rows = alerts.map((a) => [
        `"${(a.title || '').replace(/"/g, '""')}"`,
        a.category || '',
        a.severity || '',
        a.status || '',
        a.scope || '',
        a.subcityName || '',
        a.woredaName || '',
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
      doc.fontSize(11).fillColor(a.severity === 'emergency' ? '#dc2626' : a.severity === 'warning' ? '#d97706' : '#1d4ed8')
        .text(`[${(a.status || '').toUpperCase()}] ${a.title}`);
      doc.fillColor('#111827');
      doc.fontSize(9).text(
        `${svc(a.category)} • ${svc(a.severity)} • Scope: ${svc(a.scope)}${a.subcityName ? ` / ${a.subcityName}` : ''}${a.woredaName ? ` / ${a.woredaName}` : ''}`
      );
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
// @route GET /api/alerts/subscriptions
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
      categories: Array.isArray(categories)
        ? categories.filter((c) => CATEGORY_VALUES.includes(c))
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

// @desc  Complaint clusters (integration with complaint analytics)
// Groups recent unresolved complaints by subcity + category and returns
// clusters big enough to warrant a public alert.
// @route GET /api/alerts/complaint-clusters
const getComplaintClusters = async (req, res) => {
  try {
    const since = new Date();
    since.setDate(since.getDate() - parseInt(req.query.days || '7', 10));

    const clusters = await PublicComplaint.aggregate([
      { $match: { createdAt: { $gte: since }, subcity: { $ne: '' } } },
      {
        $group: {
          _id: { subcity: '$subcity', category: '$category', department: '$department' },
          count: { $sum: 1 },
          priority: { $max: '$priority' },
          complaintIds: { $push: '$_id' },
          latestAt: { $max: '$createdAt' },
        },
      },
      { $match: { count: { $gte: parseInt(req.query.min || '3', 10) } } },
      { $sort: { count: -1 } },
      { $limit: parseInt(req.query.limit || '20', 10) },
    ]);

    res.json({
      success: true,
      data: {
        clusters: clusters.map((c) => ({
          subcity: c._id.subcity,
          category: c._id.category,
          department: c._id.department,
          count: c.count,
          priority: c.priority,
          complaintIds: c.complaintIds,
          latestAt: c.latestAt,
        })),
        periodDays: parseInt(req.query.days || '7', 10),
      },
    });
  } catch (err) {
    console.error('[Alert] Complaint clusters error:', err);
    res.status(500).json({ success: false, message: 'Failed to fetch complaint clusters' });
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
  getAlerts,
  getManagedAlert,
  getPublicAlerts,
  getPublicAlertById,
  getMyAlerts,
  updateAlertStatus,
  deleteAlert,
  getAlertStats,
  getAlertAnalytics,
  exportAlerts,
  getSubscriptions,
  updateSubscriptions,
  getComplaintClusters,
  getAlertAuditLog,
  buildAlertScope,
  canManageAlert,
  notifyCitizens,
};
