const express = require('express');
const router  = express.Router();
const { register, login, reactivateAdmin, getMe, updateProfile, changePassword } = require('../controllers/authController');
const { protect, authorize } = require('../middleware/auth');
const { upload } = require('../config/cloudinary');
const { authLimiter, registerLimiter, reactivateLimiter, loginAttempts } = require('../middleware/rateLimiter');
const { validateRegister, validateLogin } = require('../middleware/validation');

router.post('/register',        registerLimiter, validateRegister, register);
router.post('/login',           authLimiter,     validateLogin,    login);
// Secure self-service admin reactivation — works WITHOUT a login so a locked-out
// default admin can be recovered. Protected by the ADMIN_REACTIVATION_KEY secret.
router.post('/admin/reactivate', reactivateLimiter, reactivateAdmin);
router.get('/me',               protect,         getMe);
router.put('/profile',          protect, upload.single('profileImage'), updateProfile);
router.put('/change-password',  protect, changePassword);

// ── Lockout management ────────────────────────────────────────────────────────

// @desc  Clear the login lockout for a specific email (admin only)
// @route DELETE /api/auth/lockout/:email
// @access Private (admin)
router.delete('/lockout/:email', protect, authorize('admin'), (req, res) => {
  const email = decodeURIComponent(req.params.email).toLowerCase().trim();
  let cleared = 0;
  for (const [key] of loginAttempts.entries()) {
    if (key.includes(`:${email}`)) {
      loginAttempts.delete(key);
      cleared++;
    }
  }
  console.log(`[AUTH-LIMIT] 🔓 Admin ${req.user.email} cleared lockout for ${email} (${cleared} record(s) removed)`);
  res.json({ success: true, message: `Lockout cleared for ${email}. ${cleared} record(s) removed.` });
});

// @desc  Clear ALL login lockouts (admin only — emergency use)
// @route DELETE /api/auth/lockout
// @access Private (admin)
router.delete('/lockout', protect, authorize('admin'), (req, res) => {
  const total = loginAttempts.size;
  loginAttempts.clear();
  console.log(`[AUTH-LIMIT] 🔓 Admin ${req.user.email} cleared ALL lockouts (${total} record(s) removed)`);
  res.json({ success: true, message: `All lockouts cleared. ${total} record(s) removed.` });
});

module.exports = router;
