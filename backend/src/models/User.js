const mongoose = require('mongoose');
const { hashPassword, verifyPassword } = require('../utils/password');

const userSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    phone: { type: String, trim: true },
    role: {
      type: String,
      validate: {
        validator(value) {
          const ROLES = [
            // Legacy roles (kept for existing accounts and the municipal/workflow systems)
            'citizen', 'government', 'ngo', 'volunteer', 'admin',
            'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura',
            'woreda', 'department', 'inspector', 'technician',
            // Complaint-management roles
            'ADMIN', 'SUBCITY_HEAD', 'WOREDA_HEAD', 'DEPARTMENT_ADMIN', 'OFFICER', 'TECHNICIAN', 'CITIZEN', 'CONTRACTOR',
            // Real Addis Ababa government hierarchy
            'SUBCITY_ADMIN', 'WOREDA_ADMIN',
            // Woreda admins provisioned by the System Admin (User Management).
            // They land on the shared /dashboard and are scoped to their subcity
            // + woreda — distinct from WOREDA_ADMIN (hierarchy dashboard).
            'woreda_admin',
            // Department officers provisioned by the System Admin (User
            // Management). Scoped to their subcity + woreda + department on the
            // shared /dashboard.
            'department_officer',
            // Governance officers provisioned by a Subcity Admin (Governance
            // Management). Assigned to one GovernmentOffice and scoped to that
            // office's governance complaints on the shared /dashboard.
            'GOVERNANCE_OFFICER',
            // Office supervisors provisioned by a Subcity Admin (Governance
            // Management). Same single-office scope as GOVERNANCE_OFFICER.
            'OFFICE_SUPERVISOR',
          ];
          // Subcity-admin roles are derived from the live Subcity collection
          // (Bole → subcity_bole, Koye → subcity_koye, …), so any subcity_<name>
          // value is accepted — the admin never types the role manually.
          return ROLES.includes(value) || /^subcity_[a-z0-9_]+$/.test(value || '');
        },
        message: 'Invalid role: {VALUE}',
      },
      default: 'citizen',
    },
    subcity: {
      type: String,
      // No enum — accepts any subcity name stored in the Subcity collection
    },
    // Optional ObjectId references to the live Subcity / Department master data
    // (used by the new complaint-management roles; the string fields above stay
    // for display and legacy records).
    subcityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcity' },
    departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
    // GovernmentOffice a GOVERNANCE_OFFICER is assigned to — scopes their
    // governance complaint dashboard to that single office.
    governmentOfficeId: { type: mongoose.Schema.Types.ObjectId, ref: 'GovernmentOffice', default: null },
    employeeId: { type: String, trim: true },
    woredaId: { type: mongoose.Schema.Types.ObjectId, ref: 'Woreda' },
    woredaName: { type: String },
    department: { type: String },
    profileImage: { type: String, default: '' },
    organizationName: { type: String },
    organizationType: { type: String },
    administrativeLevel: {
      type: String,
      enum: ['kebele', 'woreda', 'zone', 'regional_bureau', 'federal_ministry'],
    },
    kebeleName: { type: String },
    zoneName: { type: String },
    ministryName: { type: String },
    skills: [{ type: String }],
    availability: { type: Boolean, default: true },
    isActive: { type: Boolean, default: true },
    isApproved: { type: Boolean, default: false },
    emailNotifications: { type: Boolean, default: true },
    smsNotifications: { type: Boolean, default: false },
    pushNotifications: { type: Boolean, default: true },
    // Public Alert subscriptions. `enabled` toggles non-emergency alerts only —
    // emergency alerts are always delivered and cannot be disabled.
    alertSubscriptions: {
      enabled: { type: Boolean, default: true },
      categories: { type: [String], default: [] }, // empty array = all categories
      channels: {
        inApp: { type: Boolean, default: true },
        email: { type: Boolean, default: false },
        sms: { type: Boolean, default: false },
        push: { type: Boolean, default: false },
      },
    },
    resetPasswordToken: String,
    resetPasswordExpire: Date,
  },
  { timestamps: true }
);

userSchema.pre('save', function (next) {
  if ([
    'citizen', 'volunteer', 'admin', 'ngo', 'government',
    'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura',
    'woreda', 'department', 'inspector', 'technician',
    'ADMIN', 'SUBCITY_HEAD', 'WOREDA_HEAD', 'DEPARTMENT_ADMIN', 'OFFICER', 'TECHNICIAN', 'CITIZEN', 'CONTRACTOR',
    'SUBCITY_ADMIN', 'WOREDA_ADMIN', 'woreda_admin', 'department_officer', 'GOVERNANCE_OFFICER', 'OFFICE_SUPERVISOR',
  ].includes(this.role) || (typeof this.role === 'string' && this.role.startsWith('subcity_'))) {
    this.isApproved = true;
  }
  next();
});

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await hashPassword(this.password);
  next();
});

// ── Default administrator protection ─────────────────────────────────────────
// The default admin account (admin@zda.et) is the platform's lifeline — if it
// is ever deactivated nobody can log in to fix it. These hooks make it
// impossible to deactivate that ONE account through ANY code path (admin UI,
// seed/cleanup scripts, direct saves), while still allowing it to be freely
// reactivated (isActive → true) or otherwise edited.
const { isCanonicalAdminEmail } = require('../utils/adminAccount');
const DEFAULT_ADMIN_GUARD_ERROR =
  'The default administrator account cannot be deactivated.';

// Block deactivation on document.save() (create + update). Only triggers when
// this save actually changes isActive to false — editing any other field of an
// already-inactive account stays allowed.
userSchema.pre('save', function (next) {
  if (
    this.isModified('isActive') &&
    this.isActive === false &&
    isCanonicalAdminEmail(this.email)
  ) {
    return next(new Error(DEFAULT_ADMIN_GUARD_ERROR));
  }
  next();
});

// Block deactivation on updateOne / findByIdAndUpdate / updateMany (the queries
// used by adminController.updateUser and any future bulk operations).
userSchema.pre('findOneAndUpdate', async function (next) {
  const update = this.getUpdate() || {};
  const sets = update.$set || update;
  if (sets.isActive !== false) return next();

  const conditions = this.getFilter();
  const targetId = conditions._id || conditions['_id'];
  if (!targetId) return next();

  const target = await mongoose
    .model('User')
    .findById(targetId)
    .select('email role')
    .lean();
  if (target && isCanonicalAdminEmail(target.email)) {
    return next(new Error(DEFAULT_ADMIN_GUARD_ERROR));
  }
  next();
});

userSchema.methods.matchPassword = async function (enteredPassword) {
  return await verifyPassword(enteredPassword, this.password);
};

// ── Location-uniqueness indexes ──────────────────────────────────────────────
//
// Rule 1 — ONE user per subcity.
//   Applies to the three hard-coded subcity admin roles.  The `subcity` field
//   is set automatically from the role so this is effectively a per-role unique
//   constraint.  Using a partialFilterExpression keeps the index sparse so that
//   documents without a subcity value (citizen, admin, …) are never indexed.
userSchema.index(
  { subcity: 1 },
  {
    unique: true,
    partialFilterExpression: {
      role: { $in: ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura'] },
    },
    name: 'unique_subcity_admin',
  }
);

// Rule 2 — ONE woreda-role user per woreda.
//   Only documents where role === 'woreda' participate.
userSchema.index(
  { woredaId: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'woreda' },
    name: 'unique_woreda_user',
  }
);

// Rule 3 — ONE department-role user per woreda+department combination.
//   A single woreda can have up to three department accounts (Electricity, Road,
//   Water) but never two accounts for the same department in the same woreda.
userSchema.index(
  { woredaId: 1, department: 1 },
  {
    unique: true,
    partialFilterExpression: { role: 'department' },
    name: 'unique_department_user',
  }
);

module.exports = mongoose.model('User', userSchema);
