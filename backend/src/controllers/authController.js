const User = require('../models/User');
const generateToken = require('../utils/generateToken');
const { logAction } = require('../middleware/auditLog');
const { logDebug } = require('../utils/debug');
const { normalizeRole } = require('../utils/normalizeRole');
const {
  normalizeEmail,
  findUserByEmail,
  resolveAdminEmailAlias,
  isReservedAdminEmail,
  isCanonicalAdminEmail,
  isCanonicalAdminUser,
  reactivateAdminAccount,
  getAdminConfig,
} = require('../utils/adminAccount');

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { fullName, email, password, phone, role, subcity, skills } = req.body;

    const restrictedRoles = ['admin', 'government', 'ngo', 'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura'];
    if (restrictedRoles.includes(role)) {
      return res.status(403).json({ success: false, message: `${role} accounts cannot be created through public registration. Contact a system administrator.` });
    }

    const existingUser = await findUserByEmail(email);
    if (existingUser) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    if (isReservedAdminEmail(email)) {
      return res.status(400).json({ success: false, message: 'This email is reserved for the system administrator.' });
    }

    const allowedRoles = ['citizen', 'volunteer'];
    const user = await User.create({
      fullName: fullName.trim(),
      email: email.toLowerCase().trim(),
      password,
      phone: phone || '',
      role: allowedRoles.includes(role) ? role : 'citizen',
      subcity: subcity || undefined,
      skills: skills || [],
    });

    logDebug(`[REGISTER] New user: ${user.email} (role: ${user.role})`);
    logAction({ user, action: 'user_register', resource: 'User', resourceId: user._id, details: { email, role: user.role }, req });

    res.status(201).json({
      success: true,
      message: 'Registration successful. Please log in using your email and password.',
    });
  } catch (error) {
    console.error('[REGISTER] Error:', error.message);
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const logEmail = email || '(empty)';
    logDebug(`\n[LOGIN] ====== Login Attempt ======`);
    logDebug(`[LOGIN] Email: ${logEmail}`);

    if (!email || !password) {
      logDebug('[LOGIN] Result: REJECTED — Missing email or password');
      return res.status(400).json({ success: false, message: 'Please provide email and password' });
    }

    // Normalize the entered email (lowercase + trim) and resolve legacy admin
    // aliases (e.g. admin@ethiobridge.et) to the canonical admin email so the
    // documented admin credentials always work after the project rename.
    const enteredEmail = normalizeEmail(email);
    const lookupEmail  = resolveAdminEmailAlias(enteredEmail);
    if (lookupEmail !== enteredEmail) {
      logDebug(`[LOGIN] ℹ️  "${enteredEmail}" is a legacy admin alias → authenticating as "${lookupEmail}"`);
    }
    logDebug(`[LOGIN] Normalized Email: ${lookupEmail}`);

    // Case-insensitive lookup so legacy mixed-case records still match.
    let user = await findUserByEmail(lookupEmail);

    // Safety: never hijack another account through an alias. If the canonical
    // admin email is owned by a non-admin user, fall back to the email the
    // user actually typed.
    if (user && lookupEmail !== enteredEmail && user.role !== 'admin') {
      logDebug(`[LOGIN] ℹ️  "${lookupEmail}" is not an admin — falling back to "${enteredEmail}"`);
      user = await findUserByEmail(enteredEmail);
    }

    if (!user) {
      logDebug('[LOGIN] Result: REJECTED — User not found');
      // If someone is using the old project-name email, tell the operator which
      // email actually works (log only — never leak the admin email to clients).
      if (isReservedAdminEmail(enteredEmail)) {
        const { CANONICAL_ADMIN_EMAIL } = getAdminConfig();
        logDebug(`[LOGIN] ℹ️  Reserved admin email "${enteredEmail}" attempted but no matching admin exists.`);
        logDebug(`[LOGIN]    The admin account email is now: ${CANONICAL_ADMIN_EMAIL}`);
      }
      // Do NOT increment the lockout counter for unknown emails
      return res.status(401).json({
        success: false,
        message: 'No account found with that email address. Check you are using the correct email and try again.',
      });
    }

    logDebug(`[LOGIN] User Found: ${user.email}`);
    logDebug(`[LOGIN] Role: ${user.role}`);
    logDebug(`[LOGIN] Account Active: ${user.isActive}`);
    logDebug(`[LOGIN] Account Approved: ${user.isApproved}`);

    // ── Password check FIRST — correct password always wins ─────────────────
    // We verify the password BEFORE checking the lockout so that a user who
    // knows the correct password is never permanently blocked.
    const isMatch = await user.matchPassword(password);
    logDebug(`[LOGIN] Password Match: ${isMatch}`);

    if (!isMatch) {
      // Record the failure and possibly start a lockout
      const result = req.loginLockout?.fail() ?? {};
      logDebug('[LOGIN] Result: REJECTED — Invalid password');

      if (result.locked) {
        return res.status(429).json({
          success: false,
          message: `Too many failed login attempts. Please try again in ${result.retryAfterMinutes} minute(s).`,
          retryAfterMinutes: result.retryAfterMinutes,
        });
      }

      const rec = require('../middleware/rateLimiter').loginAttempts?.get(enteredEmail);
      const attemptsLeft = rec ? Math.max(0, parseInt(process.env.MAX_LOGIN_ATTEMPTS || '5', 10) - rec.count) : null;
      const hint = attemptsLeft !== null ? ` (${attemptsLeft} attempt${attemptsLeft !== 1 ? 's' : ''} left before lockout)` : '';

      return res.status(401).json({
        success: false,
        message: `Invalid password. Please check your credentials and try again.${hint}`,
      });
    }

    // ── Correct password — check account state ───────────────────────────────
    // Default admin auto-recovery: the admin account is the platform's lifeline.
    // If it was ever deactivated (manually, by a script, or by a bug) a login
    // with the correct password silently reactivates it instead of locking the
    // whole system out with a dead-end "contact an administrator" message.
    if (!user.isActive && isCanonicalAdminUser(user)) {
      logDebug('[LOGIN] 🔄 Default admin was deactivated — reactivating automatically');
      await reactivateAdminAccount(user);
      await logAction({
        user,
        action: 'user_reactivated',
        resource: 'User',
        resourceId: user._id,
        details: { email: user.email, role: user.role, source: 'login' },
        req,
      });
    }

    if (!user.isActive) {
      logDebug('[LOGIN] Result: REJECTED — Account deactivated');
      // Do NOT increment the lockout counter — this is not a brute-force attempt
      return res.status(401).json({ success: false, message: 'Your account has been deactivated. Please contact an administrator.' });
    }

    // ── If there was an active lockout, clear it — correct password wins ─────
    const { isLocked, remainingMin } = req.loginLockout?.check() ?? {};
    if (isLocked) {
      logDebug(`[LOGIN] Lockout was active for ${enteredEmail} but correct password provided — lifting lockout`);
    }
    req.loginLockout?.clear();

    if (!user.isApproved) {
      logDebug(`[LOGIN] ${user.role} ${email} was not approved — auto-approving now`);
      user.isApproved = true;
      await user.save();
    }

    const token = generateToken(user);
    logDebug(`[LOGIN] JWT Generated: true`);
    logDebug(`[LOGIN] Redirect: ${user.role}`);

    logAction({ user, action: 'user_login', resource: 'User', resourceId: user._id, details: { email, role: user.role }, req });

    logDebug(`[LOGIN] Result: SUCCESS — ${user.email} (role: ${user.role})`);
    logDebug(`[LOGIN] ====== End Login ======\n`);

    res.json({
      success: true,
      token,
      user: {
        id: user._id,
        _id: user._id,
        fullName: user.fullName,
        email: user.email,
        role: normalizeRole(user.role),
        subcity: user.subcity,
        subcityId: user.subcityId,
        woredaId: user.woredaId,
        woredaName: user.woredaName,
        department: user.department,
        departmentId: user.departmentId,
        isApproved: user.isApproved,
        isActive: user.isActive,
        profileImage: user.profileImage,
        organizationName: user.organizationName,
        organizationType: user.organizationType,
        administrativeLevel: user.administrativeLevel,
        kebeleName: user.kebeleName,
        zoneName: user.zoneName,
        ministryName: user.ministryName,
        phone: user.phone,
      },
    });
  } catch (error) {
    console.error('[LOGIN] Unexpected error:', error);
    res.status(500).json({ success: false, message: 'Server error. Please try again later.' });
  }
};

// @desc    Secure self-service reactivation of the default administrator account
// @route   POST /api/auth/admin/reactivate
// @access  Public (protected by ADMIN_REACTIVATION_KEY secret, not by login —
//          it must work even when the admin account itself is locked out)
//
// Safety model:
//   • Only ever acts on the reserved default admin email — never on arbitrary
//     accounts, so a leaked key cannot be used to hijack other users.
//   • Requires a server-side secret (ADMIN_REACTIVATION_KEY) that is never
//     shipped in client code. Rate-limited like other auth endpoints.
//   • Every attempt is logged (successes AND failures) for auditability.
const reactivateAdmin = async (req, res) => {
  try {
    const { reactivationKey, email } = req.body || {};
    const expectedKey = process.env.ADMIN_REACTIVATION_KEY;

    if (!expectedKey) {
      console.warn('[ADMIN-REACTIVATE] ⚠️  ADMIN_REACTIVATION_KEY is not configured — reactivation endpoint disabled');
      return res.status(503).json({
        success: false,
        message: 'Admin reactivation is not enabled on this server. Set ADMIN_REACTIVATION_KEY in the server environment.',
      });
    }

    if (!reactivationKey || String(reactivationKey) !== String(expectedKey)) {
      console.warn(`[ADMIN-REACTIVATE] ❌ REJECTED — invalid reactivation key (email: ${email || '(not provided)'})`);
      return res.status(401).json({ success: false, message: 'Invalid reactivation key.' });
    }

    const targetEmail = email ? normalizeEmail(email) : getAdminConfig().CANONICAL_ADMIN_EMAIL;

    if (!isCanonicalAdminEmail(targetEmail)) {
      console.warn(`[ADMIN-REACTIVATE] ❌ REJECTED — ${targetEmail} is not the default admin email`);
      return res.status(400).json({
        success: false,
        message: 'Reactivation is only allowed for the default administrator account.',
      });
    }

    const user = await findUserByEmail(targetEmail);
    if (!user) {
      console.warn(`[ADMIN-REACTIVATE] ❌ REJECTED — default admin account not found (${targetEmail})`);
      return res.status(404).json({
        success: false,
        message: 'Default administrator account not found. Run the seed script first (npm run seed).',
      });
    }

    await reactivateAdminAccount(user);
    await logAction({
      user,
      action: 'user_reactivated',
      resource: 'User',
      resourceId: user._id,
      details: { email: user.email, role: user.role, source: 'reactivate-endpoint' },
      req,
    });

    logDebug(`[ADMIN-REACTIVATE] ✅ Default admin reactivated via endpoint: ${user.email}`);
    res.json({
      success: true,
      message: 'The default administrator account has been reactivated. You can now log in.',
      email: user.email,
    });
  } catch (error) {
    console.error('[ADMIN-REACTIVATE] Error:', error);
    res.status(500).json({ success: false, message: 'Failed to reactivate the administrator account.' });
  }
};

// @desc    Get current logged in user
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {  try {
    const user = await User.findById(req.user._id).select('-password');
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    user.role = normalizeRole(user.role);
    logDebug(`[GETME] User: ${user.email} (role: ${user.role})`);
    res.json({ success: true, user });
  } catch (error) {
    console.error('[GETME] Error:', error);
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const { fullName, phone, organizationName, skills, availability } = req.body;
    const updateFields = { fullName, phone, organizationName, skills, availability };

    if (req.file) {
      updateFields.profileImage = req.file.path;
    }

    Object.keys(updateFields).forEach(k => updateFields[k] === undefined && delete updateFields[k]);

    const user = await User.findByIdAndUpdate(req.user._id, updateFields, { new: true, runValidators: true }).select('-password');

    res.json({ success: true, user });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Change password
// @route   PUT /api/auth/change-password
// @access  Private
const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id);

    const isMatch = await user.matchPassword(currentPassword);
    if (!isMatch) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();

    res.json({ success: true, message: 'Password updated successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { register, login, reactivateAdmin, getMe, updateProfile, changePassword };
