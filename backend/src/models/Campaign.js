const mongoose = require('mongoose');

const campaignSchema = new mongoose.Schema({
  title: {
    type: String,
    required: true,
    trim: true,
  },
  description: {
    type: String,
    required: true,
  },
  campaignType: {
    type: String,
    enum: ['infrastructure', 'emergency', 'general'],
    required: true,
  },
  image: {
    type: String,
    default: '',
  },
  goalAmount: {
    type: Number,
    required: true,
    min: 0,
  },
  raisedAmount: {
    type: Number,
    default: 0,
    min: 0,
  },
  donors: {
    type: Number,
    default: 0,
  },
  location: {
    region: { type: String, default: '' },
    city: { type: String, default: '' },
    specificLocation: { type: String, default: '' },
  },
  startDate: {
    type: Date,
    default: Date.now,
  },
  endDate: {
    type: Date,
    required: true,
  },
  status: {
    type: String,
    enum: ['pending', 'active', 'completed', 'closed'],
    default: 'pending',
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  approver: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
  },
  approvedAt: Date,
  relatedReport: {
    type: mongoose.Schema.Types.ObjectId,
    refPath: 'relatedReportModel',
  },
  relatedReportModel: {
    type: String,
    enum: ['InfrastructureReport', 'EmergencyReport', null],
    default: null,
  },
  successStories: [
    {
      title: String,
      description: String,
      image: String,
      date: Date,
    },
  ],
  estimatedBeneficiaries: {
    type: Number,
    default: 0,
  },
  updates: [
    {
      title: String,
      description: String,
      date: { type: Date, default: Date.now },
    },
  ],
  comments: [
    {
      author: { type: String, default: 'Anonymous' },
      text: String,
      createdAt: { type: Date, default: Date.now },
    },
  ],
  tags: [String],
  isFeatured: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

campaignSchema.index({ status: 1, createdAt: -1 });
campaignSchema.index({ campaignType: 1, status: 1 });
campaignSchema.index({ createdBy: 1 });

module.exports = mongoose.model('Campaign', campaignSchema);
