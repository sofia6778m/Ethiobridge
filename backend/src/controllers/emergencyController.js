const EmergencyReport = require('../models/EmergencyReport');
const Assignment = require('../models/Assignment');
const createNotification = require('../utils/createNotification');
const { notifyUsers } = require('../services/notificationService');
const User = require('../models/User');
const { resolveDepartment } = require('../config/departmentRouting');

const getIo = (req) => req.app?.get('io') || null;

const EMERGENCY_ORG_MAP = {
  'Flood':             resolveDepartment('emergency', 'Flood'),
  'Fire':              resolveDepartment('emergency', 'Fire'),
  'Landslide':         resolveDepartment('emergency', 'Landslide'),
  'Drought':           resolveDepartment('emergency', 'Drought'),
  'Food Shortage':     resolveDepartment('emergency', 'Food Shortage'),
  'Medical Emergency': resolveDepartment('emergency', 'Medical Emergency'),
  'Disease Outbreak':  resolveDepartment('emergency', 'Disease Outbreak'),
  'Other':             resolveDepartment('emergency', 'Other'),
};

const findResponsibleUser = async (report) => {
  const orgName = EMERGENCY_ORG_MAP[report.emergencyType] || 'Disaster Risk Management';
  const region = report.region;

  const regionMatch = await User.findOne({
    role: 'government',
    isApproved: true,
    organizationName: orgName,
    region,
  }).select('_id fullName organizationName region');

  if (regionMatch) return regionMatch;

  const orgMatch = await User.findOne({
    role: 'government',
    isApproved: true,
    organizationName: orgName,
  }).select('_id fullName organizationName region');

  if (orgMatch) return orgMatch;

  const fallback = await User.findOne({
    role: 'government',
    isApproved: true,
  }).select('_id fullName organizationName region');

  return fallback || null;
};

const notifyEmergencyStakeholders = async (req, { report, title, message, type, excludeUser }) => {
  const io = getIo(req);
  const userIds = new Set();
  const excludeKey = excludeUser?.toString();

  if (report.submittedBy && report.submittedBy.toString() !== excludeKey) {
    userIds.add(report.submittedBy.toString());
  }

  const admins = await User.find({ role: 'admin' }).select('_id');
  for (const a of admins) {
    if (a._id.toString() !== excludeKey) userIds.add(a._id.toString());
  }

  const govUsers = await User.find({ role: 'government', isApproved: true }).select('_id');
  for (const g of govUsers) {
    if (g._id.toString() !== excludeKey) userIds.add(g._id.toString());
  }

  for (const uid of userIds) {
    await createNotification({
      recipient: uid,
      actorId: excludeUser,
      title,
      message,
      type,
      relatedReport: report._id,
      relatedReportType: 'emergency',
      io,
    });
  }
};

const createReport = async (req, res) => {
  try {
    const { title, description, emergencyType, urgencyLevel, priorityLevel, numberOfPeopleAffected, region, city, subcity, specificLocation, latitude, longitude } = req.body;
    const photos = req.files ? req.files.map(f => f.path) : [];

    const targetOrg = EMERGENCY_ORG_MAP[emergencyType] || 'Disaster Risk Management';

    const report = await EmergencyReport.create({
      title, description, emergencyType, urgencyLevel, priorityLevel,
      numberOfPeopleAffected, region, city, subcity, specificLocation, latitude, longitude,
      photos, submittedBy: req.user._id,
      department: targetOrg,
      autoAssignedOrganization: targetOrg,
      assignedDepartment: targetOrg,
      responsibleOrganization: targetOrg,
    });

    report.timeline.push({
      action: 'created',
      description: `Emergency report "${title}" submitted — routed to ${targetOrg}`,
      performedBy: req.user._id,
      performedByName: req.user.fullName,
      performedByRole: req.user.role,
      metadata: { routedTo: targetOrg, emergencyType },
    });
    await report.save();

    const io = getIo(req);
    if (io) {
      io.emit('report:created', {
        reportId: report.reportId,
        title: report.title,
        category: report.emergencyType,
        region: report.region,
        status: report.status,
      });
    }

    const admins = await User.find({ role: 'admin' });
    await notifyUsers({
      userIds: admins.map((a) => a._id),
      actorId: req.user._id,
      title: 'New Emergency Report',
      message: `Urgent: "${title}" (${emergencyType}) reported in ${region}. Routed to ${targetOrg}.`,
      type: 'new_report',
      relatedReport: report._id,
      relatedReportType: 'emergency',
      io,
    });

    const targetGovUsers = await User.find({
      role: 'government',
      isApproved: true,
      organizationName: targetOrg,
    });
    await notifyUsers({
      userIds: targetGovUsers.map((g) => g._id),
      actorId: req.user._id,
      title: 'New Emergency in Your Department',
      message: `Urgent: "${title}" (${emergencyType}) reported in ${region}. Routed to ${targetOrg}.`,
      type: 'new_report',
      relatedReport: report._id,
      relatedReportType: 'emergency',
      io,
    });

    const otherGovUsers = await User.find({
      role: 'government',
      isApproved: true,
      organizationName: { $ne: targetOrg },
    });
    await notifyUsers({
      userIds: otherGovUsers.map((g) => g._id),
      actorId: req.user._id,
      title: 'New Emergency Report',
      message: `Urgent: "${title}" (${emergencyType}) reported in ${region}. Routed to ${targetOrg}.`,
      type: 'new_report',
      relatedReport: report._id,
      relatedReportType: 'emergency',
      io,
    });

    res.status(201).json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPublicReports = async (req, res) => {
  try {
    const { emergencyType, region, status, priorityLevel, search, page = 1, limit = 10 } = req.query;
    const query = { status: { $nin: ['Pending', 'Rejected'] } };

    if (emergencyType) query.emergencyType = emergencyType;
    if (region) query.region = region;
    if (status) query.status = status;
    if (priorityLevel) query.priorityLevel = priorityLevel;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { reportId: { $regex: search, $options: 'i' } },
        { region: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await EmergencyReport.countDocuments(query);
    const reports = await EmergencyReport.find(query)
      .populate('submittedBy', 'fullName region')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), reports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllReports = async (req, res) => {
  try {
    const { emergencyType, region, status, priorityLevel, search, page = 1, limit = 10 } = req.query;
    const query = {};

    if (emergencyType) query.emergencyType = emergencyType;
    if (region) query.region = region;
    if (status) query.status = status;
    if (priorityLevel) query.priorityLevel = priorityLevel;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { reportId: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await EmergencyReport.countDocuments(query);
    const reports = await EmergencyReport.find(query)
      .populate('submittedBy', 'fullName email phone')
      .populate('verifiedBy', 'fullName')
      .populate('assignedTo', 'fullName organizationName role')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), reports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getReport = async (req, res) => {
  try {
    const report = await EmergencyReport.findById(req.params.id)
      .populate('submittedBy', 'fullName region')
      .populate('verifiedBy', 'fullName')
      .populate('assignedTo', 'fullName organizationName role');

    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getMyReports = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const query = { submittedBy: req.user._id };
    if (status) query.status = status;

    const total = await EmergencyReport.countDocuments(query);
    const reports = await EmergencyReport.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), reports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const verifyReport = async (req, res) => {
  try {
    const { action, note } = req.body;
    const report = await EmergencyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const previousStatus = report.status;
    report.verifiedBy = req.user._id;
    report.verifiedAt = new Date();
    const io = getIo(req);

    if (action === 'reject') {
      report.status = 'Rejected';
      report.progressHistory.push({ status: 'Rejected', note, updatedBy: req.user._id });
      report.timeline.push({
        action: 'rejected',
        description: `Emergency report rejected: ${note}`,
        note,
        previousStatus,
        newStatus: 'Rejected',
        performedBy: req.user._id,
        performedByName: req.user.fullName,
        performedByRole: req.user.role,
      });
      await report.save();

      await createNotification({
        recipient: report.submittedBy,
        actorId: req.user._id,
        title: 'Emergency Report Rejected',
        message: `Your emergency report "${report.title}" has been rejected. Reason: ${note || 'No reason'}`,
        type: 'verification',
        relatedReport: report._id,
        relatedReportType: 'emergency',
        io,
      });

      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        if (admin._id.toString() !== req.user._id.toString()) {
          await createNotification({
            recipient: admin._id,
            actorId: req.user._id,
            title: 'Emergency Report Rejected',
            message: `Emergency "${report.title}" (${report.reportId}) has been rejected. Reason: ${note || 'No reason'}`,
            type: 'report_status',
            relatedReport: report._id,
            relatedReportType: 'emergency',
            io,
          });
        }
      }

      return res.json({ success: true, report });
    }

    report.status = 'Active';
    report.progressHistory.push({ status: 'Active', note, updatedBy: req.user._id });
    report.timeline.push({
      action: 'approved',
      description: 'Emergency report approved by administrator',
      note,
      previousStatus,
      newStatus: 'Active',
      performedBy: req.user._id,
      performedByName: req.user.fullName,
      performedByRole: req.user.role,
    });
    await report.save();

    const orgName = EMERGENCY_ORG_MAP[report.emergencyType] || 'Disaster Risk Management';
    const responsibleUser = await findResponsibleUser(report);

    if (responsibleUser) {
      report.assignedToUser = responsibleUser._id;
      report.assignedDepartment = orgName;
      report.assignedAt = new Date();
      report.responsibleOrganization = orgName;
      report.timeline.push({
        action: 'assigned',
        description: `Emergency auto-assigned to ${responsibleUser.fullName} (${orgName}) based on type routing`,
        note: `Automatic assignment based on ${report.emergencyType} -> ${orgName}`,
        previousStatus: 'Active',
        newStatus: 'Active',
        performedBy: req.user._id,
        performedByName: req.user.fullName,
        performedByRole: req.user.role,
        metadata: { assignedTo: responsibleUser.fullName, department: orgName, autoAssigned: true },
      });
      await report.save();

      await Assignment.create({
        report: report._id,
        assignedTo: responsibleUser._id,
        assignedBy: req.user._id,
        assignedDepartment: orgName,
        notes: `Auto-assigned based on emergency type routing (${report.emergencyType} -> ${orgName})`,
      });

      if (responsibleUser._id.toString() !== req.user._id.toString()) {
        await createNotification({
          recipient: responsibleUser._id,
          actorId: req.user._id,
          title: 'Emergency Report Assignment',
          message: `Emergency "${report.title}" (${report.reportId}) has been automatically assigned to you. Department: ${orgName}.`,
          type: 'assignment',
          relatedReport: report._id,
          relatedReportType: 'emergency',
          io,
        });
      }

      await createNotification({
        recipient: report.submittedBy,
        actorId: req.user._id,
        title: 'Emergency Verified & Assigned',
        message: `Your emergency "${report.title}" has been verified and assigned to ${responsibleUser.fullName} (${orgName}).`,
        type: 'report_status',
        relatedReport: report._id,
        relatedReportType: 'emergency',
        io,
      });

      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        if (admin._id.toString() !== req.user._id.toString() && admin._id.toString() !== responsibleUser._id.toString()) {
          await createNotification({
            recipient: admin._id,
            actorId: req.user._id,
            title: 'Emergency Auto-Assigned',
            message: `Emergency "${report.title}" (${report.reportId}) verified and auto-assigned to ${responsibleUser.fullName} (${orgName}).`,
            type: 'report_status',
            relatedReport: report._id,
            relatedReportType: 'emergency',
            io,
          });
        }
      }
    } else {
      await notifyEmergencyStakeholders(req, {
        report,
        title: 'Emergency Verified',
        message: `Emergency "${report.title}" (${report.reportId}) has been verified. No matching government user found for automatic assignment — manual assignment required.`,
        type: 'verification',
        excludeUser: req.user._id,
      });
    }

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { status, note, assistanceProvided } = req.body;
    const report = await EmergencyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    report.status = status;
    if (assistanceProvided) report.assistanceProvided = assistanceProvided;
    if (status === 'Resolved') report.resolvedAt = new Date();
    report.progressHistory.push({ status, note, updatedBy: req.user._id });
    await report.save();

    await notifyEmergencyStakeholders(req, {
      report,
      title: 'Emergency Status Updated',
      message: `Emergency report "${report.title}" (${report.reportId}) status changed to "${status}". ${note || ''}`,
      type: 'report_status',
      excludeUser: req.user._id,
    });

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc  NGO accepts an emergency request
// @route PUT /api/emergency/:id/accept
// @access Private (ngo, volunteer)
const acceptRequest = async (req, res) => {
  try {
    const report = await EmergencyReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    if (!report.assignedTo.includes(req.user._id)) {
      report.assignedTo.push(req.user._id);
      report.status = 'In Progress';
      report.progressHistory.push({ status: 'In Progress', note: `Accepted by ${req.user.fullName}`, updatedBy: req.user._id });
      await report.save();
    }

    const io = getIo(req);

    await createNotification({
      recipient: report.submittedBy,
      actorId: req.user._id,
      title: 'Help is on the way',
      message: `${req.user.organizationName || req.user.fullName} has accepted your emergency request "${report.title}".`,
      type: 'report_status',
      relatedReport: report._id,
      relatedReportType: 'emergency',
      io,
    });

    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      if (admin._id.toString() !== req.user._id.toString()) {
        await createNotification({
          recipient: admin._id,
          actorId: req.user._id,
          title: 'Emergency Request Accepted',
          message: `${req.user.organizationName || req.user.fullName} accepted emergency "${report.title}" (${report.reportId}).`,
          type: 'report_status',
          relatedReport: report._id,
          relatedReportType: 'emergency',
          io,
        });
      }
    }

    const govUsers = await User.find({ role: 'government', isApproved: true });
    for (const gov of govUsers) {
      if (gov._id.toString() !== req.user._id.toString()) {
        await createNotification({
          recipient: gov._id,
          actorId: req.user._id,
          title: 'Emergency Request Accepted',
          message: `${req.user.organizationName || req.user.fullName} accepted emergency "${report.title}" (${report.reportId}).`,
          type: 'report_status',
          relatedReport: report._id,
          relatedReportType: 'emergency',
          io,
        });
      }
    }

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteReport = async (req, res) => {
  try {
    const report = await EmergencyReport.findByIdAndDelete(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    res.json({ success: true, message: 'Report deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getGovernmentReports = async (req, res) => {
  try {
    const department = req.user.organizationName;
    if (!department) {
      return res.status(400).json({ success: false, message: 'No department assigned to your account' });
    }

    const {
      page = 1, limit = 20, status, urgencyLevel,
      region, emergencyType, search, sort = '-createdAt',
    } = req.query;

    const filter = { department };
    if (status) filter.status = status;
    if (urgencyLevel) filter.urgencyLevel = urgencyLevel;
    if (region) filter.region = region;
    if (emergencyType) filter.emergencyType = emergencyType;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { reportId: { $regex: search, $options: 'i' } },
      ];
    }

    const reports = await EmergencyReport.find(filter)
      .sort(sort)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .populate('submittedBy', 'fullName email phone')
      .populate('verifiedBy', 'fullName email')
      .populate('assignedTo', 'fullName email organizationName')
      .lean();

    const total = await EmergencyReport.countDocuments(filter);

    res.json({
      success: true,
      reports,
      total,
      pagination: {
        page: Number(page),
        limit: Number(limit),
        total,
        pages: Math.ceil(total / Number(limit)),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { createReport, getPublicReports, getAllReports, getReport, getMyReports, verifyReport, updateStatus, acceptRequest, deleteReport, getGovernmentReports };
