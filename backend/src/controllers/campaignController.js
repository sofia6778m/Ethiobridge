const Campaign = require('../models/Campaign');
const Donation = require('../models/Donation');
const Payment = require('../models/Payment');
const Receipt = require('../models/Receipt');
const User = require('../models/User');
const InfrastructureReport = require('../models/InfrastructureReport');
const EmergencyReport = require('../models/EmergencyReport');
const createNotification = require('../utils/createNotification');

const getIo = (req) => req.app?.get('io') || null;

const notify = async (req, users, { title, message, type, relatedId }) => {
  const io = getIo(req);
  for (const uid of users) {
    await createNotification({ recipient: uid, title, message, type, relatedReport: relatedId, relatedReportType: 'campaign', io });
  }
};

// ─── Campaign CRUD ───

exports.createCampaign = async (req, res) => {
  try {
    const { title, description, campaignType, goalAmount, endDate, location, image, tags, relatedReport, relatedReportModel } = req.body;

    if (req.user.role === 'citizen') {
      return res.status(403).json({ success: false, message: 'Citizens cannot create campaigns' });
    }
    if (req.user.role === 'ngo' && campaignType !== 'emergency') {
      return res.status(403).json({ success: false, message: 'NGOs can only create emergency campaigns' });
    }
    if (req.user.role === 'government' && campaignType === 'emergency') {
      return res.status(403).json({ success: false, message: 'Government cannot create emergency campaigns' });
    }

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

    const campaign = await Campaign.create({
      title, description, campaignType, goalAmount, endDate,
      location: location || {}, image, tags: tags || [],
      createdBy: req.user._id,
      relatedReport: relatedReport || undefined,
      relatedReportModel: relatedReportModel || undefined,
    });

    const admins = await User.find({ role: 'admin' }).select('_id');
    await notify(req, admins.map(a => a._id.toString()), {
      title: 'New Campaign Awaiting Approval',
      message: `"${campaign.title}" has been created and needs approval.`,
      type: 'campaign_approval',
      relatedId: campaign._id,
    });

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
    await campaign.save();

    await notify(req, [campaign.createdBy.toString()], {
      title: 'Campaign Approved',
      message: `Your campaign "${campaign.title}" has been approved and is now active.`,
      type: 'campaign_approved',
      relatedId: campaign._id,
    });

    res.json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getCampaigns = async (req, res) => {
  try {
    const { status, campaignType, page = 1, limit = 12, search } = req.query;
    const query = {};

    if (status) query.status = status;
    else if (!req.user || req.user.role === 'citizen' || !req.user) query.status = 'active';
    if (campaignType) query.campaignType = campaignType;
    if (search) query.title = { $regex: search, $options: 'i' };

    if (req.user && req.user.role === 'government') {
      if (!status && !campaignType) {
        query.createdBy = req.user._id;
      }
    }
    if (req.user && req.user.role === 'ngo') {
      if (!status && !campaignType) {
        query.createdBy = req.user._id;
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
    const { campaignType, page = 1, limit = 12 } = req.query;
    const query = { status: 'active' };
    if (campaignType) query.campaignType = campaignType;

    const total = await Campaign.countDocuments(query);
    const campaigns = await Campaign.find(query)
      .populate('createdBy', 'fullName organizationName')
      .sort({ isFeatured: -1, createdAt: -1 })
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
    res.json({ success: true, data: { ...campaign.toObject(), totalDonations, topDonors } });
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
    if (req.user.role === 'government' || req.user.role === 'ngo') {
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
    });

    res.status(201).json({ success: true, data: campaign });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
