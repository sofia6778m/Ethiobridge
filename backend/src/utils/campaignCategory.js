// campaignCategory.js
// ─────────────────────
// The 11 community campaign categories of the Community Campaign & Local
// Development Platform for Addis Ababa subcities and woredas. Each category
// maps to a legacy campaignType so the rest of the platform keeps working.

const CAMPAIGN_CATEGORIES = [
  { code: 'school_feeding', en: 'School Feeding & Education Support', am: 'የትምህርት ቤት ምግብና የትምህርት ድጋፍ', campaignType: 'general' },
  { code: 'back_to_school', en: 'Back-to-School Supplies', am: 'የትምህርት ቁሳቁስ', campaignType: 'general' },
  { code: 'elderly_home_repair', en: 'Elderly Home Repair', am: 'የአረጋውያን ቤት ጥገና', campaignType: 'infrastructure' },
  { code: 'social_welfare', en: 'Social Welfare Support', am: 'ማህበራዊ ድጋፍ', campaignType: 'general' },
  { code: 'community_health', en: 'Community Health Equipment', am: 'የማህበረሰብ ጤና መሳሪያዎች', campaignType: 'general' },
  { code: 'emergency_medical', en: 'Emergency Medical Fund', am: 'የድንገተኛ ሕክምና ፈንድ', campaignType: 'emergency' },
  { code: 'youth_sports_libraries', en: 'Youth Sports & Libraries', am: 'የወጣቶች ስፖርትና ቤተመጻሕፍት', campaignType: 'general' },
  { code: 'sanitation_river_cleanup', en: 'Public Sanitation & River Cleanup', am: 'የንፅህናና የወንዝ ጽዳት', campaignType: 'general' },
  { code: 'green_initiatives', en: 'Green Initiatives & Tree Planting', am: 'አረንጓዴ ተነሳሽነትና የዛፍ ተከላ', campaignType: 'general' },
  { code: 'public_square_rehab', en: 'Public Square Rehabilitation', am: 'የህዝብ አደባባይ ተሃድሶ', campaignType: 'infrastructure' },
  { code: 'community_center', en: 'Community Center Improvement', am: 'የማህበረሰብ ማዕከል ማሻሻል', campaignType: 'infrastructure' },
  { code: 'other', en: 'Other Community Project', am: 'ሌላ የማህበረሰብ ፕሮጀክት', campaignType: 'general' },
];

const CATEGORY_CODES = CAMPAIGN_CATEGORIES.map((c) => c.code);

const categoryLabel = (code, lang = 'en') => {
  const found = CAMPAIGN_CATEGORIES.find((c) => c.code === code);
  if (!found) return '';
  return lang === 'am' ? found.am : found.en;
};

// The impact metric keys that matter per category — used by the office update
// form to suggest which impact numbers to track.
const CATEGORY_IMPACT_METRICS = {
  school_feeding: ['mealsServed', 'studentsSupported'],
  back_to_school: ['studentsSupported'],
  elderly_home_repair: ['housesRepaired', 'elderlyServed'],
  social_welfare: ['beneficiariesReached'],
  community_health: ['equipmentProvided', 'patientsSupported'],
  emergency_medical: ['patientsSupported', 'beneficiariesReached'],
  youth_sports_libraries: ['youthEngaged'],
  sanitation_river_cleanup: ['sanitationSites', 'beneficiariesReached'],
  green_initiatives: ['treesPlanted', 'beneficiariesReached'],
  public_square_rehab: ['sanitationSites', 'beneficiariesReached'],
  community_center: ['beneficiariesReached'],
  other: ['beneficiariesReached'],
};

// Get the default campaignType for a given category code.
const campaignTypeForCategory = (code) => {
  const found = CAMPAIGN_CATEGORIES.find((c) => c.code === code);
  return found ? found.campaignType : 'general';
};

module.exports = {
  CAMPAIGN_CATEGORIES,
  CATEGORY_CODES,
  categoryLabel,
  CATEGORY_IMPACT_METRICS,
  campaignTypeForCategory,
};
