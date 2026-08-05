// Shared metadata for the Public Alert & Broadcast system.
// Single source of truth for categories, severities, and per-category
// safety instructions so the model, controller, seed script, and any
// exports never drift.

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
    labelEn: 'Heavy Rainfall Advisory',
    labelAm: 'ከፍተኛ የዝናብ ማስጠንቀቂያ',
    safetyInstructions: [
      'Avoid traveling unless absolutely necessary during peak rainfall.',
      'Stay away from riverbanks, culverts, and areas prone to flash floods.',
      'Secure loose objects on balconies and roofs.',
      'Keep children indoors and monitor local weather updates.',
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
    labelEn: 'Power Outage Notice',
    labelAm: 'የኤሌክትሪክ መቆራረጥ ማስታወቂያ',
    safetyInstructions: [
      'Unplug sensitive electronic equipment to protect from surges.',
      'Keep a charged torch and backup batteries ready.',
      'Use generators in well-ventilated areas only — never indoors.',
      'Report fallen or damaged power lines to the utility; keep away from them.',
    ],
  },
  {
    value: 'public_health',
    icon: '🏥',
    color: 'red',
    labelEn: 'Public Health Warning',
    labelAm: 'የህብረተሰብ ጤና ማስጠንቀቂያ',
    safetyInstructions: [
      'Follow hygiene measures: wash hands frequently and use sanitizer.',
      'Avoid crowded areas and maintain physical distance when advised.',
      'Seek medical attention if you develop symptoms.',
      'Follow guidance from health authorities and official announcements.',
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

const CATEGORY_VALUES = ALERT_CATEGORIES.map((c) => c.value);

// severity: information (blue), warning (orange), emergency (red, pinned)
const ALERT_SEVERITIES = {
  information: {
    icon: 'ℹ️',
    color: 'blue',
    labelEn: 'Information',
    labelAm: 'መረጃ',
    pinned: false,
  },
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

// Valid lifecycle statuses for an alert.
// 'published' is the canonical "live/visible" status. 'active' is kept as a
// legacy alias so older documents and clients keep working — everywhere in the
// API the two are treated as equivalent.
const ALERT_STATUSES = ['scheduled', 'published', 'active', 'expired', 'archived'];
const LIVE_STATUSES = ['published', 'active'];

function getCategoryMeta(value) {
  return ALERT_CATEGORIES.find((c) => c.value === value) || ALERT_CATEGORIES[ALERT_CATEGORIES.length - 1];
}

function getSeverityMeta(value) {
  return ALERT_SEVERITIES[value] || ALERT_SEVERITIES.information;
}

function safetyInstructionsFor(categoryValue) {
  return getCategoryMeta(categoryValue).safetyInstructions;
}

module.exports = {
  ALERT_CATEGORIES,
  CATEGORY_VALUES,
  ALERT_SEVERITIES,
  SEVERITY_VALUES,
  ALERT_STATUSES,
  LIVE_STATUSES,
  getCategoryMeta,
  getSeverityMeta,
  safetyInstructionsFor,
};
