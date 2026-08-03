const mongoose = require('mongoose');

/**
 * IssueType — master data for complaint issue types.
 *
 * Original seed set: 3 departments × 3 subcities × 5 issues each = 45 total.
 * New departments/subcities created in master data can receive their own
 * issue types without code changes — the controller validates department and
 * subcity against the live Department / Subcity collections instead of enums.
 */
const issueTypeSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // No enum restriction — any department name created in Department
    // Management is valid so new departments work without code changes.
    department: {
      type: String,
      required: true,
      trim: true,
    },
    // No enum restriction — any subcity created in the Subcity collection is valid.
    subcity: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: '',
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Each (name, department, subcity) triple must be unique.
issueTypeSchema.index({ name: 1, department: 1, subcity: 1 }, { unique: true });
issueTypeSchema.index({ department: 1, subcity: 1 });

module.exports = mongoose.model('IssueType', issueTypeSchema);
