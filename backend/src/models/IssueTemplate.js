const mongoose = require('mongoose');

// Predefined issue categories for the municipal complaint workflow.
// Each template belongs to a department (Electricity / Water / Road) and is
// classified by which administrative level usually handles it:
//   - Woreda  : minor maintenance that a woreda office can resolve
//   - Subcity : major infrastructure / high-cost / approval-required work
// Departments and subcities themselves are managed dynamically by Admins —
// only these templates are pre-seeded (idempotently) as built-in starting data.
const issueTemplateSchema = new mongoose.Schema(
  {
    department: { type: String, required: true, trim: true }, // Electricity | Water | Road
    level: { type: String, enum: ['Woreda', 'Subcity'], required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: '', trim: true },
    isActive: { type: Boolean, default: true },
    sortOrder: { type: Number, default: 0 },
  },
  { timestamps: true }
);

issueTemplateSchema.index({ department: 1, level: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('IssueTemplate', issueTemplateSchema);
