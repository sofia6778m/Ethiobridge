/**
 * migratePasswords.js
 * ──────────────────
 * One-time migration for accounts whose stored password is NOT a bcrypt hash
 * (e.g. legacy plain text, or a value produced by an older hashing scheme).
 *
 * Such accounts can never pass bcrypt.compare, so logging in with the correct
 * password failed with "Invalid password". This script re-hashes the stored
 * value in place — a user who previously logged in with password "secret"
 * keeps logging in with "secret" after the migration, because the stored plain
 * text IS the password they type.
 *
 * Idempotent: records already stored as a valid bcrypt hash ($2a$…$2y$) are
 * skipped. Run it as often as you like.
 *
 * Run (from backend/):
 *   npm run migrate:passwords
 *   node scripts/migratePasswords.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const User = require('../src/models/User');
const { hashPassword, isHashedPassword } = require('../src/utils/password');

const migrate = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const users = await User.find({}).select('_id email password').lean();
  console.log(`Found ${users.length} user account(s).`);

  let migrated = 0;
  let skipped = 0;
  let failed = 0;

  for (const user of users) {
    if (isHashedPassword(user.password)) {
      skipped += 1;
      continue;
    }

    // The stored value is not a bcrypt hash (assumed legacy plain text). Hash it
    // directly and persist with updateOne — using save() would run the model's
    // pre-save hook and hash the value a second time (double hash).
    try {
      const hashed = await hashPassword(user.password);
      await User.updateOne({ _id: user._id }, { $set: { password: hashed } });
      migrated += 1;
      console.log(`  ✓ Migrated: ${user.email} (was ${String(user.password).length} chars, non-bcrypt)`);
    } catch (err) {
      failed += 1;
      console.error(`  ✗ FAILED: ${user.email} (${user._id}) — ${err.message}`);
    }
  }

  console.log('\nMigration complete.');
  console.log(`  Migrated: ${migrated}  Skipped (already bcrypt): ${skipped}  Failed: ${failed}`);
  if (migrated > 0) {
    console.log('All migrated accounts now use the password they were created with.');
  }
  process.exit(failed > 0 ? 1 : 0);
};

migrate().catch((err) => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
