/**
 * adminAccount.js
 * ───────────────
 * Single source of truth for admin account bootstrap, lookup and validation.
 *
 * The admin account is the lifeline of the platform — if it can't log in the
 * whole system is unusable. Every piece of admin-account logic lives here so
 * the behaviour can never drift between the server startup, the login route,
 * the seed script and the reset script.
 *
 * Responsibilities:
 *   • normalizeEmail           — lowercase + trim (mirrors the User schema)
 *   • findUserByEmail          — case-insensitive lookup, even for legacy data
 *   • resolveAdminEmailAlias   — map old project-name admin emails to canonical
 *   • isReservedAdminEmail     — guard public registration of admin addresses
 *   • isCanonicalAdminEmail    — is this email the default admin (or an alias)?
 *   • isCanonicalAdminUser     — is this user document the default admin?
 *   • reactivateAdminAccount   — restore the default admin to a working state
 *   • ensureAdminAccount       — seed + migrate + dedupe on server startup
 *   • validateAdminOnStartup   — confirm an admin exists, warn loudly if not
 */
const DEFAULT_ADMIN_EMAIL = 'admin@zda.et';
const DEFAULT_ADMIN_PASSWORD = 'Admin@12345';

// Old project-name emails that are aliases for the canonical admin account.
// Logging in with any of them authenticates against the canonical admin.
const DEFAULT_LEGACY_ADMIN_EMAILS = ['admin@ethiobridge.et', 'admin@etiobrige.et'];

/** Read the admin configuration from env with safe defaults. */
const getAdminConfig = () => {
  const canonical = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).toLowerCase().trim();
  const password  = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
  const legacy    = DEFAULT_LEGACY_ADMIN_EMAILS.map((e) => e.toLowerCase().trim());
  return {
    CANONICAL_ADMIN_EMAIL: canonical,
    DEFAULT_ADMIN_PASSWORD: password,
    LEGACY_ADMIN_EMAILS: legacy,
  };
};

/** Normalize an email exactly the way the User schema stores it. */
const normalizeEmail = (email) => String(email || '').trim().toLowerCase();

/** Escape a string so it is safe inside a RegExp. */
const escapeRegex = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Case-insensitive email lookup.
 * Tries the exact match first (uses the unique index — the fast path), then
 * falls back to an anchored case-insensitive regex so legacy records that were
 * stored with mixed case are still found. Returns the user document or null.
 */
const findUserByEmail = async (email) => {
  const User = require('../models/User');
  const normalized = normalizeEmail(email);
  if (!normalized) return null;

  const exact = await User.findOne({ email: normalized });
  if (exact) return exact;

  const regexEmail = new RegExp(`^${escapeRegex(normalized)}$`, 'i');
  return User.findOne({ email: regexEmail });
};

/**
 * Resolve the email used for a login attempt.
 * A legacy admin email (e.g. admin@ethiobridge.et) is translated to the
 * canonical admin email so the documented admin credentials always work even
 * after a project rename. Any other email is returned unchanged.
 */
const resolveAdminEmailAlias = (email) => {
  const { CANONICAL_ADMIN_EMAIL, LEGACY_ADMIN_EMAILS } = getAdminConfig();
  const normalized = normalizeEmail(email);
  return LEGACY_ADMIN_EMAILS.includes(normalized) ? CANONICAL_ADMIN_EMAIL : normalized;
};

/** True when the email is the canonical admin address or one of its aliases. */
const isReservedAdminEmail = (email) => {
  const { CANONICAL_ADMIN_EMAIL, LEGACY_ADMIN_EMAILS } = getAdminConfig();
  const normalized = normalizeEmail(email);
  return normalized === CANONICAL_ADMIN_EMAIL || LEGACY_ADMIN_EMAILS.includes(normalized);
};

/** True when the given email belongs to the default administrator account. */
const isCanonicalAdminEmail = (email) => isReservedAdminEmail(email);

/** True when the given user document is the default administrator account. */
const isCanonicalAdminUser = (user) => {
  return !!(user && user.email && isCanonicalAdminEmail(user.email));
};

/**
 * Restore the default administrator account to a guaranteed working state.
 *
 * Idempotent and safe to run at any time: forces isActive=true, isApproved=true
 * and role='admin'. The default admin email is reserved for the administrator
 * (public registration is blocked for it), so restoring the role is always the
 * intended behaviour and never hijacks a legitimately registered account.
 *
 * Returns the (possibly unchanged) user document.
 */
const reactivateAdminAccount = async (user) => {
  if (!user) return null;

  let changed = false;
  if (!user.isActive) { user.isActive = true; changed = true; }
  if (!user.isApproved) { user.isApproved = true; changed = true; }
  if (user.role !== 'admin') { user.role = 'admin'; changed = true; }

  if (changed) {
    await user.save();
    console.log(`[ADMIN-ACCOUNT] 🔄 Reactivated default admin account: ${user.email} (isActive=true, isApproved=true, role=admin)`);
  }
  return user;
};

/**
 * Ensure a working admin account exists. Idempotent — safe to run on every
 * server start.
 *
 * Order of operations:
 *   1. Canonical admin email present → ensure the account is an admin and
 *      delete any duplicate legacy admin records that also exist (keeps a
 *      single admin, so login always resolves to one account).
 *   2. Otherwise, migrate a legacy admin (old project email) to the canonical
 *      email so the documented credentials keep working.
 *   3. Otherwise, if some other role=admin account exists, keep it untouched.
 *   4. Otherwise create the default admin account.
 */
const ensureAdminAccount = async () => {
  const User = require('../models/User');
  const { CANONICAL_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD, LEGACY_ADMIN_EMAILS } = getAdminConfig();

  // 1) Canonical admin already present.
  const canonical = await findUserByEmail(CANONICAL_ADMIN_EMAIL);
  if (canonical) {
    if (canonical.role !== 'admin' || !canonical.isActive || !canonical.isApproved) {
      // The reserved admin email must always hold an active, approved admin
      // account — otherwise the platform is unusable. Restore it automatically.
      await reactivateAdminAccount(canonical);
      if (canonical.role !== 'admin') {
        console.warn('[SEED] 🔄 The reserved admin email was owned by a non-admin user — restored to the admin role.');
      }
      if (!canonical.isActive || !canonical.isApproved) {
        console.warn('[SEED] 🔄 The default admin account was deactivated — reactivated on server startup.');
      }
    } else {
      console.log(`[SEED] ✅ Admin account present: ${canonical.email} (role: ${canonical.role})`);
    }

    // If a legacy admin email from the old project name also exists, remove the
    // duplicate so there is exactly one admin account.
    for (const legacy of LEGACY_ADMIN_EMAILS) {
      const legacyAdmin = await findUserByEmail(legacy);
      if (legacyAdmin && legacyAdmin.role === 'admin' && String(legacyAdmin._id) !== String(canonical._id)) {
        await User.deleteOne({ _id: legacyAdmin._id });
        console.log(`[SEED] 🧹 Removed duplicate legacy admin ${legacy} → canonical admin is ${CANONICAL_ADMIN_EMAIL}`);
      }
    }
    return true;
  }

  // 2) Migrate a legacy admin (old project email) to the canonical one.
  for (const legacy of LEGACY_ADMIN_EMAILS) {
    const legacyAdmin = await findUserByEmail(legacy);
    if (legacyAdmin && legacyAdmin.role === 'admin') {
      legacyAdmin.email = CANONICAL_ADMIN_EMAIL;
      await legacyAdmin.save();
      console.log(`[SEED] 🔁 Migrated legacy admin ${legacy} → ${CANONICAL_ADMIN_EMAIL}`);
      return true;
    }
  }

  // 3) Some other role=admin account already exists — keep it.
  const anyAdmin = await User.findOne({ role: 'admin' });
  if (anyAdmin) {
    console.log(`[SEED] ℹ️  Admin account exists with custom email: ${anyAdmin.email}`);
    console.log(`[SEED]    Log in with that email (canonical: ${CANONICAL_ADMIN_EMAIL}).`);
    return true;
  }

  // 4) No admin at all — create the default one.
  await User.create({
    fullName:   'System Administrator',
    email:      CANONICAL_ADMIN_EMAIL,
    password:   DEFAULT_ADMIN_PASSWORD, // plain — User model pre-save hook hashes it
    role:       'admin',
    isActive:   true,
    isApproved: true,
  });
  console.log(`[SEED] ✅ Admin account created: ${CANONICAL_ADMIN_EMAIL}`);
  console.log(`[SEED]    Default password:      ${DEFAULT_ADMIN_PASSWORD}`);
  console.log('[SEED]    Change this immediately after first login!');
  return true;
};

/**
 * Confirm an active admin account exists after seeding. If the default admin
 * exists but was left inactive (the scenario that locked users out before),
 * reactivate it automatically. Prints a clear warning only when no admin can be
 * recovered, so a broken login is never silent.
 */
const validateAdminOnStartup = async () => {
  const User = require('../models/User');
  const { CANONICAL_ADMIN_EMAIL } = getAdminConfig();
  try {
    // 1) Auto-recover a dormant default admin before validating.
    const canonical = await findUserByEmail(CANONICAL_ADMIN_EMAIL);
    if (canonical) {
      const wasBroken = canonical.role !== 'admin' || !canonical.isActive || !canonical.isApproved;
      await reactivateAdminAccount(canonical);
      if (wasBroken) {
        console.log(`[STARTUP] 🔄 Default admin recovered during startup validation: ${canonical.email}`);
      }
    }

    // 2) Confirm an active admin actually exists now.
    const admin = await User.findOne({ role: 'admin', isActive: true });
    if (admin) {
      console.log(`[STARTUP] ✅ Admin account confirmed: ${admin.email} (role: ${admin.role})`);
      return;
    }
    console.warn('============================================================');
    console.warn('[STARTUP] ⚠️  WARNING: No active admin account found in the database!');
    console.warn('[STARTUP]   Public registration of admin accounts is disabled by design.');
    console.warn(`[STARTUP]   Expected email: ${CANONICAL_ADMIN_EMAIL}`);
    console.warn('[STARTUP]   Run:  npm run seed   (from backend/)  then restart.');
    console.warn('============================================================');
  } catch (err) {
    console.warn('[STARTUP] ⚠️  Could not validate admin account:', err.message);
  }
};

module.exports = {
  DEFAULT_ADMIN_EMAIL,
  DEFAULT_ADMIN_PASSWORD,
  DEFAULT_LEGACY_ADMIN_EMAILS,
  getAdminConfig,
  normalizeEmail,
  escapeRegex,
  findUserByEmail,
  resolveAdminEmailAlias,
  isReservedAdminEmail,
  isCanonicalAdminEmail,
  isCanonicalAdminUser,
  reactivateAdminAccount,
  ensureAdminAccount,
  validateAdminOnStartup,
};
