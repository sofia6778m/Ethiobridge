const mongoose = require('mongoose');

const woredaSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  // subcity stores the name as the admin typed it (e.g. "Bole", "Yeka", "Lemmi Kura").
  // The hard enum has been removed so newly created subcities work automatically.
  subcity: { type: String, required: true, trim: true },
  subcityId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  description: { type: String, default: '' },
  status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
  departments: {
    type: [String],
    default: ['Electricity', 'Road', 'Water', 'Health', 'Education', 'Revenue'],
  },
  isActive: { type: Boolean, default: true },
}, { timestamps: true });

woredaSchema.index({ subcity: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('Woreda', woredaSchema);
