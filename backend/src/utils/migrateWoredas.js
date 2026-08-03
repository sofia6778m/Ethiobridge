/**
 * One-time migration — backfills the new `status` and `description` fields on
 * woredas created before Woreda Management was introduced.
 * Idempotent: safe to re-run.
 * Run: node src/utils/migrateWoredas.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Woreda = require('../models/Woreda');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const result = await Woreda.updateMany(
    { status: { $exists: false } },
    { $set: { status: 'Active', isActive: true, description: '' } }
  );
  const descResult = await Woreda.updateMany(
    { description: { $exists: false } },
    { $set: { description: '' } }
  );

  console.log(`Backfilled status on ${result.modifiedCount} woreda(s).`);
  console.log(`Backfilled description on ${descResult.modifiedCount} woreda(s).`);

  const woredas = await Woreda.find().select('name subcity status description');
  console.log('\nCurrent woredas:');
  woredas.forEach(w => console.log(`  - ${w.name} (${w.subcity}) | ${w.status}`));

  process.exit(0);
};

run().catch(err => { console.error(err); process.exit(1); });
