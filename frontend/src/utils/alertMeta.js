// Shared frontend metadata for the Public Alert & Broadcast system.
// Mirrors backend/src/utils/alertMetadata.js so the UI and API never drift.

// Alert categories are OPTIONAL free-text strings typed by admins — there is
// no hardcoded taxonomy. Filter dropdowns are populated dynamically from the
// distinct categories stored on real alerts via GET /api/alerts/categories.

// ── Canonical severities (offered in the form) + legacy aliases ───────────────
export const ALERT_SEVERITIES = [
  { value: 'critical',    icon: '🚨', label: 'Critical',    color: 'red',    pinned: true },
  { value: 'high',        icon: '⚠️', label: 'High',        color: 'orange', pinned: false },
  { value: 'medium',      icon: '🔶', label: 'Medium',      color: 'amber',  pinned: false },
  { value: 'low',         icon: '🔷', label: 'Low',         color: 'blue',   pinned: false },
  { value: 'information', icon: 'ℹ️', label: 'Information', color: 'blue',   pinned: false },
  { value: 'warning',     icon: '⚠️', label: 'Warning',     color: 'orange', pinned: false },
  { value: 'emergency',   icon: '🚨', label: 'Emergency',   color: 'red',    pinned: true },
];

export const CRITICAL_SEVERITIES = ['critical', 'emergency'];
export const isCriticalSeverity = (value) => CRITICAL_SEVERITIES.includes(value);

export const ALERT_STATUSES = ['draft', 'scheduled', 'published', 'active', 'expired', 'archived'];
export const LIVE_STATUSES = ['published', 'active'];

export const getCategory = (value) => {
  if (!value) return null;
  return { icon: '📢', label: value };
};

export const getSeverity = (value) =>
  ALERT_SEVERITIES.find((s) => s.value === value) || ALERT_SEVERITIES[4];

export const categoryLabel = (value) => value || '';


// ── Tailwind class maps ───────────────────────────────────────────────────────

const CATEGORY_BADGE = {
  blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  indigo: 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300',
  orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300',
  yellow: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-300',
  cyan: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300',
  amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300',
  red: 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  rose: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',
  slate: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',
  purple: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300',
  teal: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300',
  stone: 'bg-stone-100 dark:bg-stone-900/30 text-stone-700 dark:text-stone-300',
  lime: 'bg-lime-100 dark:bg-lime-900/30 text-lime-700 dark:text-lime-300',
  green: 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300',
  brown: 'bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-300',
  gray: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
};

export const SEVERITY_STYLES = {
  critical: {
    bg: 'bg-red-500/10 dark:bg-red-500/20',
    border: 'border-red-500/50 dark:border-red-500/60',
    text: 'text-red-600 dark:text-red-400',
    badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
    pulse: 'animate-pulse',
    leftBorder: 'border-l-red-500',
  },
  high: {
    bg: 'bg-orange-500/5 dark:bg-orange-500/10',
    border: 'border-orange-400/50 dark:border-orange-400/50',
    text: 'text-orange-600 dark:text-orange-400',
    badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
    dot: 'bg-orange-500',
    pulse: '',
    leftBorder: 'border-l-orange-500',
  },
  medium: {
    bg: 'bg-amber-500/5 dark:bg-amber-500/10',
    border: 'border-amber-400/50 dark:border-amber-400/50',
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
    pulse: '',
    leftBorder: 'border-l-amber-500',
  },
  low: {
    bg: 'bg-blue-500/5 dark:bg-blue-500/10',
    border: 'border-blue-400/40 dark:border-blue-400/50',
    text: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
    pulse: '',
    leftBorder: 'border-l-blue-500',
  },
  information: {
    bg: 'bg-blue-500/5 dark:bg-blue-500/10',
    border: 'border-blue-400/40 dark:border-blue-400/50',
    text: 'text-blue-600 dark:text-blue-400',
    badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
    dot: 'bg-blue-500',
    pulse: '',
    leftBorder: 'border-l-blue-500',
  },
  warning: {
    bg: 'bg-orange-500/5 dark:bg-orange-500/10',
    border: 'border-orange-400/50 dark:border-orange-400/50',
    text: 'text-orange-600 dark:text-orange-400',
    badge: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
    dot: 'bg-orange-500',
    pulse: '',
    leftBorder: 'border-l-orange-500',
  },
  emergency: {
    bg: 'bg-red-500/10 dark:bg-red-500/20',
    border: 'border-red-500/50 dark:border-red-500/60',
    text: 'text-red-600 dark:text-red-400',
    badge: 'bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-300',
    dot: 'bg-red-500',
    pulse: 'animate-pulse',
    leftBorder: 'border-l-red-500',
  },
};

export const STATUS_STYLES = {
  draft: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300',
  scheduled: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  published: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  active: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  expired: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  archived: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-500',
};

// Deterministic badge color for a free-text category string (categories have
// no predefined palette — the color is derived so the badge stays stable for a
// given category without any hardcoded category list).
const CATEGORY_BADGE_COLORS = ['blue', 'indigo', 'cyan', 'teal', 'green', 'emerald', 'amber', 'orange', 'rose', 'purple', 'slate', 'stone'];

const hashCategory = (s) => {
  let h = 0;
  for (let i = 0; i < s.length; i += 1) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h % CATEGORY_BADGE_COLORS.length;
};

export const getCategoryBadge = (value) => {
  if (!value) return CATEGORY_BADGE.gray;
  return CATEGORY_BADGE[CATEGORY_BADGE_COLORS[hashCategory(String(value))]] || CATEGORY_BADGE.blue;
};

// ── Permission mirror for the management UI ─────────────────────────────────
// Mirrors backend/src/controllers/alertController.js canModifyAlert so the
// dashboards hide Edit/Delete/Publish/Archive on alerts the current user
// cannot actually modify. Global roles (admin/ADMIN/government) may modify
// anything; subcity admins only alerts that specifically target their own
// subcity; woreda officers only their own woreda.
const GLOBAL_ALERT_ROLES = ['admin', 'ADMIN', 'government'];
const SUB_CITY_ADMIN_ROLES = ['subcity_admin', 'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'SUBCITY_HEAD', 'SUBCITY_ADMIN'];
const WOREDA_ADMIN_ROLES = ['woreda', 'woreda_admin', 'WOREDA_HEAD', 'department', 'DEPARTMENT_ADMIN'];
const SUBCITY_ROLE_MAP = { subcity_bole: 'BOLE', subcity_yeka: 'YEKA', subcity_lemmi_kura: 'LEMMI_KURA' };

const userSubcityName = (user) => user?.subcity || SUBCITY_ROLE_MAP[user?.role] || '';

const isSubcityRole = (role) =>
  SUB_CITY_ADMIN_ROLES.includes(role) || (typeof role === 'string' && role.startsWith('subcity_'));

export function canModifyAlertForUser(user, alert) {
  if (!user || !alert) return false;
  if (GLOBAL_ALERT_ROLES.includes(user.role)) return true;

  if (isSubcityRole(user.role)) {
    if (alert.scope === 'all' || alert.targetType === 'city') return false;
    const mine = userSubcityName(user);
    const mineId = user.subcityId ? String(user.subcityId) : null;
    const eqId = (id) => String(id) === mineId;
    const targetsMine =
      (Array.isArray(alert.subcityIds) && mineId && alert.subcityIds.some(eqId)) ||
      (Array.isArray(alert.subcityNames) && mine && alert.subcityNames.some((n) => String(n).toLowerCase() === mine.toLowerCase())) ||
      (alert.subcityId && mineId && eqId(alert.subcityId)) ||
      (alert.subcityName && mine && alert.subcityName.toLowerCase() === mine.toLowerCase());
    if (!targetsMine) return false;
    if (WOREDA_ADMIN_ROLES.includes(user.role)) {
      const wName = (user.woredaName || '').toLowerCase();
      const wId = user.woredaId ? String(user.woredaId) : null;
      const eqWid = (id) => String(id) === wId;
      return Boolean(
        (Array.isArray(alert.woredaIds) && wId && alert.woredaIds.some(eqWid)) ||
        (Array.isArray(alert.woredaNames) && wName && alert.woredaNames.some((n) => String(n).toLowerCase() === wName)) ||
        (alert.woredaId && wId && eqWid(alert.woredaId)) ||
        (alert.woredaName && wName && alert.woredaName.toLowerCase() === wName)
      );
    }
    return true;
  }

  if (WOREDA_ADMIN_ROLES.includes(user.role)) {
    if (alert.scope === 'all' || alert.targetType === 'city') return false;
    const wName = (user.woredaName || '').toLowerCase();
    const wId = user.woredaId ? String(user.woredaId) : null;
    const eqWid = (id) => String(id) === wId;
    return Boolean(
      (Array.isArray(alert.woredaIds) && wId && alert.woredaIds.some(eqWid)) ||
      (Array.isArray(alert.woredaNames) && wName && alert.woredaNames.some((n) => String(n).toLowerCase() === wName)) ||
      (alert.woredaId && wId && eqWid(alert.woredaId)) ||
      (alert.woredaName && wName && alert.woredaName.toLowerCase() === wName)
    );
  }

  return false;
}

export const locationString = (a) => {
  const parts = [];
  if (a.targetType === 'city' || a.scope === 'all' || a.scopeType === 'city') return 'Addis Ababa (city-wide)';
  const scNames = (a.subcityNames && a.subcityNames.length ? a.subcityNames : a.subcityName ? [a.subcityName] : []);
  const wNames = (a.woredaNames && a.woredaNames.length ? a.woredaNames : a.woredaName ? [a.woredaName] : []);
  parts.push(...scNames, ...wNames);
  return parts.join(' — ') || 'Addis Ababa';
};

// Viewer-relative targeting label (scope isolation). A system-wide admin sees
// the full target list ("Bole, Yeka"); a subcity admin's dashboard shows only
// their own subcity ("Bole Subcity") and a woreda officer's dashboard only
// their woreda name. Mirrors backend `viewerScopeLabel`; falls back to the
// server-supplied `alert.scopeLabel` when present, then to `locationString`.
export function scopeLabelFor(user, alert) {
  if (!alert) return '';
  if (alert.scope === 'all' || alert.targetType === 'city' || alert.scopeType === 'city') return 'Addis Ababa (city-wide)';
  if (user) {
    if (isSubcityRole(user.role)) {
      const mine = userSubcityName(user);
      if (mine) return `${mine} Subcity`;
    } else if (WOREDA_ADMIN_ROLES.includes(user.role)) {
      if (user.woredaName) return user.woredaName;
    }
  }
  return alert.targetLabel || locationString(alert);
}

export const alertLabelFor = (user, alert) =>
  typeof alert.scopeLabel === 'string' && alert.scopeLabel ? alert.scopeLabel : scopeLabelFor(user, alert);

export const alertCreatedByMeFor = (user, alert) =>
  typeof alert.createdByMe === 'boolean'
    ? alert.createdByMe
    : Boolean(alert && alert.createdBy && user && user._id && String(alert.createdBy) === String(user._id));

export const isGlobalAlertRole = (role) => GLOBAL_ALERT_ROLES.includes(role);

// Client-side mirror of the backend buildAlertScope predicate, used to reject
// real-time socket alerts that fall outside the current user's dashboard scope
// (the socket server emits every alert to every connected client). Global roles
// see everything; a subcity admin only city-wide + alerts targeting their own
// subcity; a woreda officer only city-wide + alerts targeting their own woreda.
export function inAlertScopeFor(user, alert) {
  if (!user || !alert) return false;
  if (GLOBAL_ALERT_ROLES.includes(user.role)) return true;
  if (alert.scope === 'all' || alert.targetType === 'city' || alert.scopeType === 'city') return true;

  if (isSubcityRole(user.role)) {
    const mine = userSubcityName(user);
    const mineId = user.subcityId ? String(user.subcityId) : null;
    return Boolean(
      (Array.isArray(alert.subcityIds) && mineId && alert.subcityIds.some((id) => String(id) === mineId)) ||
      (Array.isArray(alert.subcityNames) && mine && alert.subcityNames.some((n) => String(n).toLowerCase() === mine.toLowerCase())) ||
      (alert.subcityId && mineId && String(alert.subcityId) === mineId) ||
      (alert.subcityName && mine && alert.subcityName.toLowerCase() === mine.toLowerCase())
    );
  }

  if (WOREDA_ADMIN_ROLES.includes(user.role)) {
    const wName = (user.woredaName || '').toLowerCase();
    const wId = user.woredaId ? String(user.woredaId) : null;
    return Boolean(
      (Array.isArray(alert.woredaIds) && wId && alert.woredaIds.some((id) => String(id) === wId)) ||
      (Array.isArray(alert.woredaNames) && wName && alert.woredaNames.some((n) => String(n).toLowerCase() === wName)) ||
      (alert.woredaId && wId && String(alert.woredaId) === wId) ||
      (alert.woredaName && wName && alert.woredaName.toLowerCase() === wName)
    );
  }

  return true;
}
