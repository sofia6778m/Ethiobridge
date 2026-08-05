const mongoose = require('mongoose');

/**
 * GovernmentOffice — master data for the government offices / bureaus that
 * governance complaints can be filed against.
 *
 * Every office belongs to exactly one subcity (via the subcity name label and
 * the live Subcity reference). Complaint categories are attached per office
 * through the ComplaintCategory collection.
 */
const governmentOfficeSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    // Subcity name as stored in the Subcity collection (e.g. "Bole", "Yeka").
    subcity: { type: String, required: true, trim: true },
    subcityId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subcity', default: null },
    description: { type: String, default: '', trim: true },
    address: { type: String, default: '', trim: true },
    phone: { type: String, default: '', trim: true },
    email: { type: String, default: '', trim: true },
    headName: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
    // Controls ordering in public forms and management lists (lowest first).
    displayOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// One subcity may not register the same office name twice.
governmentOfficeSchema.index({ subcityId: 1, name: 1 }, { unique: true });
governmentOfficeSchema.index({ subcity: 1, isActive: 1 });

module.exports = mongoose.model('GovernmentOffice', governmentOfficeSchema);
