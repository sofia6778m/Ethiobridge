/**
 * seedIssueTypes.js
 * Seeds all 45 predefined issue types into the IssueType collection.
 *
 * Run:  node src/utils/seedIssueTypes.js
 *
 * Distribution:  3 departments × 3 subcities × 5 unique issues = 45 total
 * ─────────────────────────────────────────────────────────────────────────
 * Departments : Electricity | Road | Water
 * Subcities   : BOLE | YEKA | LEMMI_KURA
 */

require('dotenv').config({ path: require('path').resolve(__dirname, '../../.env') });
const mongoose = require('mongoose');
const IssueType = require('../models/IssueType');

const ISSUE_SEED_DATA = [

  // ══════════════════════════════════════════════════════
  //  ELECTRICITY — BOLE (5)
  // ══════════════════════════════════════════════════════
  { department: 'Electricity', subcity: 'BOLE', name: 'Power outage', description: 'Complete loss of electricity supply in the area.' },
  { department: 'Electricity', subcity: 'BOLE', name: 'Faulty street light', description: 'Street light not functioning or flickering.' },
  { department: 'Electricity', subcity: 'BOLE', name: 'Exposed electrical wiring', description: 'Dangerous bare or exposed wires in public areas.' },
  { department: 'Electricity', subcity: 'BOLE', name: 'Transformer overload', description: 'Transformer serving the area is overloaded causing brownouts.' },
  { department: 'Electricity', subcity: 'BOLE', name: 'Illegal power connection', description: 'Unauthorized tapping into the electrical grid.' },

  // ══════════════════════════════════════════════════════
  //  ELECTRICITY — YEKA (5)
  // ══════════════════════════════════════════════════════
  { department: 'Electricity', subcity: 'YEKA', name: 'Frequent voltage fluctuation', description: 'Recurring voltage instability damaging appliances.' },
  { department: 'Electricity', subcity: 'YEKA', name: 'Broken electricity meter', description: 'Electricity meter is malfunctioning or inaccurate.' },
  { department: 'Electricity', subcity: 'YEKA', name: 'Downed power line', description: 'Power line has fallen onto the road or property.' },
  { department: 'Electricity', subcity: 'YEKA', name: 'Burnt distribution box', description: 'Distribution box has been damaged by fire or short circuit.' },
  { department: 'Electricity', subcity: 'YEKA', name: 'No electricity in new building', description: 'Newly constructed building has not yet been connected to the grid.' },

  // ══════════════════════════════════════════════════════
  //  ELECTRICITY — LEMMI KURA (5)
  // ══════════════════════════════════════════════════════
  { department: 'Electricity', subcity: 'LEMMI_KURA', name: 'Electric pole falling hazard', description: 'Electric pole is leaning or at risk of falling.' },
  { department: 'Electricity', subcity: 'LEMMI_KURA', name: 'Billing dispute', description: 'Incorrect electricity bill or payment not reflected.' },
  { department: 'Electricity', subcity: 'LEMMI_KURA', name: 'Scheduled load shedding complaint', description: 'Unannounced or excessively long load-shedding periods.' },
  { department: 'Electricity', subcity: 'LEMMI_KURA', name: 'Electric fire hazard near market', description: 'Electrical fault creating fire risk in a busy market area.' },
  { department: 'Electricity', subcity: 'LEMMI_KURA', name: 'Generator noise complaint', description: 'Excessive noise from utility generators affecting residents.' },

  // ══════════════════════════════════════════════════════
  //  ROAD — BOLE (5)
  // ══════════════════════════════════════════════════════
  { department: 'Road', subcity: 'BOLE', name: 'Large pothole on main road', description: 'Deep pothole causing damage to vehicles and pedestrian hazard.' },
  { department: 'Road', subcity: 'BOLE', name: 'Broken road divider', description: 'Road divider is damaged or missing, creating safety risks.' },
  { department: 'Road', subcity: 'BOLE', name: 'Missing traffic sign', description: 'Traffic sign is absent or illegible at an intersection.' },
  { department: 'Road', subcity: 'BOLE', name: 'Flooded road after rain', description: 'Road section floods during rainfall due to poor drainage.' },
  { department: 'Road', subcity: 'BOLE', name: 'Illegal roadside construction', description: 'Unauthorized construction encroaching on the road reserve.' },

  // ══════════════════════════════════════════════════════
  //  ROAD — YEKA (5)
  // ══════════════════════════════════════════════════════
  { department: 'Road', subcity: 'YEKA', name: 'Damaged pedestrian walkway', description: 'Footpath is broken, uneven, or blocked.' },
  { department: 'Road', subcity: 'YEKA', name: 'Road surface erosion', description: 'Road surface is eroding due to heavy use or poor maintenance.' },
  { department: 'Road', subcity: 'YEKA', name: 'Broken speed bump', description: 'Speed bump is damaged or has collapsed entirely.' },
  { department: 'Road', subcity: 'YEKA', name: 'Uncovered open manhole on road', description: 'Open or improperly covered manhole posing danger to road users.' },
  { department: 'Road', subcity: 'YEKA', name: 'Blocked drainage causing road damage', description: 'Clogged roadside drain causing water to undermine the road surface.' },

  // ══════════════════════════════════════════════════════
  //  ROAD — LEMMI KURA (5)
  // ══════════════════════════════════════════════════════
  { department: 'Road', subcity: 'LEMMI_KURA', name: 'Road construction delay', description: 'Ongoing road project has stalled without completion.' },
  { department: 'Road', subcity: 'LEMMI_KURA', name: 'Narrow road obstructed by parked vehicles', description: 'Parked vehicles permanently blocking narrow road.' },
  { department: 'Road', subcity: 'LEMMI_KURA', name: 'Crumbling road shoulder', description: 'Road shoulder is crumbling, narrowing the usable road width.' },
  { department: 'Road', subcity: 'LEMMI_KURA', name: 'Broken retaining wall', description: 'Retaining wall along the road has collapsed or is failing.' },
  { department: 'Road', subcity: 'LEMMI_KURA', name: 'Dust pollution from unpaved road', description: 'Unpaved road generating excessive dust affecting health.' },

  // ══════════════════════════════════════════════════════
  //  WATER — BOLE (5)
  // ══════════════════════════════════════════════════════
  { department: 'Water', subcity: 'BOLE', name: 'Water interruption', description: 'Complete or prolonged interruption of water supply.' },
  { department: 'Water', subcity: 'BOLE', name: 'Pipe leakage', description: 'Water main or distribution pipe is leaking.' },
  { department: 'Water', subcity: 'BOLE', name: 'Low water pressure', description: 'Insufficient water pressure at tap or household connection.' },
  { department: 'Water', subcity: 'BOLE', name: 'Sewer overflow', description: 'Sewage overflowing onto roads or into drainage channels.' },
  { department: 'Water', subcity: 'BOLE', name: 'Water meter problem', description: 'Water meter is faulty, missing, or showing incorrect readings.' },

  // ══════════════════════════════════════════════════════
  //  WATER — YEKA (5)
  // ══════════════════════════════════════════════════════
  { department: 'Water', subcity: 'YEKA', name: 'Damaged water line', description: 'Main water line has been damaged causing supply loss.' },
  { department: 'Water', subcity: 'YEKA', name: 'Illegal water connection', description: 'Unauthorized tapping into the water supply network.' },
  { department: 'Water', subcity: 'YEKA', name: 'Water quality problem', description: 'Water supplied is discolored, odorous, or otherwise contaminated.' },
  { department: 'Water', subcity: 'YEKA', name: 'Broken public tap', description: 'Communal water tap is broken or non-functional.' },
  { department: 'Water', subcity: 'YEKA', name: 'Reservoir overflow', description: 'Water storage reservoir is overflowing causing flooding.' },

  // ══════════════════════════════════════════════════════
  //  WATER — LEMMI KURA (5)
  // ══════════════════════════════════════════════════════
  { department: 'Water', subcity: 'LEMMI_KURA', name: 'New connection request delay', description: 'Application for a new water connection has not been processed.' },
  { department: 'Water', subcity: 'LEMMI_KURA', name: 'Sewage blockage in residential area', description: 'Sewage pipe blocked causing backflow into homes.' },
  { department: 'Water', subcity: 'LEMMI_KURA', name: 'No water supply for more than 3 days', description: 'Area has been without water for an extended period.' },
  { department: 'Water', subcity: 'LEMMI_KURA', name: 'Contaminated water supply near factory', description: 'Industrial runoff or waste contaminating local water supply.' },
  { department: 'Water', subcity: 'LEMMI_KURA', name: 'Broken water tank in public facility', description: 'Water storage tank at a school, clinic, or public building is damaged.' },
];

async function seedIssueTypes() {
  try {
    const mongoUri = process.env.MONGO_URI || process.env.MONGODB_URI;
    if (!mongoUri) throw new Error('MONGO_URI / MONGODB_URI not set in environment.');

    await mongoose.connect(mongoUri);
    console.log('Connected to MongoDB.');

    let created = 0;
    let skipped = 0;

    for (const item of ISSUE_SEED_DATA) {
      const existing = await IssueType.findOne({
        name: item.name,
        department: item.department,
        subcity: item.subcity,
      });

      if (existing) {
        skipped++;
      } else {
        await IssueType.create(item);
        created++;
      }
    }

    // Verification counts
    const totals = await IssueType.aggregate([
      { $group: { _id: { department: '$department', subcity: '$subcity' }, count: { $sum: 1 } } },
      { $sort: { '_id.department': 1, '_id.subcity': 1 } },
    ]);

    console.log(`\n✅ Seed complete — ${created} created, ${skipped} already existed.\n`);
    console.log('Issue type distribution:');
    for (const t of totals) {
      console.log(`  ${t._id.department.padEnd(14)} | ${t._id.subcity.padEnd(12)} | ${t.count} issues`);
    }

    const grand = await IssueType.countDocuments();
    console.log(`\nGrand total: ${grand} issue types`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('Seed failed:', err.message);
    process.exit(1);
  }
}

// Allow import as module (for programmatic use) or direct execution
if (require.main === module) {
  seedIssueTypes();
}

module.exports = { ISSUE_SEED_DATA, seedIssueTypes };
