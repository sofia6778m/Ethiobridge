const mongoose = require('mongoose');

/**
 * Subcity — master data for subcity records.
 *
 * Name is stored as entered by the admin (e.g. "Bole", "Yeka", "Lemmi Kura").
 * A normalized lowercase index enforces case-insensitive uniqueness.
 */
const subcitySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Lowercase version used for unique enforcement only — not exposed in API.
    nameLower: {
      type: String,
      unique: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    status: {
      type: String,
      enum: ['Active', 'Inactive'],
      default: 'Active',
    },
  },
  { timestamps: true }
);

// Auto-populate nameLower before every save so uniqueness is case-insensitive.
subcitySchema.pre('save', function (next) {
  this.nameLower = this.name.toLowerCase().trim();
  next();
});

module.exports = mongoose.model('Subcity', subcitySchema);
