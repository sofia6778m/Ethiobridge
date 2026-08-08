const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const Donation = require('../models/Donation');
const { DONATION_STATUSES, PAYMENT_METHODS } = require('../models/Donation');
const { notifyUser, notifyUsers } = require('../services/notificationService');
const { logAction } = require('../middleware/auditLog');
const { generateDonationRef } = require('../utils/donationReference');
const { buildDonationCSV, buildDonationPDF, fileStamp } = require('../utils/campaignExport');
const { buildCampaignScope, canManageCampaign, findApprovers } = require('./campaignController');

const getIo = (req) => req.app?.get('io') || null;

// Money (cash) methods a donor can select.
const CASH_METHODS = ['telebirr', 'chapa', 'cbe_birr', 'cash', 'bank_transfer'];

const isValidPhone = (phone) => /^\+?[0-9\s()-]{7,15}$/.test(String(phone || '').trim());

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());

const sanitizeMessage = (msg) => String(msg || '').trim().slice(0, 500);

const maskPhone = (phone) => {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits.length <= 4 ? digits : `${'*'.repeat(digits.length - 4)}${digits.slice(-4)}`;
};

// Notify the admin who owns the campaign (falling back to the scope approvers)
// about a new donation. Public donations have no actor, so everyone is told.
const notifyCampaignOwner = async (req, campaign, donation, anon) => {
  try {
    const io = getIo(req);
    const title = 'New donation received';
    const message = `${anon ? 'An anonymous donor' : donation.donorName} made a ${donation.type} donation to "${campaign.title}" (${donation.donationRef}).`;

    if (campaign.createdBy) {
      await notifyUser({
        userId: campaign.createdBy,
        title,
        message,
        type: 'donation_receipt',
        campaignId: campaign._id,
        io,
      });
      return;
    }

    const approvers = await findApprovers(campaign);
    if (approvers.length) {
      await notifyUsers({
        userIds: approvers.map((a) => a._id),
        title,
        message,
        type: 'donation_receipt',
        campaignId: campaign._id,
        io,
      });
    }
  } catch (err) {
    console.error('[Donation] Owner notify failed:', err.message);
  }
};

const createDonation = async (req, res) => {
  try {
    const { campaignId, type, amount, paymentMethod, donorName, donorPhone, donorEmail, message, isAnonymous, items, itemNotes } = req.body;

    if (!campaignId || !mongoose.isValidObjectId(campaignId)) {
      return res.status(400).json({ success: false, message: 'A valid campaign is required', field: 'campaignId' });
    }
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (campaign.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Donations are only accepted while the campaign is active' });
    }

    const donationType = type === 'in_kind' ? 'in_kind' : 'money';
    if (donationType === 'money') {
      const amt = Number(amount);
      if (!amt || amt <= 0) {
        return res.status(400).json({ success: false, message: 'A valid donation amount is required', field: 'amount' });
      }
      if (amt > 10000000) {
        return res.status(400).json({ success: false, message: 'Donation amount is too large', field: 'amount' });
      }
    } else {
      if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ success: false, message: 'Please list at least one item to pledge', field: 'items' });
      }
    }

    // Donation is open to guests and every role. Logged-in users can be
    // prefilled from their account; guests must supply name + phone unless
    // the donation is anonymous.
    const anon = isAnonymous === true || isAnonymous === 'true';
    const loggedIn = Boolean(req.user);
    const name = String(donorName || '').trim();
    const phone = String(donorPhone || '').trim();

    if (!anon) {
      if (!(name || (loggedIn && req.user.fullName))) {
        return res.status(400).json({ success: false, message: 'Full name is required', field: 'donorName' });
      }
      const effectivePhone = phone || (loggedIn ? req.user.phone : '');
      if (!effectivePhone || !isValidPhone(effectivePhone)) {
        return res.status(400).json({ success: false, message: 'A valid phone number is required', field: 'donorPhone' });
      }
    }

    const email = String(donorEmail || '').trim();
    if (email && !isValidEmail(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address', field: 'donorEmail' });
    }

    const method =
      donationType === 'in_kind'
        ? 'in_kind'
        : PAYMENT_METHODS.includes(paymentMethod) && paymentMethod !== 'in_kind'
          ? paymentMethod
          : 'telebirr';

    const donationRef = await generateDonationRef();

    const donation = await Donation.create({
      campaign: campaign._id,
      donationRef,
      donor: anon ? null : loggedIn ? req.user._id : null,
      donorName: anon ? 'Anonymous' : (name || (loggedIn ? req.user.fullName : '') || 'Anonymous').trim(),
      donorPhone: anon ? '' : (phone || (loggedIn ? req.user.phone : '') || '').trim(),
      donorEmail: anon ? '' : email,
      message: sanitizeMessage(message),
      isAnonymous: anon,
      type: donationType,
      amount: donationType === 'money' ? Number(amount) : undefined,
      paymentMethod: method,
      items:
        donationType === 'in_kind'
          ? items.map((it) => ({ name: String(it.name || '').trim(), quantity: Number(it.quantity) || 1 }))
          : [],
      itemNotes: String(itemNotes || ''),
      // Money donations are verified immediately so the campaign's raised
      // total reflects them right away. In-kind pledges stay pending until a
      // manager confirms the delivery.
      status: donationType === 'money' ? 'verified' : 'pending',
      verification:
        donationType === 'money'
          ? {
              verifiedByName: loggedIn ? req.user.fullName || 'Donor' : 'Public donation (auto-verified)',
              verifiedAt: new Date(),
              note: 'Auto-verified donation',
            }
          : undefined,
    });

    const io = getIo(req);

    // Money donations update the campaign's raised total immediately.
    if (donationType === 'money') {
      campaign.raisedAmount = (campaign.raisedAmount || 0) + donation.amount;
      campaign.auditHistory.push({
        action: 'donation_received',
        byName: donation.donorName,
        byRole: loggedIn ? req.user.role || 'donor' : 'public',
        at: new Date(),
        note: `Donation ${donationRef}`,
      });
      await campaign.save();
    }

    // Receipt notification goes only to the donor when they have an account;
    // guests get their receipt inline in the confirmation screen. The campaign
    // organizer / admins are always told about the new donation.
    if (loggedIn) {
      await notifyUser({
        userId: req.user._id,
        title: 'Donation received',
        message: `Thank you! Your ${donationType} donation to "${campaign.title}" was received. Reference: ${donationRef}.`,
        type: 'donation_receipt',
        campaignId: campaign._id,
        io,
      });
    }
    await notifyCampaignOwner(req, campaign, donation, anon);

    io?.to(campaign._id.toString()).emit('donation:new', { donation });
    io?.to(campaign._id.toString()).emit('campaign:updated', { campaign });
    await logAction({
      user: loggedIn ? req.user : { _id: null, fullName: donation.donorName, role: 'public' },
      action: 'donation_create',
      resource: 'donation',
      resourceId: donation._id,
      details: { donationRef, campaign: campaign.title, type: donationType },
      req,
    });

    res.status(201).json({
      success: true,
      message: `Thank you! Your donation is recorded. Reference: ${donationRef}.`,
      data: { donation },
    });
  } catch (err) {
    console.error('[Donation] Failed to create donation:', err.message);
    if (err.name === 'ValidationError') {
      const first = Object.values(err.errors || {})[0];
      return res.status(400).json({ success: false, message: first?.message || 'The donation data is invalid', field: first?.path });
    }
    res.status(500).json({ success: false, message: 'Failed to record donation' });
  }
};

// Public receipt lookup by tracking reference. The reference is high-entropy
// and acts as the proof of payment; the phone number is masked in the response.
const trackDonationByRef = async (req, res) => {
  try {
    const ref = String(req.params.donationRef || '').trim().toUpperCase();
    if (!ref) return res.status(400).json({ success: false, message: 'A donation reference is required' });

    const donation = await Donation.findOne({ donationRef: ref })
      .populate('campaign', 'title image status campaignLevel location')
      .lean();
    if (!donation) return res.status(404).json({ success: false, message: 'Donation not found' });

    await logAction({
      user: null,
      action: 'donation_track',
      resource: 'donation',
      resourceId: donation._id,
      details: { donationRef: donation.donationRef },
      req,
    });

    res.json({
      success: true,
      data: {
        donation: {
          _id: donation._id,
          donationRef: donation.donationRef,
          donorName: donation.donorName,
          donorPhone: maskPhone(donation.donorPhone),
          isAnonymous: donation.isAnonymous,
          type: donation.type,
          amount: donation.amount,
          paymentMethod: donation.paymentMethod,
          items: donation.items,
          status: donation.status,
          message: donation.message,
          createdAt: donation.createdAt,
          campaign: donation.campaign && {
            _id: donation.campaign._id,
            title: donation.campaign.title,
            image: donation.campaign.image,
            status: donation.campaign.status,
            campaignLevel: donation.campaign.campaignLevel,
            location: donation.campaign.location,
          },
        },
      },
    });
  } catch (err) {
    console.error('[Donation] Failed to track donation:', err.message);
    res.status(500).json({ success: false, message: 'Failed to look up donation' });
  }
};

const getMyDonations = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const skip = (page - 1) * limit;

    const query = { donor: req.user._id };
    if (req.query.status) query.status = req.query.status;

    const [donations, total] = await Promise.all([
      Donation.find(query)
        .populate('campaign', 'title image status campaignLevel location')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Donation.countDocuments(query),
    ]);

    res.json({ success: true, data: { donations, total, page, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[Donation] Failed to fetch my donations:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch donations' });
  }
};

const getDonation = async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id)
      .populate('campaign', 'title image status campaignLevel location')
      .populate('donor', 'fullName email phone')
      .lean();
    if (!donation) return res.status(404).json({ success: false, message: 'Donation not found' });

    const isOwner = donation.donor && String(donation.donor._id) === String(req.user._id);
    const isManager = donation.campaign && canManageCampaign(req.user, donation.campaign);
    if (!isOwner && !isManager) {
      return res.status(403).json({ success: false, message: 'You are not allowed to view this donation' });
    }

    res.json({ success: true, data: { donation } });
  } catch (err) {
    console.error('[Donation] Failed to fetch donation:', err.message);
    if (err.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid donation id' });
    res.status(500).json({ success: false, message: 'Failed to fetch donation' });
  }
};

const getCampaignDonations = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.campaignId);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (!canManageCampaign(req.user, campaign)) {
      return res.status(403).json({ success: false, message: 'You are not allowed to view donations for this campaign' });
    }

    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const skip = (page - 1) * limit;

    const query = { campaign: campaign._id };
    if (req.query.status && DONATION_STATUSES.includes(req.query.status)) query.status = req.query.status;

    const [donations, total] = await Promise.all([
      Donation.find(query)
        .populate('donor', 'fullName email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Donation.countDocuments(query),
    ]);

    res.json({ success: true, data: { donations, total, page, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[Donation] Failed to fetch campaign donations:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch donations' });
  }
};

// Role-scoped list of donations across every campaign the user manages, with
// an optional campaignId filter. This is the "Donations" tab for managers.
const getAllDonations = async (req, res) => {
  try {
    const scope = buildCampaignScope(req.user);
    const campaigns = await Campaign.find(scope).select('_id').lean();
    const campaignIds = campaigns.map((c) => c._id);

    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const skip = (page - 1) * limit;

    const query = campaignIds.length ? { campaign: { $in: campaignIds } } : { campaign: { $in: [] } };
    if (req.query.status && DONATION_STATUSES.includes(req.query.status)) query.status = req.query.status;
    if (req.query.type && ['money', 'in_kind'].includes(req.query.type)) query.type = req.query.type;
    if (req.query.campaignId && mongoose.isValidObjectId(req.query.campaignId)) query.campaign = req.query.campaignId;

    const [donations, total] = await Promise.all([
      Donation.find(query)
        .populate('campaign', 'title image status campaignLevel location')
        .populate('donor', 'fullName email phone')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Donation.countDocuments(query),
    ]);

    res.json({ success: true, data: { donations, total, page, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[Donation] Failed to fetch donations:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch donations' });
  }
};

// Set a donation to verified / failed / refunded. Verified money donations
// increment the campaign's raised total (once — only pending → verified); a
// verified in-kind pledge increments the in-kind pledge counter.
const verifyDonation = async (req, res) => {
  try {
    const { status, note } = req.body;
    if (!DONATION_STATUSES.includes(status) || status === 'pending') {
      return res.status(400).json({ success: false, message: 'Invalid donation status', field: 'status' });
    }

    const donation = await Donation.findById(req.params.id).populate('campaign');
    if (!donation) return res.status(404).json({ success: false, message: 'Donation not found' });
    if (!canManageCampaign(req.user, donation.campaign)) {
      return res.status(403).json({ success: false, message: 'You are not allowed to verify this donation' });
    }

    if (status === 'verified' && donation.status !== 'verified') {
      if (donation.type === 'money') {
        donation.campaign.raisedAmount = (donation.campaign.raisedAmount || 0) + donation.amount;
      } else {
        donation.campaign.inKindPledges = (donation.campaign.inKindPledges || 0) + 1;
      }
      await donation.campaign.save();

      const io = getIo(req);
      await notifyUser({
        userId: donation.donor,
        title: 'Donation verified',
        message: `Your ${donation.type} donation ${donation.donationRef} to "${donation.campaign.title}" was verified. Thank you for your support!`,
        type: 'donation_receipt',
        campaignId: donation.campaign._id,
        io,
      });
      io?.to(donation.campaign._id.toString()).emit('campaign:updated', { campaign: donation.campaign });
    }

    donation.status = status;
    donation.verification = {
      verifiedBy: req.user._id,
      verifiedByName: req.user.fullName || '',
      verifiedAt: new Date(),
      note: String(note || ''),
    };
    await donation.save();

    await logAction({
      user: req.user,
      action: 'donation_verify',
      resource: 'donation',
      resourceId: donation._id,
      details: { donationRef: donation.donationRef, status },
      req,
    });

    res.json({ success: true, message: `Donation marked as ${status}`, data: { donation } });
  } catch (err) {
    console.error('[Donation] Failed to verify donation:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update donation' });
  }
};

const getDonationStats = async (req, res) => {
  try {
    const scope = buildCampaignScope(req.user);
    const campaigns = await Campaign.find(scope).select('_id').lean();
    const campaignIds = campaigns.map((c) => c._id);

    if (!campaignIds.length) {
      return res.json({
        success: true,
        data: { total: 0, byStatus: {}, byMethod: {}, byType: {}, totalVerified: 0, pending: 0, inKindPledges: 0 },
      });
    }

    const match = { campaign: { $in: campaignIds } };
    const [statusCounts, methodCounts, typeCounts, verifiedAgg, total] = await Promise.all([
      Donation.aggregate([{ $match: match }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Donation.aggregate([{ $match: match }, { $group: { _id: '$paymentMethod', count: { $sum: 1 } } }]),
      Donation.aggregate([{ $match: match }, { $group: { _id: '$type', count: { $sum: 1 } } }]),
      Donation.aggregate([
        { $match: { ...match, status: 'verified', type: 'money' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Donation.countDocuments(match),
    ]);

    const byStatus = {};
    statusCounts.forEach((s) => { byStatus[s._id] = s.count; });
    const byMethod = {};
    methodCounts.forEach((m) => { byMethod[m._id] = m.count; });
    const byType = {};
    typeCounts.forEach((t) => { byType[t._id] = t.count; });

    res.json({
      success: true,
      data: {
        total,
        pending: byStatus.pending || 0,
        verified: byStatus.verified || 0,
        totalVerified: verifiedAgg[0]?.total || 0,
        inKindPledges: byType.in_kind || 0,
        byStatus,
        byMethod,
        byType,
      },
    });
  } catch (err) {
    console.error('[Donation] Failed to fetch donation stats:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch donation stats' });
  }
};

const exportDonations = async (req, res) => {
  try {
    const format = req.query.format === 'pdf' ? 'pdf' : 'csv';
    const scope = buildCampaignScope(req.user);
    const campaigns = await Campaign.find(scope).select('_id').lean();
    const campaignIds = campaigns.map((c) => c._id);

    const query = campaignIds.length ? { campaign: { $in: campaignIds } } : { campaign: null };
    if (req.query.status && DONATION_STATUSES.includes(req.query.status)) query.status = req.query.status;

    const donations = await Donation.find(query)
      .populate('campaign', 'title')
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="donations-${fileStamp()}.csv"`);
      return res.send(buildDonationCSV(donations));
    }
    return buildDonationPDF(donations, res);
  } catch (err) {
    console.error('[Donation] Export failed:', err.message);
    res.status(500).json({ success: false, message: 'Failed to export donations' });
  }
};

module.exports = {
  CASH_METHODS,
  createDonation,
  trackDonationByRef,
  getMyDonations,
  getDonation,
  getCampaignDonations,
  getAllDonations,
  verifyDonation,
  getDonationStats,
  exportDonations,
};
