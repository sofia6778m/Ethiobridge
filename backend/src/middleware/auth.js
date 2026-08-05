const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { normalizeRole } = require('../utils/normalizeRole');

// Protect routes - verify JWT token
const protect = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) {
    console.log('[AUTH] No token provided');
    return res.status(401).json({ success: false, message: 'Not authorized, no token' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log(`[AUTH] JWT decoded — userId: ${decoded.id}`);
    req.user = await User.findById(decoded.id).select('-password');

    if (!req.user) {
      console.log(`[AUTH] Failed: User not found for decoded id: ${decoded.id}`);
      return res.status(401).json({ success: false, message: 'User no longer exists' });
    }

    if (!req.user.isActive) {
      console.log(`[AUTH] Failed: Account deactivated for ${req.user.email}`);
      return res.status(401).json({ success: false, message: 'Account is deactivated' });
    }

    // Normalize legacy role spellings (subcityAdmin → subcity_admin, …) so
    // role checks in `authorize` and the controllers always see the canonical
    // value regardless of what the database row stores.
    req.user.role = normalizeRole(req.user.role);

    console.log(`[AUTH] Authorized — ${req.user.email} (role: ${req.user.role})`);
    next();
  } catch (error) {
    const kind = error.name === 'TokenExpiredError' ? 'expired' : 'invalid';
    console.error(`[AUTH] JWT ${kind}: ${error.message}`);
    return res.status(401).json({ success: false, message: `Not authorized, ${kind} token` });
  }
};

// Authorize specific roles.
//
// Subcity-admin roles are derived from the live Subcity collection rather than
// hard-coded (Bole → subcity_bole, Koye → subcity_koye, plus the canonical
// `subcity_admin`). When a route explicitly authorizes any subcity_* role, every
// derived subcity_* role is allowed too — so admins of newly-created subcities
// never hit an "Access Denied" wall. All other roles must match exactly.
const authorize = (...roles) => {
  return (req, res, next) => {
    const role = req.user.role;
    const allowed = roles.includes(role);
    const derivedSubcityAllowed =
      typeof role === 'string' && role.startsWith('subcity_') &&
      roles.some((r) => typeof r === 'string' && r.startsWith('subcity_'));
    if (allowed || derivedSubcityAllowed) return next();
    return res.status(403).json({
      success: false,
      message: `Role '${role}' is not authorized to access this route`,
    });
  };
};

// Check if organization is approved
const requireApproved = (req, res, next) => {
  if (!req.user.isApproved) {
    return res.status(403).json({
      success: false,
      message: 'Your account is pending admin approval',
    });
  }
  next();
};

// Optional auth: attaches req.user when a valid token is present but never
// rejects the request. Used to scope-share public listing/detail endpoints
// while still allowing anonymous access (e.g. public complaint tracking).
const protectOptional = async (req, res, next) => {
  let token;

  if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
    token = req.headers.authorization.split(' ')[1];
  }

  if (!token) return next();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password');
    if (user && user.isActive) {
      user.role = normalizeRole(user.role);
      req.user = user;
    }
  } catch (error) {
    // Invalid/expired token — treat as anonymous.
  }
  next();
};

module.exports = { protect, protectOptional, authorize, requireApproved };
