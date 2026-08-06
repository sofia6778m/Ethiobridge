const mongoose = require('mongoose');

/**
 * SlaRule — category-based response deadlines for governance complaints.
 *
 * A rule is keyed by a normalized category name (case-insensitive) and scoped
 * to a subcity (subcityId) or to all subcities (subcityId = null = global).
 *
 * Resolution precedence when a complaint is created:
 *   1. rule where key === complaint category AND subcityId === complaint subcity
 *   2. rule where key === complaint category AND subcityId === null (global)
 *   3. rule where key === 'default' AND subcityId === null (global fallback)
 *   4. hardcoded 48-hour fallback (see utils/slaRules.js)
 *
 * The category name is matched case-insensitively against the denormalized
 * `category` string stored on the complaint.
 */
const slaRuleSchema = new mongoose.Schema(
  {
    // Human label (e.g. "Corruption / Bribery"). 'default' is reserved for the
    // catch-all fallback rule.
    categoryName: { type: String, required: true, trim: true },
    // Lowercased key used for unique + case-insensitive matching.
    key: { type: String, trim: true, lowercase: true },
    // null = applies to every subcity; otherwise scoped to one subcity.
    subcityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcity', default: null },
    // Response deadline in days (e.g. corruption = 3 days).
    responseDays: { type: Number, required: true, min: 1, max: 365 },
    description: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

slaRuleSchema.pre('validate', function (next) {
  if (this.categoryName !== undefined) {
    this.key = String(this.categoryName).trim().toLowerCase();
  }
  next();
});

slaRuleSchema.index({ key: 1, subcityId: 1 }, { unique: true });
slaRuleSchema.index({ isActive: 1, key: 1 });

module.exports = mongoose.model('SlaRule', slaRuleSchema);
