const bcrypt = require('bcryptjs');

// bcrypt.js hashes always start with $2a$ / $2b$ / $2x$ / $2y$.
const BCRYPT_HASH_PREFIX = /^\$2[abxy]\$/;
const SALT_ROUNDS = 10;

/**
 * Hash a plain-text password with bcrypt.
 * Never save plain-text passwords — every write path must go through this
 * (or the User model's pre-save hook, which delegates here).
 */
const hashPassword = async (plain) => {
  return bcrypt.hash(String(plain), SALT_ROUNDS);
};

/**
 * Verify a plain-text password against a stored bcrypt hash.
 * Returns false (never throws) for malformed / legacy non-bcrypt values, so a
 * record that was stored as plain text simply fails to match instead of
 * crashing the login with an "Illegal arguments" error.
 */
const verifyPassword = async (plain, hashed) => {
  if (typeof plain !== 'string' || typeof hashed !== 'string' || !hashed) return false;
  if (!isHashedPassword(hashed)) return false;
  return bcrypt.compare(plain, hashed);
};

/** True when the stored value looks like a bcrypt hash (starts with $2a$…$2y$). */
const isHashedPassword = (value) => {
  return typeof value === 'string' && BCRYPT_HASH_PREFIX.test(value);
};

module.exports = { hashPassword, verifyPassword, isHashedPassword, SALT_ROUNDS };
