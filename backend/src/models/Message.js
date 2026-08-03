const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema(
  {
    sender: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    recipient: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    subject: { type: String },
    content: { type: String, required: true },
    relatedReport: { type: mongoose.Schema.Types.ObjectId },
    relatedReportType: { type: String, enum: ['infrastructure', 'emergency', 'missing_person'] },
    isRead: { type: Boolean, default: false },
    readAt: { type: Date },
    // Conversation threading
    conversationId: { type: String },
    parentMessage: { type: mongoose.Schema.Types.ObjectId, ref: 'Message' },
  },
  { timestamps: true }
);

module.exports = mongoose.model('Message', messageSchema);
