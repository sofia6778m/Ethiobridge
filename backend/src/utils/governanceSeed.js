/**
 * governanceSeed.js
 * ────────────────────────
 * Seeds default GovernmentOffices (with their ComplaintCategories) for every
 * subcity so the DB-driven governance module is usable out of the box.
 *
 * Fully idempotent: an office is only created when the subcity has none yet,
 * and a category is only created when the office doesn't already have it. Once
 * seeded, subcity admins own the data entirely through the management UI.
 */
const GovernmentOffice = require('../models/GovernmentOffice');
const ComplaintCategory = require('../models/ComplaintCategory');
const Subcity = require('../models/Subcity');
const { DEFAULT_GOVERNANCE_CATEGORIES } = require('../models/GovernanceComplaint');

const DEFAULT_OFFICES = [
  { name: 'Subcity Mayor\'s Office', description: 'Office of the Subcity Administrator / Mayor' },
  { name: 'Land Administration Office', description: 'Land allocation, transfer and certificate services' },
  { name: 'Revenue & Taxation Office', description: 'Municipal revenue collection and business tax' },
  { name: 'Trade & Industry Development Office', description: 'Business licensing and market regulation' },
  { name: 'Health Office', description: 'Public health services and facility oversight' },
  { name: 'Education Office', description: 'Schools and educational services' },
  { name: 'Finance & Budget Office', description: 'Budget execution and financial services' },
  { name: 'Social Affairs Office', description: 'Social protection and welfare services' },
  { name: 'Justice / Legal Affairs Office', description: 'Legal aid and dispute resolution support' },
  { name: 'Urban Planning & Development Office', description: 'Permits, construction and urban development' },
];

const seedGovernanceMasterData = async () => {
  try {
    const subcities = await Subcity.find({ status: 'Active' }).select('_id name').lean();
    let officesCreated = 0;
    let categoriesCreated = 0;

    for (const subcity of subcities) {
      const existing = await GovernmentOffice.countDocuments({ subcityId: subcity._id });
      if (existing > 0) continue;

      const offices = [];
      for (const def of DEFAULT_OFFICES) {
        const office = await GovernmentOffice.create({
          name: def.name,
          subcity: subcity.name,
          subcityId: subcity._id,
          description: def.description,
          isActive: true,
        });
        offices.push(office);
        officesCreated += 1;
      }

      for (const office of offices) {
        const existingCategories = await ComplaintCategory.countDocuments({ officeId: office._id });
        if (existingCategories > 0) continue;
        for (const name of DEFAULT_GOVERNANCE_CATEGORIES) {
          await ComplaintCategory.create({ name, officeId: office._id, isActive: true });
          categoriesCreated += 1;
        }
      }
    }

    console.log(`[Governance] Seed complete — ${officesCreated} office(s), ${categoriesCreated} categor(y/ies) created across ${subcities.length} subcities.`);
  } catch (err) {
    console.warn('[Governance] Seed warning:', err.message);
  }
};

module.exports = { seedGovernanceMasterData, DEFAULT_OFFICES };
