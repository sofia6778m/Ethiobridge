const Message = require('../models/Message');
const User = require('../models/User');
const createNotification = require('../utils/createNotification');
// Simple UUID-like ID generator (avoids extra dependency)
const uuidv4 = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;

// @desc  Send a message
// @route POST /api/messages
// @access Private
const sendMessage = async (req, res) => {
  try {
    const { recipientId, subject, content, relatedReport, relatedReportType, parentMessageId } = req.body;

    const recipient = await User.findById(recipientId);
    if (!recipient) return res.status(404).json({ success: false, message: 'Recipient not found' });

    // Generate or reuse conversationId for threading
    let conversationId = uuidv4();
    if (parentMessageId) {
      const parent = await Message.findById(parentMessageId);
      if (parent) conversationId = parent.conversationId;
    }

    const message = await Message.create({
      sender: req.user._id,
      recipient: recipientId,
      subject,
      content,
      relatedReport,
      relatedReportType,
      conversationId,
      parentMessage: parentMessageId || null,
    });

    await createNotification({
      recipient: recipientId,
      actorId: req.user._id,
      title: 'New Message',
      message: `You have a new message from ${req.user.fullName}.`,
      type: 'message',
    });

    res.status(201).json({ success: true, message });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get inbox (received messages)
// @route GET /api/messages/inbox
// @access Private
const getInbox = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total = await Message.countDocuments({ recipient: req.user._id, parentMessage: null });
    const messages = await Message.find({ recipient: req.user._id, parentMessage: null })
      .populate('sender', 'fullName profileImage role organizationName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get sent messages
// @route GET /api/messages/sent
// @access Private
const getSent = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const total = await Message.countDocuments({ sender: req.user._id, parentMessage: null });
    const messages = await Message.find({ sender: req.user._id, parentMessage: null })
      .populate('recipient', 'fullName profileImage role organizationName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get conversation thread
// @route GET /api/messages/conversation/:conversationId
// @access Private
const getConversation = async (req, res) => {
  try {
    const messages = await Message.find({ conversationId: req.params.conversationId })
      .populate('sender', 'fullName profileImage role organizationName')
      .populate('recipient', 'fullName profileImage role organizationName')
      .sort({ createdAt: 1 });

    // Mark as read
    await Message.updateMany(
      { conversationId: req.params.conversationId, recipient: req.user._id, isRead: false },
      { isRead: true, readAt: new Date() }
    );

    res.json({ success: true, messages });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  Get list of users to message
// @route GET /api/messages/contacts
// @access Private
const getContacts = async (req, res) => {
  try {
    const { role, search } = req.query;
    const query = { _id: { $ne: req.user._id }, isActive: true, isApproved: true };
    if (role) query.role = role;
    if (search) query.$or = [
      { fullName: { $regex: search, $options: 'i' } },
      { organizationName: { $regex: search, $options: 'i' } },
    ];

    const users = await User.find(query).select('fullName email role organizationName profileImage region');
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { sendMessage, getInbox, getSent, getConversation, getContacts };
