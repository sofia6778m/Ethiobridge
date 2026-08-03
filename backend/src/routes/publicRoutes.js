const express = require('express');
const router = express.Router();
const InfrastructureReport = require('../models/InfrastructureReport');
const EmergencyReport = require('../models/EmergencyReport');
const PublicComplaint = require('../models/PublicComplaint');
const User = require('../models/User');
const Department = require('../models/Department');
const { getRegionStats } = require('../controllers/adminController');
const { protect } = require('../middleware/auth');
const createNotification = require('../utils/createNotification');

// @desc  Active department list for public forms (complaint submission routing)
//        Optional ?subcity=<name|id> scopes the list to one subcity.
// @route GET /api/public/departments
// @access Public
router.get('/departments', async (req, res) => {
  try {
    const subcity = (req.query.subcity || '').trim();
    let filter = { status: 'Active' };
    if (subcity) {
      const Subcity = require('../models/Subcity');
      const sc = await Subcity.findOne({
        $or: [
          { name: { $regex: `^${subcity.replace(/[ _]+/g, '[ _]')}$`, $options: 'i' } },
          { nameLower: { $regex: `^${subcity.replace(/[ _]+/g, '[ _]')}$`, $options: 'i' } },
        ],
      }).lean();
      if (!sc) return res.status(404).json({ success: false, message: 'Subcity not found' });
      filter.subcityId = sc._id;
    }
    const departments = await Department.find(filter)
      .select('name')
      .sort({ name: 1 })
      .lean();
    res.json({ success: true, departments: departments.map(d => d.name) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @desc  Active subcity list for public complaint forms
// @route GET /api/public/subcities
// @access Public
router.get('/subcities', async (req, res) => {
  try {
    const Subcity = require('../models/Subcity');
    const subcities = await Subcity.find({ status: 'Active' })
      .select('name description')
      .sort({ name: 1 })
      .lean();
    res.json({ success: true, subcities: subcities.map(s => ({ name: s.name, description: s.description || '' })) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @desc  Woredas for a given subcity (drives the complaint form woreda dropdown)
// @route GET /api/public/woredas?subcity=<name>
// @access Public
router.get('/woredas', async (req, res) => {
  try {
    const subcity = (req.query.subcity || '').trim();
    if (!subcity) {
      return res.status(400).json({ success: false, message: 'A subcity query parameter is required' });
    }
    const Woreda = require('../models/Woreda');
    const woredas = await Woreda.find({
      subcity: { $regex: `^${subcity.replace(/[ _]+/g, '[ _]')}$`, $options: 'i' },
      status: 'Active',
    }).select('_id name').sort({ name: 1 }).lean();
    res.json({ success: true, woredas });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @desc  Public platform statistics for homepage counters
// @route GET /api/public/stats
router.get('/stats', async (req, res) => {
  try {
    const [
      totalReports, activeReports, resolvedReports,
      registeredCitizens, govOrgs, ngoOrgs, volunteers,
      publicComplaints, resolvedComplaints,
    ] = await Promise.all([
      Promise.all([
        InfrastructureReport.countDocuments(),
        EmergencyReport.countDocuments(),
        PublicComplaint.countDocuments(),
      ]).then(counts => counts.reduce((a, b) => a + b, 0)),
      Promise.all([
        InfrastructureReport.countDocuments({ status: { $in: ['Under Review', 'In Progress'] } }),
        EmergencyReport.countDocuments({ status: { $in: ['Active', 'In Progress'] } }),
      ]).then(counts => counts.reduce((a, b) => a + b, 0)),
      Promise.all([
        InfrastructureReport.countDocuments({ status: 'Resolved' }),
        EmergencyReport.countDocuments({ status: 'Resolved' }),
        PublicComplaint.countDocuments({ status: 'Resolved' }),
      ]).then(counts => counts.reduce((a, b) => a + b, 0)),
      User.countDocuments({ role: 'citizen' }),
      User.countDocuments({ role: 'government', isApproved: true }),
      User.countDocuments({ role: 'ngo', isApproved: true }),
      User.countDocuments({ role: 'volunteer' }),
      PublicComplaint.countDocuments(),
      PublicComplaint.countDocuments({ status: 'Resolved' }),
    ]);

    res.json({
      success: true,
      stats: {
        totalReports, activeReports, resolvedReports,
        registeredCitizens, govOrgs, ngoOrgs, volunteers,
        regionsCovered: 14,
        publicComplaints,
        resolvedComplaints,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @desc  Public region risk map stats
// @route GET /api/public/region-stats
router.get('/region-stats', getRegionStats);

// @desc  Public map markers - all verified reports with coordinates
// @route GET /api/public/map-markers
router.get('/map-markers', async (req, res) => {
  try {
    const [infra, emergency] = await Promise.all([
      InfrastructureReport.find({
        status: { $ne: 'Pending' }, latitude: { $exists: true }, longitude: { $exists: true },
      }).select('title category region latitude longitude status reportId'),
      EmergencyReport.find({
        status: { $nin: ['Pending', 'Rejected'] }, latitude: { $exists: true }, longitude: { $exists: true },
      }).select('title emergencyType region latitude longitude status reportId priorityLevel'),
    ]);

    res.json({
      success: true,
      markers: {
        infrastructure: infra.map(r => ({ ...r.toObject(), type: 'infrastructure' })),
        emergency: emergency.map(r => ({ ...r.toObject(), type: 'emergency' })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @desc  Get public volunteer list (for NGOs and approved orgs)
// @route GET /api/public/volunteers
// @access Private (ngo, government, admin)
router.get('/volunteers', protect, async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const query = { role: 'volunteer', isActive: true };
    if (search) {
      query.$or = [
        { fullName: { $regex: search, $options: 'i' } },
        { region: { $regex: search, $options: 'i' } },
      ];
    }
    const total = await User.countDocuments(query);
    const volunteers = await User.find(query)
      .select('fullName region city skills availability profileImage phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));
    res.json({ success: true, total, volunteers });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

// @desc  Submit contact form
// @route POST /api/public/contact
// @access Public
router.post('/contact', async (req, res) => {
  try {
    const { fullName, email, phone, subject, message } = req.body;
    if (!fullName || !email || !subject || !message) {
      return res.status(400).json({ success: false, message: 'Please fill all required fields' });
    }

    // Notify all admins about the contact submission
    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      await createNotification({
        recipient: admin._id,
        title: 'New Contact Form Submission',
        message: `${fullName} (${email}) submitted a contact form: "${subject}"`,
        type: 'system',
      });
    }

    res.status(201).json({ success: true, message: 'Contact form submitted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
});

module.exports = router;
