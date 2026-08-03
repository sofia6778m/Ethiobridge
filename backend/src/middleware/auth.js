const jwt = require('jsonwebtoken');
const User = require('../models/User');

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

    console.log(`[AUTH] Authorized — ${req.user.email} (role: ${req.user.role})`);
    next();
  } catch (error) {
    const kind = error.name === 'TokenExpiredError' ? 'expired' : 'invalid';
    console.error(`[AUTH] JWT ${kind}: ${error.message}`);
    return res.status(401).json({ success: false, message: `Not authorized, ${kind} token` });
  }
};

// Authorize specific roles
const authorize = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({
        success: false,
        message: `Role '${req.user.role}' is not authorized to access this route`,
      });
    }
    next();
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
    if (user && user.isActive) req.user = user;
  } catch (error) {
    // Invalid/expired token — treat as anonymous.
  }
  next();
};

module.exports = { protect, protectOptional, authorize, requireApproved };
