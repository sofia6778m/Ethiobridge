const IssueTemplate = require('../models/IssueTemplate');

// Built-in issue templates: 5 per department (Electricity, Water, Road) at each
// of the two handling levels (Woreda = minor maintenance, Subcity = major works).
const MUNICIPAL_TEMPLATE_SEED = [
  // ── Woreda level ────────────────────────────────────────────────────────────
  ['Electricity', 'Woreda', 'Street light bulb replacement', 'Replace a faulty street light bulb on a single fixture'],
  ['Electricity', 'Woreda', 'Broken street light switch', 'Repair or replace a broken street light switch'],
  ['Electricity', 'Woreda', 'Small local cable repair', 'Repair a small local power cable / connection fault'],
  ['Electricity', 'Woreda', 'Meter inspection request', 'Request inspection of an electricity meter'],
  ['Electricity', 'Woreda', 'Pole light maintenance', 'Routine maintenance of a pole-mounted light'],
  ['Water', 'Woreda', 'Water leakage from small pipe', 'Repair a water leak on a small distribution pipe'],
  ['Water', 'Woreda', 'Water meter inspection', 'Inspect a water meter for reading or damage'],
  ['Water', 'Woreda', 'Public tap repair', 'Repair a public water tap'],
  ['Water', 'Woreda', 'Low pressure complaint', 'Investigate and fix low water pressure'],
  ['Water', 'Woreda', 'Water connection inspection', 'Inspect a domestic water connection'],
  ['Road', 'Woreda', 'Small pothole repair', 'Fill a small pothole on a local road'],
  ['Road', 'Woreda', 'Drainage cleaning', 'Clean a blocked roadside drainage channel'],
  ['Road', 'Woreda', 'Road sign replacement', 'Replace a damaged or missing road sign'],
  ['Road', 'Woreda', 'Sidewalk repair', 'Repair a damaged pedestrian sidewalk'],
  ['Road', 'Woreda', 'Speed breaker maintenance', 'Maintain or repair a speed breaker'],
  // ── Subcity level ───────────────────────────────────────────────────────────
  ['Electricity', 'Subcity', 'Transformer replacement', 'Replace a failed power transformer'],
  ['Electricity', 'Subcity', 'Main feeder line repair', 'Repair a main electrical feeder line'],
  ['Electricity', 'Subcity', 'Area-wide power outage', 'Restore power after an area-wide outage'],
  ['Electricity', 'Subcity', 'High-voltage equipment repair', 'Repair high-voltage electrical equipment'],
  ['Electricity', 'Subcity', 'New electrical infrastructure installation', 'Install new electrical infrastructure'],
  ['Water', 'Subcity', 'Main water line burst', 'Repair a burst main water transmission line'],
  ['Water', 'Subcity', 'Reservoir or pump failure', 'Repair or replace a reservoir / pump station component'],
  ['Water', 'Subcity', 'Large-area water interruption', 'Restore water supply after a large-area interruption'],
  ['Water', 'Subcity', 'Major pipeline replacement', 'Replace a major water pipeline segment'],
  ['Water', 'Subcity', 'Water infrastructure expansion', 'Expansion of water infrastructure network'],
  ['Road', 'Subcity', 'Major road reconstruction', 'Reconstruct a major road section'],
  ['Road', 'Subcity', 'Bridge repair', 'Structural repair of a road bridge'],
  ['Road', 'Subcity', 'Asphalt resurfacing project', 'Asphalt resurfacing of a main road'],
  ['Road', 'Subcity', 'Large drainage construction', 'Construction of large drainage infrastructure'],
  ['Road', 'Subcity', 'Traffic infrastructure project', 'Traffic lights / intersection infrastructure project'],
];

// Idempotent: inserts any template that is not already present (matched on
// department + level + name). Never deletes or overwrites existing records.
const seedIssueTemplates = async () => {
  try {
    const bulk = [];
    for (let i = 0; i < MUNICIPAL_TEMPLATE_SEED.length; i++) {
      const [department, level, name, description] = MUNICIPAL_TEMPLATE_SEED[i];
      const existing = await IssueTemplate.findOne({ department, level, name });
      if (!existing) {
        bulk.push({
          department,
          level,
          name,
          description,
          sortOrder: i,
          isActive: true,
        });
      }
    }
    if (bulk.length) {
      await IssueTemplate.insertMany(bulk);
      console.log(`[Municipal] Seeded ${bulk.length} built-in issue templates.`);
    }
    return bulk.length;
  } catch (err) {
    console.error('[Municipal] Issue template seeding failed:', err.message);
    return 0;
  }
};

module.exports = { MUNICIPAL_TEMPLATE_SEED, seedIssueTemplates };
