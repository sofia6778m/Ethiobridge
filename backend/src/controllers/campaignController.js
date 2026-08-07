const Campaign = require('../models/Campaign');
const Donation = require('../models/Donation');
const Payment = require('../models/Payment');
const Receipt = require('../models/Receipt');
const User = require('../models/User');
const Subcity = require('../models/Subcity');
const Woreda = require('../models/Woreda');
const InfrastructureReport = require('../models/InfrastructureReport');
const EmergencyReport = require('../models/EmergencyReport');
const { notifyUsers } = require('../services/notificationService');
const { logAction } = require('../middleware/auditLog');
const {
  CAMPAIGN_CATEGORIES,
  categoryLabel,
  campaignTypeForCategory,
} = require('../utils/campaignCategory');

const getIo = (req) => req.app?.get('io') || null;

const notify = async (req, users, { title, message, type, relatedId, actorId }) => {
  const io = getIo(req);
  await notifyUsers({
    userIds: users,
    actorId,
    title,
    message,
    type,
    relatedReport: relatedId,
    relatedReportType: 'campaign',
    io,
  });
};

// ── Local government office scope ─────────────────────────────────────────────
// Subcity Admins (subcity_* / SUBCITY_HEAD) and Woreda Admins (woreda /
// WOREDA_HEAD) manage campaigns for their own office only.
const OFFICE_ROLES = [
  'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura',
  'woreda', 'SUBCITY_HEAD', 'WOREDA_HEAD',
];

const isOfficeRole = (role) => OFFICE_ROLES.includes(role);
const isAdminRole = (role) => ['admin', 'ADMIN'].includes(role);
const canCreateCampaigns = (role) =>
  isAdminRole(role) || isOfficeRole(role) || role === 'government' || role === 'ngo';

const SUB_CITY_LABELS = {
  subcity_bole: 'Bole',
  subcity_yeka: 'Yeka',
  subcity_lemmi_kura: 'Lemmi Kura',
};

// Resolve the subcity/woreda scope a campaign should belong to from the
// creating user's own scope. Falls back to the master Subcity / Woreda records
// when the string fields are missing on the user document.
const resolveOfficeScope = async (user) => {
  const scope = { subcity: '', subcityId: null, woreda: '', woredaId: null };
  if (!user) return scope;

  const isSubcityRole = user.role.startsWith('subcity_') || user.role === 'SUBCITY_HEAD';
  const isWoredaRole = user.role === 'woreda' || user.role === 'WOREDA_HEAD';

  if (isSubcityRole) {
    scope.subcity = user.subcity || SUB_CITY_LABELS[user.role] || '';
    if (user.subcityId) scope.subcityId = user.subcityId;
    else if (scope.subcity) {
      const sub = await Subcity.findOne({ nameLower: scope.subcity.toLowerCase() }).select('_id').lean();
      if (sub) scope.subcityId = sub._id;
    }
  }

  if (isWoredaRole) {
    scope.woreda = user.woredaName || '';
    if (user.woredaId) scope.woredaId = user.woredaId;
    else if (scope.woreda) {
      const wr = await Woreda.findOne({ name: scope.woreda, status: 'Active' }).select('_id').lean();
      if (wr) scope.woredaId = wr._id;
    }
    scope.subcity = user.subcity || '';
    if (!scope.subcity && scope.woredaId) {
      const wr = await Woreda.findById(scope.woredaId).select('subcity').lean();
      if (wr) scope.subcity = wr.subcity || '';
    }
    if (!scope.subcityId && scope.subcity) {
      const sub = await Subcity.findOne({ nameLower: scope.subcity.toLowerCase() }).select('_id').lean();
      if (sub) scope.subcityId = sub._id;
    }
  }

  return scope;
};

// Build a Mongo $or scope filter for office roles so a Subcity Admin sees all
// campaigns of their subcity and a Woreda Admin sees all campaigns of their
// woreda — regardless of which office staff member created them.
const buildCampaignScopeQuery = async (user) => {
  if (!user) return null;
  const isSubcityRole = user.role.startsWith('subcity_') || user.role === 'SUBCITY_HEAD';
  const isWoredaRole = user.role === 'woreda' || user.role === 'WOREDA_HEAD';
  if (!isSubcityRole && !isWoredaRole) return null;

  const subcity = user.subcity || SUB_CITY_LABELS[user.role] || '';
  const woreda = user.woredaName || user.woreda || '';

  const clauses = [];
  if (isSubcityRole && subcity) clauses.push({ subcity: { $regex: `^${subcity}$`, $options: 'i' } });
  if (isWoredaRole) {
    if (woreda) clauses.push({ woreda: { $regex: `^${woreda}$`, $options: 'i' } });
    else if (subcity) clauses.push({ subcity: { $regex: `^${subcity}$`, $options: 'i' } });
  }
  if (clauses.length === 0) return null;
  return { $or: clauses };
};

// Whether a campaign document falls inside a user's office scope.
const isCampaignInOfficeScope = async (user, campaign) => {
  if (!user || !campaign) return false;
  if (isAdminRole(user.role)) return true;
  if (!isOfficeRole(user.role)) return false;

  const isSubcityRole = user.role.startsWith('subcity_') || user.role === 'SUBCITY_HEAD';
  const isWoredaRole = user.role === 'woreda' || user.role === 'WOREDA_HEAD';

  const subcity = user.subcity || SUB_CITY_LABELS[user.role] || '';
  const woreda = user.woredaName || user.woreda || '';

  if (isSubcityRole && subcity && (campaign.subcity || '').toLowerCase() === subcity.toLowerCase()) return true;
  if (isWoredaRole) {
    if (woreda && (campaign.woreda || '').toLowerCase() === woreda.toLowerCase()) return true;
    if (!woreda && subcity && (campaign.subcity || '').toLowerCase() === subcity.toLowerCase()) return true;
  }
  return false;
};

// ─── Campaign CRUD ───

exports.createCampaign = async (req, res) => {
  try {
    const {
      title, description, campaignType, category, priority, goalAmount, endDate, startDate,
      location, image, tags, relatedReport, relatedReportModel, isFeatured,
      estimatedBeneficiaries, impactMetrics, expenseSummary, status, department,
      urgencyLevel, destinationAccount,
    } = req.body;

    if (!canCreateCampaigns(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Your role is not allowed to create campaigns' });
    }
    if (req.user.role === 'ngo' && campaignType !== 'emergency' && category !== 'emergency_medical') {
      return res.status(403).json({ success: false, message: 'NGOs can only create emergency campaigns' });
    }
    if (req.user.role === 'government' && campaignType === 'emergency') {
      return res.status(403).json({ success: false, message: 'Government cannot create emergency campaigns' });
    }

    // Community category drives the legacy campaignType when none is provided.
    let resolvedType = campaignType;
    if (category && campaignTypeForCategory(category)) {
      resolvedType = resolvedType || campaignTypeForCategory(category);
    }
    if (!resolvedType) resolvedType = 'general';

    let reportData = null;
    if (relatedReport && relatedReportModel === 'InfrastructureReport') {
      reportData = await InfrastructureReport.findById(relatedReport);
      if (!reportData) return res.status(404).json({ success: false, message: 'Infrastructure report not found' });
      if (!title) title = `Infrastructure Fundraising: ${reportData.title}`;
      if (!description) description = reportData.description;
      if (!location) location = { region: reportData.region, city: reportData.city, specificLocation: reportData.specificLocation };
      if (!image && reportData.photos?.[0]) image = reportData.photos[0];
    }
    if (relatedReport && relatedReportModel === 'EmergencyReport') {
      reportData = await EmergencyReport.findById(relatedReport);
      if (!reportData) return res.status(404).json({ success: false, message: 'Emergency report not found' });
      if (!title) title = `Emergency Fundraising: ${reportData.title}`;
      if (!description) description = reportData.description;
      if (!location) location = { region: reportData.region, city: reportData.city, specificLocation: reportData.specificLocation };
      if (!image && reportData.photos?.[0]) image = reportData.photos[0];
    }

    // Admins create campaigns directly as active (no approval step needed).
    const isAdmin = isAdminRole(req.user.role);
    const allowedStatus = ['active', 'completed', 'closed'].includes(status) ? status : undefined;

    // Office roles (subcity / woreda admins) always create campaigns for their
    // OWN office — the scope is resolved server-side and cannot be overridden.
    const officeScope = isOfficeRole(req.user.role) ? await resolveOfficeScope(req.user) : null;

    const campaign = await Campaign.create({
      title, description,
      campaignType: resolvedType,
      category: category || 'other',
      priority: ['high', 'medium', 'low'].includes(priority) ? priority : 'medium',
      goalAmount, endDate,
      startDate: startDate || undefined,
      location: location || {},
      image,
      tags: tags || [],
      isFeatured: Boolean(isFeatured),
      estimatedBeneficiaries: Number(estimatedBeneficiaries) || 0,
      impactMetrics: impactMetrics || undefined,
      expenseSummary: expenseSummary || [],
      subcity: officeScope?.subcity || req.body.subcity || '',
      subcityId: officeScope?.subcityId || undefined,
      woreda: officeScope?.woreda || req.body.woreda || '',
      woredaId: officeScope?.woredaId || undefined,
      department: String(department || '').trim(),
      urgencyLevel: ['low', 'normal', 'high', 'critical'].includes(urgencyLevel) ? urgencyLevel : 'normal',
      destinationAccount: destinationAccount || undefined,
      createdBy: req.user._id,
      relatedReport: relatedReport || undefined,
      relatedReportModel: relatedReportModel || undefined,
      status: isAdmin ? (allowedStatus || 'active') : 'pending',
      approver: isAdmin ? req.user._id : undefined,
      approvedAt: isAdmin ? new Date() : undefined,
      officialVerified: isAdmin,
    });

    await logAction({ user: req.user, action: 'campaign_created', resource: 'donation_campaigns', resourceId: campaign._id, details: { title: campaign.title, subcity: campaign.subcity, woreda: campaign.woreda }, req });

    if (campaign.status === 'pending') {
      const admins = await User.find({ role: 'admin' }).select('_id');
      await notify(req, admins.map(a => a._id.toString()), {
        title: 'New Campaign Awaiting Approval',
        message: `"${campaign.title}" has been created and needs approval.`,
        type: 'campaign_approval',
        relatedId: campaign._id,
        actorId: req.user._id,
      });
    }

    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (campaign.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    const updated = await Campaign.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    res.json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (campaign.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, message: 'Not authorized' });
    }
    await campaign.deleteOne();
    res.json({ success: true, message: 'Campaign deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.approveCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    campaign.status = 'active';
    campaign.approver = req.user._id;
    campaign.approvedAt = new Date();
    campaign.officialVerified = true;
    await campaign.save();

    await logAction({ user: req.user, action: 'campaign_approved', resource: 'donation_campaigns', resourceId: campaign._id, details: { title: campaign.title }, req });

    await notify(req, [campaign.createdBy.toString()], {
      title: 'Campaign Approved',
      message: `Your campaign "${campaign.title}" has been approved and is now active.`,
      type: 'campaign_approved',
      relatedId: campaign._id,
      actorId: req.user._id,
    });

    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCampaigns = async (req, res) => {
  try {
    const { status, campaignType, category, priority, page = 1, limit = 12, search, subcity, woreda } = req.query;
    const query = {};

    if (status) query.status = status;
    else if (!req.user || req.user.role === 'citizen' || !req.user) query.status = 'active';
    if (campaignType) query.campaignType = campaignType;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (subcity) query.subcity = { $regex: `^${subcity}$`, $options: 'i' };
    if (woreda) query.woreda = { $regex: `^${woreda}$`, $options: 'i' };
    if (search) query.title = { $regex: search, $options: 'i' };

    if (req.user && (req.user.role === 'government' || req.user.role === 'ngo' || isOfficeRole(req.user.role))) {
      if (!status && !campaignType && !category && !priority) {
        // Office roles see ALL campaigns of their office scope, not only the
        // ones they personally created.
        if (isOfficeRole(req.user.role)) {
          const officeQuery = await buildCampaignScopeQuery(req.user);
          if (officeQuery) query.$or = officeQuery.$or;
          else query.createdBy = req.user._id;
        } else {
          query.createdBy = req.user._id;
        }
      }
    }

    const total = await Campaign.countDocuments(query);
    const campaigns = await Campaign.find(query)
      .populate('createdBy', 'fullName organizationName')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, data: campaigns, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getPublicCampaigns = async (req, res) => {
  try {
    const {
      campaignType, category, priority, subcity, woreda, region, search,
      page = 1, limit = 12, sort,
    } = req.query;
    const query = { status: 'active' };
    if (campaignType) query.campaignType = campaignType;
    if (category) query.category = category;
    if (priority) query.priority = priority;
    if (region) query['location.region'] = { $regex: `^${region}$`, $options: 'i' };
    if (subcity) query.subcity = { $regex: `^${subcity}$`, $options: 'i' };
    if (woreda) query.woreda = { $regex: `^${woreda}$`, $options: 'i' };
    if (search) query.title = { $regex: search, $options: 'i' };

    const sortOptions = {
      newest: { isFeatured: -1, createdAt: -1 },
      most_raised: { raisedAmount: -1 },
      goal_progress: { goalAmount: -1 },
      priority: { priority: -1, isFeatured: -1, createdAt: -1 },
      ending_soon: { endDate: 1 },
    };
    const sorter = sortOptions[sort] || sortOptions.newest;

    const total = await Campaign.countDocuments(query);
    const campaigns = await Campaign.find(query)
      .populate('createdBy', 'fullName organizationName')
      .sort(sorter)
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const stats = await Campaign.aggregate([
      { $match: { status: 'active' } },
      { $group: { _id: null, totalRaised: { $sum: '$raisedAmount' }, totalDonors: { $sum: '$donors' }, totalCampaigns: { $sum: 1 } } }
    ]);

    res.json({
      success: true,
      data: campaigns,
      stats: stats[0] || { totalRaised: 0, totalDonors: 0, totalCampaigns: 0 },
      total, page: parseInt(page), pages: Math.ceil(total / limit)
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id)
      .populate('createdBy', 'fullName organizationName email phone profileImage')
      .populate('successStories');
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    const totalDonations = await Donation.countDocuments({ campaign: campaign._id, paymentStatus: 'completed' });
    const topDonors = await Donation.find({ campaign: campaign._id, paymentStatus: 'completed', isAnonymous: false })
      .populate('donor', 'fullName profileImage')
      .sort({ amount: -1 }).limit(10);

    // ── Transparency dashboard data ─────────────────────────────────────────
    const [verified] = await Donation.aggregate([
      { $match: { campaign: campaign._id, verificationStatus: 'verified', donationType: { $ne: 'in_kind' } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const [inKind] = await Donation.aggregate([
      { $match: { campaign: campaign._id, verificationStatus: 'verified', donationType: 'in_kind' } },
      { $group: { _id: null, total: { $sum: '$inKind.estimatedValue' }, count: { $sum: 1 } } },
    ]);
    const [expenses] = await Campaign.aggregate([
      { $match: { _id: campaign._id } },
      { $unwind: { path: '$expenseSummary', preserveNullAndEmptyArrays: true } },
      { $group: { _id: null, totalExpenses: { $sum: '$expenseSummary.amount' } } },
    ]);

    const donorCount = await Donation.distinct('donor', { campaign: campaign._id, verificationStatus: 'verified', donor: { $ne: null } });
    const anonymousCount = await Donation.countDocuments({ campaign: campaign._id, verificationStatus: 'verified', isAnonymous: true });
    const volunteerCount = await require('../models/Volunteer').countDocuments({
      campaign: campaign._id,
      status: { $in: ['approved', 'attended'] },
    });

    const obj = campaign.toObject();
    res.json({
      success: true,
      data: {
        ...obj,
        totalDonations,
        topDonors,
        transparency: {
          targetAmount: campaign.goalAmount,
          amountRaised: campaign.raisedAmount,
          percentProgress: campaign.progressPercent,
          donorCount: (donorCount?.length || 0) + anonymousCount,
          daysRemaining: campaign.daysRemaining,
          lastUpdateDate: campaign.lastUpdateDate,
          verifiedFunds: verified?.total || 0,
          verifiedDonations: verified?.count || 0,
          inKindValue: inKind?.total || 0,
          inKindDonations: inKind?.count || 0,
          totalExpenses: expenses?.totalExpenses || 0,
          beneficiaryCount: campaign.impactMetrics?.beneficiariesReached || campaign.estimatedBeneficiaries || 0,
          volunteerCount,
          expenseBreakdown: (campaign.expenseSummary || []).map((e) => ({
            label: e.label, amount: e.amount, date: e.date, category: e.category,
          })),
          proofOfWork: (campaign.proofOfWork || []).map((m) => ({
            kind: m.kind, url: m.url, caption: m.caption, date: m.date,
          })),
        },
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyCampaigns = async (req, res) => {
  try {
    const { status, page = 1, limit = 12 } = req.query;
    const query = { createdBy: req.user._id };
    if (status) query.status = status;
    const total = await Campaign.countDocuments(query);
    const campaigns = await Campaign.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    res.json({ success: true, data: campaigns, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Community Campaign Platform ─────────────────────────────────────────────

// Public list of the community campaign categories (with EN/AM labels).
exports.getCampaignCategories = async (req, res) => {
  res.json({
    success: true,
    data: CAMPAIGN_CATEGORIES.map((c) => ({
      code: c.code,
      name: c.en,
      nameAmharic: c.am,
      campaignType: c.campaignType,
    })),
  });
};

// Public transparency / donor statistics for a single campaign.
exports.getCampaignTransparency = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const [verified] = await Donation.aggregate([
      { $match: { campaign: campaign._id, verificationStatus: 'verified', donationType: { $ne: 'in_kind' } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const [inKind] = await Donation.aggregate([
      { $match: { campaign: campaign._id, verificationStatus: 'verified', donationType: 'in_kind' } },
      { $group: { _id: null, total: { $sum: '$inKind.estimatedValue' }, count: { $sum: 1 } } },
    ]);
    const byMethod = await Donation.aggregate([
      { $match: { campaign: campaign._id, verificationStatus: 'verified', donationType: { $ne: 'in_kind' } } },
      { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);
    const recent = await Donation.find({
      campaign: campaign._id,
      verificationStatus: 'verified',
      donationType: { $ne: 'in_kind' },
      isAnonymous: false,
    })
      .populate('donor', 'fullName profileImage')
      .sort({ verifiedAt: -1 })
      .limit(20)
      .lean();

    const donorIds = await Donation.distinct('donor', { campaign: campaign._id, verificationStatus: 'verified', donor: { $ne: null } });
    const anonymousCount = await Donation.countDocuments({ campaign: campaign._id, verificationStatus: 'verified', isAnonymous: true });

    res.json({
      success: true,
      data: {
        campaignId: campaign._id,
        targetAmount: campaign.goalAmount,
        amountRaised: campaign.raisedAmount,
        percentProgress: campaign.progressPercent,
        daysRemaining: campaign.daysRemaining,
        lastUpdateDate: campaign.lastUpdateDate,
        donorCount: (donorIds?.length || 0) + anonymousCount,
        verifiedFunds: verified?.total || 0,
        verifiedDonations: verified?.count || 0,
        inKindValue: inKind?.total || 0,
        inKindDonations: inKind?.count || 0,
        byMethod: byMethod.map((m) => ({ method: m._id, total: m.total, count: m.count })),
        recentDonors: recent.map((d) => ({
          _id: d._id,
          referenceNumber: d.referenceNumber,
          amount: d.amount,
          currency: d.currency,
          donorName: d.donor?.fullName || d.fullName || 'Donor',
          createdAt: d.verifiedAt || d.createdAt,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Add a progress update to a campaign. Supports optional proof-of-work media
// (photos / videos / receipts) uploaded as multipart field "media" (array).
exports.addCampaignUpdate = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const isAdmin = isAdminRole(req.user.role);
    const isOwner = String(campaign.createdBy) === String(req.user._id);
    const inScope = await isCampaignInOfficeScope(req.user, campaign);
    if (!isAdmin && !isOwner && !inScope) {
      return res.status(403).json({ success: false, message: 'You are not authorized to update this campaign' });
    }

    const { title, description, type, receiptAmount } = req.body;
    const updateType = type === 'milestone' ? 'milestone' : 'update';
    const media = (req.files || []).map((f) => {
      const kind = f.mimetype?.startsWith('video/') ? 'video'
        : String(f.originalname || '').toLowerCase().includes('receipt') ? 'receipt'
        : 'image';
      return {
        kind,
        url: f.path || f.secure_url || '',
        publicId: f.public_id || '',
        caption: '',
      };
    });

    const update = {
      title: String(title || 'Progress Update').slice(0, 200),
      description: String(description || '').slice(0, 4000),
      date: new Date(),
      type: updateType,
      media,
      receiptAmount: Number(receiptAmount) || 0,
      postedBy: req.user._id,
    };
    campaign.updates.push(update);
    await campaign.save();

    // Refresh the public proof-of-work gallery with the latest media.
    if (media.length > 0) {
      const added = campaign.updates[campaign.updates.length - 1];
      await Campaign.updateOne(
        { _id: campaign._id },
        {
          $push: {
            proofOfWork: {
              $each: media.map((m) => ({
                kind: m.kind, url: m.url, publicId: m.publicId,
                caption: title ? String(title).slice(0, 200) : '', date: new Date(),
                updateId: added._id,
              })),
              $position: 0,
            },
          },
        }
      );
      // Keep the gallery to the latest 50 media items.
      await Campaign.updateOne(
        { _id: campaign._id },
        { $slice: { proofOfWork: 50 } }
      );
    }

    await logAction({ user: req.user, action: 'campaign_update_added', resource: 'donation_campaigns', resourceId: campaign._id, details: { title: update.title, mediaCount: media.length }, req });

    const updated = await Campaign.findById(campaign._id);
    res.status(201).json({ success: true, data: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Remove an update (office owner or admin) — keeps the record clean.
exports.deleteCampaignUpdate = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const isAdmin = isAdminRole(req.user.role);
    const isOwner = String(campaign.createdBy) === String(req.user._id);
    const inScope = await isCampaignInOfficeScope(req.user, campaign);
    if (!isAdmin && !isOwner && !inScope) {
      return res.status(403).json({ success: false, message: 'You are not authorized to update this campaign' });
    }

    const updateId = req.params.updateId;
    const before = campaign.updates.length;
    campaign.updates = (campaign.updates || []).filter((u) => String(u._id) !== String(updateId));
    campaign.proofOfWork = (campaign.proofOfWork || []).filter((m) => String(m.updateId) !== String(updateId));
    await campaign.save();

    res.json({ success: true, message: before > campaign.updates.length ? 'Update removed' : 'Update not found' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Add an expense line item to the campaign's expense summary.
exports.addExpense = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const isAdmin = isAdminRole(req.user.role);
    const isOwner = String(campaign.createdBy) === String(req.user._id);
    const inScope = await isCampaignInOfficeScope(req.user, campaign);
    if (!isAdmin && !isOwner && !inScope) {
      return res.status(403).json({ success: false, message: 'You are not authorized to update this campaign' });
    }

    const { label, amount, date, category } = req.body;
    const parsedAmount = Number(amount);
    if (!label || !Number.isFinite(parsedAmount)) {
      return res.status(400).json({ success: false, message: 'Label and a valid amount are required.' });
    }

    campaign.expenseSummary.push({
      label: String(label).slice(0, 200),
      amount: parsedAmount,
      date: date ? new Date(date) : new Date(),
      category: String(category || '').slice(0, 100),
    });
    await campaign.save();

    await logAction({ user: req.user, action: 'campaign_expense_added', resource: 'donation_campaigns', resourceId: campaign._id, details: { label, amount: parsedAmount }, req });
    res.status(201).json({ success: true, data: campaign.expenseSummary });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Update the campaign's impact metrics (beneficiaries, houses, students, …).
exports.updateImpactMetrics = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const isAdmin = isAdminRole(req.user.role);
    const isOwner = String(campaign.createdBy) === String(req.user._id);
    const inScope = await isCampaignInOfficeScope(req.user, campaign);
    if (!isAdmin && !isOwner && !inScope) {
      return res.status(403).json({ success: false, message: 'You are not authorized to update this campaign' });
    }

    const { impactMetrics } = req.body;
    if (!impactMetrics || typeof impactMetrics !== 'object') {
      return res.status(400).json({ success: false, message: 'Impact metrics are required.' });
    }

    const numeric = {};
    for (const key of [
      'beneficiariesReached', 'housesRepaired', 'studentsSupported', 'mealsServed',
      'elderlyServed', 'patientsSupported', 'youthEngaged', 'treesPlanted',
      'sanitationSites', 'equipmentProvided', 'volunteersEngaged',
    ]) {
      const v = Number(impactMetrics[key]);
      if (Number.isFinite(v)) numeric[key] = v;
    }
    campaign.impactMetrics = { ...(campaign.impactMetrics || {}), ...numeric };
    if (Array.isArray(impactMetrics.custom)) {
      campaign.impactMetrics.custom = impactMetrics.custom
        .filter((c) => c && c.label)
        .map((c) => ({ label: String(c.label).slice(0, 120), value: Number(c.value) || 0 }));
    }
    await campaign.save();

    await logAction({ user: req.user, action: 'campaign_impact_updated', resource: 'donation_campaigns', resourceId: campaign._id, details: { impactMetrics: numeric }, req });
    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Mark a campaign completed (office owner or admin).
exports.completeCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const isAdmin = isAdminRole(req.user.role);
    const isOwner = String(campaign.createdBy) === String(req.user._id);
    const inScope = await isCampaignInOfficeScope(req.user, campaign);
    if (!isAdmin && !isOwner && !inScope) {
      return res.status(403).json({ success: false, message: 'You are not authorized to update this campaign' });
    }

    campaign.status = 'completed';
    await campaign.save();

    await logAction({ user: req.user, action: 'campaign_completed', resource: 'donation_campaigns', resourceId: campaign._id, details: { title: campaign.title }, req });

    await notify(req, [campaign.createdBy.toString()], {
      title: 'Campaign Completed',
      message: `"${campaign.title}" has been marked as completed. Add your impact metrics and proof-of-work so donors can see the outcome.`,
      type: 'campaign_approved',
      relatedId: campaign._id,
      actorId: req.user._id,
    });

    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Public donor statistics overview for the transparency dashboard.
exports.getPublicDonorStats = async (req, res) => {
  try {
    const [raised] = await Donation.aggregate([
      { $match: { verificationStatus: 'verified', donationType: { $ne: 'in_kind' } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const [inKind] = await Donation.aggregate([
      { $match: { verificationStatus: 'verified', donationType: 'in_kind' } },
      { $group: { _id: null, total: { $sum: '$inKind.estimatedValue' }, count: { $sum: 1 } } },
    ]);
    const registeredDonors = await Donation.distinct('donor', { verificationStatus: 'verified', donor: { $ne: null } });
    const anonymousCount = await Donation.countDocuments({ verificationStatus: 'verified', isAnonymous: true });
    const bySubcity = await Donation.aggregate([
      { $match: { verificationStatus: 'verified', subcity: { $ne: '' } } },
      { $group: { _id: '$subcity', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);
    const byWoreda = await Donation.aggregate([
      { $match: { verificationStatus: 'verified', woreda: { $ne: '' } } },
      { $group: { _id: '$woreda', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]);

    res.json({
      success: true,
      data: {
        totalVerifiedFunds: raised?.total || 0,
        totalVerifiedDonations: raised?.count || 0,
        totalInKindValue: inKind?.total || 0,
        totalInKindDonations: inKind?.count || 0,
        totalDonors: (registeredDonors?.length || 0) + anonymousCount,
        bySubcity: bySubcity.map((m) => ({ name: m._id, total: m.total, count: m.count })),
        byWoreda: byWoreda.map((m) => ({ name: m._id, total: m.total, count: m.count })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Donation ───

exports.donate = async (req, res) => {
  try {
    const { campaignId, amount, isAnonymous, message, paymentMethod, donorName, donorEmail } = req.body;
    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (campaign.status !== 'active') return res.status(400).json({ success: false, message: 'Campaign is not active' });
    if (new Date() > new Date(campaign.endDate)) return res.status(400).json({ success: false, message: 'Campaign has ended' });

    const donation = await Donation.create({
      campaign: campaignId,
      donor: req.user?._id || undefined,
      amount, isAnonymous: isAnonymous || false,
      message: message || '',
      paymentMethod,
      paymentStatus: 'completed',
      donorName: donorName || (req.user?.fullName || 'Anonymous'),
      donorEmail: donorEmail || (req.user?.email || ''),
    });

    await Payment.create({
      donation: donation._id,
      campaign: campaignId,
      amount,
      paymentMethod,
      status: 'completed',
      transactionId: `TXN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
      processedAt: new Date(),
    });

    const receipt = await Receipt.create({
      receiptNumber: donation.receiptNumber,
      donation: donation._id,
      campaign: campaignId,
      donor: req.user?._id || undefined,
      donorName: isAnonymous ? 'Anonymous' : (donorName || req.user?.fullName || 'Anonymous'),
      donorEmail: donorEmail || (req.user?.email || ''),
      amount,
      paymentMethod,
      campaignTitle: campaign.title,
      transactionId: donation.transactionId,
      isAnonymous: isAnonymous || false,
      message: message || '',
    });

    campaign.raisedAmount = (campaign.raisedAmount || 0) + amount;
    campaign.donors = (campaign.donors || 0) + 1;
    await campaign.save();

    await notify(req, [campaign.createdBy.toString()], {
      title: 'New Donation Received',
      message: `${isAnonymous ? 'Anonymous' : (donorName || 'Someone')} donated ${amount} ETB to "${campaign.title}"`,
      type: 'donation_received',
      relatedId: campaign._id,
      actorId: req.user?._id,
    });

    res.status(201).json({
      success: true,
      data: { donation, receipt },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getDonationHistory = async (req, res) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const query = {};
    if (req.user.role === 'citizen') query.donor = req.user._id;
    if (req.user.role === 'government' || req.user.role === 'ngo') {
      const campaigns = await Campaign.find({ createdBy: req.user._id }).select('_id');
      query.campaign = { $in: campaigns.map(c => c._id) };
    }
    const total = await Donation.countDocuments(query);
    const donations = await Donation.find(query)
      .populate('campaign', 'title campaignType')
      .populate('donor', 'fullName email')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));
    res.json({ success: true, data: donations, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Receipt ───

exports.getReceipt = async (req, res) => {
  try {
    const receipt = await Receipt.findOne({ receiptNumber: req.params.receiptNumber })
      .populate('campaign', 'title campaignType');
    if (!receipt) return res.status(404).json({ success: false, message: 'Receipt not found' });
    res.json({ success: true, data: receipt });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getMyReceipts = async (req, res) => {
  try {
    const receipts = await Receipt.find({ donor: req.user._id })
      .populate('campaign', 'title campaignType')
      .sort({ createdAt: -1 });
    res.json({ success: true, data: receipts });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Statistics ───

exports.getCampaignStats = async (req, res) => {
  try {
    const match = {};
    if (req.user.role === 'government' || req.user.role === 'ngo' || isOfficeRole(req.user.role)) {
      const campaigns = await Campaign.find({ createdBy: req.user._id }).select('_id');
      match._id = { $in: campaigns.map(c => c._id) };
    }
    const pipeline = [
      { $match: match },
      {
        $group: {
          _id: null,
          totalCampaigns: { $sum: 1 },
          activeCampaigns: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
          completedCampaigns: { $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] } },
          totalRaised: { $sum: '$raisedAmount' },
          totalDonors: { $sum: '$donors' },
          totalGoal: { $sum: '$goalAmount' },
        },
      },
    ];
    const stats = await Campaign.aggregate(pipeline);
    res.json({ success: true, data: stats[0] || { totalCampaigns: 0, activeCampaigns: 0, completedCampaigns: 0, totalRaised: 0, totalDonors: 0, totalGoal: 0 } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getFinancialReports = async (req, res) => {
  try {
    const match = {};
    if (req.user.role === 'government' || req.user.role === 'ngo') {
      const campaigns = await Campaign.find({ createdBy: req.user._id }).select('_id');
      match.campaign = { $in: campaigns.map(c => c._id) };
    }
    const donations = await Donation.find({ ...match, paymentStatus: 'completed' })
      .populate('campaign', 'title campaignType')
      .populate('donor', 'fullName email')
      .sort({ createdAt: -1 }).limit(100);
    const totalAmount = donations.reduce((sum, d) => sum + d.amount, 0);
    res.json({ success: true, data: { donations, totalAmount, count: donations.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getFinancialAnalytics = async (req, res) => {
  try {
    const monthly = await Donation.aggregate([
      { $match: { paymentStatus: 'completed' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          total: { $sum: '$amount' },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
      { $limit: 12 },
    ]);
    const byMethod = await Donation.aggregate([
      { $match: { paymentStatus: 'completed' } },
      { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    const byCampaignType = await Donation.aggregate([
      { $match: { paymentStatus: 'completed' } },
      {
        $lookup: { from: 'campaigns', localField: 'campaign', foreignField: '_id', as: 'campaign' }
      },
      { $unwind: '$campaign' },
      { $group: { _id: '$campaign.campaignType', total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]);
    res.json({ success: true, data: { monthly, byMethod, byCampaignType } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.detectFraud = async (req, res) => {
  try {
    const suspicious = await Donation.find({
      paymentStatus: 'completed',
      createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
    }).populate('campaign', 'title');
    const flagged = suspicious.filter(d => {
      const hourDonations = suspicious.filter(s =>
        s.donor?.toString() === d.donor?.toString() &&
        Math.abs(new Date(s.createdAt) - new Date(d.createdAt)) < 3600000
      );
      return hourDonations.length > 5 || d.amount > 100000;
    });
    res.json({ success: true, data: { flagged, total: suspicious.length } });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Save Campaign ───

exports.saveCampaign = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    const idx = (user.savedCampaigns || []).indexOf(req.params.id);
    if (idx > -1) {
      user.savedCampaigns.splice(idx, 1);
      await user.save();
      return res.json({ success: true, saved: false });
    }
    if (!user.savedCampaigns) user.savedCampaigns = [];
    user.savedCampaigns.push(req.params.id);
    await user.save();
    res.json({ success: true, saved: true });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSavedCampaigns = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).populate({
      path: 'savedCampaigns',
      match: { status: 'active' },
    });
    res.json({ success: true, data: user.savedCampaigns || [] });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getSuccessStories = async (req, res) => {
  try {
    const campaigns = await Campaign.find({
      status: 'completed',
      'successStories.0': { $exists: true }
    }).select('title successStories image campaignType').sort({ updatedAt: -1 }).limit(10);
    const stories = campaigns.flatMap(c =>
      (c.successStories || []).map(s => ({ ...s.toObject(), campaignTitle: c.title, campaignImage: c.image, campaignType: c.campaignType }))
    );
    res.json({ success: true, data: stories });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getTopDonors = async (req, res) => {
  try {
    const topDonors = await Donation.aggregate([
      { $match: { paymentStatus: 'completed', isAnonymous: false } },
      {
        $group: {
          _id: '$donor',
          totalDonated: { $sum: '$amount' },
          donationCount: { $sum: 1 },
          lastDonation: { $max: '$createdAt' },
        },
      },
      { $sort: { totalDonated: -1 } },
      { $limit: 20 },
      {
        $lookup: { from: 'users', localField: '_id', foreignField: '_id', as: 'donor' }
      },
      { $unwind: { path: '$donor', preserveNullAndEmptyArrays: true } },
    ]);
    res.json({ success: true, data: topDonors });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getDistributionReports = async (req, res) => {
  try {
    const campaigns = await Campaign.find({ createdBy: req.user._id }).sort({ createdAt: -1 });
    const report = await Promise.all(campaigns.map(async (c) => {
      const donations = await Donation.find({ campaign: c._id, paymentStatus: 'completed' });
      return {
        campaign: { _id: c._id, title: c.title, campaignType: c.campaignType, raisedAmount: c.raisedAmount, goalAmount: c.goalAmount, donors: c.donors, status: c.status },
        totalDonations: donations.length,
        totalAmount: donations.reduce((s, d) => s + d.amount, 0),
        donorsList: donations.filter(d => !d.isAnonymous).slice(0, 10),
      };
    }));
    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.rejectCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    campaign.status = 'closed';
    await campaign.save();
    await logAction({ user: req.user, action: 'campaign_rejected', resource: 'donation_campaigns', resourceId: campaign._id, details: { title: campaign.title }, req });
    res.json({ success: true, message: 'Campaign rejected and closed' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ─── Report-to-Campaign Integration ───

exports.getAvailableReports = async (req, res) => {
  try {
    let reports = [];
    if (req.user.role === 'government') {
      reports = await InfrastructureReport.find({
        status: { $in: ['Approved', 'In Progress', 'Completed'] },
        $or: [{ submittedBy: req.user._id }, { assignedTo: req.user._id }],
      }).sort({ createdAt: -1 }).limit(20);
      reports = reports.map(r => ({
        _id: r._id,
        title: r.title,
        description: r.description,
        type: 'Infrastructure',
        location: { region: r.region, city: r.city, specificLocation: r.specificLocation },
        image: r.photos?.[0] || '',
        estimatedCost: r.estimatedCost || 0,
      }));
    }
    if (req.user.role === 'ngo') {
      reports = await EmergencyReport.find({
        status: { $in: ['Active', 'In Progress', 'Resolved'] },
        $or: [{ submittedBy: req.user._id }, { assignedTo: req.user._id }],
      }).sort({ createdAt: -1 }).limit(20);
      reports = reports.map(r => ({
        _id: r._id,
        title: r.title,
        description: r.description,
        type: 'Emergency',
        location: { region: r.region, city: r.city, specificLocation: r.specificLocation },
        image: r.photos?.[0] || '',
        victims: r.numberOfPeopleAffected || 0,
      }));
    }
    res.json({ success: true, data: reports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.createCampaignFromReport = async (req, res) => {
  try {
    const { reportId, reportType, goalAmount, endDate } = req.body;
    if (!reportId || !reportType || !goalAmount || !endDate) {
      return res.status(400).json({ success: false, message: 'Missing required fields: reportId, reportType, goalAmount, endDate' });
    }

    let reportData = null;
    let campaignType = 'general';
    if (reportType === 'Infrastructure') {
      reportData = await InfrastructureReport.findById(reportId);
      if (!reportData) return res.status(404).json({ success: false, message: 'Infrastructure report not found' });
      if (req.user.role !== 'government') return res.status(403).json({ success: false, message: 'Only government can create infrastructure campaigns' });
      campaignType = 'infrastructure';
    }
    if (reportType === 'Emergency') {
      reportData = await EmergencyReport.findById(reportId);
      if (!reportData) return res.status(404).json({ success: false, message: 'Emergency report not found' });
      if (req.user.role !== 'ngo') return res.status(403).json({ success: false, message: 'Only NGOs can create emergency campaigns' });
      campaignType = 'emergency';
    }

    const campaign = await Campaign.create({
      title: `Fundraising: ${reportData.title}`,
      description: reportData.description,
      campaignType,
      goalAmount,
      endDate,
      location: { region: reportData.region || '', city: reportData.city || '', specificLocation: reportData.specificLocation || '' },
      image: reportData.photos?.[0] || '',
      createdBy: req.user._id,
      relatedReport: reportData._id,
      relatedReportModel: reportType === 'Infrastructure' ? 'InfrastructureReport' : 'EmergencyReport',
      estimatedBeneficiaries: reportType === 'Emergency' ? reportData.numberOfPeopleAffected : undefined,
    });

    const admins = await User.find({ role: 'admin' }).select('_id');
    await notify(req, admins.map(a => a._id.toString()), {
      title: 'New Campaign from Report',
      message: `"${campaign.title}" was created from a ${reportType} report and needs approval.`,
      type: 'campaign_approval',
      relatedId: campaign._id,
      actorId: req.user._id,
    });

    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
