const Volunteer = require('../models/Volunteer');
const Campaign = require('../models/Campaign');
const createNotification = require('../utils/createNotification');
const { logAction } = require('../middleware/auditLog');

const getIo = (req) => req.app?.get('io') || null;

const OFFICE_ROLES = ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'woreda', 'SUBCITY_HEAD', 'WOREDA_HEAD'];
const isOfficeRole = (role) => OFFICE_ROLES.includes(role);
const isAdminRole = (role) => ['admin', 'ADMIN'].includes(role);

const normalizePhone = (phone) => String(phone || '').replace(/[\s\-().]/g, '');
const isValidPhone = (phone) => /^\+?[0-9]{9,15}$/.test(normalizePhone(phone));

const SUB_CITY_LABELS = { subcity_bole: 'Bole', subcity_yeka: 'Yeka', subcity_lemmi_kura: 'Lemmi Kura' };

// ── Public registration ──────────────────────────────────────────────────────
exports.registerVolunteer = async (req, res) => {
  try {
    const { campaign: campaignId, fullName, phone, email, area, skills, availability, message } = req.body;

    if (!campaignId) return res.status(400).json({ success: false, message: 'Campaign is required.' });
    if (!fullName || !phone) return res.status(400).json({ success: false, message: 'Full name and phone number are required.' });
    if (!isValidPhone(phone)) return res.status(400).json({ success: false, message: 'Please enter a valid phone number (e.g. +251911000000).' });

    const campaign = await Campaign.findById(campaignId);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found.' });
    if (campaign.status !== 'active') return res.status(400).json({ success: false, message: 'This campaign is not accepting volunteers right now.' });

    const normalizedPhone = normalizePhone(phone);

    // Duplicate prevention (same phone + campaign, pending).
    const duplicate = await Volunteer.findOne({
      campaign: campaignId,
      phone: { $regex: `^${normalizedPhone.replace(/^\+/, '\\+?')}$`, $options: 'i' },
      status: { $in: ['pending', 'approved'] },
    }).lean();
    if (duplicate) {
      return res.status(409).json({ success: false, message: 'You have already registered as a volunteer for this campaign.' });
    }

    const volunteer = await Volunteer.create({
      campaign: campaignId,
      user: req.user?._id || undefined,
      fullName: String(fullName).trim().slice(0, 120),
      phone: normalizedPhone,
      email: email ? String(email).toLowerCase().trim().slice(0, 120) : '',
      subcity: campaign.subcity || '',
      woreda: campaign.woreda || '',
      area: String(area || '').slice(0, 200),
      skills: String(skills || '').slice(0, 500),
      availability: String(availability || '').slice(0, 300),
      message: String(message || '').slice(0, 1000),
    });

    await logAction({ user: req.user, action: 'volunteer_registered', resource: 'volunteers', resourceId: volunteer._id, details: { campaign: campaign.title, fullName: volunteer.fullName }, req });

    const io = getIo(req);
    await createNotification({
      recipient: campaign.createdBy,
      title: 'New Volunteer Registration',
      message: `${volunteer.fullName} volunteered for "${campaign.title}". Review their registration in your dashboard.`,
      type: 'volunteer_registered',
      relatedReport: campaign._id,
      relatedReportType: 'campaign',
      io,
    });

    res.status(201).json({ success: true, data: volunteer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Citizen: my volunteering ──────────────────────────────────────────────────
exports.getMyVolunteering = async (req, res) => {
  try {
    const { status, page = 1, limit = 50 } = req.query;
    const query = { user: req.user._id };
    if (status) query.status = status;

    const total = await Volunteer.countDocuments(query);
    const volunteers = await Volunteer.find(query)
      .populate('campaign', 'title image subcity woreda status category')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, data: volunteers, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Office / Admin listing ────────────────────────────────────────────────────
// Builds a filter for volunteers belonging to the office's own campaigns.
const buildOfficeVolunteerQuery = async (req) => {
  const user = req.user;
  if (isAdminRole(user.role)) return {};
  if (!isOfficeRole(user.role)) return { user: user._id };

  const subcityRoles = ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura', 'SUBCITY_HEAD'];
  const woredaRoles = ['woreda', 'WOREDA_HEAD'];

  let scope = null;
  if (subcityRoles.includes(user.role)) {
    scope = { subcity: user.subcity || SUB_CITY_LABELS[user.role] || '' };
  } else if (woredaRoles.includes(user.role)) {
    scope = { woreda: user.woredaName || user.woreda || '' };
  }
  if (!scope || !Object.values(scope)[0]) {
    const campaigns = await Campaign.find({ createdBy: user._id }).select('_id').lean();
    return { campaign: { $in: campaigns.map((c) => c._id) } };
  }
  return scope;
};

exports.getVolunteers = async (req, res) => {
  try {
    const { status, campaign: campaignId, search, page = 1, limit = 25 } = req.query;
    const query = await buildOfficeVolunteerQuery(req);
    if (status) query.status = status;
    if (campaignId) query.campaign = campaignId;
    if (search) {
      const term = String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      query.$or = [
        { fullName: { $regex: term, $options: 'i' } },
        { phone: { $regex: term, $options: 'i' } },
        { email: { $regex: term, $options: 'i' } },
      ];
    }

    const total = await Volunteer.countDocuments(query);
    const volunteers = await Volunteer.find(query)
      .populate('campaign', 'title image status subcity woreda category')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    res.json({ success: true, data: volunteers, total, page: parseInt(page), pages: Math.ceil(total / limit) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCampaignVolunteers = async (req, res) => {
  try {
    const { status } = req.query;
    const campaign = await Campaign.findById(req.params.campaignId);
    if (!campaign) return res.status(404).json({ success: false, message: 'Campaign not found.' });

    const isAdmin = isAdminRole(req.user.role);
    const isOwner = String(campaign.createdBy) === String(req.user._id);
    const inScope = isOfficeRole(req.user.role) && (
      (campaign.subcity || '').toLowerCase() === (req.user.subcity || SUB_CITY_LABELS[req.user.role] || '').toLowerCase() ||
      (campaign.woreda || '').toLowerCase() === (req.user.woredaName || req.user.woreda || '').toLowerCase()
    );
    if (!isAdmin && !isOwner && !inScope) {
      return res.status(403).json({ success: false, message: 'You are not authorized to view these volunteers.' });
    }

    const query = { campaign: campaign._id };
    if (status) query.status = status;

    const volunteers = await Volunteer.find(query)
      .populate('campaign', 'title')
      .sort({ createdAt: -1 });

    res.json({ success: true, data: volunteers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getVolunteerStats = async (req, res) => {
  try {
    const query = await buildOfficeVolunteerQuery(req);
    const [stats] = await Volunteer.aggregate([
      { $match: query },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          pending: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, 1, 0] } },
          approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } },
          declined: { $sum: { $cond: [{ $eq: ['$status', 'declined'] }, 1, 0] } },
          attended: { $sum: { $cond: [{ $eq: ['$status', 'attended'] }, 1, 0] } },
        },
      },
    ]);
    res.json({
      success: true,
      data: stats || { total: 0, pending: 0, approved: 0, declined: 0, attended: 0 },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// ── Office / Admin status management ──────────────────────────────────────────
exports.updateVolunteerStatus = async (req, res) => {
  try {
    const volunteer = await Volunteer.findById(req.params.id).populate('campaign', 'title subcity woreda createdBy');
    if (!volunteer) return res.status(404).json({ success: false, message: 'Volunteer not found.' });

    const isAdmin = isAdminRole(req.user.role);
    const isOwner = volunteer.campaign && String(volunteer.campaign.createdBy) === String(req.user._id);
    const inScope = isOfficeRole(req.user.role) && volunteer.campaign && (
      (volunteer.campaign.subcity || '').toLowerCase() === (req.user.subcity || SUB_CITY_LABELS[req.user.role] || '').toLowerCase() ||
      (volunteer.campaign.woreda || '').toLowerCase() === (req.user.woredaName || req.user.woreda || '').toLowerCase()
    );
    if (!isAdmin && !isOwner && !inScope) {
      return res.status(403).json({ success: false, message: 'You are not authorized to manage this volunteer.' });
    }

    const { status, note } = req.body;
    if (!['pending', 'approved', 'declined', 'attended'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Invalid volunteer status.' });
    }

    volunteer.status = status;
    volunteer.statusNote = String(note || '').slice(0, 500);
    volunteer.updatedBy = req.user._id;
    if (status === 'approved' && !volunteer.approvedAt) volunteer.approvedAt = new Date();
    if (status === 'attended') volunteer.attendedAt = new Date();
    await volunteer.save();

    // Keep the campaign's volunteersEngaged impact metric in sync.
    if (volunteer.campaign) {
      const attendedCount = await Volunteer.countDocuments({ campaign: volunteer.campaign._id, status: 'attended' });
      const engagedCount = await Volunteer.countDocuments({ campaign: volunteer.campaign._id, status: { $in: ['approved', 'attended'] } });
      await Campaign.updateOne(
        { _id: volunteer.campaign._id },
        { $set: { 'impactMetrics.volunteersEngaged': attendedCount, 'impactMetrics.volunteersApproved': engagedCount } }
      );
    }

    await logAction({ user: req.user, action: 'volunteer_status_updated', resource: 'volunteers', resourceId: volunteer._id, details: { fullName: volunteer.fullName, status, note: volunteer.statusNote }, req });

    // Notify the volunteer (in-app if they have an account).
    const io = getIo(req);
    if (volunteer.user) {
      const messageMap = {
        approved: 'Your volunteer application has been approved.',
        declined: 'Your volunteer application was not approved. ' + (volunteer.statusNote || ''),
        attended: 'You were marked as attended. Thank you for volunteering!',
      };
      await createNotification({
        recipient: volunteer.user,
        title: `Volunteer ${status}`,
        message: messageMap[status] || `Your volunteer status is now ${status}.`,
        type: status === 'approved' ? 'volunteer_approved' : status === 'declined' ? 'volunteer_declined' : 'volunteer_registered',
        relatedReport: volunteer.campaign._id,
        relatedReportType: 'campaign',
        io,
      });
    }

    res.json({ success: true, data: volunteer });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteVolunteer = async (req, res) => {
  try {
    const volunteer = await Volunteer.findById(req.params.id);
    if (!volunteer) return res.status(404).json({ success: false, message: 'Volunteer not found.' });

    const isAdmin = isAdminRole(req.user.role);
    const isOwner = volunteer.campaign && String(volunteer.campaign.createdBy) === String(req.user._id);
    if (!isAdmin && !isOwner) {
      return res.status(403).json({ success: false, message: 'You are not authorized to delete this volunteer.' });
    }

    await volunteer.deleteOne();
    await logAction({ user: req.user, action: 'volunteer_deleted', resource: 'volunteers', resourceId: volunteer._id, details: { fullName: volunteer.fullName }, req });
    res.json({ success: true, message: 'Volunteer registration removed.' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
