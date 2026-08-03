/**
 * Seed script — bootstraps only the main admin account and the woreda
 * reference data required by the admin "Create User" form.
 * No demo/dummy accounts are created. All other users must be created
 * manually by an admin from the User Management page.
 * Run: node src/utils/seed.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const User = require('../models/User');
const {
  getAdminConfig,
  findUserByEmail,
} = require('./adminAccount');

const seed = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const { CANONICAL_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD } = getAdminConfig();

  // 1) Main admin account (only user created automatically).
  //    Uses the canonical ADMIN_EMAIL from .env (default admin@zda.et).
  //    If the account already exists but was left deactivated, it is
  //    automatically reactivated so the documented credentials always work.
  const adminExists = await findUserByEmail(CANONICAL_ADMIN_EMAIL);
  if (!adminExists) {
    await User.create({
      fullName: 'System Administrator',
      email: CANONICAL_ADMIN_EMAIL,
      password: DEFAULT_ADMIN_PASSWORD,
      role: 'admin',
      isActive: true,
      isApproved: true,
      phone: '+251911000001',
      region: 'Addis Ababa',
    });
    console.log(`  ✓ Created: ${CANONICAL_ADMIN_EMAIL} (admin)`);
  } else {
    if (adminExists.role !== 'admin') {
      console.warn(`  ⚠️  WARNING: ${CANONICAL_ADMIN_EMAIL} exists but its role is "${adminExists.role}", not "admin".`);
      console.warn('      The reserved admin email must hold an admin account — forcing role back to admin.');
      adminExists.role = 'admin';
    }
    if (!adminExists.isActive || !adminExists.isApproved) {
      console.log(`  🔄 Reactivating: ${CANONICAL_ADMIN_EMAIL} (was inactive / unapproved)`);
      adminExists.isActive = true;
      adminExists.isApproved = true;
      await adminExists.save();
    }
    console.log(`  → Already exists: ${CANONICAL_ADMIN_EMAIL} (admin)`);
  }

  // 2) Woreda reference data — used by the admin Create User form dropdowns
  //    and by woreda/department scoping. Not user accounts.
  try {
    const Woreda = require('../models/Woreda');
    const woredas = [
      { name: 'Woreda 01', subcity: 'BOLE', description: 'Bole subcity first woreda' },
      { name: 'Woreda 02', subcity: 'BOLE', description: 'Bole subcity second woreda' },
      { name: 'Woreda 03', subcity: 'YEKA', description: 'Yeka subcity first woreda' },
      { name: 'Woreda 04', subcity: 'YEKA', description: 'Yeka subcity second woreda' },
      { name: 'Woreda 05', subcity: 'LEMMI_KURA', description: 'Lemmi Kura subcity first woreda' },
      { name: 'Woreda 06', subcity: 'LEMMI_KURA', description: 'Lemmi Kura subcity second woreda' },
    ];
    for (const w of woredas) {
      const exists = await Woreda.findOne({ name: w.name, subcity: w.subcity });
      if (!exists) {
        await Woreda.create({ ...w, subcityId: null, status: 'Active', departments: ['Electricity', 'Road', 'Water'] });
        console.log(`  ✓ Created: ${w.name} (${w.subcity})`);
      } else {
        await Woreda.updateOne({ _id: exists._id }, { $set: { status: exists.status || 'Active', description: exists.description || '' } });
        console.log(`  → Already exists: ${w.name} (${w.subcity})`);
      }
    }
  } catch (e) {
    console.log('  (Woreda model not available, skipping woreda seed)');
  }

  console.log('\nSeed complete!');
  console.log(`Only the main admin account (${CANONICAL_ADMIN_EMAIL}) exists. Create all other users from the User Management page.`);
  process.exit(0);
};

seed().catch(err => { console.error(err); process.exit(1); });
