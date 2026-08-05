const mongoose = require('mongoose');

/**
 * ComplaintCategory — the issue categories a governance complaint can use,
 * owned by a GovernmentOffice.
 *
 * Each office manages its own categories, so the public form only ever offers
 * categories that belong to the selected office (fully DB-driven — no
 * hardcoded category lists anywhere).
 */
const complaintCategorySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    officeId: { type: mongoose.Schema.Types.ObjectId, ref: 'GovernmentOffice', required: true, index: true },
    description: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
    // Controls ordering in public forms and management lists (lowest first).
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// An office cannot register the same category name twice.
complaintCategorySchema.index({ officeId: 1, name: 1 }, { unique: true });
complaintCategorySchema.index({ officeId: 1, isActive: 1 });

module.exports = mongoose.model('ComplaintCategory', complaintCategorySchema);
