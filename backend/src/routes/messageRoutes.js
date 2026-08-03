const express = require('express');
const router = express.Router();
const {
  sendMessage, getInbox, getSent, getConversation, getContacts,
} = require('../controllers/messageController');
const { protect } = require('../middleware/auth');

router.post('/', protect, sendMessage);
router.get('/inbox', protect, getInbox);
router.get('/sent', protect, getSent);
router.get('/contacts', protect, getContacts);
router.get('/conversation/:conversationId', protect, getConversation);

module.exports = router;
