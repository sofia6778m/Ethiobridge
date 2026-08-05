/**
 * migrateRoles.js
 * ───────────────
 * One-time migration that renames legacy camelCase role values to their
 * canonical snake_case spelling:
 *
 *   subcityAdmin     → subcity_admin
 *   woredaAdmin      → woreda_admin
 *   departmentOfficer → department_officer
 *
 * The canonical spellings are what the frontend routes and the role-based
 * authorization checks expect. This migration keeps older accounts working
 * instead of them hitting "Access Denied" on login.
 *
 * Idempotent — records already using canonical values are skipped.
 * Run (from backend/):
 *   npm run migrate:roles
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { LEGACY_ROLE_ALIASES } = require('../src/utils/normalizeRole');

const migrate = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const targets = Object.keys(LEGACY_ROLE_ALIASES);
  const found = await User.find({ role: { $in: targets } }).select('_id email role').lean();
  console.log(`Found ${found.length} account(s) using legacy role values: ${targets.join(', ')}`);

  let migrated = 0;
  for (const user of found) {
    const canonical = LEGACY_ROLE_ALIASES[user.role];
    await User.updateOne({ _id: user._id }, { $set: { role: canonical } });
    migrated += 1;
    console.log(`  ✓ ${user.email}: ${user.role} → ${canonical}`);
  }

  console.log(`\nMigration complete. Migrated: ${migrated}`);
  process.exit(0);
};

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
