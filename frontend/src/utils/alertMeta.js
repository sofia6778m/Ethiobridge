// Shared frontend metadata for the Public Alert & Broadcast system.
// Mirrors backend/src/utils/alertMetadata.js so the UI and API never drift.

export const ALERT_CATEGORIES = [
  { value: 'flood',                icon: '🌊', label: 'Flood Warning',              labelKey: 'alert.category.flood',                color: 'blue' },
  { value: 'heavy_rainfall',       icon: '🌧️', label: 'Heavy Rainfall Advisory',    labelKey: 'alert.category.heavy_rainfall',       color: 'indigo' },
  { value: 'road_closure',         icon: '🚧', label: 'Road Closure',               labelKey: 'alert.category.road_closure',         color: 'orange' },
  { value: 'traffic_diversion',    icon: '🚗', label: 'Traffic Diversion',          labelKey: 'alert.category.traffic_diversion',    color: 'yellow' },
  { value: 'water_interruption',   icon: '💧', label: 'Water Interruption',         labelKey: 'alert.category.water_interruption',   color: 'cyan' },
  { value: 'power_outage',         icon: '⚡', label: 'Power Outage Notice',         labelKey: 'alert.category.power_outage',         color: 'amber' },
  { value: 'public_health',        icon: '🏥', label: 'Public Health Warning',       labelKey: 'alert.category.public_health',        color: 'red' },
  { value: 'fire_emergency',       icon: '🔥', label: 'Fire Emergency',             labelKey: 'alert.category.fire_emergency',       color: 'rose' },
  { value: 'construction_advisory', icon: '🏗️', label: 'Construction Advisory',      labelKey: 'alert.category.construction_advisory', color: 'slate' },
  { value: 'security_advisory',    icon: '🚨', label: 'Security Advisory',          labelKey: 'alert.category.security_advisory',    color: 'purple' },
  { value: 'community_announcement', icon: '📢', label: 'Community Announcement',    labelKey: 'alert.category.community_announcement', color: 'teal' },
];

export const ALERT_SEVERITIES = [
  { value: 'information', icon: 'ℹ️', label: 'Information', labelKey: 'alert.severity.information', color: 'blue',    pinned: false },
  { value: 'warning',     icon: '⚠️', label: 'Warning',     labelKey: 'alert.severity.warning',     color: 'orange',  pinned: false },
  { value: 'emergency',   icon: '🚨', label: 'Emergency',   labelKey: 'alert.severity.emergency',   color: 'red',     pinned: true },
];

export const ALERT_STATUSES = ['scheduled', 'published', 'active', 'expired', 'archived'];

export const getCategory = (value) =>
  ALERT_CATEGORIES.find((c) => c.value === value) || ALERT_CATEGORIES[ALERT_CATEGORIES.length - 1];

export const getSeverity = (value) =>
  ALERT_SEVERITIES.find((s) => s.value === value) || ALERT_SEVERITIES[0];

export const categoryLabel = (value) => getCategory(value)?.label || value || '';

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
};

export const SEVERITY_STYLES = {
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
    bg: 'bg-amber-500/5 dark:bg-amber-500/10',
    border: 'border-amber-400/50 dark:border-amber-400/50',
    text: 'text-amber-600 dark:text-amber-400',
    badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
    dot: 'bg-amber-500',
    pulse: '',
    leftBorder: 'border-l-amber-500',
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
  scheduled: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
  published: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  active: 'bg-green-100 dark:bg-green-900/20 text-green-700 dark:text-green-300',
  expired: 'bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400',
  archived: 'bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-500',
};

export const getCategoryBadge = (value) => CATEGORY_BADGE[getCategory(value)?.color] || CATEGORY_BADGE.blue;

// Safety instructions shown on the public detail page.
export const SAFETY_INSTRUCTIONS = {
  flood: [
    'Move to higher ground immediately and avoid low-lying areas.',
    'Do not attempt to cross flooded roads or bridges on foot or by vehicle.',
    'Turn off electrical appliances and disconnect gas supplies if flooding enters your home.',
    'Keep emergency contact numbers handy and follow official guidance.',
  ],
  heavy_rainfall: [
    'Avoid traveling unless absolutely necessary during peak rainfall.',
    'Stay away from riverbanks, culverts, and areas prone to flash floods.',
    'Secure loose objects on balconies and roofs.',
    'Keep children indoors and monitor local weather updates.',
  ],
  road_closure: [
    'Use the designated alternative routes shown in the alert.',
    'Reduce speed and be alert for construction workers and signage.',
    'Do not remove barriers or drive on closed sections.',
    'Plan extra travel time for your journey.',
  ],
  traffic_diversion: [
    'Follow diversion signs and traffic police directions.',
    'Expect delays; use public transport where possible.',
    'Merge early and avoid sudden lane changes.',
    'Allow extra time for emergency vehicles to pass.',
  ],
  water_interruption: [
    'Store clean drinking water in advance of the interruption window.',
    'Close taps before supply resumes to avoid wastage.',
    'Boil or treat stored water if the interruption was unplanned.',
    'Report leaks or contamination to the responsible utility.',
  ],
  power_outage: [
    'Unplug sensitive electronic equipment to protect from surges.',
    'Keep a charged torch and backup batteries ready.',
    'Use generators in well-ventilated areas only — never indoors.',
    'Report fallen or damaged power lines to the utility; keep away from them.',
  ],
  public_health: [
    'Follow hygiene measures: wash hands frequently and use sanitizer.',
    'Avoid crowded areas and maintain physical distance when advised.',
    'Seek medical attention if you develop symptoms.',
    'Follow guidance from health authorities and official announcements.',
  ],
  fire_emergency: [
    'Evacuate the area immediately using the nearest safe exit.',
    'Call the fire department and emergency services right away.',
    'Do not use elevators during a fire.',
    'Stop, drop, and roll if your clothing catches fire.',
  ],
  construction_advisory: [
    'Keep a safe distance from active construction sites.',
    'Obey warning signs and barricades.',
    'Wear safety equipment when working near the site.',
    'Report unsafe conditions or debris to the authorities.',
  ],
  security_advisory: [
    'Stay indoors and remain alert to your surroundings.',
    'Avoid gatherings or areas mentioned in the advisory.',
    'Follow instructions from security forces.',
    'Report suspicious activity to the nearest police station.',
  ],
  community_announcement: [
    'Share the announcement with neighbors who may not have internet access.',
    'Verify event details with official channels before attending.',
    'Keep personal documents safe and avoid sharing sensitive information.',
  ],
};

export const locationString = (a) => {
  const parts = [];
  if (a.scope === 'all') return 'Addis Ababa (city-wide)';
  if (a.subcityName) parts.push(a.subcityName);
  if (a.woredaName) parts.push(a.woredaName);
  return parts.join(' — ') || 'Addis Ababa';
};
