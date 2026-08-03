const mongoose = require('mongoose');

const newsSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, trim: true },
    content: { type: String, required: true },
    summary: { type: String },
    featuredImage: { type: String },
    category: {
      type: String,
      enum: ['Government Updates', 'NGO Activities', 'Success Stories', 'Emergency Alerts', 'Platform Updates', 'Community News'],
      required: true,
    },
    author: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    organizationName: { type: String },
    region: { type: String },
    isPublished: { type: Boolean, default: false },
    publishedAt: { type: Date },
    tags: [{ type: String }],
    views: { type: Number, default: 0 },
  },
  { timestamps: true }
);

module.exports = mongoose.model('News', newsSchema);
