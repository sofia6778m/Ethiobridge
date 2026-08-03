/**
 * One-time cleanup — removes every demo/seed/generated user so that only
 * admin accounts (e.g. the main admin) remain in the database.
 * Idempotent: safe to re-run. All users must then be created manually
 * from the admin User Management page.
 * Run: node src/utils/cleanupDemoUsers.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const kept = await User.find({ role: 'admin' }).select('email role');
  const removed = await User.deleteMany({ role: { $ne: 'admin' } });

  console.log(`Removed ${removed.deletedCount} demo/non-admin user(s).`);
  console.log('Kept admin account(s):');
  kept.forEach(a => console.log(`  - ${a.email} (${a.role})`));

  console.log('\nCleanup complete. Only admin accounts remain.');
  process.exit(0);
};

run().catch(err => { console.error(err); process.exit(1); });
