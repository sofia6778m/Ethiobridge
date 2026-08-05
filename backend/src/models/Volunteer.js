const mongoose = require('mongoose');

// Volunteer registration per community campaign.
// ──────────────────────────────────────────────
// Citizens, diaspora and community members register to volunteer for an
// official campaign. The Subcity / Woreda office manages the registration
// (approve / decline / mark attended) and the impact rolls up into the
// campaign's impactMetrics.volunteersEngaged.
const volunteerSchema = new mongoose.Schema(
  {
    campaign: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Campaign',
      required: true,
      index: true,
    },
    // Authenticated user who registered (optional — guests may volunteer too).
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    fullName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
      maxlength: 20,
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
    },
    // Location context (denormalized from the campaign at registration time).
    subcity: { type: String, default: '' },
    woreda: { type: String, default: '' },
    area: {
      type: String,
      default: '',
    },
    skills: {
      type: String,
      default: '',
      maxlength: 500,
    },
    // e.g. "Weekends", "Mon-Fri mornings", "One-off event day".
    availability: {
      type: String,
      default: '',
      maxlength: 300,
    },
    message: {
      type: String,
      default: '',
      maxlength: 1000,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'declined', 'attended'],
      default: 'pending',
    },
    statusNote: {
      type: String,
      default: '',
    },
    updatedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    approvedAt: {
      type: Date,
    },
    attendedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

volunteerSchema.index({ campaign: 1, status: 1 });
volunteerSchema.index({ user: 1, createdAt: -1 });
volunteerSchema.index({ phone: 1, campaign: 1 });

module.exports = mongoose.model('Volunteer', volunteerSchema);
