const crypto = require('crypto');
const Donation = require('../models/Donation');
const Campaign = require('../models/Campaign');
const User = require('../models/User');
const Receipt = require('../models/Receipt');
const DonationPaymentMethod = require('../models/DonationPaymentMethod');
const DonationVerification = require('../models/DonationVerification');
const DonationNotification = require('../models/DonationNotification');
const createNotification = require('../utils/createNotification');
const { generateDonationReference } = require('../utils/donationReference');
const { sendEmail } = require('../services/emailService');
const { sendSms } = require('../services/smsService');
const { buildCertificate } = require('../utils/donationCertificates');
const { donationsToCsv, donationsToExcel, donationsToPdf } = require('../utils/donationExport');
const { cloudinary } = require('../config/cloudinary');
const { logAction } = require('../middleware/auditLog');
const {
  initiateChapa, initiateCoopayAmole,
} = require('../services/paymentProvider');

const getIo = (req) => req.app?.get('io') || null;

const normalizePhone = (phone) => String(phone || '').replace(/[\s\-().]/g, '');
const isValidPhone = (phone) => /^\+?[0-9]{9,15}$/.test(normalizePhone(phone));

const hashIp = (ip) => {
  try {
    return crypto.createHash('sha256').update(String(ip || '')).digest('hex').slice(0, 16);
  } catch {
    return '';
  }
};

// ── QR payload ────────────────────────────────────────────────────────────────
const buildQrPayload = (donation, method, campaign) => {
  const payload = {
    platform: 'EthioBridge',
    type: 'donation',
    reference: donation.referenceNumber,
    method: method?.code || donation.paymentMethod,
    methodName: method?.name || '',
    account: method?.accountNumber || '',
    accountHolder: method?.accountHolder || '',
    branch: method?.branch || '',
    amount: donation.amount,
    currency: donation.currency || 'ETB',
    campaign: String(campaign?._id || donation.campaign),
    campaignTitle: campaign?.title || '',
    id: String(donation._id),
  };
  if (method?.qrContent) payload.qrContent = method.qrContent;
  return payload;
};

// ── Notification dispatch ─────────────────────────────────────────────────────
// Every channel attempt is recorded in donation_notifications for traceability.
const dispatchDonationChannel = async ({ req, donation, event, channel, recipientUser, recipientContact, subject, message }) => {
  try {
    const record = await DonationNotification.create({
      donation: donation._id,
      event,
      channel,
      recipientUser: recipientUser || undefined,
      recipientContact: recipientContact || '',
      subject: subject || '',
      message: message || '',
      status: 'pending',
    });

    let result = null;
    if (channel === 'email' && recipientContact) {
      result = await sendEmail({ to: recipientContact, subject, text: message });
    } else if (channel === 'sms' && recipientContact) {
      result = await sendSms({ to: recipientContact, message });
    }

    if (!result) {
      record.status = 'skipped';
    } else if (result.ok) {
      record.status = 'sent';
      record.providerRef = result.messageId || `http:${result.status}`;
      record.sentAt = new Date();
    } else if (result.skipped) {
      record.status = 'skipped';
    } else {
      record.status = 'failed';
    }
    await record.save();
  } catch (err) {
    console.error('[DONATIONS] notification dispatch failed:', err.message);
  }
};

const notifyDonor = async (req, donation, event, { title, message, type }) => {
  const io = getIo(req);
  if (donation.donor) {
    await createNotification({ recipient: donation.donor, title, message, type, relatedReport: donation._id, relatedReportType: 'donation', io });
    await dispatchDonationChannel({ req, donation, event, channel: 'in_app', recipientUser: donation.donor, recipientContact: '', subject: title, message });
  }
  if (donation.email) {
    await dispatchDonationChannel({ req, donation, event, channel: 'email', recipientContact: donation.email, subject: title, message });
  }
  if (donation.phone) {
    await dispatchDonationChannel({ req, donation, event, channel: 'sms', recipientContact: donation.phone, subject: title, message });
  }
};

const notifyAdmins = async (req, donation, event, { title, message, type }) => {
  const io = getIo(req);
  const admins = await User.find({ role: { $in: ['admin', 'ADMIN'] } }).select('_id').lean();
  for (const admin of admins) {
    await createNotification({ recipient: admin._id, title, message, type, relatedReport: donation._id, relatedReportType: 'donation', io });
    await dispatchDonationChannel({ req, donation, event, channel: 'in_app', recipientUser: admin._id, recipientContact: '', subject: title, message });
  }
};

// ── Public ────────────────────────────────────────────────────────────────────

exports.getPublicOverview = async (req, res) => {
  try {
    const [raised] = await Donation.aggregate([
      { $match: { verificationStatus: 'verified' } },
      { $group: { _id: null, totalRaised: { $sum: '$amount' }, totalDonations: { $sum: 1 }, totalDonors: { $sum: { $cond: [{ $eq: ['$isAnonymous', false] }, 1, 0] } } } },
    ]);

    const byMethod = await Donation.aggregate([
      { $match: { verificationStatus: 'verified' } },
      { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);

    const bySubcity = await Donation.aggregate([
      { $match: { verificationStatus: 'verified' } },
      { $group: { _id: '$subcity', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $match: { _id: { $ne: '' } } },
      { $sort: { total: -1 } },
    ]);

    const byWoreda = await Donation.aggregate([
      { $match: { verificationStatus: 'verified' } },
      { $group: { _id: '$woreda', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $match: { _id: { $ne: '' } } },
      { $sort: { total: -1 } },
    ]);

    const recentVerified = await Donation.find({ verificationStatus: 'verified' })
      .populate('campaign', 'title image campaignType')
      .sort({ verifiedAt: -1 })
      .limit(8)
      .lean();

    const campaigns = await Campaign.find({ status: 'active' })
      .sort({ isFeatured: -1, createdAt: -1 })
      .limit(9)
      .lean();

    const emergencyCampaigns = await Campaign.find({ status: 'active', campaignType: 'emergency' })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();

    const successStories = await Campaign.find({
      status: 'completed',
      'successStories.0': { $exists: true },
    }).select('title successStories image campaignType').sort({ updatedAt: -1 }).limit(6).lean();

    res.json({
      success: true,
      data: {
        stats: {
          totalRaised: raised?.totalRaised || 0,
          totalDonations: raised?.totalDonations || 0,
          totalDonors: raised?.totalDonors || 0,
          byMethod: byMethod.map((m) => ({ method: m._id, total: m.total, count: m.count })),
          bySubcity: bySubcity.map((m) => ({ name: m._id || 'General', total: m.total, count: m.count })),
          byWoreda: byWoreda.map((m) => ({ name: m._id || 'General', total: m.total, count: m.count })),
        },
        recentVerified: recentVerified.map((d) => ({
          _id: d._id,
          referenceNumber: d.referenceNumber,
          amount: d.amount,
          currency: d.currency,
          isAnonymous: d.isAnonymous,
          donorName: d.isAnonymous ? 'Anonymous' : (d.fullName || d.donorName || 'Donor'),
          campaign: d.campaign,
          verifiedAt: d.verifiedAt,
        })),
        campaigns,
        emergencyCampaigns,
        successStories: successStories.flatMap((c) =>
          (c.successStories || []).map((s) => ({
            ...s,
            campaignTitle: c.title,
            campaignImage: c.image,
            campaignType: c.campaignType,
          }))
        ),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPaymentMethods = async (req, res) => {
  try {
    const methods = await DonationPaymentMethod.find({ isActive: true }).sort({ sortOrder: 1 }).lean();
    res.json({ success: true, data: methods });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Create donation (public; optional auth) ───────────────────────────────────
exports.createDonation = async (req, res) => {
  try {
    const {
      campaign: campaignId, amount, fullName, phone, email, isAnonymous, message,
      paymentMethod, recurringMonthly, purposeLabel,
      donationType, inKind,
    } = req.body;

    const isInKind = donationType === 'in_kind';

    // Validation
    if (!campaignId || !fullName || !phone) {
      return res.status(400).json({ success: false, message: 'Full name, phone number and campaign are required.' });
    }
    if (isInKind) {
      if (!inKind?.itemName) {
        return res.status(400).json({ success: false, message: 'Please describe the item or service you are donating.' });
      }
    } else {
      const parsedAmount = Number(amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount < 10) {
        return res.status(400).json({ success: false, message: 'Please enter a valid donation amount (minimum 10 ETB).' });
      }
      if (parsedAmount > 10000000) {
        return res.status(400).json({ success: false, message: 'Amount exceeds the allowed limit.' });
      }
    }
    if (!isValidPhone(phone)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid phone number (e.g. +251911000000).' });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found.' });
    if (campaign.status !== 'active') return res.status(400).json({ success: false, message: 'This campaign is not currently accepting donations.' });
    if (new Date() > new Date(campaign.endDate)) return res.status(400).json({ success: false, message: 'This campaign has ended.' });

    let method = null;
    if (!isInKind) {
      method = await DonationPaymentMethod.findOne({ code: paymentMethod, isActive: true }).lean();
      if (!method) return res.status(400).json({ success: false, message: 'Please select a valid payment method.' });
    }

    // Duplicate submission prevention (same phone + campaign + amount within 5 min)
    const normalizedPhone = normalizePhone(phone);
    const duplicateQuery = {
      phone: { $regex: new RegExp(normalizedPhone.replace(/^\+/, '\\+?').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') },
      campaign: campaignId,
      verificationStatus: 'pending_verification',
      createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) },
    };
    if (isInKind) duplicateQuery.donationType = 'in_kind';
    else duplicateQuery.amount = Number(amount);
    const duplicate = await Donation.findOne(duplicateQuery).lean();

    if (duplicate) {
      return res.status(409).json({ success: false, message: 'A donation with these details was already submitted. Please wait for verification or contact support.' });
    }

    const referenceNumber = await generateDonationReference();
    const sanitizedName = String(fullName).trim().slice(0, 120);
    const sanitizedMessage = String(message || '').slice(0, 1000);

    // In-kind: the schema requires a numeric amount — store the estimated value
    // (min 1) on `amount` and keep the real value in `inKind.estimatedValue`.
    const estimatedValue = Math.max(0, Number(inKind?.estimatedValue) || 0);
    const storedAmount = isInKind ? (estimatedValue > 0 ? estimatedValue : 1) : Number(amount);

    const donation = await Donation.create({
      campaign: campaignId,
      purposeLabel: typeof purposeLabel === 'string' ? purposeLabel.slice(0, 200) : '',
      donationType: isInKind ? 'in_kind' : 'cash',
      inKind: isInKind ? {
        itemName: String(inKind.itemName).trim().slice(0, 200),
        description: String(inKind.description || '').slice(0, 2000),
        quantity: Math.max(1, Number(inKind.quantity) || 1),
        unit: String(inKind.unit || '').trim().slice(0, 50),
        estimatedValue,
        condition: String(inKind.condition || 'new').slice(0, 50),
        photos: Array.isArray(inKind.photos) ? inKind.photos.filter((p) => p && p.url).map((p) => ({ url: p.url, publicId: p.publicId || '' })) : [],
      } : undefined,
      // Denormalize the local-government office scope from the campaign so
      // donations are tracked per subcity / woreda / department.
      subcity: campaign.subcity || '',
      subcityId: campaign.subcityId || undefined,
      woreda: campaign.woreda || '',
      woredaId: campaign.woredaId || undefined,
      department: campaign.department || '',
      donor: req.user?._id || undefined,
      fullName: sanitizedName,
      donorName: sanitizedName,
      phone: normalizedPhone,
      email: email ? String(email).toLowerCase().trim().slice(0, 120) : '',
      donorEmail: email ? String(email).toLowerCase().trim().slice(0, 120) : '',
      amount: storedAmount,
      isAnonymous: Boolean(isAnonymous),
      message: sanitizedMessage,
      paymentMethod: isInKind ? 'in_kind' : method.code,
      paymentMethodName: isInKind ? 'In-Kind Donation' : method.name,
      paymentMethodAccount: isInKind ? '' : method.accountNumber,
      recurringMonthly: isInKind ? false : Boolean(recurringMonthly),
      referenceNumber,
      verificationStatus: 'pending_verification',
      paymentStatus: isInKind ? 'completed' : 'pending',
      source: 'web',
      ipHash: hashIp(req.ip),
      verificationHistory: [{ action: 'submitted', reason: isInKind ? 'In-kind goods/services registration' : '' }],
    });

    let checkoutUrl = '';
    if (!isInKind && method && (method.code === 'chapa_payment' || method.code === 'coopay_amole')) {
      // Online aggregator channels: attempt to open the provider checkout.
      const init = method.code === 'chapa_payment'
        ? await initiateChapa({
            amount: storedAmount,
            reference: referenceNumber,
            donorName: sanitizedName,
            donorEmail: donation.email,
            customFields: { campaign_title: campaign.title },
          })
        : await initiateCoopayAmole({
            amount: storedAmount,
            reference: referenceNumber,
            donorName: sanitizedName,
            phone: normalizedPhone,
          });
      if (init.ok && init.checkoutUrl) {
        checkoutUrl = init.checkoutUrl;
        donation.transactionId = init.txRef;
      }
    }

    const payload = buildQrPayload(donation, method || { code: 'in_kind', name: 'In-Kind Donation' }, campaign);
    donation.qrPayload = JSON.stringify(payload);
    await donation.save();

    await logAction({ user: req.user, action: 'donation_created', resource: 'donations', resourceId: donation._id, details: { referenceNumber: donation.referenceNumber, amount: donation.amount, donationType: donation.donationType, campaign: campaign.title, subcity: donation.subcity, woreda: donation.woreda }, req });

    // Notify admins (in-app + hooks)
    await notifyAdmins(req, donation, 'donation_received', {
      title: isInKind ? 'New In-Kind Donation Received' : 'New Donation Received',
      message: isInKind
        ? `${sanitizedName} registered ${inKind.quantity || 1} ${inKind.unit || 'item(s)'} of "${inKind.itemName}" for "${campaign.title}" (${referenceNumber}) — pending verification.`
        : `${sanitizedName} donated ${storedAmount.toLocaleString()} ETB to "${campaign.title}" (${referenceNumber}) — pending verification.`,
      type: 'donation_received',
    });

    // Notify donor
    await notifyDonor(req, donation, 'donation_received', {
      title: isInKind ? 'In-Kind Donation Received — Awaiting Verification' : 'Donation Received — Awaiting Verification',
      message: isInKind
        ? `Thank you! Your in-kind donation of "${inKind.itemName}" to "${campaign.title}" was received. Your reference number is ${referenceNumber}. We will notify you once it is verified.`
        : `Thank you! Your donation of ${storedAmount.toLocaleString()} ETB to "${campaign.title}" was received. Your reference number is ${referenceNumber}. We will notify you once it is verified.`,
      type: 'donation_received',
    });

    res.status(201).json({
      success: true,
      data: {
        donation: {
          _id: donation._id,
          referenceNumber: donation.referenceNumber,
          amount: donation.amount,
          donationType: donation.donationType,
          inKind: donation.inKind || undefined,
          currency: donation.currency,
          fullName: donation.isAnonymous ? 'Anonymous' : donation.fullName,
          verificationStatus: donation.verificationStatus,
          paymentMethod: donation.paymentMethod,
          paymentMethodName: donation.paymentMethodName,
          campaign: campaign.title,
          createdAt: donation.createdAt,
        },
        qr: method ? { payload, method: { code: method.code, name: method.name, nameAmharic: method.nameAmharic, accountNumber: method.accountNumber, accountHolder: method.accountHolder, branch: method.branch, instructions: method.instructions } } : null,
        checkoutUrl,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Upload proof-of-payment receipt image ─────────────────────────────────────
exports.uploadReceipt = async (req, res) => {
  try {
    const donation = await Donation.findOne({ referenceNumber: req.params.referenceNumber });
    if (!donation) return res.status(404).json({ success: false, message: 'Donation not found.' });

    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Please attach a receipt image (JPG or PNG, max 5 MB).' });
    }
    if (!['image/jpeg', 'image/png'].includes(req.file.mimetype)) {
      return res.status(400).json({ success: false, message: 'Only JPG and PNG receipt images are allowed.' });
    }

    donation.receiptImageUrl = req.file.path || req.file.secure_url || '';
    donation.receiptPublicId = req.file.public_id || '';
    donation.receiptSubmittedAt = new Date();
    donation.verificationHistory.push({ action: 'receipt_uploaded', reason: 'Payment receipt uploaded by donor' });
    await donation.save();

    await notifyAdmins(req, donation, 'receipt_uploaded', {
      title: 'Payment Receipt Uploaded',
      message: `Donation ${donation.referenceNumber} (${donation.amount.toLocaleString()} ETB) now has a receipt image ready for verification.`,
      type: 'donation_update',
    });

    res.json({ success: true, data: { referenceNumber: donation.referenceNumber, verificationStatus: donation.verificationStatus, receiptImageUrl: donation.receiptImageUrl } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Public tracking by reference ──────────────────────────────────────────────
exports.trackDonation = async (req, res) => {
  try {
    const donation = await Donation.findOne({ referenceNumber: req.params.referenceNumber })
      .populate('campaign', 'title image campaignType')
      .lean();
    if (!donation) return res.status(404).json({ success: false, message: 'Donation reference not found.' });

    res.json({
      success: true,
      data: {
        referenceNumber: donation.referenceNumber,
        amount: donation.amount,
        currency: donation.currency,
        campaign: donation.campaign,
        isAnonymous: donation.isAnonymous,
        paymentMethod: donation.paymentMethodName || donation.paymentMethod,
        verificationStatus: donation.verificationStatus,
        paymentStatus: donation.paymentStatus,
        rejectionReason: donation.rejectionReason,
        receiptSubmitted: Boolean(donation.receiptImageUrl),
        createdAt: donation.createdAt,
        verifiedAt: donation.verifiedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Donor dashboard ───────────────────────────────────────────────────────────
exports.getMyDonations = async (req, res) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    const query = { donor: req.user._id };
    // Also surface guest donations made with the same phone number so citizens
    // who donated before registering can see their full history.
    if (req.user.phone) {
      const normalized = normalizePhone(req.user.phone);
      query.$or = [
        { donor: req.user._id },
        { donor: { $exists: false }, phone: { $regex: new RegExp(normalized.replace(/^\+/, '\\+?').replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i') } },
      ];
    }

    const total = await Donation.countDocuments(query);
    const donations = await Donation.find(query)
      .populate('campaign', 'title image campaignType')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, data: donations, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyDonationSummary = async (req, res) => {
  try {
    const [stats] = await Donation.aggregate([
      { $match: { donor: req.user._id } },
      {
        $group: {
          _id: null,
          totalCommitted: { $sum: '$amount' },
          totalVerified: { $sum: { $cond: [{ $eq: ['$verificationStatus', 'verified'] }, '$amount', 0] } },
          count: { $sum: 1 },
          verifiedCount: { $sum: { $cond: [{ $eq: ['$verificationStatus', 'verified'] }, 1, 0] } },
          pendingCount: { $sum: { $cond: [{ $eq: ['$verificationStatus', 'pending_verification'] }, 1, 0] } },
          rejectedCount: { $sum: { $cond: [{ $eq: ['$verificationStatus', 'rejected'] }, 1, 0] } },
        },
      },
    ]);
    res.json({
      success: true,
      data: stats || { totalCommitted: 0, totalVerified: 0, count: 0, verifiedCount: 0, pendingCount: 0, rejectedCount: 0 },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Certificate PDF ───────────────────────────────────────────────────────────
exports.getCertificate = async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id).populate('campaign', 'title');
    if (!donation) return res.status(404).json({ success: false, message: 'Donation not found.' });
    if (donation.verificationStatus !== 'verified') {
      return res.status(400).json({ success: false, message: 'Certificates are only available for verified donations.' });
    }

    const isAdmin = ['admin', 'ADMIN'].includes(req.user?.role);
    const isOwner = donation.donor && String(donation.donor) === String(req.user?._id);
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'You are not authorized to download this certificate.' });
    }

    const pdf = await buildCertificate({ donation, campaign: donation.campaign });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="EthioBridge-Certificate-${donation.referenceNumber || donation._id}.pdf"`);
    res.send(pdf);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Admin: list / detail ──────────────────────────────────────────────────────
const buildAdminQuery = (q) => {
  const query = {};
  if (q.status && ['pending_verification', 'verified', 'rejected'].includes(q.status)) query.verificationStatus = q.status;
  if (q.paymentMethod) query.paymentMethod = q.paymentMethod;
  if (q.campaign) query.campaign = q.campaign;
  if (q.donationType && ['cash', 'in_kind'].includes(q.donationType)) query.donationType = q.donationType;

  if (q.from || q.to) {
    query.createdAt = {};
    if (q.from) query.createdAt.$gte = new Date(q.from);
    if (q.to) query.createdAt.$lte = new Date(q.to);
  }

  const min = Number(q.minAmount);
  const max = Number(q.maxAmount);
  if (Number.isFinite(min)) query.amount = { ...(query.amount || {}), $gte: min };
  if (Number.isFinite(max)) query.amount = { ...(query.amount || {}), $lte: max };

  if (q.search) {
    const term = String(q.search).trim();
    const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const searchRegex = new RegExp(safeTerm, 'i');
    query.$or = [
      { referenceNumber: searchRegex },
      { fullName: searchRegex },
      { donorName: searchRegex },
      { phone: searchRegex },
      { email: searchRegex },
      { paymentMethodName: searchRegex },
    ];
  }
  return query;
};

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  amount_desc: { amount: -1 },
  amount_asc: { amount: 1 },
};

exports.getDonations = async (req, res) => {
  try {
    const { page = 1, limit = 25 } = req.query;
    const query = buildAdminQuery(req.query);
    const sort = SORTS[req.query.sort] || SORTS.newest;

    const total = await Donation.countDocuments(query);
    const donations = await Donation.find(query)
      .populate('campaign', 'title image campaignType')
      .populate('donor', 'fullName email phone')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, data: donations, total, page: parseInt(page), pages: Math.ceil(total / limit), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getDonation = async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id)
      .populate('campaign', 'title image campaignType goalAmount raisedAmount')
      .populate('donor', 'fullName email phone profileImage')
      .populate('verifiedBy', 'fullName email');
    if (!donation) return res.status(404).json({ success: false, message: 'Donation not found.' });
    res.json({ success: true, data: donation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getDonationStats = async (req, res) => {
  try {
    const [verified] = await Donation.aggregate([
      { $match: { verificationStatus: 'verified' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const [committed] = await Donation.aggregate([
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);

    const pendingCount = await Donation.countDocuments({ verificationStatus: 'pending_verification' });
    const rejectedCount = await Donation.countDocuments({ verificationStatus: 'rejected' });
    const verifiedCount = verified?.count || 0;

    const byMethod = await Donation.aggregate([
      { $match: { verificationStatus: 'verified' } },
      { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);

    const byCampaign = await Donation.aggregate([
      { $match: { verificationStatus: 'verified' } },
      {
        $lookup: { from: 'campaigns', localField: 'campaign', foreignField: '_id', as: 'campaign' },
      },
      { $unwind: { path: '$campaign', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$campaign._id',
          title: { $first: '$campaign.title' },
          campaignType: { $first: '$campaign.campaignType' },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);

    const bySubcity = await Donation.aggregate([
      { $match: { verificationStatus: 'verified' } },
      { $group: { _id: '$subcity', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $match: { _id: { $ne: '' } } },
      { $sort: { total: -1 } },
    ]);

    const byWoreda = await Donation.aggregate([
      { $match: { verificationStatus: 'verified' } },
      { $group: { _id: '$woreda', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $match: { _id: { $ne: '' } } },
      { $sort: { total: -1 } },
    ]);

    const byDepartment = await Donation.aggregate([
      { $match: { verificationStatus: 'verified' } },
      { $group: { _id: '$department', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $match: { _id: { $ne: '' } } },
      { $sort: { total: -1 } },
    ]);

    const monthly = await Donation.aggregate([
      { $match: { verificationStatus: 'verified' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$verifiedAt' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 12 },
    ]);

    const donors = await Donation.distinct('donor', { verificationStatus: 'verified', donor: { $ne: null } });
    const anonymousVerified = await Donation.countDocuments({ verificationStatus: 'verified', isAnonymous: true });

    const inKind = await Donation.aggregate([
      { $match: { verificationStatus: 'verified', donationType: 'in_kind' } },
      { $group: { _id: null, total: { $sum: '$inKind.estimatedValue' }, count: { $sum: 1 } } },
    ]);
    const byItem = await Donation.aggregate([
      { $match: { verificationStatus: 'verified', donationType: 'in_kind' } },
      { $group: { _id: '$inKind.itemName', quantity: { $sum: '$inKind.quantity' }, count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 20 },
    ]);

    res.json({
      success: true,
      data: {
        totalVerified: verified?.total || 0,
        verifiedCount,
        totalCommitted: committed?.total || 0,
        totalDonations: committed?.count || 0,
        pendingCount,
        rejectedCount,
        donorCount: donors.length + anonymousVerified,
        inKindValue: inKind[0]?.total || 0,
        inKindDonations: inKind[0]?.count || 0,
        byItem,
        byMethod,
        byCampaign,
        bySubcity,
        byWoreda,
        byDepartment,
        monthly,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Admin: verify / reject ────────────────────────────────────────────────────
/**
 * Mark a donation as verified/paid. Shared by the admin verify flow and the
 * online payment (Chapa/Coopay) verification webhooks so behaviour stays
 * identical regardless of how the money was confirmed.
 *
 * @param {string} donationId
 * @param {object} opts
 * @param {object} [opts.req]   Express request (for audit log / io). Optional.
 * @param {object} [opts.by]    User that verified it (admin). Optional for webhooks.
 * @param {string} [opts.byLabel] e.g. "Chapa webhook", "Coopay webhook".
 * @param {string} [opts.reason]
 * @returns {Promise<object>} The updated donation document.
 */
const markDonationPaid = async (donationId, { req = null, by = null, byLabel = '', reason = 'Payment confirmed' } = {}) => {
  const donation = await Donation.findById(donationId).populate('campaign', 'title');
  if (!donation) throw Object.assign(new Error('Donation not found.'), { statusCode: 404 });
  if (donation.verificationStatus === 'verified') return donation;
  if (donation.verificationStatus === 'rejected') {
    throw Object.assign(new Error('Rejected donations cannot be verified. Create a new donation instead.'), { statusCode: 400 });
  }

  donation.verificationStatus = 'verified';
  donation.paymentStatus = 'completed';
  donation.verifiedBy = by?._id || undefined;
  donation.verifiedAt = new Date();
  donation.rejectionReason = '';
  donation.verificationHistory.push({ action: 'verified', admin: by?._id || undefined, reason: by ? `${reason} (by ${by.name || byLabel || 'admin'})` : `${reason} (${byLabel || 'auto-verification'})` });
  await donation.save();

  // Audit record
  if (by) {
    await DonationVerification.create({
      donation: donation._id,
      action: 'verified',
      admin: by._id,
      previousStatus: 'pending_verification',
    });
  }
  await logAction({ user: by, action: 'donation_verified', resource: 'donations', resourceId: donation._id, details: { referenceNumber: donation.referenceNumber, amount: donation.amount, method: byLabel || 'manual' }, req });

  // Roll up to the campaign totals (verified funds only).
  const campaign = donation.campaign || (await Campaign.findById(donation.campaign));
  if (campaign && campaign._id) {
    campaign.raisedAmount = (campaign.raisedAmount || 0) + donation.amount;
    campaign.donors = (campaign.donors || 0) + 1;
    await campaign.save();
  }

  // Issued receipt (reuses the existing Receipt collection).
  let receipt = await Receipt.findOne({ donation: donation._id });
  if (!receipt) {
    receipt = await Receipt.create({
      receiptNumber: donation.receiptNumber,
      donation: donation._id,
      campaign: donation.campaign,
      donor: donation.donor || undefined,
      donorName: donation.isAnonymous ? 'Anonymous' : donation.fullName,
      donorEmail: donation.email || '',
      amount: donation.amount,
      currency: donation.currency,
      paymentMethod: donation.paymentMethod,
      campaignTitle: campaign?.title || 'EthioBridge Donation',
      transactionId: donation.transactionId,
      isAnonymous: donation.isAnonymous,
      message: donation.message,
    });
  }
  donation.certificatePdfUrl = `/api/donations/${donation._id}/certificate`;
  await donation.save();

  await notifyDonor(req, donation, 'donation_verified', {
    title: byLabel ? 'Donation Verified ✅' : 'Donation Verified ✅',
    message: `Great news! Your donation of ${donation.amount.toLocaleString()} ETB to "${campaign?.title || 'EthioBridge'}" has been verified. Reference: ${donation.referenceNumber}. Your certificate is now available.`,
    type: 'donation_verified',
  });

  return donation;
};

exports.verifyDonation = async (req, res) => {
  try {
    const donation = await markDonationPaid(req.params.id, { req, by: req.user, reason: 'Payment confirmed by admin' });
    res.json({ success: true, data: donation });
  } catch (error) {
    res.status(error.statusCode || 500).json({ success: false, message: error.message });
  }
};

exports.rejectDonation = async (req, res) => {
  try {
    const donation = await Donation.findById(req.params.id).populate('campaign', 'title');
    if (!donation) return res.status(404).json({ success: false, message: 'Donation not found.' });
    if (donation.verificationStatus === 'verified') {
      return res.status(400).json({ success: false, message: 'Verified donations cannot be rejected.' });
    }

    const reason = String(req.body.reason || '').trim().slice(0, 500);
    if (!reason) {
      return res.status(400).json({ success: false, message: 'A rejection reason is required.' });
    }

    donation.verificationStatus = 'rejected';
    donation.paymentStatus = 'failed';
    donation.rejectionReason = reason;
    donation.verifiedBy = req.user._id;
    donation.verifiedAt = new Date();
    donation.verificationHistory.push({ action: 'rejected', admin: req.user._id, reason });
    await donation.save();

    await DonationVerification.create({
      donation: donation._id,
      action: 'rejected',
      admin: req.user._id,
      reason,
      previousStatus: donation.paymentStatus === 'pending' ? 'pending_verification' : donation.verificationStatus,
    });
    await logAction({ user: req.user, action: 'donation_rejected', resource: 'donations', resourceId: donation._id, details: { referenceNumber: donation.referenceNumber, reason }, req });

    await notifyDonor(req, donation, 'donation_rejected', {
      title: 'Donation Not Verified',
      message: `We could not verify your donation of ${donation.amount.toLocaleString()} ETB to "${campaign?.title || 'EthioBridge'}" (${donation.referenceNumber}). Reason: ${reason}. If you believe this is a mistake, please contact us.`,
      type: 'donation_rejected',
    });

    res.json({ success: true, data: donation });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Admin: exports ────────────────────────────────────────────────────────────
exports.exportDonationsCsv = async (req, res) => {
  try {
    const query = buildAdminQuery(req.query);
    const donations = await Donation.find(query)
      .populate('campaign', 'title')
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean();
    const csv = donationsToCsv(donations);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ethiobridge-donations-${new Date().toISOString().slice(0, 10)}.csv"`);
    res.send('\ufeff' + csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.exportDonationsExcel = async (req, res) => {
  try {
    const query = buildAdminQuery(req.query);
    const donations = await Donation.find(query)
      .populate('campaign', 'title')
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean();
    const xml = donationsToExcel(donations);
    res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ethiobridge-donations-${new Date().toISOString().slice(0, 10)}.xls"`);
    res.send('\ufeff' + xml);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Office (Subcity / Woreda) dashboards ──────────────────────────────────────
// Subcity and Woreda admins see donations collected for their own office. The
// donations store a denormalized subcity / woreda scope (copied from the
// campaign at submission), so filtering is a simple string match. When the
// admin document is missing a scope string, fall back to the campaigns the
// admin created.
const SUB_CITY_LABELS = { subcity_bole: 'Bole', subcity_yeka: 'Yeka', subcity_lemmi_kura: 'Lemmi Kura' };

const buildOfficeDonationQuery = async (req) => {
  const user = req.user;
  if (!user) return { campaign: { $in: [] } };
  const q = {};
  const subcityRoles = ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'SUBCITY_HEAD'];
  const woredaRoles = ['woreda', 'WOREDA_HEAD'];

  let scope = null;
  if (subcityRoles.includes(user.role)) {
    scope = { subcity: user.subcity || SUB_CITY_LABELS[user.role] || '' };
  } else if (woredaRoles.includes(user.role)) {
    scope = { woreda: user.woredaName || user.woreda || '' };
  } else {
    return q;
  }

  const key = Object.keys(scope)[0];
  if (scope[key]) {
    q[key] = scope[key];
  } else {
    const campaigns = await Campaign.find({ createdBy: user._id }).select('_id').lean();
    q.campaign = { $in: campaigns.map((c) => c._id) };
  }
  return q;
};

exports.getOfficeDonations = async (req, res) => {
  try {
    const { page = 1, limit = 25 } = req.query;
    const query = await buildOfficeDonationQuery(req);
    Object.assign(query, buildAdminQuery(req.query));
    const sort = SORTS[req.query.sort] || SORTS.newest;

    const total = await Donation.countDocuments(query);
    const donations = await Donation.find(query)
      .populate('campaign', 'title image campaignType department urgencyLevel')
      .populate('donor', 'fullName email phone')
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, data: donations, total, page: parseInt(page), pages: Math.ceil(total / limit), limit: parseInt(limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getOfficeDonationStats = async (req, res) => {
  try {
    const query = await buildOfficeDonationQuery(req);

    const [verified] = await Donation.aggregate([
      { $match: { ...query, verificationStatus: 'verified' } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const [committed] = await Donation.aggregate([
      { $match: query },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const pendingCount = await Donation.countDocuments({ ...query, verificationStatus: 'pending_verification' });
    const rejectedCount = await Donation.countDocuments({ ...query, verificationStatus: 'rejected' });

    const [campaignStats] = await Campaign.aggregate([
      { $match: { createdBy: req.user._id } },
      {
        $group: {
          _id: null,
          totalCampaigns: { $sum: 1 },
          activeCampaigns: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          pendingCampaigns: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          completedCampaigns: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          totalGoal: { $sum: '$goalAmount' },
        },
      },
    ]);

    const donors = await Donation.distinct('donor', { ...query, verificationStatus: 'verified', donor: { $ne: null } });
    const anonymousVerified = await Donation.countDocuments({ ...query, verificationStatus: 'verified', isAnonymous: true });

    const performance = await Donation.aggregate([
      { $match: { ...query, verificationStatus: 'verified' } },
      { $lookup: { from: 'campaigns', localField: 'campaign', foreignField: '_id', as: 'camp' } },
      { $unwind: { path: '$camp', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$camp._id',
          title: { $first: '$camp.title' },
          department: { $first: '$camp.department' },
          goalAmount: { $first: '$camp.goalAmount' },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { total: -1 } },
    ]);

    res.json({
      success: true,
      data: {
        totalRaised: verified?.total || 0,
        verifiedCount: verified?.count || 0,
        totalCommitted: committed?.total || 0,
        totalDonations: committed?.count || 0,
        pendingCount,
        rejectedCount,
        donorCount: donors.length + anonymousVerified,
        totalCampaigns: campaignStats?.totalCampaigns || 0,
        activeCampaigns: campaignStats?.activeCampaigns || 0,
        pendingCampaigns: campaignStats?.pendingCampaigns || 0,
        completedCampaigns: campaignStats?.completedCampaigns || 0,
        totalGoal: campaignStats?.totalGoal || 0,
        performance,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getOfficeExport = async (req, res) => {
  try {
    const query = await buildOfficeDonationQuery(req);
    Object.assign(query, buildAdminQuery(req.query));
    const donations = await Donation.find(query)
      .populate('campaign', 'title')
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean();
    const format = req.query.format || 'csv';
    const date = new Date().toISOString().slice(0, 10);

    if (format === 'excel') {
      const xml = donationsToExcel(donations);
      res.setHeader('Content-Type', 'application/vnd.ms-excel; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="ethiobridge-office-donations-${date}.xls"`);
      return res.send('\ufeff' + xml);
    }
    if (format === 'pdf') {
      const pdf = await donationsToPdf(donations, { title: 'Local Government Office Donation Report' });
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename="ethiobridge-office-donations-${date}.pdf"`);
      return res.send(pdf);
    }
    const csv = donationsToCsv(donations);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="ethiobridge-office-donations-${date}.csv"`);
    res.send('\ufeff' + csv);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Admin: PDF export ─────────────────────────────────────────────────────────
exports.exportDonationsPdf = async (req, res) => {
  try {
    const query = buildAdminQuery(req.query);
    const donations = await Donation.find(query)
      .populate('campaign', 'title')
      .sort({ createdAt: -1 })
      .limit(10000)
      .lean();
    const pdf = await donationsToPdf(donations, { title: 'EthioBridge Donation Report' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="ethiobridge-donations-${new Date().toISOString().slice(0, 10)}.pdf"`);
    res.send(pdf);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Admin: payment method management ──────────────────────────────────────────
exports.getAdminPaymentMethods = async (req, res) => {
  try {
    const methods = await DonationPaymentMethod.find({}).sort({ sortOrder: 1 });
    res.json({ success: true, data: methods });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createPaymentMethod = async (req, res) => {
  try {
    const method = await DonationPaymentMethod.create(req.body);
    res.status(201).json({ success: true, data: method });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.updatePaymentMethod = async (req, res) => {
  try {
    const method = await DonationPaymentMethod.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!method) return res.status(404).json({ success: false, message: 'Payment method not found.' });
    res.json({ success: true, data: method });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

exports.deletePaymentMethod = async (req, res) => {
  try {
    const method = await DonationPaymentMethod.findByIdAndDelete(req.params.id);
    if (!method) return res.status(404).json({ success: false, message: 'Payment method not found.' });
    res.json({ success: true, message: 'Payment method deleted.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Export helpers (used by tests)
exports._internal = { normalizePhone, isValidPhone, buildQrPayload, buildAdminQuery, markDonationPaid, notifyDonor, notifyAdmins };
