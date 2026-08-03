const User = require('../models/User');

// Verifies a submitted form password against the logged-in user's stored hash.
// The password is never persisted on the report — it is only checked to confirm
// the submitter is the account owner before the report is accepted.
// Throws an Error with a user-safe message (and a .status) on failure.
const verifySubmissionPassword = async (user, enteredPassword) => {
  if (!user) {
    const err = new Error('You must be logged in to verify your password.');
    err.status = 401;
    throw err;
  }
  if (!enteredPassword) {
    const err = new Error('Password is required to submit this form.');
    err.status = 400;
    throw err;
  }
  const fullUser = await User.findById(user._id).select('+password');
  if (!fullUser) {
    const err = new Error('Account no longer exists.');
    err.status = 401;
    throw err;
  }
  const isMatch = await fullUser.matchPassword(enteredPassword);
  if (!isMatch) {
    const err = new Error('Incorrect password. Please try again.');
    err.status = 400;
    throw err;
  }
};

module.exports = { verifySubmissionPassword };
