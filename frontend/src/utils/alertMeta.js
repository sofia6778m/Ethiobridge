// Shared frontend metadata for the Public Alert & Broadcast system.
// Mirrors backend/src/utils/alertMetadata.js so the UI and API never drift.

// ── Canonical categories (offered in the Unified Public Alert Form) ───────────
export const ALERT_CATEGORIES = [
  { value: 'flood',                       icon: '🌊',  label: 'Flood Warning',                    color: 'blue' },
  { value: 'heavy_rainfall',              icon: '🌧️', label: 'Heavy Rainfall',                  color: 'indigo' },
  { value: 'landslide_risk',              icon: '⛰️', label: 'Landslide Risk',                  color: 'stone' },
  { value: 'public_health',               icon: '🏥',  label: 'Public Health Emergency',         color: 'red' },
  { value: 'cholera_alert',               icon: '🦠',  label: 'Cholera Alert',                  color: 'cyan' },
  { value: 'dengue_alert',                icon: '🦟',  label: 'Dengue Alert',                   color: 'lime' },
  { value: 'fire_emergency',              icon: '🔥',  label: 'Fire Emergency',                 color: 'rose' },
  { value: 'security_alert',              icon: '🚨',  label: 'Security Alert',                 color: 'purple' },
  { value: 'road_closure',                icon: '🚧',  label: 'Road Closure',                   color: 'orange' },
  { value: 'traffic_diversion',           icon: '🚗',  label: 'Traffic Diversion',              color: 'yellow' },
  { value: 'water_interruption',          icon: '💧',  label: 'Water Interruption',             color: 'cyan' },
  { value: 'power_outage',                icon: '⚡',  label: 'Power Outage',                   color: 'amber' },
  { value: 'infrastructure_maintenance',  icon: '🛠️', label: 'Infrastructure Maintenance',      color: 'slate' },
  { value: 'vaccination_campaign',        icon: '💉',  label: 'Vaccination Campaign',           color: 'green' },
  { value: 'community_meeting',           icon: '🗣️', label: 'Community Meeting',               color: 'teal' },
  { value: 'sanitation_campaign',         icon: '🧹',  label: 'Sanitation Campaign',            color: 'emerald' },
  { value: 'illegal_construction',        icon: '🏗️', label: 'Illegal Construction Enforcement', color: 'slate' },
  { value: 'land_administration',         icon: '🏛️', label: 'Land Administration Notice',      color: 'brown' },
  { value: 'service_center_closure',      icon: '🏢',  label: 'Service Center Closure',         color: 'gray' },
  { value: 'public_awareness_campaign',   icon: '📢',  label: 'Public Awareness Campaign',      color: 'teal' },
  { value: 'other',                       icon: '📌',  label: 'Other',                          color: 'slate' },
];

// Legacy categories that predate the unified form. Still valid enum values so
// older alerts keep loading, but not offered in the new form.
export const LEGACY_CATEGORIES = [
  { value: 'construction_advisory',   icon: '🏗️', label: 'Construction Advisory',   color: 'slate' },
  { value: 'security_advisory',       icon: '🚨',  label: 'Security Advisory',       color: 'purple' },
  { value: 'community_announcement',  icon: '📢',  label: 'Community Announcement',  color: 'teal' },
];

export const ALL_CATEGORIES = [...ALERT_CATEGORIES, ...LEGACY_CATEGORIES];

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
  return ALL_CATEGORIES.find((c) => c.value === value) || null;
};

export const getSeverity = (value) =>
  ALERT_SEVERITIES.find((s) => s.value === value) || ALERT_SEVERITIES[4];

export const categoryLabel = (value, customCategory) => {
  if (value === 'other' && customCategory) return customCategory;
  return getCategory(value)?.label || value || '';
};

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

export const getCategoryBadge = (value) => {
  if (!value) return CATEGORY_BADGE.gray;
  return CATEGORY_BADGE[getCategory(value)?.color] || CATEGORY_BADGE.blue;
};

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
  landslide_risk: [
    'Evacuate hillside areas immediately and move to flat, open ground.',
    'Stay alert for cracks in the ground, leaning trees or moving soil.',
    'Never cross recently landslide-affected roads or bridges.',
    'Report ground movement signs to the local authorities right away.',
  ],
  public_health: [
    'Follow hygiene measures: wash hands frequently and use sanitizer.',
    'Avoid crowded areas and maintain physical distance when advised.',
    'Seek medical attention if you develop symptoms.',
    'Follow guidance from health authorities and official announcements.',
  ],
  cholera_alert: [
    'Drink only boiled or treated water and use clean containers.',
    'Wash hands with soap before eating and after using the toilet.',
    'Seek medical care immediately if you experience severe watery diarrhoea.',
    'Report suspected cases to the nearest health facility.',
  ],
  dengue_alert: [
    'Use insect repellent and sleep under mosquito nets.',
    'Drain standing water around your home where mosquitoes breed.',
    'Wear long sleeves and trousers during peak mosquito hours.',
    'Seek medical help for high fever, severe headache or joint pain.',
  ],
  fire_emergency: [
    'Evacuate the area immediately using the nearest safe exit.',
    'Call the fire department and emergency services right away.',
    'Do not use elevators during a fire.',
    'Stop, drop, and roll if your clothing catches fire.',
  ],
  security_alert: [
    'Stay indoors and remain alert to your surroundings.',
    'Avoid gatherings or areas mentioned in the alert.',
    'Follow instructions from security forces.',
    'Report suspicious activity to the nearest police station.',
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
  infrastructure_maintenance: [
    'Keep a safe distance from active maintenance work zones.',
    'Obey warning signs, barricades and traffic officers.',
    'Expect temporary service disruptions and plan accordingly.',
    'Report hazardous conditions caused by the works to the authorities.',
  ],
  vaccination_campaign: [
    'Carry your ID and vaccination card to the campaign site.',
    'Arrive early to reduce waiting time and crowding.',
    'Report any severe reaction to the health workers on site.',
    'Follow the vaccination schedule advised by health professionals.',
  ],
  community_meeting: [
    'Verify the meeting date, time and venue with official channels.',
    'Arrive early and follow the organizers’ instructions.',
    'Share the announcement with neighbours who may not have internet access.',
    'Keep personal documents safe and avoid sharing sensitive information.',
  ],
  sanitation_campaign: [
    'Dispose of waste only in designated collection points.',
    'Wear gloves and protective gear when handling waste.',
    'Keep water sources clean and away from waste materials.',
    'Report illegal dumping to the local authorities.',
  ],
  illegal_construction: [
    'Do not enter active construction sites without authorization.',
    'Obey warning signs and barricades.',
    'Ensure your own building projects obtain the required permits.',
    'Report illegal construction activity to the authorities.',
  ],
  land_administration: [
    'Bring your landholding documentation when visiting the office.',
    'Verify notice details with the land administration office.',
    'Keep copies of all submitted documents for your records.',
    'Report any request for unofficial payments to the authorities.',
  ],
  service_center_closure: [
    'Use alternative service channels or the nearest open branch.',
    'Complete online procedures where available.',
    'Check the center’s reopening date before travelling.',
    'Follow any temporary arrangements described in the alert.',
  ],
  public_awareness_campaign: [
    'Follow the official campaign messages and guidance.',
    'Share accurate information and avoid spreading rumours.',
    'Participate in activities only at approved venues.',
    'Contact the organizers for verified details.',
  ],
  other: [
    'Follow the instructions in the alert description.',
    'Contact the issuing authority for more information.',
    'Share the alert with neighbours who may not have internet access.',
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
  if (a.targetType === 'city' || a.scope === 'all' || a.scopeType === 'city') return 'Addis Ababa (city-wide)';
  const scNames = (a.subcityNames && a.subcityNames.length ? a.subcityNames : a.subcityName ? [a.subcityName] : []);
  const wNames = (a.woredaNames && a.woredaNames.length ? a.woredaNames : a.woredaName ? [a.woredaName] : []);
  parts.push(...scNames, ...wNames);
  return parts.join(' — ') || 'Addis Ababa';
};
