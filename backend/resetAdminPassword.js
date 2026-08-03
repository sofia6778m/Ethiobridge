/**
 * resetAdminPassword.js
 * ─────────────────────
 * Resets the admin account to a known state.
 * Run from the backend/ directory: node resetAdminPassword.js
 *
 * NOTE: Pass plain-text password — the User model pre-save hook hashes it.
 *       Never pass a bcrypt hash directly to User.create/save.
 */
require('dotenv').config();
const mongoose = require('mongoose');
const User     = require('./src/models/User');
const { getAdminConfig, findUserByEmail } = require('./src/utils/adminAccount');

async function resetAdmin() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('MongoDB connected');

    const { CANONICAL_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD } = getAdminConfig();
    const newPassword  = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;
    const adminEmail   = process.env.ADMIN_EMAIL    || CANONICAL_ADMIN_EMAIL;

    // Case-insensitive lookup so mixed-case legacy records are still found.
    let user = await findUserByEmail(adminEmail);

    if (user) {
      // Update existing record — assign plain password; hook will hash it.
      user.password   = newPassword;
      user.isActive   = true;
      user.isApproved = true;
      user.role       = 'admin';
      await user.save();
      console.log('================================');
      console.log('Admin password reset successful');
    } else {
      // Create fresh admin — pass plain password.
      user = await User.create({
        fullName:   'System Administrator',
        email:      adminEmail,
        password:   newPassword,
        role:       'admin',
        isActive:   true,
        isApproved: true,
      });
      console.log('================================');
      console.log('Admin account created');
    }

    console.log('Email   :', adminEmail);
    console.log('Password:', newPassword);
    console.log('isActive:', user.isActive);
    console.log('================================');
    process.exit(0);
  } catch (error) {
    console.error('Error:', error.message);
    process.exit(1);
  }
}

resetAdmin();
