const mongoose = require('mongoose');
const { normalizeDepartmentName } = require('../utils/departmentNames');

const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'Department name is required'],
      trim: true,
      maxlength: [100, 'Department name must be 100 characters or fewer'],
    },
    // Case- and whitespace-insensitive identity (trimmed, lower-cased).
    // Uniqueness is enforced per subcity by the database (see the compound
    // index below) so the same department name can exist in different subcities
    // but never twice inside one subcity, regardless of casing or spaces.
    normalizedDepartmentName: {
      type: String,
      required: [true, 'Normalized department name is required'],
      trim: true,
      maxlength: [100, 'Department name must be 100 characters or fewer'],
    },
    // Ownership: every department belongs to exactly one subcity. subcityId is
    // null only for legacy/global records that the migration has not yet moved.
    subcityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Subcity',
      index: true,
      default: null,
    },
    // Denormalized subcity name so lists/notifications never need a join.
    subcityName: { type: String, trim: true, default: '' },
    // Optional woreda ownership. A department is:
    //   general        — subcityId null,  woredaId null
    //   subcity-level  — subcityId set,   woredaId null
    //   woreda-level   — subcityId set,   woredaId set
    woredaId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Woreda',
      index: true,
      default: null,
    },
    // Denormalized woreda name so lists/notifications never need a join.
    woredaName: { type: String, trim: true, default: '' },
    // The admin account that created the department.
    createdByAdmin: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    description: { type: String, default: '', trim: true },
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  },
  { timestamps: true }
);

// Keep normalizedDepartmentName in sync with name whenever the name is written
// through a document save (Department.create / doc.save()). findByIdAndUpdate
// bypasses save hooks, so the controllers set normalizedDepartmentName explicitly.
departmentSchema.pre('validate', function (next) {
  if (this.isModified('name')) {
    this.normalizedDepartmentName = normalizeDepartmentName(this.name);
  }
  next();
});

// The single source of truth for duplicate prevention: a department name may
// appear once per subcity AND woreda scope. Legacy/global records (subcityId
// null, woredaId null) keep their name globally unique via the same index.
departmentSchema.index(
  { subcityId: 1, woredaId: 1, normalizedDepartmentName: 1 },
  { unique: true, name: 'unique_subcity_woreda_department' }
);

module.exports = mongoose.model('Department', departmentSchema);
