/**
 * One-time cleanup — removes every demo/seed infrastructure & emergency report
 * from the database so the Admin Report Management page starts empty.
 * Idempotent: safe to re-run. Real reports submitted by citizens are kept.
 * Run: node src/utils/cleanupDemoReports.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const InfrastructureReport = require('../models/InfrastructureReport');
const EmergencyReport = require('../models/EmergencyReport');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const infra = await InfrastructureReport.find().select('reportId title status submittedBy createdAt');
  const emerg = await EmergencyReport.find().select('reportId title status submittedBy createdAt');

  console.log(`Found ${infra.length} infrastructure report(s):`);
  infra.forEach(r => console.log(`  - ${r.reportId} | ${r.title} | ${r.status}`));

  console.log(`Found ${emerg.length} emergency report(s):`);
  emerg.forEach(r => console.log(`  - ${r.reportId} | ${r.title} | ${r.status}`));

  if (infra.length === 0 && emerg.length === 0) {
    console.log('\nNo demo reports to remove.');
    process.exit(0);
  }

  const infraRemoved = await InfrastructureReport.deleteMany({ _id: { $in: infra.map(r => r._id) } });
  const emergRemoved = await EmergencyReport.deleteMany({ _id: { $in: emerg.map(r => r._id) } });

  console.log(`\nRemoved ${infraRemoved.deletedCount} infrastructure report(s) and ${emergRemoved.deletedCount} emergency report(s).`);
  console.log('Cleanup complete. Report list is now empty.');
  process.exit(0);
};

run().catch(err => { console.error(err); process.exit(1); });
