const mongoose = require('mongoose');
const Campaign = require('../models/Campaign');
const CampaignUpdate = require('../models/CampaignUpdate');
const CampaignProof = require('../models/CampaignProof');
const SavedCampaign = require('../models/SavedCampaign');
const Donation = require('../models/Donation');
const User = require('../models/User');
const { notifyUser, notifyUsers } = require('../services/notificationService');
const { logAction } = require('../middleware/auditLog');
const { SUBCITY_ROLE_MAP } = require('../utils/scopeFilter');
const {
  CAMPAIGN_LEVELS,
  CAMPAIGN_CATEGORIES,
  CAMPAIGN_STATUSES,
} = require('../models/Campaign');
const { buildCampaignCSV, buildCampaignPDF, fileStamp } = require('../utils/campaignExport');

const getIo = (req) => req.app?.get('io') || null;

// ── Roles & scope helpers ────────────────────────────────────────────────────

const GLOBAL_ROLES = ['admin', 'ADMIN', 'government'];
const SUB_CITY_ADMIN_ROLES = ['subcity_admin', 'SUBCITY_ADMIN', 'SUBCITY_HEAD', 'subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura'];
const WOREDA_ADMIN_ROLES = ['woreda_admin', 'WOREDA_ADMIN', 'woreda', 'WOREDA_HEAD'];

const esc = (s) => (s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const isGlobal = (user) => Boolean(user && GLOBAL_ROLES.includes(user.role));

const isSubcityAdmin = (user) =>
  Boolean(
    user &&
    (SUB_CITY_ADMIN_ROLES.includes(user.role) || (typeof user.role === 'string' && user.role.startsWith('subcity_')))
  );

const isWoredaAdmin = (user) => Boolean(user && WOREDA_ADMIN_ROLES.includes(user.role));

// Management-list scope. System admin / government see everything; subcity
// admins see campaigns in their subcity; woreda admins see campaigns in their
// woreda. Falls back to the denormalized name strings when the ObjectId refs
// are missing so legacy accounts still get a correct scope.
function buildCampaignScope(user) {
  if (!user || isGlobal(user)) return {};

  if (isSubcityAdmin(user)) {
    const scope = {};
    if (user.subcityId) scope.subcityId = user.subcityId;
    const name = user.subcity || SUBCITY_ROLE_MAP[user.role] || '';
    if (name) scope['location.subcity'] = { $regex: `^${esc(name)}$`, $options: 'i' };
    return scope;
  }

  if (isWoredaAdmin(user)) {
    if (user.woredaId) return { woredaId: user.woredaId };
    const woredaName = user.woredaName || '';
    if (woredaName) return { 'location.woreda': { $regex: `^${esc(woredaName)}$`, $options: 'i' } };
    return {};
  }

  return {};
}

// Whether a manager may edit / post updates / upload proofs for a campaign.
function canManageCampaign(user, campaign) {
  if (!user || !campaign) return false;
  if (isGlobal(user)) return true;
  if (campaign.createdBy && String(campaign.createdBy) === String(user._id)) return true;

  if (isSubcityAdmin(user)) {
    if (user.subcityId && campaign.subcityId) return String(user.subcityId) === String(campaign.subcityId);
    const subName = (user.subcity || SUBCITY_ROLE_MAP[user.role] || '').toLowerCase();
    const camSub = (campaign.location?.subcity || '').toLowerCase();
    return Boolean(subName && camSub && subName === camSub);
  }

  if (isWoredaAdmin(user)) {
    if (user.woredaId && campaign.woredaId) return String(user.woredaId) === String(campaign.woredaId);
    const worName = (user.woredaName || '').toLowerCase();
    const camWor = (campaign.location?.woreda || '').toLowerCase();
    return Boolean(worName && camWor && worName === camWor);
  }

  return false;
}

// Who may approve a pending campaign:
//   - subcity campaigns → System Admin only.
//   - woreda campaigns  → System Admin OR the Subcity Admin of that subcity.
function canApprove(user, campaign) {
  if (!user || !campaign) return false;
  if (isGlobal(user)) return true;
  if (campaign.campaignLevel === 'subcity') return false;
  if (!isSubcityAdmin(user)) return false;
  if (user.subcityId && campaign.subcityId) return String(user.subcityId) === String(campaign.subcityId);
  const subName = (user.subcity || SUBCITY_ROLE_MAP[user.role] || '').toLowerCase();
  const camSub = (campaign.location?.subcity || '').toLowerCase();
  return Boolean(subName && camSub && subName === camSub);
}

// Approvers for a campaign: subcity campaigns → system admins; woreda
// campaigns → subcity admins of the campaign's subcity.
async function findApprovers(campaign) {
  if (campaign.campaignLevel === 'subcity') {
    return User.find({ role: { $in: ['admin', 'ADMIN'] }, isActive: true })
      .select('_id fullName')
      .lean();
  }

  const scope = {
    isActive: true,
    $or: [{ role: 'subcity_admin' }, { role: 'SUBCITY_ADMIN' }, { role: { $regex: '^subcity_' } }],
  };
  if (campaign.subcityId) scope.subcityId = campaign.subcityId;
  else if (campaign.location?.subcity) {
    scope.subcity = { $regex: `^${esc(campaign.location.subcity)}$`, $options: 'i' };
  }
  return User.find(scope).select('_id fullName').lean();
}

async function notifyApprovers(req, campaign, event) {
  try {
    const approvers = await findApprovers(campaign);
    if (!approvers.length) return;
    const io = getIo(req);
    const by = req.user?.fullName || 'a staff member';
    await notifyUsers({
      userIds: approvers.map((a) => a._id),
      actorId: req.user?._id,
      title: `Campaign awaiting approval — ${campaign.title}`,
      message:
        event === 'submitted'
          ? `${campaign.title} (${campaign.campaignLevel}) was submitted for approval by ${by}.`
          : `${by} updated ${campaign.title} — please review it.`,
      type: 'campaign_status',
      campaignId: campaign._id,
      io,
    });
  } catch (err) {
    console.error('[Campaign] Approver notify failed:', err.message);
  }
}

async function notifyDonors(req, campaign, note, type) {
  try {
    const donorIds = await Donation.find({ campaign: campaign._id, donor: { $ne: null } }).distinct('donor');
    if (!donorIds.length) return;
    const io = getIo(req);
    await notifyUsers({
      userIds: donorIds,
      actorId: req.user?._id,
      title: `Update on "${campaign.title}"`,
      message: note || `${req.user?.fullName || 'The organizer'} posted an update to ${campaign.title}.`,
      type: type || 'campaign_update',
      campaignId: campaign._id,
      io,
    });
  } catch (err) {
    console.error('[Campaign] Donor notify failed:', err.message);
  }
}

// ── Public reads ─────────────────────────────────────────────────────────────

const getCampaignCategories = (req, res) => {
  res.json({ success: true, data: { categories: CAMPAIGN_CATEGORIES } });
};

const getFeaturedCampaigns = async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 5;
    const campaigns = await Campaign.find({ status: 'active' })
      .select('-fraudScore -fraudFlags')
      .sort({ isFeatured: -1, createdAt: -1 })
      .limit(limit)
      .lean();
    res.json({ success: true, data: { campaigns } });
  } catch (err) {
    console.error('[Campaign] Failed to fetch featured campaigns:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch campaigns' });
  }
};

const getPublicCampaigns = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 12, 50);
    const skip = (page - 1) * limit;

    // Only ACTIVE campaigns are ever shown to the public. Draft, pending,
    // rejected, cancelled, suspended and completed campaigns stay hidden.
    const query = { status: 'active' };
    if (req.query.level) query.campaignLevel = req.query.level;
    if (req.query.category) query.category = req.query.category;
    if (req.query.subcity) query['location.subcity'] = { $regex: `^${esc(req.query.subcity)}$`, $options: 'i' };
    if (req.query.woreda) query['location.woreda'] = { $regex: `^${esc(req.query.woreda)}$`, $options: 'i' };
    if (req.query.q) {
      const rx = { $regex: esc(req.query.q), $options: 'i' };
      query.$or = [{ title: rx }, { description: rx }, { 'location.subcity': rx }, { 'location.woreda': rx }];
    }

    const sort = req.query.sort === 'goal' ? { raisedAmount: -1 } : { createdAt: -1 };
    const [campaigns, total] = await Promise.all([
      Campaign.find(query)
        .select('-fraudScore -fraudFlags')
        .sort(sort)
        .skip(skip)
        .limit(limit)
        .lean(),
      Campaign.countDocuments(query),
    ]);

    res.json({ success: true, data: { campaigns, total, page, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[Campaign] Failed to fetch public campaigns:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch campaigns' });
  }
};

const getCampaignById = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id)
      .select('-fraudScore -fraudFlags')
      .populate('createdBy', 'fullName profileImage organizationName')
      .lean();
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    // Only ACTIVE campaigns are visible to the public. Draft, pending, rejected,
    // cancelled, suspended and completed campaigns must never leak on the
    // public site, even via a direct URL.
    if (campaign.status !== 'active') {
      return res.status(404).json({ success: false, message: 'Campaign not found' });
    }

    const [updates, proofs] = await Promise.all([
      CampaignUpdate.find({ campaign: campaign._id }).sort({ createdAt: -1 }).limit(20).lean(),
      CampaignProof.find({ campaign: campaign._id, status: 'verified' }).sort({ createdAt: -1 }).limit(10).lean(),
    ]);

    res.json({ success: true, data: { campaign, updates, proofs } });
  } catch (err) {
    console.error('[Campaign] Failed to fetch campaign:', err.message);
    if (err.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid campaign id' });
    res.status(500).json({ success: false, message: 'Failed to fetch campaign' });
  }
};

// ── Manager reads ────────────────────────────────────────────────────────────

const getManageCampaigns = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const skip = (page - 1) * limit;

    const query = buildCampaignScope(req.user);
    if (req.query.status && CAMPAIGN_STATUSES.includes(req.query.status)) query.status = req.query.status;
    if (req.query.level && CAMPAIGN_LEVELS.includes(req.query.level)) query.campaignLevel = req.query.level;
    if (req.query.category) query.category = req.query.category;
    if (req.query.q) {
      const rx = { $regex: esc(req.query.q), $options: 'i' };
      query.$or = [{ title: rx }, { description: rx }, { 'location.subcity': rx }, { 'location.woreda': rx }];
    }

    const [campaigns, total] = await Promise.all([
      Campaign.find(query).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Campaign.countDocuments(query),
    ]);

    res.json({ success: true, data: { campaigns, total, page, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[Campaign] Failed to fetch manage campaigns:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch campaigns' });
  }
};

// Pending campaigns the current user is authorized to approve.
const getApprovals = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const skip = (page - 1) * limit;

    const query = { status: 'pending' };
    if (!isGlobal(req.user)) {
      // Subcity admins only review pending woreda campaigns in their subcity.
      if (isSubcityAdmin(req.user)) {
        query.campaignLevel = 'woreda';
        if (req.user.subcityId) query.subcityId = req.user.subcityId;
        else if (req.user.subcity) query['location.subcity'] = { $regex: `^${esc(req.user.subcity)}$`, $options: 'i' };
      } else {
        return res.json({ success: true, data: { campaigns: [], total: 0, page: 1, pages: 0 } });
      }
    }

    const [campaigns, total] = await Promise.all([
      Campaign.find(query).sort({ createdAt: 1 }).skip(skip).limit(limit).lean(),
      Campaign.countDocuments(query),
    ]);

    res.json({ success: true, data: { campaigns, total, page, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[Campaign] Failed to fetch approvals:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch approvals' });
  }
};

const getCampaignAnalytics = async (req, res) => {
  try {
    const scope = buildCampaignScope(req.user);

    const [statusCounts, levelCounts, categoryCounts, total, activeAgg] = await Promise.all([
      Campaign.aggregate([{ $match: scope }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
      Campaign.aggregate([{ $match: scope }, { $group: { _id: '$campaignLevel', count: { $sum: 1 } } }]),
      Campaign.aggregate([{ $match: scope }, { $group: { _id: '$category', count: { $sum: 1 } } }]),
      Campaign.countDocuments(scope),
      Campaign.aggregate([
        { $match: { ...scope, status: 'active' } },
        { $group: { _id: null, raised: { $sum: '$raisedAmount' }, goal: { $sum: '$goalAmount' }, count: { $sum: 1 } } },
      ]),
    ]);

    const byStatus = {};
    statusCounts.forEach((s) => { byStatus[s._id] = s.count; });
    const byLevel = {};
    levelCounts.forEach((l) => { byLevel[l._id] = l.count; });
    const byCategory = {};
    categoryCounts.forEach((c) => { byCategory[c._id] = c.count; });

    const active = activeAgg[0] || { raised: 0, goal: 0, count: 0 };
    const pending = byStatus.pending || 0;
    const activeCount = byStatus.active || 0;

    res.json({
      success: true,
      data: {
        total,
        active: activeCount,
        pending,
        byStatus,
        byLevel,
        byCategory,
        totalRaised: active.raised,
        totalGoal: active.goal,
        averageProgress: active.goal > 0 ? Math.round((active.raised / active.goal) * 100) : 0,
      },
    });
  } catch (err) {
    console.error('[Campaign] Failed to fetch analytics:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch analytics' });
  }
};

const exportCampaigns = async (req, res) => {
  try {
    const format = req.query.format === 'pdf' ? 'pdf' : 'csv';
    const query = buildCampaignScope(req.user);
    if (req.query.status && CAMPAIGN_STATUSES.includes(req.query.status)) query.status = req.query.status;

    const campaigns = await Campaign.find(query).sort({ createdAt: -1 }).limit(500).lean();

    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="campaigns-${fileStamp()}.csv"`);
      return res.send(buildCampaignCSV(campaigns));
    }
    return buildCampaignPDF(campaigns, res);
  } catch (err) {
    console.error('[Campaign] Export failed:', err.message);
    res.status(500).json({ success: false, message: 'Failed to export campaigns' });
  }
};

// ── Create / update ──────────────────────────────────────────────────────────

const createCampaign = async (req, res) => {
  try {
    const { title, description, category, campaignLevel, goalAmount, endDate } = req.body;

    if (!title || !String(title).trim()) {
      return res.status(400).json({ success: false, message: 'Campaign title is required', field: 'title' });
    }
    if (!description || !String(description).trim()) {
      return res.status(400).json({ success: false, message: 'Campaign description is required', field: 'description' });
    }
    const amount = Number(goalAmount);
    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'A valid goal amount is required', field: 'goalAmount' });
    }

    const level = campaignLevel === 'woreda' ? 'woreda' : 'subcity';
    if (level === 'woreda' && !isWoredaAdmin(req.user) && !isSubcityAdmin(req.user) && !isGlobal(req.user)) {
      return res.status(403).json({ success: false, message: 'Only woreda admins can create woreda-level campaigns' });
    }
    if (level === 'subcity' && !isSubcityAdmin(req.user) && !isGlobal(req.user)) {
      return res.status(403).json({ success: false, message: 'Only subcity admins can create subcity-level campaigns' });
    }

    // Scope enforcement: an admin may only create a campaign inside their own
    // administrative unit. The location (and ObjectId refs) are always derived
    // from the authenticated user's own subcity / woreda — never trusted from
    // the request body. A mismatch is rejected outright.
    const subcityName = String(req.user.subcity || SUBCITY_ROLE_MAP[req.user.role] || '').trim();
    const woredaName = String(req.user.woredaName || '').trim();

    let location = {
      region: String(req.body.location?.region || 'Addis Ababa'),
      subcity: subcityName,
      woreda: level === 'woreda' ? woredaName : '',
    };
    let subcityId = req.user.subcityId || null;
    let woredaId = level === 'woreda' ? req.user.woredaId || null : null;

    if (!isGlobal(req.user)) {
      const bodySubcity = String(req.body.location?.subcity || '').trim();
      const bodyWoreda = String(req.body.location?.woreda || '').trim();
      if (isSubcityAdmin(req.user)) {
        if (bodySubcity && subcityName && bodySubcity.toLowerCase() !== subcityName.toLowerCase()) {
          return res.status(403).json({
            success: false,
            message: 'Subcity admins can only create campaigns within their own subcity',
            field: 'location.subcity',
          });
        }
        if (bodyWoreda && level === 'subcity') {
          return res.status(403).json({
            success: false,
            message: 'A subcity-level campaign cannot be scoped to a woreda',
            field: 'location.woreda',
          });
        }
      }
      if (isWoredaAdmin(req.user)) {
        if (bodyWoreda && woredaName && bodyWoreda.toLowerCase() !== woredaName.toLowerCase()) {
          return res.status(403).json({
            success: false,
            message: 'Woreda admins can only create campaigns within their own woreda',
            field: 'location.woreda',
          });
        }
        if (bodySubcity && subcityName && bodySubcity.toLowerCase() !== subcityName.toLowerCase()) {
          return res.status(403).json({
            success: false,
            message: 'Woreda admins can only create campaigns within their own subcity',
            field: 'location.subcity',
          });
        }
      }
    }

    // Subcity admins creating a woreda-level campaign must scope it to one of
    // the woredas inside their subcity (fallback: their own woreda name).
    if (!isGlobal(req.user) && isSubcityAdmin(req.user) && !isWoredaAdmin(req.user) && level === 'woreda') {
      const bodyWoreda = String(req.body.location?.woreda || '').trim();
      if (!bodyWoreda) {
        return res.status(400).json({
          success: false,
          message: 'Please specify the woreda for this woreda-level campaign',
          field: 'location.woreda',
        });
      }
      location.woreda = bodyWoreda;
    }

    const campaign = await Campaign.create({
      title: String(title).trim(),
      description: String(description).trim(),
      category: category && CAMPAIGN_CATEGORIES.includes(category) ? category : 'other',
      campaignLevel: level,
      location,
      subcityId,
      woredaId,
      goalAmount: amount,
      endDate: endDate ? new Date(endDate) : null,
      image: req.file ? req.file.path : String(req.body.image || ''),
      status: 'draft',
      createdBy: req.user._id,
      createdByName: req.user.fullName || '',
      createdByRole: req.user.role || '',
      auditHistory: [{ action: 'created', byName: req.user.fullName || '', byRole: req.user.role || '', at: new Date() }],
    });

    const io = getIo(req);
    io?.to(campaign._id.toString()).emit('campaign:new', { campaign });
    await logAction({
      user: req.user,
      action: 'campaign_create',
      resource: 'campaign',
      resourceId: campaign._id,
      details: { title: campaign.title, level: campaign.campaignLevel },
      req,
    });

    res.status(201).json({ success: true, message: 'Campaign created', data: { campaign } });
  } catch (err) {
    console.error('[Campaign] Failed to create campaign:', err.message);
    if (err.name === 'ValidationError') {
      const first = Object.values(err.errors || {})[0];
      return res.status(400).json({ success: false, message: first?.message || 'The campaign data is invalid', field: first?.path });
    }
    res.status(500).json({ success: false, message: 'Failed to create campaign' });
  }
};

const updateCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (!canManageCampaign(req.user, campaign)) {
      return res.status(403).json({ success: false, message: 'You cannot modify this campaign' });
    }
    if (campaign.status === 'completed' || campaign.status === 'cancelled') {
      return res.status(400).json({ success: false, message: 'Completed or cancelled campaigns cannot be edited' });
    }

    const { title, description, category, goalAmount, endDate } = req.body;
    if (title !== undefined && String(title).trim()) campaign.title = String(title).trim();
    if (description !== undefined && String(description).trim()) campaign.description = String(description).trim();
    if (category !== undefined && CAMPAIGN_CATEGORIES.includes(category)) campaign.category = category;

    // Goal/end date are locked once a campaign is pending or live to preserve
    // the approval record's integrity.
    const mutable = ['draft', 'rejected', 'suspended'].includes(campaign.status);
    if (mutable && goalAmount !== undefined) {
      const amount = Number(goalAmount);
      if (amount && amount > 0) campaign.goalAmount = amount;
    }
    if (mutable && endDate !== undefined) campaign.endDate = endDate ? new Date(endDate) : null;
    if (req.file) campaign.image = req.file.path;
    if (req.body.image !== undefined && !req.file) campaign.image = String(req.body.image);

    campaign.auditHistory.push({ action: 'updated', byName: req.user.fullName || '', byRole: req.user.role || '', at: new Date() });
    await campaign.save();

    const io = getIo(req);
    io?.to(campaign._id.toString()).emit('campaign:updated', { campaign });

    // Notify the campaign owner when a different authorized admin edited it.
    if (campaign.createdBy && String(campaign.createdBy) !== String(req.user._id)) {
      await notifyUser({
        userId: campaign.createdBy,
        actorId: req.user._id,
        title: 'Campaign updated',
        message: `Your campaign "${campaign.title}" was updated by ${req.user.fullName || 'an admin'}.`,
        type: 'campaign_status',
        campaignId: campaign._id,
        io,
      });
    }

    await logAction({ user: req.user, action: 'campaign_update', resource: 'campaign', resourceId: campaign._id, details: { title: campaign.title }, req });

    res.json({ success: true, message: 'Campaign updated', data: { campaign } });
  } catch (err) {
    console.error('[Campaign] Failed to update campaign:', err.message);
    res.status(500).json({ success: false, message: 'Failed to update campaign' });
  }
};

// ── Workflow transitions ─────────────────────────────────────────────────────

const submitCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (!canManageCampaign(req.user, campaign)) {
      return res.status(403).json({ success: false, message: 'You cannot modify this campaign' });
    }
    if (!['draft', 'rejected', 'suspended'].includes(campaign.status)) {
      return res.status(400).json({ success: false, message: 'Only draft, rejected or suspended campaigns can be submitted for approval' });
    }

    campaign.status = 'pending';
    campaign.rejectReason = '';
    campaign.auditHistory.push({ action: 'submitted', byName: req.user.fullName || '', byRole: req.user.role || '', at: new Date(), note: 'Submitted for approval' });

    const { score, flags } = await runFraudChecks(campaign);
    const added = mergeFraudFlags(campaign, flags);
    campaign.fraudScore = score;
    if (added.length) campaign.fraudFlags.push(...added);

    await campaign.save();

    await notifyApprovers(req, campaign, 'submitted');
    const io = getIo(req);
    io?.to(campaign._id.toString()).emit('campaign:statusUpdate', { campaign });
    await logAction({ user: req.user, action: 'campaign_submit', resource: 'campaign', resourceId: campaign._id, details: { title: campaign.title }, req });

    res.json({ success: true, message: 'Campaign submitted for approval', data: { campaign } });
  } catch (err) {
    console.error('[Campaign] Failed to submit campaign:', err.message);
    res.status(500).json({ success: false, message: 'Failed to submit campaign' });
  }
};

const approveCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (campaign.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending campaigns can be approved' });
    }
    if (!canApprove(req.user, campaign)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to approve this campaign' });
    }

    campaign.status = 'active';
    campaign.auditHistory.push({ action: 'approved', byName: req.user.fullName || '', byRole: req.user.role || '', at: new Date(), note: 'Approved and published' });
    await campaign.save();

    const io = getIo(req);
    await notifyUser({
      userId: campaign.createdBy,
      actorId: req.user._id,
      title: 'Campaign approved',
      message: `Your campaign "${campaign.title}" has been approved and is now live.`,
      type: 'campaign_status',
      campaignId: campaign._id,
      io,
    });
    io?.to(campaign._id.toString()).emit('campaign:statusUpdate', { campaign });
    await logAction({ user: req.user, action: 'campaign_approve', resource: 'campaign', resourceId: campaign._id, details: { title: campaign.title }, req });

    res.json({ success: true, message: 'Campaign approved', data: { campaign } });
  } catch (err) {
    console.error('[Campaign] Failed to approve campaign:', err.message);
    res.status(500).json({ success: false, message: 'Failed to approve campaign' });
  }
};

const rejectCampaign = async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'A rejection reason is required', field: 'reason' });

    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (campaign.status !== 'pending') {
      return res.status(400).json({ success: false, message: 'Only pending campaigns can be rejected' });
    }
    if (!canApprove(req.user, campaign)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to reject this campaign' });
    }

    campaign.status = 'rejected';
    campaign.rejectReason = reason;
    campaign.auditHistory.push({ action: 'rejected', byName: req.user.fullName || '', byRole: req.user.role || '', at: new Date(), note: reason });
    await campaign.save();

    const io = getIo(req);
    await notifyUser({
      userId: campaign.createdBy,
      actorId: req.user._id,
      title: 'Campaign rejected',
      message: `Your campaign "${campaign.title}" was rejected: ${reason}`,
      type: 'campaign_status',
      campaignId: campaign._id,
      io,
    });
    io?.to(campaign._id.toString()).emit('campaign:statusUpdate', { campaign });
    await logAction({ user: req.user, action: 'campaign_reject', resource: 'campaign', resourceId: campaign._id, details: { title: campaign.title, reason }, req });

    res.json({ success: true, message: 'Campaign rejected', data: { campaign } });
  } catch (err) {
    console.error('[Campaign] Failed to reject campaign:', err.message);
    res.status(500).json({ success: false, message: 'Failed to reject campaign' });
  }
};

// The completing authority verifies the campaign reached its objective.
const completeCampaign = async (req, res) => {
  try {
    const note = String(req.body.note || '').trim();
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (campaign.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Only active campaigns can be completed' });
    }
    if (!canManageCampaign(req.user, campaign) && !canApprove(req.user, campaign)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to complete this campaign' });
    }

    campaign.status = 'completed';
    campaign.completion = {
      verifiedBy: req.user._id,
      verifiedByName: req.user.fullName || '',
      verifiedAt: new Date(),
      note,
    };
    campaign.auditHistory.push({ action: 'completed', byName: req.user.fullName || '', byRole: req.user.role || '', at: new Date(), note });
    await campaign.save();

    const io = getIo(req);
    await notifyDonors(req, campaign, `"${campaign.title}" has been completed. Thank you for your support!`, 'campaign_status');
    io?.to(campaign._id.toString()).emit('campaign:statusUpdate', { campaign });
    await logAction({ user: req.user, action: 'campaign_complete', resource: 'campaign', resourceId: campaign._id, details: { title: campaign.title }, req });

    res.json({ success: true, message: 'Campaign completed', data: { campaign } });
  } catch (err) {
    console.error('[Campaign] Failed to complete campaign:', err.message);
    res.status(500).json({ success: false, message: 'Failed to complete campaign' });
  }
};

const suspendCampaign = async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'A suspension reason is required', field: 'reason' });

    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (campaign.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Only active campaigns can be suspended' });
    }

    campaign.status = 'suspended';
    campaign.suspension = {
      reason,
      suspendedBy: req.user.fullName || '',
      suspendedAt: new Date(),
      restoredAt: null,
    };
    campaign.auditHistory.push({ action: 'suspended', byName: req.user.fullName || '', byRole: req.user.role || '', at: new Date(), note: reason });
    await campaign.save();

    const io = getIo(req);
    await notifyUser({
      userId: campaign.createdBy,
      actorId: req.user._id,
      title: 'Campaign suspended',
      message: `Your campaign "${campaign.title}" was suspended: ${reason}`,
      type: 'campaign_status',
      campaignId: campaign._id,
      io,
    });
    io?.to(campaign._id.toString()).emit('campaign:statusUpdate', { campaign });
    await logAction({ user: req.user, action: 'campaign_suspend', resource: 'campaign', resourceId: campaign._id, details: { title: campaign.title, reason }, req });

    res.json({ success: true, message: 'Campaign suspended', data: { campaign } });
  } catch (err) {
    console.error('[Campaign] Failed to suspend campaign:', err.message);
    res.status(500).json({ success: false, message: 'Failed to suspend campaign' });
  }
};

const restoreCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (campaign.status !== 'suspended') {
      return res.status(400).json({ success: false, message: 'Only suspended campaigns can be restored' });
    }

    campaign.status = 'active';
    campaign.suspension.restoredAt = new Date();
    campaign.auditHistory.push({ action: 'restored', byName: req.user.fullName || '', byRole: req.user.role || '', at: new Date() });
    await campaign.save();

    const io = getIo(req);
    await notifyUser({
      userId: campaign.createdBy,
      actorId: req.user._id,
      title: 'Campaign restored',
      message: `Your campaign "${campaign.title}" has been restored and is live again.`,
      type: 'campaign_status',
      campaignId: campaign._id,
      io,
    });
    io?.to(campaign._id.toString()).emit('campaign:statusUpdate', { campaign });
    await logAction({ user: req.user, action: 'campaign_restore', resource: 'campaign', resourceId: campaign._id, details: { title: campaign.title }, req });

    res.json({ success: true, message: 'Campaign restored', data: { campaign } });
  } catch (err) {
    console.error('[Campaign] Failed to restore campaign:', err.message);
    res.status(500).json({ success: false, message: 'Failed to restore campaign' });
  }
};

// ── Self-service lifecycle (subcity / woreda owners) ─────────────────────────

// Hard-delete a campaign that has not started receiving verified funding. Only
// draft / rejected / suspended / cancelled campaigns can be removed; campaigns
// that ever received verified money stay in place for audit purposes.
const deleteCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (!canManageCampaign(req.user, campaign)) {
      return res.status(403).json({ success: false, message: 'You cannot delete this campaign' });
    }
    if (!['draft', 'rejected', 'suspended', 'cancelled'].includes(campaign.status)) {
      return res.status(400).json({ success: false, message: 'Only draft, rejected, suspended or cancelled campaigns can be deleted' });
    }
    const verified = await Donation.countDocuments({ campaign: campaign._id, status: 'verified' });
    if (verified > 0) {
      return res.status(400).json({ success: false, message: 'This campaign has verified donations and cannot be deleted' });
    }

    await Promise.all([
      Campaign.deleteOne({ _id: campaign._id }),
      CampaignUpdate.deleteMany({ campaign: campaign._id }),
      CampaignProof.deleteMany({ campaign: campaign._id }),
      SavedCampaign.deleteMany({ campaign: campaign._id }),
      Donation.deleteMany({ campaign: campaign._id }),
    ]);

    const io = getIo(req);
    io?.to(campaign._id.toString()).emit('campaign:deleted', { id: campaign._id });
    await logAction({ user: req.user, action: 'campaign_delete', resource: 'campaign', resourceId: campaign._id, details: { title: campaign.title }, req });

    res.json({ success: true, message: 'Campaign deleted' });
  } catch (err) {
    console.error('[Campaign] Failed to delete campaign:', err.message);
    res.status(500).json({ success: false, message: 'Failed to delete campaign' });
  }
};

// Activate a campaign so it becomes publicly visible and accepts donations.
const activateCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (!canManageCampaign(req.user, campaign)) {
      return res.status(403).json({ success: false, message: 'You cannot activate this campaign' });
    }
    if (campaign.status === 'active') {
      return res.json({ success: true, message: 'Campaign is already active', data: { campaign } });
    }
    if (!['draft', 'rejected', 'suspended', 'cancelled'].includes(campaign.status)) {
      return res.status(400).json({ success: false, message: 'Only draft, rejected, suspended or cancelled campaigns can be activated' });
    }

    campaign.status = 'active';
    campaign.rejectReason = '';
    campaign.auditHistory.push({ action: 'activated', byName: req.user.fullName || '', byRole: req.user.role || '', at: new Date(), note: 'Campaign activated by owner' });
    await campaign.save();

    const io = getIo(req);
    await notifyUser({
      userId: campaign.createdBy,
      actorId: req.user._id,
      title: 'Campaign activated',
      message: `Your campaign "${campaign.title}" is now live and accepting donations.`,
      type: 'campaign_status',
      campaignId: campaign._id,
      io,
    });
    io?.to(campaign._id.toString()).emit('campaign:statusUpdate', { campaign });
    await logAction({ user: req.user, action: 'campaign_activate', resource: 'campaign', resourceId: campaign._id, details: { title: campaign.title }, req });

    res.json({ success: true, message: 'Campaign activated', data: { campaign } });
  } catch (err) {
    console.error('[Campaign] Failed to activate campaign:', err.message);
    res.status(500).json({ success: false, message: 'Failed to activate campaign' });
  }
};

// Deactivate a live campaign (suspends donations + hides it from public lists).
const deactivateCampaign = async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (!canManageCampaign(req.user, campaign)) {
      return res.status(403).json({ success: false, message: 'You cannot deactivate this campaign' });
    }
    if (campaign.status !== 'active') {
      return res.status(400).json({ success: false, message: 'Only active campaigns can be deactivated' });
    }

    campaign.status = 'suspended';
    campaign.suspension = {
      reason: reason || 'Deactivated by administrator',
      suspendedBy: req.user.fullName || '',
      suspendedAt: new Date(),
      restoredAt: null,
    };
    campaign.auditHistory.push({ action: 'deactivated', byName: req.user.fullName || '', byRole: req.user.role || '', at: new Date(), note: reason || 'Deactivated by administrator' });
    await campaign.save();

    const io = getIo(req);
    await notifyUser({
      userId: campaign.createdBy,
      actorId: req.user._id,
      title: 'Campaign deactivated',
      message: `Your campaign "${campaign.title}" was deactivated${reason ? `: ${reason}` : '.'}`,
      type: 'campaign_status',
      campaignId: campaign._id,
      io,
    });
    io?.to(campaign._id.toString()).emit('campaign:statusUpdate', { campaign });
    await logAction({ user: req.user, action: 'campaign_deactivate', resource: 'campaign', resourceId: campaign._id, details: { title: campaign.title, reason }, req });

    res.json({ success: true, message: 'Campaign deactivated', data: { campaign } });
  } catch (err) {
    console.error('[Campaign] Failed to deactivate campaign:', err.message);
    res.status(500).json({ success: false, message: 'Failed to deactivate campaign' });
  }
};

// Compact campaign + donation stats for the subcity / woreda dashboard overview.
const getCampaignDashboardStats = async (req, res) => {
  try {
    const scope = buildCampaignScope(req.user);
    const owned = await Campaign.find(scope).select('_id').lean();
    const ids = owned.map((c) => c._id);

    const [campaignAgg, donationAgg, recentDonors] = await Promise.all([
      Campaign.aggregate([
        { $match: scope },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            active: { $sum: { $cond: [{ $eq: ['$status', 'active'] }, 1, 0] } },
            raised: { $sum: '$raisedAmount' },
            goal: { $sum: '$goalAmount' },
          },
        },
      ]),
      ids.length
        ? Donation.aggregate([
            { $match: { campaign: { $in: ids }, status: 'verified' } },
            {
              $group: {
                _id: null,
                count: { $sum: 1 },
                amount: { $sum: { $cond: [{ $eq: ['$type', 'money'] }, '$amount', 0] } },
              },
            },
          ])
        : Promise.resolve([]),
      ids.length
        ? Donation.find({ campaign: { $in: ids }, status: 'verified' })
            .populate('campaign', 'title')
            .sort({ createdAt: -1 })
            .limit(5)
            .select('donorName donorPhone amount paymentMethod type createdAt campaign')
            .lean()
        : Promise.resolve([]),
    ]);

    const c = campaignAgg[0] || { total: 0, active: 0, raised: 0, goal: 0 };
    const d = donationAgg[0] || { count: 0, amount: 0 };

    res.json({
      success: true,
      data: {
        totalCampaigns: c.total,
        activeCampaigns: c.active,
        totalDonations: d.count,
        totalDonationAmount: d.amount,
        campaignProgress: c.goal > 0 ? Math.round((c.raised / c.goal) * 100) : 0,
        recentDonors,
      },
    });
  } catch (err) {
    console.error('[Campaign] Failed to fetch dashboard stats:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch dashboard stats' });
  }
};

// ── Fraud screening & review ────────────────────────────────────────────────

// Heuristic fraud screening. Returns { score, flags } where each flag carries a
// weight. A cumulative score of >= 40 puts the campaign in the admin fraud queue.
async function runFraudChecks(campaign) {
  const flags = [];
  const push = (weight, reason) => flags.push({ weight, reason });

  const desc = String(campaign.description || '').trim();
  if (campaign.goalAmount >= 5000000) push(30, 'Goal amount is unusually high for the area');
  if (desc.length < 50) push(25, 'Very short campaign description');
  if (!campaign.image) push(15, 'No campaign image provided');

  const rejections = (campaign.auditHistory || []).filter((a) => a.action === 'rejected').length;
  if (rejections >= 2) push(20, 'Campaign has been rejected repeatedly');

  if (campaign.status === 'active' && campaign.raisedAmount > 0) {
    const verifiedProofs = await CampaignProof.countDocuments({
      campaign: campaign._id,
      status: 'verified',
    });
    if (verifiedProofs === 0) push(20, 'Raised funds with no verified supporting evidence');
  }

  return { score: flags.reduce((s, f) => s + f.weight, 0), flags };
}

// Append only flags we do not already hold so re-running checks never piles up
// duplicate entries for the same reason.
function mergeFraudFlags(campaign, newFlags) {
  const reasons = new Set((campaign.fraudFlags || []).map((f) => f.reason));
  return newFlags
    .filter((f) => !reasons.has(f.reason))
    .map((f) => ({ reason: f.reason, weight: f.weight, source: 'auto', status: 'open' }));
}

// System admins: everything currently open or confirmed in the fraud queue.
const getFraudReview = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const skip = (page - 1) * limit;

    const query = {
      $or: [
        { fraudScore: { $gte: 40 } },
        { 'fraudFlags.status': { $in: ['open', 'confirmed'] } },
      ],
    };
    if (req.query.status === 'open' || req.query.status === 'confirmed') {
      query['fraudFlags.status'] = req.query.status;
    }
    if (req.query.q) {
      const rx = { $regex: esc(req.query.q), $options: 'i' };
      query.$and = [{ $or: [{ title: rx }, { description: rx }, { 'location.subcity': rx }] }];
    }

    const [campaigns, total] = await Promise.all([
      Campaign.find(query).sort({ fraudScore: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      Campaign.countDocuments(query),
    ]);

    res.json({ success: true, data: { campaigns, total, page, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[Campaign] Failed to fetch fraud review:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch fraud review' });
  }
};

const checkFraud = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const { score, flags } = await runFraudChecks(campaign);
    const added = mergeFraudFlags(campaign, flags);
    campaign.fraudScore = score;
    if (added.length) campaign.fraudFlags.push(...added);
    campaign.auditHistory.push({ action: 'fraud_check', byName: req.user.fullName || '', byRole: req.user.role || '', at: new Date() });
    await campaign.save();

    await logAction({ user: req.user, action: 'campaign_fraud_check', resource: 'campaign', resourceId: campaign._id, details: { title: campaign.title, score, added: added.length }, req });
    res.json({ success: true, message: 'Fraud checks completed', data: { fraudScore: score, added } });
  } catch (err) {
    console.error('[Campaign] Failed to run fraud checks:', err.message);
    res.status(500).json({ success: false, message: 'Failed to run fraud checks' });
  }
};

const reviewFraudFlag = async (req, res) => {
  try {
    const decision = req.body.decision === 'confirmed' ? 'confirmed' : 'dismissed';
    const note = String(req.body.note || '').trim();

    const campaign = await Campaign.findOne({ 'fraudFlags._id': req.params.flagId });
    if (!campaign) return res.status(404).json({ success: false, message: 'Flag not found' });

    const flag = campaign.fraudFlags.id(req.params.flagId);
    if (!flag) return res.status(404).json({ success: false, message: 'Flag not found' });

    flag.status = decision;
    flag.reviewedBy = req.user._id;
    flag.reviewedAt = new Date();
    flag.reviewNote = note;

    campaign.fraudScore = campaign.fraudFlags
      .filter((f) => f.status === 'open' || f.status === 'confirmed')
      .reduce((s, f) => s + (f.weight || 0), 0);
    campaign.auditHistory.push({
      action: decision === 'confirmed' ? 'fraud_confirmed' : 'fraud_dismissed',
      byName: req.user.fullName || '',
      byRole: req.user.role || '',
      at: new Date(),
      note,
    });
    await campaign.save();

    await logAction({ user: req.user, action: 'campaign_fraud_review', resource: 'campaign', resourceId: campaign._id, details: { title: campaign.title, decision, note }, req });
    res.json({ success: true, message: 'Fraud flag reviewed', data: { campaign } });
  } catch (err) {
    console.error('[Campaign] Failed to review fraud flag:', err.message);
    if (err.name === 'CastError') return res.status(400).json({ success: false, message: 'Invalid flag id' });
    res.status(500).json({ success: false, message: 'Failed to review fraud flag' });
  }
};

// Citizens flag a campaign they believe is suspicious; it lands in the admin queue.
const reportCampaign = async (req, res) => {
  try {
    const reason = String(req.body.reason || '').trim();
    if (!reason) return res.status(400).json({ success: false, message: 'A reason is required', field: 'reason' });

    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (!['active', 'pending', 'suspended', 'completed'].includes(campaign.status)) {
      return res.status(400).json({ success: false, message: 'This campaign cannot be reported' });
    }

    const already = (campaign.fraudFlags || []).find(
      (f) => f.source === 'citizen_report' && f.reportedBy && String(f.reportedBy) === String(req.user._id)
    );
    if (already) return res.json({ success: true, message: 'Campaign already reported' });

    campaign.fraudFlags.push({
      reason: `Citizen report: ${reason}`,
      weight: 35,
      source: 'citizen_report',
      reportedBy: req.user._id,
      reportNote: reason,
      status: 'open',
    });
    campaign.fraudScore = (campaign.fraudScore || 0) + 35;
    await campaign.save();

    await logAction({ user: req.user, action: 'campaign_reported', resource: 'campaign', resourceId: campaign._id, details: { title: campaign.title, reason }, req });
    res.status(201).json({ success: true, message: 'Campaign reported for review' });
  } catch (err) {
    console.error('[Campaign] Failed to report campaign:', err.message);
    res.status(500).json({ success: false, message: 'Failed to report campaign' });
  }
};

// ── Updates ──────────────────────────────────────────────────────────────────

const addCampaignUpdate = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (!canManageCampaign(req.user, campaign)) {
      return res.status(403).json({ success: false, message: 'You cannot post updates to this campaign' });
    }

    const message = String(req.body.message || '').trim();
    if (!message) return res.status(400).json({ success: false, message: 'Update message is required', field: 'message' });

    const update = await CampaignUpdate.create({
      campaign: campaign._id,
      author: req.user._id,
      authorName: req.user.fullName || '',
      authorRole: req.user.role || '',
      title: String(req.body.title || '').trim(),
      message,
      type: ['progress', 'milestone', 'reminder', 'completion'].includes(req.body.type) ? req.body.type : 'general',
      images: req.files ? req.files.map((f) => f.path) : [],
    });

    campaign.auditHistory.push({ action: 'update', byName: req.user.fullName || '', byRole: req.user.role || '', at: new Date(), note: 'Added campaign update' });
    await campaign.save();

    const io = getIo(req);
    await notifyDonors(req, campaign, `${req.user.fullName || 'The organizer'} posted an update to "${campaign.title}".`, 'campaign_update');
    io?.to(campaign._id.toString()).emit('campaign:update', { update });

    res.status(201).json({ success: true, message: 'Campaign update added', data: { update } });
  } catch (err) {
    console.error('[Campaign] Failed to add update:', err.message);
    res.status(500).json({ success: false, message: 'Failed to add update' });
  }
};

const getCampaignUpdates = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id).select('_id').lean();
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    const updates = await CampaignUpdate.find({ campaign: campaign._id }).sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, data: { updates } });
  } catch (err) {
    console.error('[Campaign] Failed to fetch updates:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch updates' });
  }
};

// ── Proofs ───────────────────────────────────────────────────────────────────

const uploadCampaignProof = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (!canManageCampaign(req.user, campaign)) {
      return res.status(403).json({ success: false, message: 'You cannot upload proofs to this campaign' });
    }

    const proof = await CampaignProof.create({
      campaign: campaign._id,
      uploader: req.user._id,
      uploaderName: req.user.fullName || '',
      uploaderRole: req.user.role || '',
      title: String(req.body.title || '').trim(),
      description: String(req.body.description || '').trim(),
      type: ['expense', 'milestone', 'completion'].includes(req.body.type) ? req.body.type : 'general',
      files: req.files ? req.files.map((f) => f.path) : [],
    });

    const io = getIo(req);
    await notifyApprovers(req, campaign, 'proof');
    io?.to(campaign._id.toString()).emit('campaign:proof', { proof });

    res.status(201).json({ success: true, message: 'Proof uploaded for verification', data: { proof } });
  } catch (err) {
    console.error('[Campaign] Failed to upload proof:', err.message);
    res.status(500).json({ success: false, message: 'Failed to upload proof' });
  }
};

const getCampaignProofs = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id).select('_id').lean();
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    const proofs = await CampaignProof.find({ campaign: campaign._id }).sort({ createdAt: -1 }).limit(100).lean();
    res.json({ success: true, data: { proofs } });
  } catch (err) {
    console.error('[Campaign] Failed to fetch proofs:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch proofs' });
  }
};

// All proofs awaiting verification across the campaigns the user manages,
// enriched with their campaign title for the dashboard queue view.
const getProofQueue = async (req, res) => {
  try {
    const scope = buildCampaignScope(req.user);
    const campaigns = await Campaign.find(scope).select('_id').lean();
    const campaignIds = campaigns.map((c) => c._id);

    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const skip = (page - 1) * limit;

    const query = campaignIds.length
      ? { campaign: { $in: campaignIds }, status: 'pending' }
      : { campaign: { $in: [] } };

    const [proofs, total] = await Promise.all([
      CampaignProof.find(query)
        .populate('campaign', 'title image status campaignLevel location')
        .sort({ createdAt: 1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      CampaignProof.countDocuments(query),
    ]);

    res.json({ success: true, data: { proofs, total, page, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[Campaign] Failed to fetch proof queue:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch proof queue' });
  }
};

const verifyProof = async (req, res) => {
  try {
    const note = String(req.body.note || '').trim();
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (!canManageCampaign(req.user, campaign) && !canApprove(req.user, campaign)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to verify proofs' });
    }

    const proof = await CampaignProof.findOneAndUpdate(
      { _id: req.params.proofId, campaign: campaign._id },
      {
        status: 'verified',
        verifiedBy: req.user._id,
        verifiedByName: req.user.fullName || '',
        verifiedAt: new Date(),
        verifiedNote: note,
      },
      { new: true }
    );
    if (!proof) return res.status(404).json({ success: false, message: 'Proof not found' });

    const io = getIo(req);
    await notifyUser({
      userId: proof.uploader,
      actorId: req.user._id,
      title: 'Proof verified',
      message: `Your proof for "${campaign.title}" was verified${note ? ` (${note})` : ''}.`,
      type: 'campaign_update',
      campaignId: campaign._id,
      io,
    });

    res.json({ success: true, message: 'Proof verified', data: { proof } });
  } catch (err) {
    console.error('[Campaign] Failed to verify proof:', err.message);
    res.status(500).json({ success: false, message: 'Failed to verify proof' });
  }
};

const rejectProof = async (req, res) => {
  try {
    const note = String(req.body.note || '').trim();
    const campaign = await Campaign.findById(req.params.id);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });
    if (!canManageCampaign(req.user, campaign) && !canApprove(req.user, campaign)) {
      return res.status(403).json({ success: false, message: 'You are not authorized to reject proofs' });
    }

    const proof = await CampaignProof.findOneAndUpdate(
      { _id: req.params.proofId, campaign: campaign._id },
      {
        status: 'rejected',
        verifiedBy: req.user._id,
        verifiedByName: req.user.fullName || '',
        verifiedAt: new Date(),
        verifiedNote: note,
      },
      { new: true }
    );
    if (!proof) return res.status(404).json({ success: false, message: 'Proof not found' });

    const io = getIo(req);
    await notifyUser({
      userId: proof.uploader,
      actorId: req.user._id,
      title: 'Proof rejected',
      message: `Your proof for "${campaign.title}" was rejected${note ? ` (${note})` : ''}.`,
      type: 'campaign_update',
      campaignId: campaign._id,
      io,
    });

    res.json({ success: true, message: 'Proof rejected', data: { proof } });
  } catch (err) {
    console.error('[Campaign] Failed to reject proof:', err.message);
    res.status(500).json({ success: false, message: 'Failed to reject proof' });
  }
};

// ── Saved campaigns (citizens) ───────────────────────────────────────────────

const saveCampaign = async (req, res) => {
  try {
    const campaign = await Campaign.findById(req.params.id).select('_id').lean();
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found' });

    const existing = await SavedCampaign.findOne({ user: req.user._id, campaign: campaign._id });
    if (!existing) await SavedCampaign.create({ user: req.user._id, campaign: campaign._id });

    res.status(201).json({ success: true, message: 'Campaign saved' });
  } catch (err) {
    console.error('[Campaign] Failed to save campaign:', err.message);
    if (err.code === 11000) return res.json({ success: true, message: 'Campaign already saved' });
    res.status(500).json({ success: false, message: 'Failed to save campaign' });
  }
};

const unSaveCampaign = async (req, res) => {
  try {
    await SavedCampaign.deleteOne({ user: req.user._id, campaign: req.params.id });
    res.json({ success: true, message: 'Campaign removed from saved' });
  } catch (err) {
    console.error('[Campaign] Failed to unsave campaign:', err.message);
    res.status(500).json({ success: false, message: 'Failed to remove saved campaign' });
  }
};

const getSavedCampaigns = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
    const skip = (page - 1) * limit;

    const [saved, total] = await Promise.all([
      SavedCampaign.find({ user: req.user._id })
        .populate({ path: 'campaign', match: { status: { $in: ['active', 'completed', 'suspended'] } } })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      SavedCampaign.countDocuments({ user: req.user._id }),
    ]);

    const campaigns = saved
      .filter((s) => s.campaign)
      .map((s) => s.campaign);

    res.json({ success: true, data: { campaigns, total, page, pages: Math.ceil(total / limit) } });
  } catch (err) {
    console.error('[Campaign] Failed to fetch saved campaigns:', err.message);
    res.status(500).json({ success: false, message: 'Failed to fetch saved campaigns' });
  }
};

module.exports = {
  // Shared scoping helpers (used by donationController).
  buildCampaignScope,
  canManageCampaign,
  canApprove,
  isSubcityAdmin,
  isWoredaAdmin,
  findApprovers,
  getCampaignCategories,
  getFeaturedCampaigns,
  getPublicCampaigns,
  getCampaignById,
  getManageCampaigns,
  getApprovals,
  getCampaignAnalytics,
  getCampaignDashboardStats,
  exportCampaigns,
  createCampaign,
  updateCampaign,
  submitCampaign,
  approveCampaign,
  rejectCampaign,
  completeCampaign,
  suspendCampaign,
  restoreCampaign,
  deleteCampaign,
  activateCampaign,
  deactivateCampaign,
  addCampaignUpdate,
  getCampaignUpdates,
  uploadCampaignProof,
  getCampaignProofs,
  getProofQueue,
  verifyProof,
  rejectProof,
  saveCampaign,
  unSaveCampaign,
  getSavedCampaigns,
  getFraudReview,
  checkFraud,
  reviewFraudFlag,
  reportCampaign,
};
