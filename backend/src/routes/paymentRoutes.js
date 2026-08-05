const express = require('express');
const router = express.Router();
const { protectOptional, authorize } = require('../middleware/auth');
const { generalLimiter } = require('../middleware/rateLimiter');
const Donation = require('../models/Donation');
const {
  initiateChapa, verifyChapaTransaction, verifyChapaWebhookSignature,
  initiateCoopayAmole, verifyCoopayTransaction,
} = require('../services/paymentProvider');
const {
  _internal: { markDonationPaid, notifyAdmins, notifyDonor },
} = require('../controllers/donationController');
const { logAction } = require('../middleware/auditLog');

// ── Chapa ────────────────────────────────────────────────────────────────────
// Initiate a Chapa checkout for an existing pending donation.
router.post('/chapa/initiate', generalLimiter, protectOptional, async (req, res) => {
  try {
    const { referenceNumber, returnUrl } = req.body;
    if (!referenceNumber) return res.status(400).json({ success: false, message: 'Reference number is required.' });

    const donation = await Donation.findOne({ referenceNumber }).populate('campaign', 'title');
    if (!donation) return res.status(404).json({ success: false, message: 'Donation not found.' });
    if (donation.paymentMethod !== 'chapa_payment') {
      return res.status(400).json({ success: false, message: 'This donation is not configured for Chapa.' });
    }

    const result = await initiateChapa({
      amount: donation.amount,
      reference: donation.referenceNumber,
      donorName: donation.isAnonymous ? 'Anonymous' : donation.fullName,
      donorEmail: donation.email,
      returnUrl,
      customFields: { campaign_title: donation.campaign?.title || '' },
    });

    if (!result.ok || !result.checkoutUrl) {
      return res.status(503).json({
        success: false,
        message: 'Chapa is not configured on this platform yet. Please use the QR code or bank transfer instead.',
        checkoutUrl: '',
      });
    }

    donation.transactionId = result.txRef;
    await donation.save();

    await logAction({ user: req.user, action: 'payment_chapa_initiated', resource: 'donations', resourceId: donation._id, details: { referenceNumber: donation.referenceNumber, txRef: result.txRef }, req });

    res.json({ success: true, data: { checkoutUrl: result.checkoutUrl, txRef: result.txRef } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Verify a Chapa transaction status (donor polls this after returning).
router.get('/chapa/verify/:txRef', generalLimiter, async (req, res) => {
  try {
    const result = await verifyChapaTransaction(req.params.txRef);
    if (!result.ok) return res.status(502).json({ success: false, message: result.error || 'Chapa verification failed.' });

    let donation = null;
    if (result.txRef) donation = await Donation.findOne({ transactionId: result.txRef }).populate('campaign', 'title');
    if (donation && result.paid) {
      donation.paymentStatus = 'completed';
      donation.paymentMethodName = donation.paymentMethodName || 'Chapa Online Payment';
      await donation.save();
    }

    res.json({ success: true, data: { paid: result.paid, donation: donation ? { referenceNumber: donation.referenceNumber, paymentStatus: donation.paymentStatus } : null } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Chapa webhook — auto-verifies a donation when Chapa confirms the payment.
router.post('/chapa/webhook', async (req, res) => {
  try {
    const payload = req.body;
    const signature = req.headers['chapa-signature'] || req.headers['x-chapa-signature'] || '';
    if (!verifyChapaWebhookSignature(payload, signature)) {
      // Chapa does not always sign webhooks; proceed with tx_ref validation only.
      if (!payload?.tx_ref) return res.status(400).json({ success: false, message: 'Invalid webhook payload.' });
    }

    const txRef = payload?.tx_ref;
    if (!txRef) return res.status(400).json({ success: false, message: 'Missing tx_ref.' });

    const donation = await Donation.findOne({ transactionId: txRef }).populate('campaign', 'title');
    if (!donation) return res.status(404).json({ success: false, message: 'Donation not found.' });

    if (payload?.status === 'success' || payload?.data?.status === 'success') {
      if (donation.verificationStatus !== 'verified') {
        await markDonationPaid({ req: { app: undefined }, user: null }, donation, { via: 'chapa_webhook', skipIo: true });
      }
    }

    res.json({ success: true, received: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// ── Coopay (Amole) ───────────────────────────────────────────────────────────
router.post('/coopay/initiate', generalLimiter, protectOptional, async (req, res) => {
  try {
    const { referenceNumber, returnUrl, phone } = req.body;
    if (!referenceNumber) return res.status(400).json({ success: false, message: 'Reference number is required.' });

    const donation = await Donation.findOne({ referenceNumber }).populate('campaign', 'title');
    if (!donation) return res.status(404).json({ success: false, message: 'Donation not found.' });
    if (donation.paymentMethod !== 'coopay_amole') {
      return res.status(400).json({ success: false, message: 'This donation is not configured for Coopay.' });
    }

    const result = await initiateCoopayAmole({
      amount: donation.amount,
      reference: donation.referenceNumber,
      donorName: donation.isAnonymous ? 'Anonymous' : donation.fullName,
      returnUrl,
      phone: phone || donation.phone,
    });

    if (!result.ok || !result.checkoutUrl) {
      return res.status(503).json({
        success: false,
        message: 'Coopay is not configured on this platform yet. Please use the QR code or bank transfer instead.',
        checkoutUrl: '',
      });
    }

    donation.transactionId = result.txRef;
    await donation.save();

    await logAction({ user: req.user, action: 'payment_coopay_initiated', resource: 'donations', resourceId: donation._id, details: { referenceNumber: donation.referenceNumber, txRef: result.txRef }, req });

    res.json({ success: true, data: { checkoutUrl: result.checkoutUrl, txRef: result.txRef } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

router.get('/coopay/verify/:txRef', generalLimiter, async (req, res) => {
  try {
    const result = await verifyCoopayTransaction(req.params.txRef);
    if (!result.ok) return res.status(502).json({ success: false, message: result.error || 'Coopay verification failed.' });

    let donation = null;
    if (result.txRef) donation = await Donation.findOne({ transactionId: result.txRef }).populate('campaign', 'title');
    if (donation && result.paid) {
      donation.paymentStatus = 'completed';
      donation.paymentMethodName = donation.paymentMethodName || 'Coopay / Amole Online';
      await donation.save();
    }

    res.json({ success: true, data: { paid: result.paid, donation: donation ? { referenceNumber: donation.referenceNumber, paymentStatus: donation.paymentStatus } : null } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// Coopay webhook — auto-verifies a donation when Coopay confirms the payment.
router.post('/coopay/webhook', async (req, res) => {
  try {
    const txRef = req.body?.tx_ref || req.body?.data?.tx_ref || req.body?.reference;
    const paid = req.body?.status === 'success' || req.body?.data?.payment_status === 'success';
    if (!txRef) return res.status(400).json({ success: false, message: 'Missing tx_ref.' });

    const donation = await Donation.findOne({ transactionId: txRef });
    if (!donation) return res.status(404).json({ success: false, message: 'Donation not found.' });

    if (paid && donation.verificationStatus !== 'verified') {
      await markDonationPaid({ req: { app: undefined }, user: null }, donation, { via: 'coopay_webhook', skipIo: true });
    }

    res.json({ success: true, received: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
