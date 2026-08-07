const rateLimit = require('express-rate-limit');
const { logDebug } = require('../utils/debug');

// ── General / register / upload limiters ─────────────────────────────────────

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  message: { success: false, message: 'Too many requests, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many registration attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many uploads, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Public complaint submission limiter ───────────────────────────────────────
// Protects the anonymous complaint endpoint from spam / abuse while still
// allowing genuine citizens to submit a handful of complaints per hour.
const complaintSubmitLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many complaint submissions from this address. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Public tracking limiter ───────────────────────────────────────────────────
// The unauthenticated /api/public-track endpoint is a phone+id lookup, so it is
// rate-limited to deter enumeration / scraping without blocking genuine use.
const trackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many tracking requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Admin reactivation endpoint limiter ───────────────────────────────────────
// Tight per-IP budget so the ADMIN_REACTIVATION_KEY cannot be brute-forced even
// though the key itself is a long random secret.
const reactivateLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  message: { success: false, message: 'Too many reactivation attempts, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});

// ── Login brute-force protection ──────────────────────────────────────────────
//
// Tracks failed login attempts per email (NOT per IP+email).
// Keying on email only means that clearing a lockout for an account works
// regardless of which IP the next login comes from.
//
// IMPORTANT: The lockout check is intentionally done INSIDE the controller
// (authController.login) so that a correct password always bypasses the lock.
// This middleware only attaches helper functions to req and intercepts the
// response to update the counter — it never blocks the request itself.
//
// Configuration (backend/.env):
//   MAX_LOGIN_ATTEMPTS    — max consecutive wrong-password attempts before lockout (default 5)
//   LOGIN_LOCKOUT_MINUTES — lockout duration in minutes (default 10)

const MAX_ATTEMPTS = parseInt(process.env.MAX_LOGIN_ATTEMPTS    || '5',  10);
const LOCKOUT_MS   = parseInt(process.env.LOGIN_LOCKOUT_MINUTES || '10', 10) * 60 * 1000;

// In-memory store: email → { count, lockedUntil }
const loginAttempts = new Map();

// Purge stale entries every 30 minutes. `.unref()` so the timer never keeps a
// process alive on its own (the HTTP server owns the process lifetime).
setInterval(() => {
  const now = Date.now();
  for (const [key, rec] of loginAttempts.entries()) {
    if (now > rec.lockedUntil + LOCKOUT_MS * 2) {
      loginAttempts.delete(key);
    }
  }
}, 30 * 60 * 1000).unref();

/**
 * Get the lockout record for an email, creating it if missing.
 * Returns { count, lockedUntil, isLocked, remainingMinutes }
 */
function getLockoutRecord(email) {
  const now = Date.now();
  let rec = loginAttempts.get(email);
  if (!rec) {
    rec = { count: 0, lockedUntil: 0 };
    loginAttempts.set(email, rec);
  }
  const isLocked       = rec.lockedUntil > now;
  const remainingMs    = isLocked ? rec.lockedUntil - now : 0;
  const remainingMin   = isLocked ? Math.ceil(remainingMs / 60000) : 0;
  return { rec, isLocked, remainingMin };
}

/**
 * Record a wrong-password failure. Starts a lockout when MAX_ATTEMPTS is reached.
 */
function recordFailure(email) {
  const { rec } = getLockoutRecord(email);
  // If the previous lockout already expired, reset the counter first
  if (rec.lockedUntil > 0 && rec.lockedUntil <= Date.now()) {
    rec.count       = 0;
    rec.lockedUntil = 0;
  }
  rec.count += 1;
  if (rec.count >= MAX_ATTEMPTS) {
    rec.lockedUntil = Date.now() + LOCKOUT_MS;
    const lockMin   = Math.ceil(LOCKOUT_MS / 60000);
    logDebug(`[AUTH-LIMIT] 🔒 Locked   ${email} for ${lockMin} minute(s) after ${rec.count} failures`);
    return { locked: true, retryAfterMinutes: lockMin };
  }
  logDebug(`[AUTH-LIMIT] ❌ Wrong password for ${email} — attempt ${rec.count}/${MAX_ATTEMPTS}`);  return { locked: false };
}

/**
 * Clear all lockout records for an email (called after successful login).
 */
function clearLockout(email) {
  const rec = loginAttempts.get(email);
  if (rec && rec.count > 0) {
    logDebug(`[AUTH-LIMIT] ✅ Unlocked ${email} after successful login (was at ${rec.count} failure(s))`);
  }
  loginAttempts.delete(email);
}

/**
 * authLimiter middleware
 *
 * Does NOT block any request itself — it only attaches three helpers to req
 * so the login controller can call them at the right moment:
 *
 *   req.loginLockout.check()   → { isLocked, remainingMin }
 *   req.loginLockout.fail()    → { locked, retryAfterMinutes }
 *   req.loginLockout.clear()   → void
 */
const authLimiter = (req, res, next) => {
  const email = (req.body?.email || '').toLowerCase().trim() || 'unknown';

  req.loginLockout = {
    check:  () => {
      const { isLocked, remainingMin } = getLockoutRecord(email);
      return { isLocked, remainingMin };
    },
    fail:   () => recordFailure(email),
    clear:  () => clearLockout(email),
  };

  next();
};

module.exports = {
  generalLimiter,
  authLimiter,
  registerLimiter,
  uploadLimiter,
  complaintSubmitLimiter,
  trackLimiter,
  reactivateLimiter,
  loginAttempts,
  getLockoutRecord,
  recordFailure,
  clearLockout,
};
