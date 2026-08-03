const InfrastructureReport = require('../models/InfrastructureReport');
const Assignment = require('../models/Assignment');
const createNotification = require('../utils/createNotification');
const User = require('../models/User');
const { cloudinary } = require('../config/cloudinary');
const { logAction } = require('../middleware/auditLog');
const { generateReportPDF, generateBulkPDF } = require('../utils/pdfExport');
const { generateExcelXML } = require('../utils/excelExport');
const { resolveDepartment } = require('../config/departmentRouting');
const { verifySubmissionPassword } = require('../utils/verifySubmissionPassword');
const { createInfrastructureReport } = require('../utils/reportIdGenerator');

const CATEGORY_ORG_MAP = {
  'road_issue':         resolveDepartment('infrastructure', 'road_issue'),
  'electricity_issue':  resolveDepartment('infrastructure', 'electricity_issue'),
  'water_supply_issue': resolveDepartment('infrastructure', 'water_supply_issue'),
};

const findResponsibleUser = async (report) => {
  const orgName = CATEGORY_ORG_MAP[report.category] || 'General Services';
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

const emitToReportChannels = (req, event, data) => {
  try {
    const io = req.app?.get('io');
    if (io) {
      io.emit(event, data);
    }
  } catch (_) {}
};

const getIo = (req) => req.app?.get('io') || null;

const notifyAllStakeholders = async (req, { report, title, message, type, excludeUser }) => {
  const io = getIo(req);
  const userIds = new Set();

  if (report.submittedBy && report.submittedBy.toString() !== excludeUser?.toString()) {
    userIds.add(report.submittedBy.toString());
  }

  const admins = await User.find({ role: 'admin' }).select('_id');
  for (const a of admins) userIds.add(a._id.toString());

  const govUsers = await User.find({ role: 'government', isApproved: true }).select('_id');
  for (const g of govUsers) userIds.add(g._id.toString());

  for (const uid of userIds) {
    await createNotification({
      recipient: uid,
      title,
      message,
      type,
      relatedReport: report._id,
      relatedReportType: 'infrastructure',
      io,
    });
  }
};

const createReport = async (req, res) => {
  try {
    const {
      title, description, category, severityLevel, region, zone, woreda, kebele,
      city, subcity, woredaId, woredaName, specificLocation, latitude, longitude,
      address, incidentDate, department,
      reporterName, reporterEmail, reporterPhone,
    } = req.body;

    // Confirm the submitter's password against their account before accepting
    // the report. The password is verified, never stored on the report.
    try {
      await verifySubmissionPassword(req.user, req.body.password);
    } catch (pErr) {
      return res.status(pErr.status || 400).json({ success: false, message: pErr.message });
    }

    const photos = (req.files || []).filter(f => f.mimetype.startsWith('image/')).map(f => f.path);
    const videos = (req.files || []).filter(f => f.mimetype.startsWith('video/')).map(f => f.path);

    // If the citizen explicitly picked a department (e.g. Health, Electricity),
    // honour it. Otherwise fall back to the old category-based mapping.
    const dept = department || CATEGORY_ORG_MAP[category] || 'General Services';

    // The simplified form has no category picker — derive one from the chosen
    // department so the classic three keep their original category, and any
    // other department falls back to 'other'.
    const reportCategory = category || ({
      Electricity: 'electricity_issue',
      Road:        'road_issue',
      Water:       'water_supply_issue',
    }[dept] || 'other');

    // reportId is assigned atomically by the pre-save hook (counters
    // collection). createInfrastructureReport retries on the rare duplicate-key
    // case, pulling the next sequential number each attempt.
    const report = await createInfrastructureReport({
      title, description, category: reportCategory, severityLevel, region, zone, woreda, kebele,
      city, subcity, specificLocation,
      latitude: latitude ? Number(latitude) : undefined,
      longitude: longitude ? Number(longitude) : undefined,
      address, incidentDate: incidentDate ? new Date(incidentDate) : undefined,
      photos, videos,
      submittedBy: req.user._id,
      reporterName: reporterName || '',
      reporterEmail: reporterEmail || '',
      reporterPhone: reporterPhone || '',
      department: dept,
      autoAssignedOrganization: dept,
      // Store the woreda scope fields so the woreda/department dashboard
      // queries ({woredaId, department}) find this report immediately.
      woredaId: woredaId || undefined,
      woredaName: woredaName || '',
      currentLevel: 'kebele',
      status: 'Assigned',
    });

    report.timeline.push({
      action: 'created',
      description: `Report "${title}" submitted and routed to ${dept}`,
      performedBy: req.user._id,
      performedByName: req.user.fullName,
      performedByRole: req.user.role,
    });

    await report.save();

    const io = getIo(req);

    // Notify the department user(s) that match this exact woreda + department.
    // This is what makes the report appear in the department dashboard.
    if (woredaId && dept) {
      const deptUsers = await User.find({ role: 'department', woredaId, department: dept }).select('_id');
      for (const u of deptUsers) {
        await createNotification({
          recipient: u._id,
          title: 'New Report Assigned to Your Department',
          message: `A new report "${title}" has been submitted for ${dept} department.`,
          type: 'new_report',
          relatedReport: report._id,
          relatedReportType: 'infrastructure',
          io,
        });
      }
    }

    // Also notify the woreda manager for this woreda.
    if (woredaId) {
      const woredaUsers = await User.find({ role: 'woreda', woredaId }).select('_id');
      for (const u of woredaUsers) {
        await createNotification({
          recipient: u._id,
          title: 'New Infrastructure Report in Your Woreda',
          message: `New ${dept} report: "${title}"`,
          type: 'new_report',
          relatedReport: report._id,
          relatedReportType: 'infrastructure',
          io,
        });
      }
    }

    // Notify admins.
    const admins = await User.find({ role: 'admin' }).select('_id');
    for (const admin of admins) {
      await createNotification({
        recipient: admin._id,
        title: 'New Infrastructure Report',
        message: `New report "${title}" (${category}) submitted from ${region}.`,
        type: 'new_report',
        relatedReport: report._id,
        relatedReportType: 'infrastructure',
        io,
      });
    }

    await createNotification({
      recipient: report.submittedBy,
      title: 'Report Submitted',
      message: `Your report "${title}" has been submitted and routed to the ${dept} department.`,
      type: 'report_status',
      relatedReport: report._id,
      relatedReportType: 'infrastructure',
      io,
    });

    emitToReportChannels(req, 'report:created', { reportId: report.reportId, title: report.title, category: report.category, region: report.region, status: report.status });

    res.status(201).json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPublicReports = async (req, res) => {
  try {
    const { category, region, status, severityLevel, search, page = 1, limit = 10, assignedOrganization, dateFrom, dateTo } = req.query;
    const query = { status: { $nin: ['Pending', 'Rejected'] } };

    if (category) query.category = category;
    if (region) query.region = region;
    if (status) query.status = status;
    if (severityLevel) query.severityLevel = severityLevel;
    if (assignedOrganization) query.autoAssignedOrganization = assignedOrganization;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }
    if (search) {
      const re = { $regex: search, $options: 'i' };
      query.$or = [
        { title: re },
        { description: re },
        { reportId: re },
        { category: re },
        { region: re },
        { zone: re },
        { woreda: re },
        { kebele: re },
        { address: re },
        { city: re },
        { specificLocation: re },
      ];
    }

    const total = await InfrastructureReport.countDocuments(query);
    const reports = await InfrastructureReport.find(query)
      .populate('submittedBy', 'fullName region')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), reports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getPublicAutocomplete = async (req, res) => {
  try {
    const { q } = req.query;
    if (!q || q.trim().length < 1) {
      return res.json({ success: true, suggestions: [] });
    }

    const re = { $regex: q, $options: 'i' };
    const publicQuery = { status: { $nin: ['Pending', 'Rejected'] } };

    const [titles, categories, regions, zones, woredas, kebeles, addresses, reportIds] = await Promise.all([
      InfrastructureReport.distinct('title', { ...publicQuery, title: re }),
      InfrastructureReport.distinct('category', { ...publicQuery, category: re }),
      InfrastructureReport.distinct('region', { ...publicQuery, region: re }),
      InfrastructureReport.distinct('zone', { ...publicQuery, zone: { $regex: q, $options: 'i', $exists: true, $ne: null, $ne: '' } }),
      InfrastructureReport.distinct('woreda', { ...publicQuery, woreda: { $regex: q, $options: 'i', $exists: true, $ne: null, $ne: '' } }),
      InfrastructureReport.distinct('kebele', { ...publicQuery, kebele: { $regex: q, $options: 'i', $exists: true, $ne: null, $ne: '' } }),
      InfrastructureReport.distinct('address', { ...publicQuery, address: { $regex: q, $options: 'i', $exists: true, $ne: null, $ne: '' } }),
      InfrastructureReport.distinct('reportId', { ...publicQuery, reportId: re }),
    ]);

    const suggestions = [];
    const seen = new Set();
    const maxPerType = 5;

    const addSuggestions = (items, type, labelKey) => {
      let count = 0;
      for (const item of items) {
        if (count >= maxPerType) break;
        const val = typeof item === 'string' ? item.trim() : '';
        if (!val || seen.has(val.toLowerCase())) continue;
        seen.add(val.toLowerCase());
        suggestions.push({ text: val, type, label: val });
        count++;
      }
    };

    addSuggestions(categories, 'category', 'Category');
    addSuggestions(regions, 'region', 'Region');
    addSuggestions(titles, 'title', 'Report');
    addSuggestions(zones, 'zone', 'Zone');
    addSuggestions(woredas, 'woreda', 'Woreda');
    addSuggestions(kebeles, 'kebele', 'Kebele');
    addSuggestions(addresses, 'address', 'Address');
    addSuggestions(reportIds, 'reportId', 'Report ID');

    res.json({ success: true, suggestions });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAllReports = async (req, res) => {
  try {
    const { category, region, status, severityLevel, search, page = 1, limit = 10, assignedOrganization, dateFrom, dateTo } = req.query;
    const query = {};

    if (category) query.category = category;
    if (region) query.region = region;
    if (status) query.status = status;
    if (severityLevel) query.severityLevel = severityLevel;
    if (assignedOrganization) query.autoAssignedOrganization = assignedOrganization;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { reportId: { $regex: search, $options: 'i' } },
        { region: { $regex: search, $options: 'i' } },
      ];
    }

    const total = await InfrastructureReport.countDocuments(query);
    const reports = await InfrastructureReport.find(query)
      .populate('submittedBy', 'fullName email phone')
      .populate('verifiedBy', 'fullName')
      .populate('assignedTo', 'fullName organizationName')
      .populate('workCompletedBy', 'fullName')
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
    const report = await InfrastructureReport.findById(req.params.id)
      .populate('submittedBy', 'fullName region city phone')
      .populate('verifiedBy', 'fullName')
      .populate('assignedTo', 'fullName organizationName')
      .populate('workCompletedBy', 'fullName')
      .populate('timeline.performedBy', 'fullName organizationName');

    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getMyReports = async (req, res) => {
  try {
    const { status, category, page = 1, limit = 10 } = req.query;
    const query = { submittedBy: req.user._id };
    if (status) query.status = status;
    if (category) query.category = category;

    const total = await InfrastructureReport.countDocuments(query);
    const reports = await InfrastructureReport.find(query)
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
    const report = await InfrastructureReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const previousStatus = report.status;
    report.verifiedBy = req.user._id;
    report.verifiedAt = new Date();
    const io = getIo(req);

    if (action === 'reject') {
      report.status = 'Rejected';
      report.rejectionReason = note;

      report.progressHistory.push({ status: 'Rejected', note, updatedBy: req.user._id });
      report.timeline.push({
        action: 'rejected',
        description: `Report rejected: ${note}`,
        note,
        previousStatus,
        newStatus: 'Rejected',
        performedBy: req.user._id,
        performedByName: req.user.fullName,
        performedByRole: req.user.role,
      });
      await report.save();

      await notifyAllStakeholders(req, {
        report,
        title: 'Report Rejected',
        message: `Report "${report.title}" (${report.reportId}) has been rejected. Reason: ${note || 'No reason provided'}`,
        type: 'verification',
        excludeUser: req.user._id,
      });

      emitToReportChannels(req, 'report:updated', { reportId: report.reportId, status: report.status, title: report.title });
      return res.json({ success: true, report });
    }

    report.status = 'Approved';
    report.currentLevel = 'kebele';
    report.progressHistory.push({ status: 'Approved', note, updatedBy: req.user._id });
    report.timeline.push({
      action: 'approved',
      description: 'Report approved and forwarded to Kebele',
      note,
      previousStatus,
      newStatus: 'Approved',
      performedBy: req.user._id,
      performedByName: req.user.fullName,
      performedByRole: req.user.role,
    });
    report.forwardingHistory.push({
      fromLevel: 'citizen',
      fromOfficer: req.user._id,
      fromOfficerName: req.user.fullName,
      fromDepartment: 'Administration',
      toLevel: 'kebele',
      toDepartment: 'Kebele',
      comment: note || 'Report approved and forwarded to Kebele level',
      action: 'forward',
      timestamp: new Date(),
    });
    await report.save();

    const orgName = CATEGORY_ORG_MAP[report.category] || 'General Services';
    const responsibleUser = await findResponsibleUser(report);

    if (responsibleUser) {
      report.assignedTo = responsibleUser._id;
      report.assignedDepartment = orgName;
      report.assignedAt = new Date();
      report.responsibleOrganization = orgName;
      report.status = 'Assigned';
      report.progressHistory.push({ status: 'Assigned', note: `Auto-assigned to ${responsibleUser.fullName} (${orgName})`, updatedBy: req.user._id });
      report.timeline.push({
        action: 'assigned',
        description: `Report auto-assigned to ${responsibleUser.fullName} (${orgName}) based on category routing`,
        note: `Automatic assignment based on ${report.category} -> ${orgName}`,
        previousStatus: 'Approved',
        newStatus: 'Assigned',
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
        notes: `Auto-assigned based on category routing (${report.category} -> ${orgName})`,
      });

      await createNotification({
        recipient: responsibleUser._id,
        title: 'New Report Assignment',
        message: `Report "${report.title}" (${report.reportId}) has been automatically assigned to you. Organization: ${orgName}.`,
        type: 'assignment',
        relatedReport: report._id,
        relatedReportType: 'infrastructure',
        io,
      });

      await createNotification({
        recipient: report.submittedBy,
        title: 'Report Assigned',
        message: `Your report "${report.title}" has been approved and assigned to ${responsibleUser.fullName} (${orgName}).`,
        type: 'report_status',
        relatedReport: report._id,
        relatedReportType: 'infrastructure',
        io,
      });

      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        if (admin._id.toString() !== req.user._id.toString() && admin._id.toString() !== responsibleUser._id.toString()) {
          await createNotification({
            recipient: admin._id,
            title: 'Report Auto-Assigned',
            message: `Report "${report.title}" (${report.reportId}) has been approved and auto-assigned to ${responsibleUser.fullName} (${orgName}).`,
            type: 'report_status',
            relatedReport: report._id,
            relatedReportType: 'infrastructure',
            io,
          });
        }
      }
    } else {
      await notifyAllStakeholders(req, {
        report,
        title: 'Report Approved',
        message: `Report "${report.title}" (${report.reportId}) has been approved. No matching government user found for automatic assignment — manual assignment required.`,
        type: 'verification',
        excludeUser: req.user._id,
      });
    }

    emitToReportChannels(req, 'report:updated', { reportId: report.reportId, status: report.status, title: report.title });

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const assignReport = async (req, res) => {
  try {
    const { assignedTo, assignedDepartment, dueDate, notes, slaDays } = req.body;
    const report = await InfrastructureReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const assignee = await User.findById(assignedTo);
    if (!assignee) return res.status(404).json({ success: false, message: 'Assignee not found' });

    const previousStatus = report.status;
    report.assignedTo = assignedTo;
    report.assignedDepartment = assignedDepartment || report.assignedDepartment;
    report.assignedAt = new Date();
    report.dueDate = dueDate ? new Date(dueDate) : report.dueDate;
    if (slaDays) {
      report.slaDays = Number(slaDays);
      report.slaWarningAt = new Date(Date.now() + (Number(slaDays) - 1) * 86400000);
    }
    report.status = 'Assigned';
    report.progressHistory.push({ status: 'Assigned', note: `Assigned to ${assignee.fullName}`, updatedBy: req.user._id });
    report.timeline.push({
      action: 'assigned',
      description: `Report assigned to ${assignee.fullName} (${assignee.organizationName || assignee.role})`,
      note,
      previousStatus,
      newStatus: 'Assigned',
      performedBy: req.user._id,
      performedByName: req.user.fullName,
      performedByRole: req.user.role,
      metadata: { assignedTo: assignee.fullName, department: assignedDepartment, dueDate },
    });
    await report.save();

    await Assignment.create({
      report: report._id,
      assignedTo,
      assignedBy: req.user._id,
      assignedDepartment: report.assignedDepartment,
      dueDate: report.dueDate,
      notes,
    });

    const io = getIo(req);

    await createNotification({
      recipient: assignedTo,
      title: 'New Report Assignment',
      message: `You have been assigned report "${report.title}" (${report.reportId}).`,
      type: 'assignment',
      relatedReport: report._id,
      relatedReportType: 'infrastructure',
      io,
    });

    await createNotification({
      recipient: report.submittedBy,
      title: 'Report Assigned',
      message: `Your report "${report.title}" has been assigned to ${assignee.fullName}.`,
      type: 'report_status',
      relatedReport: report._id,
      relatedReportType: 'infrastructure',
      io,
    });

    const admins = await User.find({ role: 'admin' });
    for (const admin of admins) {
      if (admin._id.toString() !== req.user._id.toString() && admin._id.toString() !== assignedTo.toString()) {
        await createNotification({
          recipient: admin._id,
          title: 'Report Assigned',
          message: `Report "${report.title}" (${report.reportId}) has been assigned to ${assignee.fullName}.`,
          type: 'report_status',
          relatedReport: report._id,
          relatedReportType: 'infrastructure',
          io,
        });
      }
    }

    emitToReportChannels(req, 'report:assigned', { reportId: report.reportId, assignedTo: assignee.fullName, status: report.status });

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateStatus = async (req, res) => {
  try {
    const { status, note, afterPhotos, afterVideos } = req.body;
    const report = await InfrastructureReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const previousStatus = report.status;
    report.status = status;

    if (status === 'In Progress' && previousStatus !== 'In Progress') {
      report.timeline.push({
        action: 'work_started',
        description: 'Work started on the report',
        note,
        previousStatus,
        newStatus: status,
        performedBy: req.user._id,
        performedByName: req.user.fullName,
        performedByRole: req.user.role,
      });
      await notifyAllStakeholders(req, {
        report,
        title: 'Work Started',
        message: `Work has started on report "${report.title}" (${report.reportId}).`,
        type: 'report_status',
        excludeUser: req.user._id,
      });
    } else if (status === 'Completed') {
      report.completedAt = new Date();
      report.workCompletedBy = req.user._id;
      if (afterPhotos) report.afterPhotos = Array.isArray(afterPhotos) ? afterPhotos : [afterPhotos];
      if (afterVideos) report.afterVideos = Array.isArray(afterVideos) ? afterVideos : [afterVideos];
      report.timeline.push({
        action: 'work_completed',
        description: 'Work completed, awaiting citizen verification',
        note,
        previousStatus,
        newStatus: 'Citizen Verification',
        performedBy: req.user._id,
        performedByName: req.user.fullName,
        performedByRole: req.user.role,
        metadata: { afterPhotos: report.afterPhotos?.length || 0, afterVideos: report.afterVideos?.length || 0 },
      });
      report.status = 'Citizen Verification';
      await notifyAllStakeholders(req, {
        report,
        title: 'Work Completed — Verification Needed',
        message: `Work on report "${report.title}" (${report.reportId}) is complete. Citizen verification is pending.`,
        type: 'verification',
        excludeUser: req.user._id,
      });
    } else {
      report.timeline.push({
        action: 'status_changed',
        description: `Status changed from ${previousStatus} to ${status}`,
        note,
        previousStatus,
        newStatus: status,
        performedBy: req.user._id,
        performedByName: req.user.fullName,
        performedByRole: req.user.role,
      });
      await notifyAllStakeholders(req, {
        report,
        title: 'Report Status Updated',
        message: `Report "${report.title}" (${report.reportId}) status changed from "${previousStatus}" to "${status}". ${note || ''}`,
        type: 'report_status',
        excludeUser: req.user._id,
      });
    }

    if (status === 'Resolved') report.resolvedAt = new Date();
    report.progressHistory.push({ status, note, updatedBy: req.user._id });
    await report.save();

    emitToReportChannels(req, 'report:updated', { reportId: report.reportId, status: report.status, title: report.title });

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const citizenVerify = async (req, res) => {
  try {
    const { verified, note, rejectionPhotos, rejectionVideos } = req.body;
    const report = await InfrastructureReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    if (report.submittedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the report submitter can verify completion' });
    }

    report.citizenVerified = verified;
    report.citizenVerifiedAt = new Date();
    report.citizenVerificationNote = note;

    if (verified) {
      report.status = 'Resolved';
      report.resolvedAt = new Date();
      report.timeline.push({
        action: 'citizen_verified',
        description: 'Citizen confirmed the issue is resolved',
        note,
        previousStatus: 'Citizen Verification',
        newStatus: 'Resolved',
        performedBy: req.user._id,
        performedByName: req.user.fullName,
        performedByRole: 'citizen',
      });

      const io = getIo(req);
      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        await createNotification({
          recipient: admin._id,
          title: 'Report Resolved',
          message: `Report "${report.title}" (${report.reportId}) has been verified as resolved by the citizen.`,
          type: 'report_status',
          relatedReport: report._id,
          relatedReportType: 'infrastructure',
          io,
        });
      }
      const govUsers = await User.find({ role: 'government', isApproved: true });
      for (const gov of govUsers) {
        await createNotification({
          recipient: gov._id,
          title: 'Report Resolved',
          message: `Report "${report.title}" (${report.reportId}) has been verified as resolved by the citizen.`,
          type: 'report_status',
          relatedReport: report._id,
          relatedReportType: 'infrastructure',
          io,
        });
      }
    } else {
      report.status = 'Reopened';
      report.reopenedCount = (report.reopenedCount || 0) + 1;
      if (rejectionPhotos) report.citizenRejectionPhotos = rejectionPhotos;
      if (rejectionVideos) report.citizenRejectionVideos = rejectionVideos;
      report.timeline.push({
        action: 'citizen_rejected',
        description: 'Citizen rejected completion — report reopened',
        note,
        previousStatus: 'Citizen Verification',
        newStatus: 'Reopened',
        performedBy: req.user._id,
        performedByName: req.user.fullName,
        performedByRole: 'citizen',
        metadata: { reopenedCount: report.reopenedCount },
      });

      const io = getIo(req);
      const govUsers = await User.find({ role: { $in: ['government', 'admin'] } });
      for (const u of govUsers) {
        await createNotification({
          recipient: u._id,
          title: 'Report Reopened',
          message: `Report "${report.title}" (${report.reportId}) was reopened by the citizen. Reason: ${note || 'No reason'}`,
          type: 'report_status',
          relatedReport: report._id,
          relatedReportType: 'infrastructure',
          io,
        });
      }
    }

    report.progressHistory.push({ status: report.status, note, updatedBy: req.user._id });
    await report.save();

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const addFeedback = async (req, res) => {
  try {
    const { rating, feedback } = req.body;
    const report = await InfrastructureReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    if (report.submittedBy.toString() !== req.user._id.toString()) {
      return res.status(403).json({ success: false, message: 'Only the report submitter can leave feedback' });
    }

    report.rating = rating;
    report.feedback = feedback;
    report.feedbackAt = new Date();
    report.timeline.push({
      action: 'feedback_added',
      description: `Citizen rated ${rating}/5`,
      note: feedback,
      performedBy: req.user._id,
      performedByName: req.user.fullName,
      performedByRole: 'citizen',
      metadata: { rating },
    });
    await report.save();

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const addComment = async (req, res) => {
  try {
    const { text, isInternal } = req.body;
    const report = await InfrastructureReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    report.comments.push({
      text,
      author: req.user._id,
      authorName: req.user.fullName,
      authorRole: req.user.role,
      isInternal: isInternal && ['admin', 'government'].includes(req.user.role),
    });
    report.timeline.push({
      action: 'comment_added',
      description: `${req.user.fullName} added a comment`,
      note: text,
      performedBy: req.user._id,
      performedByName: req.user.fullName,
      performedByRole: req.user.role,
    });
    await report.save();

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const addAfterMedia = async (req, res) => {
  try {
    const report = await InfrastructureReport.findById(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    const photos = (req.files || []).filter(f => f.mimetype.startsWith('image/')).map(f => f.path);
    const videos = (req.files || []).filter(f => f.mimetype.startsWith('video/')).map(f => f.path);

    report.afterPhotos = [...(report.afterPhotos || []), ...photos];
    report.afterVideos = [...(report.afterVideos || []), ...videos];
    report.timeline.push({
      action: 'media_uploaded',
      description: `Uploaded ${photos.length} after-photos and ${videos.length} after-videos`,
      performedBy: req.user._id,
      performedByName: req.user.fullName,
      performedByRole: req.user.role,
      metadata: { photos: photos.length, videos: videos.length },
    });
    await report.save();

    res.json({ success: true, report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAnalytics = async (req, res) => {
  try {
    const { dateFrom, dateTo } = req.query;
    const matchStage = {};
    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
      if (dateTo) matchStage.createdAt.$lte = new Date(dateTo);
    }

    const [statusStats, categoryStats, regionStats, severityStats, avgResolution] = await Promise.all([
      InfrastructureReport.aggregate([
        { $match: matchStage },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      InfrastructureReport.aggregate([
        { $match: matchStage },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      InfrastructureReport.aggregate([
        { $match: matchStage },
        { $group: { _id: '$region', count: { $sum: 1 }, avgSeverity: { $avg: { $switch: { branches: [{ case: { $eq: ['$severityLevel', 'Low'] }, then: 1 }, { case: { $eq: ['$severityLevel', 'Medium'] }, then: 2 }, { case: { $eq: ['$severityLevel', 'High'] }, then: 3 }, { case: { $eq: ['$severityLevel', 'Critical'] }, then: 4 }], default: 2 } } } } },
        { $sort: { count: -1 } },
      ]),
      InfrastructureReport.aggregate([
        { $match: matchStage },
        { $group: { _id: '$severityLevel', count: { $sum: 1 } } },
      ]),
      InfrastructureReport.aggregate([
        { $match: { ...matchStage, resolvedAt: { $exists: true }, createdAt: { $exists: true } } },
        { $project: { resolutionDays: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 86400000] } } },
        { $group: { _id: null, avg: { $avg: '$resolutionDays' } } },
      ]),
    ]);

    const total = await InfrastructureReport.countDocuments(matchStage);
    const pending = await InfrastructureReport.countDocuments({ ...matchStage, status: 'Pending' });
    const resolved = await InfrastructureReport.countDocuments({ ...matchStage, status: 'Resolved' });
    const reopened = await InfrastructureReport.countDocuments({ ...matchStage, status: 'Reopened' });

    res.json({
      success: true,
      analytics: {
        total, pending, resolved, reopened,
        byStatus: statusStats,
        byCategory: categoryStats,
        byRegion: regionStats,
        bySeverity: severityStats,
        avgResolutionDays: avgResolution[0]?.avg || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const exportReports = async (req, res) => {
  try {
    const { format = 'csv', category, region, status, severityLevel, dateFrom, dateTo } = req.query;
    const query = {};
    if (category) query.category = category;
    if (region) query.region = region;
    if (status) query.status = status;
    if (severityLevel) query.severityLevel = severityLevel;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const reports = await InfrastructureReport.find(query)
      .populate('submittedBy', 'fullName email')
      .populate('assignedTo', 'fullName organizationName')
      .sort({ createdAt: -1 });

    if (format === 'csv') {
      const headers = ['Report ID', 'Title', 'Category', 'Severity', 'Region', 'Zone', 'Woreda', 'Kebele', 'Status', 'Submitted By', 'Assigned To', 'Created', 'Resolved'];
      const rows = reports.map(r => [
        r.reportId, `"${r.title}"`, r.category, r.severityLevel, r.region, r.zone || '', r.woreda || '', r.kebele || '', r.status,
        r.submittedBy?.fullName || '', r.assignedTo?.fullName || '',
        r.createdAt?.toISOString()?.split('T')[0] || '', r.resolvedAt?.toISOString()?.split('T')[0] || '',
      ]);
      const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=reports-${Date.now()}.csv`);
      return res.send(csv);
    }

    if (format === 'json') {
      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Content-Disposition', `attachment; filename=reports-${Date.now()}.json`);
      return res.json(reports);
    }

    res.json({ success: true, reports, format });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteReport = async (req, res) => {
  try {
    const report = await InfrastructureReport.findByIdAndDelete(req.params.id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
    await Assignment.deleteMany({ report: report._id });
    res.json({ success: true, message: 'Report deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const bulkVerify = async (req, res) => {
  try {
    const { ids, action, note } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide report IDs' });
    }
    const reports = await InfrastructureReport.find({ _id: { $in: ids } });
    const results = [];
    const io = getIo(req);

    for (const report of reports) {
      const previousStatus = report.status;
      report.verifiedBy = req.user._id;
      report.verifiedAt = new Date();

      if (action === 'reject') {
        report.status = 'Rejected';
        report.rejectionReason = note;
        report.progressHistory.push({ status: 'Rejected', note, updatedBy: req.user._id });
        report.timeline.push({
          action: 'rejected',
          description: `Report rejected: ${note}`,
          note, previousStatus, newStatus: 'Rejected',
          performedBy: req.user._id,
          performedByName: req.user.fullName,
          performedByRole: req.user.role,
        });
        await report.save();

        await createNotification({
          recipient: report.submittedBy,
          title: 'Report Rejected',
          message: `Your report "${report.title}" has been rejected. Reason: ${note || 'No reason'}`,
          type: 'verification',
          relatedReport: report._id,
          relatedReportType: 'infrastructure',
          io,
        });
      } else {
        report.status = 'Approved';
        report.progressHistory.push({ status: 'Approved', note, updatedBy: req.user._id });
        report.timeline.push({
          action: 'approved',
          description: 'Report approved by administrator',
          note, previousStatus, newStatus: 'Approved',
          performedBy: req.user._id,
          performedByName: req.user.fullName,
          performedByRole: req.user.role,
        });
        await report.save();

        const orgName = CATEGORY_ORG_MAP[report.category] || 'General Services';
        const responsibleUser = await findResponsibleUser(report);

        if (responsibleUser) {
          report.assignedTo = responsibleUser._id;
          report.assignedDepartment = orgName;
          report.assignedAt = new Date();
          report.responsibleOrganization = orgName;
          report.status = 'Assigned';
          report.progressHistory.push({ status: 'Assigned', note: `Auto-assigned to ${responsibleUser.fullName} (${orgName})`, updatedBy: req.user._id });
          report.timeline.push({
            action: 'assigned',
            description: `Report auto-assigned to ${responsibleUser.fullName} (${orgName}) based on category routing`,
            note: `Automatic assignment based on ${report.category} -> ${orgName}`,
            previousStatus: 'Approved',
            newStatus: 'Assigned',
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
            notes: `Auto-assigned based on category routing (${report.category} -> ${orgName})`,
          });

          await createNotification({
            recipient: responsibleUser._id,
            title: 'New Report Assignment',
            message: `Report "${report.title}" (${report.reportId}) has been automatically assigned to you. Organization: ${orgName}.`,
            type: 'assignment',
            relatedReport: report._id,
            relatedReportType: 'infrastructure',
            io,
          });

          await createNotification({
            recipient: report.submittedBy,
            title: 'Report Assigned',
            message: `Your report "${report.title}" has been approved and assigned to ${responsibleUser.fullName} (${orgName}).`,
            type: 'report_status',
            relatedReport: report._id,
            relatedReportType: 'infrastructure',
            io,
          });
        } else {
          await createNotification({
            recipient: report.submittedBy,
            title: 'Report Approved',
            message: `Your report "${report.title}" has been approved. No matching government user found for automatic assignment.`,
            type: 'verification',
            relatedReport: report._id,
            relatedReportType: 'infrastructure',
            io,
          });
        }
      }

      results.push(report.reportId);
    }

    emitToReportChannels(req, 'report:bulk-updated', { ids: results, action, status: action === 'approve' ? 'Assigned' : 'Rejected' });

    res.json({ success: true, message: `${results.length} reports ${action}d`, updated: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const bulkDelete = async (req, res) => {
  try {
    const { ids } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide report IDs' });
    }
    const result = await InfrastructureReport.deleteMany({ _id: { $in: ids } });
    await Assignment.deleteMany({ report: { $in: ids } });

    emitToReportChannels(req, 'report:bulk-deleted', { ids });

    res.json({ success: true, message: `${result.deletedCount} reports deleted` });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const bulkAssign = async (req, res) => {
  try {
    const { ids, assignedTo, assignedDepartment, dueDate, notes } = req.body;
    if (!ids || !Array.isArray(ids) || ids.length === 0) {
      return res.status(400).json({ success: false, message: 'Please provide report IDs' });
    }

    const assignee = await User.findById(assignedTo);
    if (!assignee) return res.status(404).json({ success: false, message: 'Assignee not found' });

    const reports = await InfrastructureReport.find({ _id: { $in: ids } });
    const results = [];
    const io = getIo(req);

    for (const report of reports) {
      const previousStatus = report.status;
      report.assignedTo = assignedTo;
      report.assignedDepartment = assignedDepartment || report.assignedDepartment;
      report.assignedAt = new Date();
      report.dueDate = dueDate ? new Date(dueDate) : report.dueDate;
      report.status = 'Assigned';
      report.progressHistory.push({ status: 'Assigned', note: `Assigned to ${assignee.fullName}`, updatedBy: req.user._id });
      report.timeline.push({
        action: 'assigned',
        description: `Report assigned to ${assignee.fullName} (${assignee.organizationName || assignee.role})`,
        note: notes, previousStatus, newStatus: 'Assigned',
        performedBy: req.user._id,
        performedByName: req.user.fullName,
        performedByRole: req.user.role,
        metadata: { assignedTo: assignee.fullName, department: assignedDepartment, dueDate },
      });
      await report.save();

      await Assignment.create({
        report: report._id, assignedTo, assignedBy: req.user._id,
        assignedDepartment: report.assignedDepartment, dueDate: report.dueDate, notes,
      });

      await createNotification({
        recipient: assignedTo,
        title: 'New Report Assignment',
        message: `You have been assigned report "${report.title}" (${report.reportId}).`,
        type: 'assignment',
        relatedReport: report._id,
        relatedReportType: 'infrastructure',
        io,
      });

      await createNotification({
        recipient: report.submittedBy,
        title: 'Report Assigned',
        message: `Your report "${report.title}" has been assigned to ${assignee.fullName}.`,
        type: 'report_status',
        relatedReport: report._id,
        relatedReportType: 'infrastructure',
        io,
      });

      const admins = await User.find({ role: 'admin' });
      for (const admin of admins) {
        if (admin._id.toString() !== req.user._id.toString() && admin._id.toString() !== assignedTo.toString()) {
          await createNotification({
            recipient: admin._id,
            title: 'Report Assigned',
            message: `Report "${report.title}" (${report.reportId}) has been assigned to ${assignee.fullName}.`,
            type: 'report_status',
            relatedReport: report._id,
            relatedReportType: 'infrastructure',
            io,
          });
        }
      }

      results.push(report.reportId);
    }

    emitToReportChannels(req, 'report:bulk-assigned', { ids: results, assignedTo: assignee.fullName });

    res.json({ success: true, message: `${results.length} reports assigned`, updated: results });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAssignedReports = async (req, res) => {
  try {
    const { status, page = 1, limit = 10 } = req.query;
    const query = { assignedTo: req.user._id };
    if (status) query.status = status;

    const total = await InfrastructureReport.countDocuments(query);
    const reports = await InfrastructureReport.find(query)
      .populate('submittedBy', 'fullName phone')
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(Number(limit));

    res.json({ success: true, total, page: Number(page), pages: Math.ceil(total / limit), reports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getGovernmentUsers = async (req, res) => {
  try {
    const users = await User.find({ role: 'government', isApproved: true })
      .select('fullName organizationName organizationType region email')
      .sort({ organizationName: 1 });
    res.json({ success: true, users });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const trackByReportId = async (req, res) => {
  try {
    const { reportId } = req.params;
    const report = await InfrastructureReport.findOne({ reportId })
      .populate('submittedBy', 'fullName region city')
      .populate('assignedTo', 'fullName organizationName')
      .populate('workCompletedBy', 'fullName')
      .populate('timeline.performedBy', 'fullName organizationName');

    if (!report) return res.status(404).json({ success: false, message: 'Report not found with this ID' });

    const publicTimeline = (report.timeline || []).filter(e => {
      const hiddenActions = ['comment_added'];
      if (e.isInternal) return false;
      return !hiddenActions.includes(e.action);
    });

    res.json({
      success: true,
      report: {
        reportId: report.reportId,
        title: report.title,
        description: report.description,
        category: report.category,
        severityLevel: report.severityLevel,
        status: report.status,
        region: report.region,
        zone: report.zone,
        woreda: report.woreda,
        kebele: report.kebele,
        city: report.city,
        address: report.address,
        specificLocation: report.specificLocation,
        latitude: report.latitude,
        longitude: report.longitude,
        incidentDate: report.incidentDate,
        photos: report.photos,
        videos: report.videos,
        afterPhotos: report.afterPhotos,
        afterVideos: report.afterVideos,
        autoAssignedOrganization: report.autoAssignedOrganization,
        assignedDepartment: report.assignedDepartment,
        createdAt: report.createdAt,
        resolvedAt: report.resolvedAt,
        rating: report.rating,
        feedback: report.feedback,
        timeline: publicTimeline,
        comments: (report.comments || []).filter(c => !c.isInternal).map(c => ({
          authorName: c.authorName,
          authorRole: c.authorRole,
          text: c.text,
          createdAt: c.createdAt,
        })),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const exportReportPDF = async (req, res) => {
  try {
    const report = await InfrastructureReport.findById(req.params.id)
      .populate('submittedBy', 'fullName email')
      .populate('verifiedBy', 'fullName')
      .populate('assignedTo', 'fullName organizationName')
      .populate('workCompletedBy', 'fullName')
      .populate('timeline.performedBy', 'fullName organizationName');

    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    await logAction({ user: req.user, action: 'export_performed', resource: 'InfrastructureReport', resourceId: report._id, details: { format: 'pdf' }, req });
    generateReportPDF(report.toObject(), res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const exportBulkPDF = async (req, res) => {
  try {
    const { category, region, status, severityLevel, dateFrom, dateTo } = req.query;
    const query = {};
    if (category) query.category = category;
    if (region) query.region = region;
    if (status) query.status = status;
    if (severityLevel) query.severityLevel = severityLevel;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const reports = await InfrastructureReport.find(query)
      .populate('submittedBy', 'fullName email')
      .populate('assignedTo', 'fullName organizationName')
      .sort({ createdAt: -1 });

    await logAction({ user: req.user, action: 'export_performed', resource: 'InfrastructureReport', details: { format: 'bulk_pdf', count: reports.length }, req });
    generateBulkPDF(reports.map(r => r.toObject()), res);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const exportExcel = async (req, res) => {
  try {
    const { category, region, status, severityLevel, dateFrom, dateTo } = req.query;
    const query = {};
    if (category) query.category = category;
    if (region) query.region = region;
    if (status) query.status = status;
    if (severityLevel) query.severityLevel = severityLevel;
    if (dateFrom || dateTo) {
      query.createdAt = {};
      if (dateFrom) query.createdAt.$gte = new Date(dateFrom);
      if (dateTo) query.createdAt.$lte = new Date(dateTo);
    }

    const reports = await InfrastructureReport.find(query)
      .populate('submittedBy', 'fullName email')
      .populate('assignedTo', 'fullName organizationName')
      .sort({ createdAt: -1 });

    const xml = generateExcelXML(reports);
    res.setHeader('Content-Type', 'application/vnd.ms-excel');
    res.setHeader('Content-Disposition', `attachment; filename=reports-${Date.now()}.xls`);
    return res.send(xml);
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getEnhancedAnalytics = async (req, res) => {
  try {
    const { dateFrom, dateTo, region } = req.query;
    const matchStage = {};
    if (dateFrom || dateTo) {
      matchStage.createdAt = {};
      if (dateFrom) matchStage.createdAt.$gte = new Date(dateFrom);
      if (dateTo) matchStage.createdAt.$lte = new Date(dateTo);
    }
    if (region) matchStage.region = region;

    const [
      statusStats, categoryStats, regionStats, severityStats,
      avgResolution, monthlyTrend, organizationStats, topRated,
    ] = await Promise.all([
      InfrastructureReport.aggregate([
        { $match: matchStage },
        { $group: { _id: '$status', count: { $sum: 1 } } },
      ]),
      InfrastructureReport.aggregate([
        { $match: matchStage },
        { $group: { _id: '$category', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
      ]),
      InfrastructureReport.aggregate([
        { $match: matchStage },
        { $group: { _id: '$region', count: { $sum: 1 }, resolved: { $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] } }, avgSeverity: { $avg: { $switch: { branches: [{ case: { $eq: ['$severityLevel', 'Low'] }, then: 1 }, { case: { $eq: ['$severityLevel', 'Medium'] }, then: 2 }, { case: { $eq: ['$severityLevel', 'High'] }, then: 3 }, { case: { $eq: ['$severityLevel', 'Critical'] }, then: 4 }], default: 2 } } } } },
        { $sort: { count: -1 } },
      ]),
      InfrastructureReport.aggregate([
        { $match: matchStage },
        { $group: { _id: '$severityLevel', count: { $sum: 1 } } },
      ]),
      InfrastructureReport.aggregate([
        { $match: { ...matchStage, resolvedAt: { $exists: true }, createdAt: { $exists: true } } },
        { $project: { resolutionDays: { $divide: [{ $subtract: ['$resolvedAt', '$createdAt'] }, 86400000] } } },
        { $group: { _id: null, avg: { $avg: '$resolutionDays' }, min: { $min: '$resolutionDays' }, max: { $max: '$resolutionDays' } } },
      ]),
      InfrastructureReport.aggregate([
        { $match: matchStage },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
            count: { $sum: 1 },
            resolved: { $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] } },
          },
        },
        { $sort: { _id: 1 } },
        { $limit: 12 },
      ]),
      InfrastructureReport.aggregate([
        { $match: { ...matchStage, autoAssignedOrganization: { $exists: true, $ne: null } } },
        { $group: { _id: '$autoAssignedOrganization', count: { $sum: 1 }, resolved: { $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] } } } },
        { $sort: { count: -1 } },
      ]),
      InfrastructureReport.aggregate([
        { $match: { ...matchStage, rating: { $exists: true, $ne: null } } },
        { $group: { _id: null, avgRating: { $avg: '$rating' }, totalRated: { $sum: 1 } } },
      ]),
    ]);

    const total = await InfrastructureReport.countDocuments(matchStage);
    const pending = await InfrastructureReport.countDocuments({ ...matchStage, status: 'Pending' });
    const resolved = await InfrastructureReport.countDocuments({ ...matchStage, status: 'Resolved' });
    const reopened = await InfrastructureReport.countDocuments({ ...matchStage, status: 'Reopened' });
    const inProgress = await InfrastructureReport.countDocuments({ ...matchStage, status: 'In Progress' });

    res.json({
      success: true,
      analytics: {
        total, pending, resolved, reopened, inProgress,
        byStatus: statusStats,
        byCategory: categoryStats,
        byRegion: regionStats,
        bySeverity: severityStats,
        avgResolutionDays: avgResolution[0]?.avg || 0,
        minResolutionDays: avgResolution[0]?.min || 0,
        maxResolutionDays: avgResolution[0]?.max || 0,
        monthlyTrend: monthlyTrend.map(m => ({ month: m._id, total: m.count, resolved: m.resolved })),
        byOrganization: organizationStats,
        averageRating: topRated[0]?.avgRating || 0,
        totalRated: topRated[0]?.totalRated || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getSLAStats = async (req, res) => {
  try {
    const now = new Date();
    const activeStatuses = ['Assigned', 'In Progress', 'Reopened'];

    const [overdue, warning, onTrack, noSLA] = await Promise.all([
      InfrastructureReport.countDocuments({
        status: { $in: activeStatuses },
        dueDate: { $lt: now, $exists: true },
      }),
      InfrastructureReport.countDocuments({
        status: { $in: activeStatuses },
        slaWarningAt: { $lte: now },
        dueDate: { $gte: now, $exists: true },
        slaBreached: false,
      }),
      InfrastructureReport.countDocuments({
        status: { $in: activeStatuses },
        $or: [
          { dueDate: { $gte: now } },
          { dueDate: { $exists: false } },
        ],
        slaBreached: false,
      }),
      InfrastructureReport.countDocuments({
        status: { $in: activeStatuses },
        dueDate: { $exists: false },
        slaDays: { $exists: false },
      }),
    ]);

    const overdueReports = await InfrastructureReport.find({
      status: { $in: activeStatuses },
      dueDate: { $lt: now, $exists: true },
    })
      .populate('assignedTo', 'fullName')
      .populate('submittedBy', 'fullName')
      .sort({ dueDate: 1 })
      .limit(20)
      .select('reportId title severityLevel dueDate status assignedTo submittedBy region createdAt');

    res.json({
      success: true,
      sla: {
        overdue,
        warning,
        onTrack,
        noSLA,
        overdueReports,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getDepartmentStats = async (req, res) => {
  try {
    const EmergencyReport = require('../models/EmergencyReport');
    const { DEPARTMENT_ROUTING } = require('../config/departmentRouting');

    const departments = [
      'Roads Authority', 'Water Bureau', 'Electric Utility',
      'Health Bureau', 'Disaster Risk Management', 'Fire and Emergency Service',
    ];

    const infraCategories = Object.entries(DEPARTMENT_ROUTING.infrastructure)
      .filter(([_, dept]) => departments.includes(dept))
      .map(([cat]) => cat);

    const emergencyTypes = Object.entries(DEPARTMENT_ROUTING.emergency)
      .filter(([_, dept]) => departments.includes(dept))
      .map(([type]) => type);

    const [infraByDept, emergencyByDept] = await Promise.all([
      InfrastructureReport.aggregate([
        { $match: { category: { $in: infraCategories } } },
        { $group: {
          _id: '$autoAssignedOrganization',
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $in: ['$status', ['Assigned', 'In Progress', 'Reopened']] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] } },
        }},
      ]),
      EmergencyReport.aggregate([
        { $match: { emergencyType: { $in: emergencyTypes } } },
        { $group: {
          _id: '$autoAssignedOrganization',
          total: { $sum: 1 },
          active: { $sum: { $cond: [{ $in: ['$status', ['Active', 'In Progress']] }, 1, 0] } },
          resolved: { $sum: { $cond: [{ $eq: ['$status', 'Resolved'] }, 1, 0] } },
        }},
      ]),
    ]);

    const infraMap = {};
    for (const row of infraByDept) infraMap[row._id] = row;

    const emergMap = {};
    for (const row of emergencyByDept) emergMap[row._id] = row;

    const stats = departments.map(name => {
      const infra = infraMap[name] || { total: 0, active: 0, resolved: 0 };
      const emerg = emergMap[name] || { total: 0, active: 0, resolved: 0 };
      return {
        name,
        infraReports: infra.total,
        infraActive: infra.active,
        infraResolved: infra.resolved,
        emergencyReports: emerg.total,
        emergencyActive: emerg.active,
        emergencyResolved: emerg.resolved,
        totalReports: infra.total + emerg.total,
        activeProjects: infra.active + emerg.active,
      };
    });

    res.json({ success: true, departments: stats });
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
      page = 1, limit = 20, status, severityLevel,
      region, category, search, sort = '-createdAt',
    } = req.query;

    const filter = { department };
    if (status) filter.status = status;
    if (severityLevel) filter.severityLevel = severityLevel;
    if (region) filter.region = region;
    if (category) filter.category = category;
    if (search) {
      filter.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } },
        { reportId: { $regex: search, $options: 'i' } },
      ];
    }

    const reports = await InfrastructureReport.find(filter)
      .sort(sort)
      .limit(Number(limit))
      .skip((Number(page) - 1) * Number(limit))
      .populate('submittedBy', 'fullName email phone')
      .populate('verifiedBy', 'fullName email')
      .populate('assignedTo', 'fullName email organizationName')
      .lean();

    const total = await InfrastructureReport.countDocuments(filter);

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

module.exports = {
  createReport, getPublicReports, getPublicAutocomplete, getAllReports, getReport, getMyReports,
  verifyReport, assignReport, updateStatus, citizenVerify, addFeedback,
  addComment, addAfterMedia, getAnalytics, exportReports, deleteReport,
  getAssignedReports, getGovernmentUsers, getGovernmentReports,
  trackByReportId, exportReportPDF, exportBulkPDF, exportExcel, getEnhancedAnalytics,
  bulkVerify, bulkDelete, bulkAssign, getSLAStats, getDepartmentStats,
};
