// Shared metadata for the Public Alert & Broadcast system.
// Single source of truth for categories, severities, and per-category
// safety instructions so the model, controller, seed script, and any
// exports never drift.

// ── Alert categories ──────────────────────────────────────────────────────────
// The canonical list drives the Unified Public Alert Form. Every entry carries
// an En/Am label, an icon, a colour token and safety instructions that are
// auto-attached to alerts created with that category.
//
// NOTE: a handful of legacy values (construction_advisory, security_advisory,
// community_announcement) are NOT part of the new form but must stay valid
// enum members so pre-existing documents keep working. They are declared in
// LEGACY_CATEGORIES and merged into CATEGORY_VALUES below.
const ALERT_CATEGORIES = [
  {
    value: 'flood',
    icon: '🌊',
    color: 'blue',
    labelEn: 'Flood Warning',
    labelAm: 'የጎርፍ ማስጠንቀቂያ',
    safetyInstructions: [
      'Move to higher ground immediately and avoid low-lying areas.',
      'Do not attempt to cross flooded roads or bridges on foot or by vehicle.',
      'Turn off electrical appliances and disconnect gas supplies if flooding enters your home.',
      'Keep emergency contact numbers handy and follow official guidance.',
    ],
  },
  {
    value: 'heavy_rainfall',
    icon: '🌧️',
    color: 'indigo',
    labelEn: 'Heavy Rainfall',
    labelAm: 'ከፍተኛ የዝናብ ማስጠንቀቂያ',
    safetyInstructions: [
      'Avoid traveling unless absolutely necessary during peak rainfall.',
      'Stay away from riverbanks, culverts, and areas prone to flash floods.',
      'Secure loose objects on balconies and roofs.',
      'Keep children indoors and monitor local weather updates.',
    ],
  },
  {
    value: 'landslide_risk',
    icon: '⛰️',
    color: 'stone',
    labelEn: 'Landslide Risk',
    labelAm: 'የመሬት መንሸራተት አደጋ',
    safetyInstructions: [
      'Evacuate hillside areas immediately and move to flat, open ground.',
      'Stay alert for cracks in the ground, leaning trees or moving soil.',
      'Never cross recently landslide-affected roads or bridges.',
      'Report ground movement signs to the local authorities right away.',
    ],
  },
  {
    value: 'public_health',
    icon: '🏥',
    color: 'red',
    labelEn: 'Public Health Emergency',
    labelAm: 'የህብረተሰብ ጤና ድንገተኛ አደጋ',
    safetyInstructions: [
      'Follow hygiene measures: wash hands frequently and use sanitizer.',
      'Avoid crowded areas and maintain physical distance when advised.',
      'Seek medical attention if you develop symptoms.',
      'Follow guidance from health authorities and official announcements.',
    ],
  },
  {
    value: 'cholera_alert',
    icon: '🦠',
    color: 'cyan',
    labelEn: 'Cholera Alert',
    labelAm: 'የኮሌራ ማስጠንቀቂያ',
    safetyInstructions: [
      'Drink only boiled or treated water and use clean containers.',
      'Wash hands with soap before eating and after using the toilet.',
      'Seek medical care immediately if you experience severe watery diarrhoea.',
      'Report suspected cases to the nearest health facility.',
    ],
  },
  {
    value: 'dengue_alert',
    icon: '🦟',
    color: 'lime',
    labelEn: 'Dengue Alert',
    labelAm: 'የዴንግ ትኩሳት ማስጠንቀቂያ',
    safetyInstructions: [
      'Use insect repellent and sleep under mosquito nets.',
      'Drain standing water around your home where mosquitoes breed.',
      'Wear long sleeves and trousers during peak mosquito hours.',
      'Seek medical help for high fever, severe headache or joint pain.',
    ],
  },
  {
    value: 'fire_emergency',
    icon: '🔥',
    color: 'rose',
    labelEn: 'Fire Emergency',
    labelAm: 'የእሳት አደጋ',
    safetyInstructions: [
      'Evacuate the area immediately using the nearest safe exit.',
      'Call the fire department and emergency services right away.',
      'Do not use elevators during a fire.',
      'Stop, drop, and roll if your clothing catches fire.',
    ],
  },
  {
    value: 'security_alert',
    icon: '🚨',
    color: 'purple',
    labelEn: 'Security Alert',
    labelAm: 'የፀጥታ ማስጠንቀቂያ',
    safetyInstructions: [
      'Stay indoors and remain alert to your surroundings.',
      'Avoid gatherings or areas mentioned in the alert.',
      'Follow instructions from security forces.',
      'Report suspicious activity to the nearest police station.',
    ],
  },
  {
    value: 'road_closure',
    icon: '🚧',
    color: 'orange',
    labelEn: 'Road Closure',
    labelAm: 'የመንገድ መዘጋት',
    safetyInstructions: [
      'Use the designated alternative routes shown in the alert.',
      'Reduce speed and be alert for construction workers and signage.',
      'Do not remove barriers or drive on closed sections.',
      'Plan extra travel time for your journey.',
    ],
  },
  {
    value: 'traffic_diversion',
    icon: '🚗',
    color: 'yellow',
    labelEn: 'Traffic Diversion',
    labelAm: 'የትራፊክ ማዞሪያ',
    safetyInstructions: [
      'Follow diversion signs and traffic police directions.',
      'Expect delays; use public transport where possible.',
      'Merge early and avoid sudden lane changes.',
      'Allow extra time for emergency vehicles to pass.',
    ],
  },
  {
    value: 'water_interruption',
    icon: '💧',
    color: 'cyan',
    labelEn: 'Water Interruption',
    labelAm: 'የውሃ መቋረጥ',
    safetyInstructions: [
      'Store clean drinking water in advance of the interruption window.',
      'Close taps before supply resumes to avoid wastage.',
      'Boil or treat stored water if the interruption was unplanned.',
      'Report leaks or contamination to the responsible utility.',
    ],
  },
  {
    value: 'power_outage',
    icon: '⚡',
    color: 'amber',
    labelEn: 'Power Outage',
    labelAm: 'የኤሌክትሪክ መቆራረጥ ማስታወቂያ',
    safetyInstructions: [
      'Unplug sensitive electronic equipment to protect from surges.',
      'Keep a charged torch and backup batteries ready.',
      'Use generators in well-ventilated areas only — never indoors.',
      'Report fallen or damaged power lines to the utility; keep away from them.',
    ],
  },
  {
    value: 'infrastructure_maintenance',
    icon: '🛠️',
    color: 'slate',
    labelEn: 'Infrastructure Maintenance',
    labelAm: 'የመሰረተ ልማት ጥገና',
    safetyInstructions: [
      'Keep a safe distance from active maintenance work zones.',
      'Obey warning signs, barricades and traffic officers.',
      'Expect temporary service disruptions and plan accordingly.',
      'Report hazardous conditions caused by the works to the authorities.',
    ],
  },
  {
    value: 'vaccination_campaign',
    icon: '💉',
    color: 'green',
    labelEn: 'Vaccination Campaign',
    labelAm: 'የክትባት ዘመቻ',
    safetyInstructions: [
      'Carry your ID and vaccination card to the campaign site.',
      'Arrive early to reduce waiting time and crowding.',
      'Report any severe reaction to the health workers on site.',
      'Follow the vaccination schedule advised by health professionals.',
    ],
  },
  {
    value: 'community_meeting',
    icon: '🗣️',
    color: 'teal',
    labelEn: 'Community Meeting',
    labelAm: 'የማህበረሰብ ስብሰባ',
    safetyInstructions: [
      'Verify the meeting date, time and venue with official channels.',
      'Arrive early and follow the organizers’ instructions.',
      'Share the announcement with neighbours who may not have internet access.',
      'Keep personal documents safe and avoid sharing sensitive information.',
    ],
  },
  {
    value: 'sanitation_campaign',
    icon: '🧹',
    color: 'emerald',
    labelEn: 'Sanitation Campaign',
    labelAm: 'የንፅህና ዘመቻ',
    safetyInstructions: [
      'Dispose of waste only in designated collection points.',
      'Wear gloves and protective gear when handling waste.',
      'Keep water sources clean and away from waste materials.',
      'Report illegal dumping to the local authorities.',
    ],
  },
  {
    value: 'illegal_construction',
    icon: '🏗️',
    color: 'slate',
    labelEn: 'Illegal Construction Enforcement',
    labelAm: 'ህገወጥ ግንባታ ማስፈጸሚያ',
    safetyInstructions: [
      'Do not enter active construction sites without authorization.',
      'Obey warning signs and barricades.',
      'Ensure your own building projects obtain the required permits.',
      'Report illegal construction activity to the authorities.',
    ],
  },
  {
    value: 'land_administration',
    icon: '🏛️',
    color: 'brown',
    labelEn: 'Land Administration Notice',
    labelAm: 'የመሬት አስተዳደር ማስታወቂያ',
    safetyInstructions: [
      'Bring your landholding documentation when visiting the office.',
      'Verify notice details with the land administration office.',
      'Keep copies of all submitted documents for your records.',
      'Report any request for unofficial payments to the authorities.',
    ],
  },
  {
    value: 'service_center_closure',
    icon: '🏢',
    color: 'gray',
    labelEn: 'Service Center Closure',
    labelAm: 'የአገልግሎት ማዕከል መዘጋት',
    safetyInstructions: [
      'Use alternative service channels or the nearest open branch.',
      'Complete online procedures where available.',
      'Check the center’s reopening date before travelling.',
      'Follow any temporary arrangements described in the alert.',
    ],
  },
  {
    value: 'public_awareness_campaign',
    icon: '📢',
    color: 'teal',
    labelEn: 'Public Awareness Campaign',
    labelAm: 'የህብረተሰብ ግንዛቤ ዘመቻ',
    safetyInstructions: [
      'Follow the official campaign messages and guidance.',
      'Share accurate information and avoid spreading rumours.',
      'Participate in activities only at approved venues.',
      'Contact the organizers for verified details.',
    ],
  },
  {
    value: 'other',
    icon: '📌',
    color: 'slate',
    labelEn: 'Other',
    labelAm: 'ሌላ',
    safetyInstructions: [
      'Follow the instructions in the alert description.',
      'Contact the issuing authority for more information.',
      'Share the alert with neighbours who may not have internet access.',
    ],
  },
];

// Legacy categories that predate the unified form. They remain valid enum
// values so older alerts continue to load, but they are not offered in the
// new form.
const LEGACY_CATEGORIES = [
  {
    value: 'construction_advisory',
    icon: '🏗️',
    color: 'slate',
    labelEn: 'Construction Advisory',
    labelAm: 'የግንባታ ማስታወቂያ',
    safetyInstructions: [
      'Keep a safe distance from active construction sites.',
      'Obey warning signs and barricades.',
      'Wear safety equipment when working near the site.',
      'Report unsafe conditions or debris to the authorities.',
    ],
  },
  {
    value: 'security_advisory',
    icon: '🚨',
    color: 'purple',
    labelEn: 'Security Advisory',
    labelAm: 'የፀጥታ ማስጠንቀቂያ',
    safetyInstructions: [
      'Stay indoors and remain alert to your surroundings.',
      'Avoid gatherings or areas mentioned in the advisory.',
      'Follow instructions from security forces.',
      'Report suspicious activity to the nearest police station.',
    ],
  },
  {
    value: 'community_announcement',
    icon: '📢',
    color: 'teal',
    labelEn: 'Community Announcement',
    labelAm: 'የማህበረሰብ ማስታወቂያ',
    safetyInstructions: [
      'Share the announcement with neighbors who may not have internet access.',
      'Verify event details with official channels before attending.',
      'Keep personal documents safe and avoid sharing sensitive information.',
    ],
  },
];

const ALL_CATEGORIES = [...ALERT_CATEGORIES, ...LEGACY_CATEGORIES];
const CATEGORY_VALUES = ALL_CATEGORIES.map((c) => c.value);

// ── Severities ────────────────────────────────────────────────────────────────
// critical (red, pinned) → always delivered, cannot be opted out of.
// high (orange) → urgent; medium / low / information (blue) → routine.
// `emergency` and `warning` are kept as legacy aliases so old documents and
// clients keep working; the new form only offers the five canonical levels.
const ALERT_SEVERITIES = {
  critical: {
    icon: '🚨',
    color: 'red',
    labelEn: 'Critical',
    labelAm: 'ወሳኝ',
    pinned: true,
  },
  high: {
    icon: '⚠️',
    color: 'orange',
    labelEn: 'High',
    labelAm: 'ከፍተኛ',
    pinned: false,
  },
  medium: {
    icon: '🔶',
    color: 'amber',
    labelEn: 'Medium',
    labelAm: 'መካከለኛ',
    pinned: false,
  },
  low: {
    icon: '🔷',
    color: 'blue',
    labelEn: 'Low',
    labelAm: 'ዝቅተኛ',
    pinned: false,
  },
  information: {
    icon: 'ℹ️',
    color: 'blue',
    labelEn: 'Information',
    labelAm: 'መረጃ',
    pinned: false,
  },
  // Legacy aliases — kept valid for older rows, not offered in the new form.
  warning: {
    icon: '⚠️',
    color: 'orange',
    labelEn: 'Warning',
    labelAm: 'ማስጠንቀቂያ',
    pinned: false,
  },
  emergency: {
    icon: '🚨',
    color: 'red',
    labelEn: 'Emergency',
    labelAm: 'ድንገተኛ',
    pinned: true,
  },
};

const SEVERITY_VALUES = Object.keys(ALERT_SEVERITIES);

// Critical severities are always delivered regardless of subscriptions and are
// always pinned on citizen feeds.
const CRITICAL_SEVERITIES = ['critical', 'emergency'];
const isCriticalSeverity = (value) => CRITICAL_SEVERITIES.includes(value);

// Valid lifecycle statuses for an alert.
// 'draft'      → created, not yet published
// 'scheduled'  → startAt is in the future; auto-publishes by the scheduler
// 'published'  → canonical "live/visible" status
// 'active'     → legacy alias for published (older documents)
// 'expired'    → endAt passed / explicitly expired
// 'archived'   → hidden after expiry, kept for records
const ALERT_STATUSES = ['draft', 'scheduled', 'published', 'active', 'expired', 'archived'];
const LIVE_STATUSES = ['published', 'active'];

function getCategoryMeta(value) {
  if (!value) return null;
  return ALL_CATEGORIES.find((c) => c.value === value) || null;
}

function getSeverityMeta(value) {
  return ALERT_SEVERITIES[value] || ALERT_SEVERITIES.information;
}

// An alert without a category carries NO category-specific safety
// instructions (empty list), so a blank category never imports the flood
// category's instructions by accident.
function safetyInstructionsFor(categoryValue) {
  if (!categoryValue) return [];
  return getCategoryMeta(categoryValue)?.safetyInstructions || [];
}

module.exports = {
  ALERT_CATEGORIES,
  LEGACY_CATEGORIES,
  ALL_CATEGORIES,
  CATEGORY_VALUES,
  ALERT_SEVERITIES,
  SEVERITY_VALUES,
  CRITICAL_SEVERITIES,
  isCriticalSeverity,
  ALERT_STATUSES,
  LIVE_STATUSES,
  getCategoryMeta,
  getSeverityMeta,
  safetyInstructionsFor,
};
