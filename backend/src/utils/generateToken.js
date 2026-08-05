const jwt = require('jsonwebtoken');
const { normalizeRole } = require('./normalizeRole');

// Include both the user id and role in the token payload so downstream
// middleware can make cheap role checks without an extra database lookup.
const generateToken = (user) => {
  const payload = {
    id: user._id || user.id,
    role: normalizeRole(user.role),
    // Org-scoping fields so the client never needs a second round-trip to know
    // which subcity / woreda / department an admin account belongs to.
    subcityId: user.subcityId || undefined,
    woredaId: user.woredaId || undefined,
    departmentId: user.departmentId || undefined,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

module.exports = generateToken;
