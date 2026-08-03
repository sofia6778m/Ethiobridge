const jwt = require('jsonwebtoken');

// Include both the user id and role in the token payload so downstream
// middleware can make cheap role checks without an extra database lookup.
const generateToken = (user) => {
  const payload = {
    id: user._id || user.id,
    role: user.role,
  };
  return jwt.sign(payload, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE || '7d',
  });
};

module.exports = generateToken;
