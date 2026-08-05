const mongoose = require('mongoose');

// Donation Verification (donation_verifications collection)
// ─────────────────────────────────────────────────────────
// Immutable audit trail of every admin verify / reject action taken on a
// donation. Kept separate from the donation document so the history can be
// queried and exported independently without bloating the donation.
const donationVerificationSchema = new mongoose.Schema(
  {
    donation: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Donation',
      required: true,
    },
    action: {
      type: String,
      enum: ['verified', 'rejected'],
      required: true,
    },
    admin: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
    },
    reason: {
      type: String,
      default: '',
    },
    previousStatus: {
      type: String,
      default: 'pending_verification',
    },
  },
  { timestamps: true }
);

donationVerificationSchema.index({ donation: 1, createdAt: -1 });
donationVerificationSchema.index({ admin: 1, createdAt: -1 });

module.exports = mongoose.model('DonationVerification', donationVerificationSchema);
