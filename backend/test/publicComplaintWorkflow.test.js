/**
 * Tests for the public complaint management workflow:
 *   • list search (title / tracking / phone / description) + advanced filters
 *   • assign officer / assign technician (with due date + work instruction)
 *   • forward-to-subcity escalation (reason required, assignedLevel=SUBCITY)
 *   • internal notes + timeline entries
 *   • dashboard stats / analytics aggregations
 *
 * Uses mongodb-memory-server with the system mongod binary when available.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const mongoose = require('mongoose');

const CANDIDATE_PATHS = {
  win32: [
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\MongoDB\\Server\\8.3\\bin\\mongod.exe`,
    process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}\\MongoDB\\Server\\8.3\\bin\\mongod.exe`,
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\MongoDB\\Server\\8.0\\bin\\mongod.exe`,
    process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}\\MongoDB\\Server\\8.0\\bin\\mongod.exe`,
  ],
  linux: ['/usr/bin/mongod', '/usr/local/bin/mongod'],
  darwin: ['/usr/local/bin/mongod', '/opt/homebrew/bin/mongod'],
};
if (!process.env.MONGOMS_SYSTEM_BINARY) {
  for (const candidate of (CANDIDATE_PATHS[process.platform] || [])) {
    if (candidate && fs.existsSync(candidate)) {
      process.env.MONGOMS_SYSTEM_BINARY = candidate;
      break;
    }
  }
}

const { MongoMemoryServer } = require('mongodb-memory-server');
const PublicComplaint = require('../src/models/PublicComplaint');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');
const {
  getPublicComplaints,
  getComplaintById,
  assignOfficer,
  assignTechnician,
  acceptOfficerAssignment,
  updateTechnicianWorkState,
  verifyWork,
  closeComplaint,
  escalateToSubcityManual,
  addInternalNote,
  getAssignableUsers,
  getStats,
  createComplaint,
  getByTrackingNumber,
  acceptComplaint,
  rejectComplaint,
  requestMoreInfo,
  markWaitingParts,
  forwardToSubcity,
  resolveBySubcity,
  getAuditLog,
} = require('../src/controllers/publicComplaintController');

let mongod;

const mockRes = () => {
  const res = { _status: 200, _json: null };
  res.status = function (s) { res._status = s; return res; };
  res.json = function (obj) { res._json = obj; return res; };
  return res;
};

const call = (fn) => async (id, body = {}, extra = {}) => {
  const res = mockRes();
  const user = extra.user || { _id: new mongoose.Types.ObjectId(), role: 'admin', fullName: 'Admin' };
  await fn({ params: { id }, body, user, query: extra.query || {}, ip: '127.0.0.1', connection: { remoteAddress: '127.0.0.1' }, get: () => 'node-test', app: { get: () => null } }, res);
  return { status: res._status, json: res._json };
};

const callTrack = (fn) => async (trackingNumber, query = {}) => {
  const res = mockRes();
  await fn({ params: { trackingNumber }, body: {}, query, user: null, ip: '127.0.0.1', connection: { remoteAddress: '127.0.0.1' }, get: () => 'node-test', app: { get: () => null } }, res);
  return { status: res._status, json: res._json };
};

const mkComplaint = (over = {}) =>
  PublicComplaint.create({
    title: 'Broken streetlight on Bole road',
    description: 'The streetlight near the gate has not worked for two weeks.',
    category: 'Poor Work Quality',
    region: 'Addis Ababa',
    subcity: 'BOLE',
    woredaName: '01',
    department: 'Electricity',
    priority: 'High',
    reporterName: 'Dagi',
    reporterPhone: '0967786170',
    reporterEmail: 'dagi@example.com',
    reporter: null,
    status: 'Submitted',
    submittedAt: new Date(),
    escalationDeadline: new Date(Date.now() + 48 * 60 * 60 * 1000),
    subcityEscalationDeadline: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000),
    ...over,
  });

const mkUser = (over = {}) =>
  User.create({
    fullName: 'Agent One',
    email: `agent_${Math.random().toString(36).slice(2, 10)}@zda.et`,
    password: 'password123',
    role: 'admin',
    ...over,
  });

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  await PublicComplaint.init();
  await User.init();
  await AuditLog.init();
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await PublicComplaint.deleteMany({});
  await User.deleteMany({});
  await AuditLog.deleteMany({});
});

// ── List: search + filters ────────────────────────────────────────────────────
describe('public complaint list', () => {
  it('returns all complaints for an admin', async () => {
    await mkComplaint();
    await mkComplaint({ title: 'Second complaint' });
    const { status, json } = await call(getPublicComplaints)(undefined, {}, { query: { page: 1, limit: 10 } });
    assert.equal(status, 200);
    assert.equal(json.data.total, 2);
    assert.equal(json.data.complaints.length, 2);
  });

  it('searches by title, tracking number, phone and description', async () => {
    const c1 = await mkComplaint();
    await mkComplaint({ title: 'Water leak', reporterPhone: '0911000000', description: 'pipe burst on Bole road' });

    const byTitle = await call(getPublicComplaints)(undefined, {}, { query: { search: 'streetlight' } });
    assert.equal(byTitle.json.data.total, 1);
    assert.equal(byTitle.json.data.complaints[0]._id.toString(), c1._id.toString());

    const byTracking = await call(getPublicComplaints)(undefined, {}, { query: { search: c1.trackingNumber } });
    assert.equal(byTracking.json.data.total, 1);

    const byPhone = await call(getPublicComplaints)(undefined, {}, { query: { search: '0911000000' } });
    assert.equal(byPhone.json.data.total, 1);
    assert.equal(byPhone.json.data.complaints[0].title, 'Water leak');

    const byDesc = await call(getPublicComplaints)(undefined, {}, { query: { search: 'pipe burst' } });
    assert.equal(byDesc.json.data.total, 1);
  });

  it('filters by subcity, department and priority', async () => {
    await mkComplaint();
    await mkComplaint({ subcity: 'YEKA', department: 'Water', priority: 'Low', title: 'Water leak' });

    const bySubcity = await call(getPublicComplaints)(undefined, {}, { query: { subcity: 'BOLE' } });
    assert.equal(bySubcity.json.data.total, 1);

    const byDept = await call(getPublicComplaints)(undefined, {}, { query: { department: 'Water' } });
    assert.equal(byDept.json.data.total, 1);

    const byPriority = await call(getPublicComplaints)(undefined, {}, { query: { priority: 'Low' } });
    assert.equal(byPriority.json.data.total, 1);
  });

  it('filters by status and date range', async () => {
    await mkComplaint({ status: 'Closed', createdAt: new Date('2025-01-01T00:00:00Z') });
    await mkComplaint({ status: 'Under Review' });

    const byStatus = await call(getPublicComplaints)(undefined, {}, { query: { status: 'Under Review' } });
    assert.equal(byStatus.json.data.total, 1);

    const inRange = await call(getPublicComplaints)(undefined, {}, { query: { from: '2025-01-01', to: '2025-01-02' } });
    assert.equal(inRange.json.data.total, 1);

    const notInRange = await call(getPublicComplaints)(undefined, {}, { query: { from: '2020-01-01', to: '2020-01-02' } });
    assert.equal(notInRange.json.data.total, 0);
  });
});

// ── Officer assignment ────────────────────────────────────────────────────────
describe('assign officer', () => {
  it('assigns an eligible OFFICER, updates status and records the timeline', async () => {
    const c = await mkComplaint();
    const officer = await mkUser({ role: 'OFFICER', fullName: 'Officer Adem' });

    const { status, json } = await call(assignOfficer)(c._id, { officerId: officer._id, note: 'Please review' });
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.assignedOfficerId.toString(), officer._id.toString());
    assert.equal(fresh.assignedOfficerName, 'Officer Adem');
    assert.ok(fresh.assignedOfficerAt);
    assert.equal(fresh.status, 'Under Review');
    assert.ok(fresh.timeline.some((t) => t.action === 'officer_assigned'));
  });

  it('rejects a citizen user as officer', async () => {
    const c = await mkComplaint();
    const citizen = await mkUser({ role: 'citizen' });
    const { status } = await call(assignOfficer)(c._id, { officerId: citizen._id });
    assert.equal(status, 400);
  });

  it('rejects a department admin as officer (never offered in dropdowns)', async () => {
    const c = await mkComplaint();
    const deptAdmin = await mkUser({ role: 'DEPARTMENT_ADMIN' });
    const { status } = await call(assignOfficer)(c._id, { officerId: deptAdmin._id });
    assert.equal(status, 400);
  });

  it('rejects an officer outside the complaint scope', async () => {
    const c = await mkComplaint({ woredaId: new mongoose.Types.ObjectId() });
    const other = await mkUser({ role: 'OFFICER', woredaId: new mongoose.Types.ObjectId(), department: 'Road' });
    const { status } = await call(assignOfficer)(c._id, { officerId: other._id });
    assert.equal(status, 400);
  });

  it('rejects when officer is missing', async () => {
    const c = await mkComplaint();
    const { status } = await call(assignOfficer)(c._id, {});
    assert.equal(status, 400);
  });
});

// ── Technician assignment ─────────────────────────────────────────────────────
describe('assign technician', () => {
  it('assigns a TECHNICIAN with due date + work instruction', async () => {
    const c = await mkComplaint();
    const tech = await mkUser({ role: 'TECHNICIAN', fullName: 'Tech Gebre' });

    const { status, json } = await call(assignTechnician)(c._id, {
      technicianId: tech._id,
      dueDate: '2026-08-10',
      workInstruction: 'Replace the bulb and test the circuit.',
    });
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.assignedTechnicianId.toString(), tech._id.toString());
    assert.equal(fresh.assignedTechnicianName, 'Tech Gebre');
    assert.equal(fresh.dueDate.toISOString().slice(0, 10), '2026-08-10');
    assert.equal(fresh.workInstruction, 'Replace the bulb and test the circuit.');
    assert.equal(fresh.status, 'Technician Assigned');
    assert.equal(fresh.technicianWorkState, 'ASSIGNED');
    assert.ok(fresh.timeline.some((t) => t.action === 'technician_assigned'));
  });

  it('rejects a department admin as technician (never offered in dropdowns)', async () => {
    const c = await mkComplaint();
    const deptAdmin = await mkUser({ role: 'DEPARTMENT_ADMIN' });
    const { status } = await call(assignTechnician)(c._id, { technicianId: deptAdmin._id });
    assert.equal(status, 400);
  });

  it('rejects a technician outside the complaint scope', async () => {
    const c = await mkComplaint({ woredaId: new mongoose.Types.ObjectId() });
    const other = await mkUser({ role: 'TECHNICIAN', woredaId: new mongoose.Types.ObjectId(), department: 'Road' });
    const { status } = await call(assignTechnician)(c._id, { technicianId: other._id });
    assert.equal(status, 400);
  });
});

// ── Officer acceptance ────────────────────────────────────────────────────────
describe('officer acceptance', () => {
  it('marks the assignment accepted and records it', async () => {
    const c = await mkComplaint();
    const officer = await mkUser({ role: 'OFFICER', fullName: 'Officer Sara' });
    await PublicComplaint.updateOne({ _id: c._id }, { $set: { assignedOfficerId: officer._id } });

    const asOfficer = { user: { _id: officer._id, role: 'OFFICER', fullName: 'Officer Sara' } };
    const { status } = await call(acceptOfficerAssignment)(c._id, {}, asOfficer);
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.officerAccepted, true);
    assert.ok(fresh.officerAcceptedAt);
    assert.ok(fresh.timeline.some((t) => t.action === 'officer_accepted'));
  });

  it('forbids a non-assigned officer from accepting', async () => {
    const c = await mkComplaint();
    const officer = await mkUser({ role: 'OFFICER' });
    const { status } = await call(acceptOfficerAssignment)(c._id, {}, { user: { _id: officer._id, role: 'OFFICER', fullName: 'Officer' } });
    assert.equal(status, 403);
  });
});

// ── Technician work-order state machine ───────────────────────────────────────
describe('technician work state', () => {
  it('walks the work order through to WORK_COMPLETED and awaits verification', async () => {
    const c = await mkComplaint();
    const tech = await mkUser({ role: 'TECHNICIAN', fullName: 'Tech Hana' });
    await PublicComplaint.updateOne({ _id: c._id }, { $set: { assignedTechnicianId: tech._id, technicianWorkState: 'ASSIGNED' } });

    const asTech = { user: { _id: tech._id, role: 'TECHNICIAN', fullName: 'Tech Hana' } };
    for (const ws of ['ACCEPTED', 'ON_THE_WAY', 'WORK_STARTED', 'WORK_COMPLETED']) {
      const r = await call(updateTechnicianWorkState)(c._id, { workState: ws }, asTech);
      assert.equal(r.status, 200);
    }
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.technicianWorkState, 'WORK_COMPLETED');
    assert.equal(fresh.status, 'Awaiting Verification');
    assert.equal(fresh.technicianRequested, true);
    assert.ok(fresh.workNotes.length >= 4);
    assert.ok(fresh.timeline.some((t) => t.action === 'technician_work_state'));
  });

  it('rejects an illegal transition', async () => {
    const c = await mkComplaint();
    const tech = await mkUser({ role: 'TECHNICIAN', fullName: 'Tech' });
    await PublicComplaint.updateOne({ _id: c._id }, { $set: { assignedTechnicianId: tech._id, technicianWorkState: 'ASSIGNED' } });
    const asTech = { user: { _id: tech._id, role: 'TECHNICIAN', fullName: 'Tech' } };
    const { status } = await call(updateTechnicianWorkState)(c._id, { workState: 'WORK_STARTED' }, asTech);
    assert.equal(status, 400);
  });

  it('rejects an unknown work state', async () => {
    const c = await mkComplaint();
    const tech = await mkUser({ role: 'TECHNICIAN' });
    const asTech = { user: { _id: tech._id, role: 'TECHNICIAN', fullName: 'Tech' } };
    const { status } = await call(updateTechnicianWorkState)(c._id, { workState: 'TEA_BREAK' }, asTech);
    assert.equal(status, 400);
  });
});

// ── Verification + closure ────────────────────────────────────────────────────
describe('verification & closure', () => {
  it('approves the work: Resolved with verifier details', async () => {
    const c = await mkComplaint({ status: 'Awaiting Verification' });
    const officer = await mkUser({ role: 'OFFICER', fullName: 'Officer Ken' });
    await PublicComplaint.updateOne({ _id: c._id }, { $set: { assignedOfficerId: officer._id } });
    const asOfficer = { user: { _id: officer._id, role: 'OFFICER', fullName: 'Officer Ken' } };

    const { status } = await call(verifyWork)(c._id, { verified: true, note: 'Work looks good.' }, asOfficer);
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.status, 'Resolved');
    assert.equal(fresh.verifiedByOfficerId.toString(), officer._id.toString());
    assert.ok(fresh.verifiedAt);
    assert.equal(fresh.verificationNote, 'Work looks good.');
  });

  it('sends the work back for rework', async () => {
    const c = await mkComplaint({ status: 'Awaiting Verification' });
    const officer = await mkUser({ role: 'OFFICER' });
    const tech = await mkUser({ role: 'TECHNICIAN' });
    await PublicComplaint.updateOne({ _id: c._id }, { $set: { assignedOfficerId: officer._id, assignedTechnicianId: tech._id } });
    const asOfficer = { user: { _id: officer._id, role: 'OFFICER', fullName: 'Officer' } };

    const { status } = await call(verifyWork)(c._id, { verified: false, note: 'Loose wiring, redo it.' }, asOfficer);
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.status, 'Rework Required');
    assert.equal(fresh.technicianWorkState, 'ASSIGNED');
    assert.equal(fresh.technicianRequested, false);
  });

  it('requires a verification note', async () => {
    const c = await mkComplaint({ status: 'Awaiting Verification' });
    const officer = await mkUser({ role: 'OFFICER' });
    await PublicComplaint.updateOne({ _id: c._id }, { $set: { assignedOfficerId: officer._id } });
    const asOfficer = { user: { _id: officer._id, role: 'OFFICER', fullName: 'Officer' } };
    const { status } = await call(verifyWork)(c._id, { verified: true }, asOfficer);
    assert.equal(status, 400);
  });

  it('closes a resolved complaint with the closing admin recorded', async () => {
    const woredaId = new mongoose.Types.ObjectId();
    const c = await mkComplaint({ status: 'Resolved', woredaId });
    const deptAdmin = await mkUser({ role: 'DEPARTMENT_ADMIN', fullName: 'Dept Admin', woredaId, department: 'Electricity' });
    const asDept = { user: { _id: deptAdmin._id, role: 'DEPARTMENT_ADMIN', fullName: 'Dept Admin', woredaId, department: 'Electricity' } };

    const { status } = await call(closeComplaint)(c._id, { note: 'All done.' }, asDept);
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.status, 'Closed');
    assert.ok(fresh.closedAt);
    assert.equal(fresh.closedByAdminId.toString(), deptAdmin._id.toString());
    assert.equal(fresh.closedByAdminName, 'Dept Admin');
  });

  it('refuses to close an un-resolved complaint', async () => {
    const woredaId = new mongoose.Types.ObjectId();
    const c = await mkComplaint({ status: 'Awaiting Verification', woredaId });
    const deptAdmin = await mkUser({ role: 'DEPARTMENT_ADMIN', woredaId, department: 'Electricity' });
    const asDept = { user: { _id: deptAdmin._id, role: 'DEPARTMENT_ADMIN', fullName: 'Dept Admin', woredaId, department: 'Electricity' } };
    const { status } = await call(closeComplaint)(c._id, {}, asDept);
    assert.equal(status, 400);
  });
});

// ── Full workflow: submit → officer → technician → verify → close ─────────────
describe('full complaint workflow', () => {
  it('routes a complaint end-to-end with the final scenario roles', async () => {
    const woredaId = new mongoose.Types.ObjectId();
    const c = await mkComplaint({ woredaId });

    const officer = await mkUser({ role: 'OFFICER', fullName: 'Officer Bole', woredaId, department: 'Electricity', subcity: 'BOLE' });
    const tech = await mkUser({ role: 'TECHNICIAN', fullName: 'Tech Bole', woredaId, department: 'Electricity', subcity: 'BOLE' });
    const deptAdmin = await mkUser({ role: 'DEPARTMENT_ADMIN', fullName: 'Dept Bole', woredaId, department: 'Electricity' });
    const asDept = { user: { _id: deptAdmin._id, role: 'DEPARTMENT_ADMIN', fullName: 'Dept Bole', woredaId, department: 'Electricity' } };
    const asOfficer = { user: { _id: officer._id, role: 'OFFICER', fullName: 'Officer Bole' } };
    const asTech = { user: { _id: tech._id, role: 'TECHNICIAN', fullName: 'Tech Bole' } };

    // Dropdowns filtered to the exact woreda + department staff, no department admin.
    const { status: s0, json } = await call(getAssignableUsers)(undefined, {}, { query: { complaintId: c._id } });
    assert.equal(s0, 200);
    assert.deepEqual(json.data.officers.map((o) => o.fullName), ['Officer Bole']);
    assert.deepEqual(json.data.technicians.map((t) => t.fullName), ['Tech Bole']);

    // Officer assigned + accepts.
    assert.equal((await call(assignOfficer)(c._id, { officerId: officer._id }, asDept)).status, 200);
    assert.equal((await call(acceptOfficerAssignment)(c._id, {}, asOfficer)).status, 200);

    // Technician assigned and progresses the work order to completion.
    assert.equal((await call(assignTechnician)(c._id, { technicianId: tech._id }, asDept)).status, 200);
    for (const ws of ['ACCEPTED', 'ON_THE_WAY', 'WORK_STARTED', 'WORK_COMPLETED']) {
      assert.equal((await call(updateTechnicianWorkState)(c._id, { workState: ws }, asTech)).status, 200);
    }

    // Officer verifies → Resolved.
    assert.equal((await call(verifyWork)(c._id, { verified: true, note: 'Verified on site.' }, asOfficer)).status, 200);

    // Department admin closes → Closed.
    assert.equal((await call(closeComplaint)(c._id, { note: 'Case closed.' }, asDept)).status, 200);

    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.status, 'Closed');
    assert.equal(fresh.assignedOfficerId.toString(), officer._id.toString());
    assert.equal(fresh.assignedTechnicianId.toString(), tech._id.toString());
    assert.equal(fresh.verifiedByOfficerId.toString(), officer._id.toString());
    assert.equal(fresh.closedByAdminId.toString(), deptAdmin._id.toString());
    assert.equal(fresh.technicianWorkState, 'WORK_COMPLETED');
  });
});

// ── Escalation (Forward to Subcity) ───────────────────────────────────────────
describe('escalate to subcity', () => {
  it('requires an escalation reason', async () => {
    const c = await mkComplaint();
    const { status } = await call(escalateToSubcityManual)(c._id, {});
    assert.equal(status, 400);
  });

  it('escalates with reason: status Escalated to Subcity, assignedLevel SUBCITY', async () => {
    const c = await mkComplaint();
    const { status, json } = await call(escalateToSubcityManual)(c._id, {
      reason: 'Requires subcity authority for road closure.',
      targetDepartment: 'Electricity',
    });
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.status, 'Escalated to Subcity');
    assert.equal(fresh.assignedLevel, 'SUBCITY');
    assert.equal(fresh.escalationReason, 'Requires subcity authority for road closure.');
    assert.equal(fresh.escalatedToSubcity, true);
    assert.ok(fresh.escalatedToSubcityAt);
    assert.ok(fresh.timeline.some((t) => t.action === 'escalated_to_subcity'));
  });
});

// ── Internal notes ────────────────────────────────────────────────────────────
describe('internal notes', () => {
  it('adds an internal note and timeline entry', async () => {
    const c = await mkComplaint();
    const user = { _id: new mongoose.Types.ObjectId(), role: 'admin', fullName: 'Admin' };
    const { status, json } = await call(addInternalNote)(c._id, { note: 'Awaiting site inspection.' }, { user });
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.internalNotes.length, 1);
    assert.equal(fresh.internalNotes[0].body, 'Awaiting site inspection.');
    assert.equal(fresh.internalNotes[0].authorName, 'Admin');
    assert.ok(fresh.timeline.some((t) => t.action === 'note_added'));
  });

  it('rejects an empty note', async () => {
    const c = await mkComplaint();
    const { status } = await call(addInternalNote)(c._id, { note: '   ' });
    assert.equal(status, 400);
  });
});

// ── Assignable users ──────────────────────────────────────────────────────────
describe('assignable users', () => {
  it('lists officers and technicians separately, excluding department admins', async () => {
    await mkUser({ role: 'OFFICER', fullName: 'Officer A' });
    await mkUser({ role: 'TECHNICIAN', fullName: 'Tech B' });
    await mkUser({ role: 'DEPARTMENT_ADMIN', fullName: 'Dept Admin' });
    await mkUser({ role: 'citizen', fullName: 'Not Eligible' });
    const { status, json } = await call(getAssignableUsers)();
    assert.equal(status, 200);
    assert.ok(json.data.officers.some((o) => o.fullName === 'Officer A'));
    assert.ok(!json.data.officers.some((o) => o.fullName === 'Dept Admin'));
    assert.ok(!json.data.officers.some((o) => o.fullName === 'Not Eligible'));
    assert.ok(json.data.technicians.some((t) => t.fullName === 'Tech B'));
    assert.ok(!json.data.technicians.some((t) => t.fullName === 'Dept Admin'));
  });

  it('filters dropdowns to field staff covering the complaint scope', async () => {
    const woredaId = new mongoose.Types.ObjectId();
    const c = await mkComplaint({ woredaId });
    await mkUser({ role: 'OFFICER', fullName: 'Officer Local', woredaId, department: 'Electricity', subcity: 'BOLE' });
    await mkUser({ role: 'OFFICER', fullName: 'Officer Far', woredaId: new mongoose.Types.ObjectId(), department: 'Electricity' });
    await mkUser({ role: 'TECHNICIAN', fullName: 'Tech Local', woredaId, department: 'Electricity', subcity: 'BOLE' });
    await mkUser({ role: 'TECHNICIAN', fullName: 'Tech WrongDept', woredaId, department: 'Water' });
    await mkUser({ role: 'DEPARTMENT_ADMIN', fullName: 'Dept Admin', woredaId, department: 'Electricity' });

    const { status, json } = await call(getAssignableUsers)(undefined, {}, { query: { complaintId: c._id } });
    assert.equal(status, 200);
    assert.deepEqual(json.data.officers.map((o) => o.fullName), ['Officer Local']);
    assert.deepEqual(json.data.technicians.map((t) => t.fullName), ['Tech Local']);
  });

  it('returns 404 for an unknown complaint', async () => {
    const { status } = await call(getAssignableUsers)(undefined, {}, { query: { complaintId: new mongoose.Types.ObjectId() } });
    assert.equal(status, 404);
  });
});

// ── Stats / analytics ─────────────────────────────────────────────────────────
describe('stats & analytics', () => {
  it('computes the dashboard summary + aggregations', async () => {
    const today = new Date();
    await mkComplaint({ status: 'Submitted' });
    await mkComplaint({ status: 'Submitted' });
    await mkComplaint({ status: 'Under Review', subcity: 'YEKA', department: 'Water' });
    const resolved = await mkComplaint({ status: 'Resolved' });
    await PublicComplaint.updateOne({ _id: resolved._id }, { $set: { resolvedAt: today } });
    const overdue = await mkComplaint({ status: 'Pending' });
    await PublicComplaint.updateOne({ _id: overdue._id }, { $set: { escalationDeadline: new Date(Date.now() - 1000) } });

    const { status, json } = await call(getStats)();
    assert.equal(status, 200);
    assert.equal(json.data.total, 5);
    assert.equal(json.data.summary.pending, 3); // 2 Submitted + 1 Pending
    assert.equal(json.data.summary.underReview, 1);
    assert.equal(json.data.summary.resolvedToday, 1);
    assert.equal(json.data.summary.overdue, 1);
    assert.equal(json.data.bySubcity.BOLE, 4);
    assert.equal(json.data.bySubcity.YEKA, 1);
    assert.equal(json.data.byDepartment.Water, 1);
    assert.equal(json.data.byStatus.Resolved, 1);
    assert.equal(json.data.byPriority.High, 5);
    assert.ok(Array.isArray(json.data.resolutionTrend));
  });
});

// ── Detail ────────────────────────────────────────────────────────────────────
describe('complaint detail', () => {
  it('returns the full complaint with timeline', async () => {
    const c = await mkComplaint();
    const { status, json } = await call(getComplaintById)(c._id);
    assert.equal(status, 200);
    assert.equal(json.data.complaint.trackingNumber, c.trackingNumber);
    assert.ok(Array.isArray(json.data.complaint.timeline));
  });
});

// ── Tracking number format ────────────────────────────────────────────────────
describe('tracking number generation', () => {
  it('generates CMP-YYYY-000001 sequential tracking numbers', async () => {
    const a = await PublicComplaint.create({ title: 'A', description: 'desc', category: 'Other', region: 'Addis Ababa', priority: 'Medium' });
    const b = await PublicComplaint.create({ title: 'B', description: 'desc', category: 'Other', region: 'Addis Ababa', priority: 'Medium' });
    assert.match(a.trackingNumber, /^CMP-\d{4}-\d{6}$/);
    assert.match(b.trackingNumber, /^CMP-\d{4}-\d{6}$/);
    assert.notEqual(a.trackingNumber, b.trackingNumber);
  });

  it('createComplaint returns a CMP tracking number', async () => {
    const { status, json } = await call(createComplaint)(undefined, {
      title: 'Pothole on Bole road',
      description: 'A deep pothole near the roundabout.',
      category: 'Poor Work Quality',
      region: 'Addis Ababa',
      priority: 'High',
      reporterName: 'Dagi',
      reporterPhone: '0967786170',
      reporterEmail: 'dagi@example.com',
    });
    assert.equal(status, 201);
    assert.match(json.data.trackingNumber, /^CMP-\d{4}-\d{6}$/);
  });
});

// ── Public tracking with phone verification ───────────────────────────────────
describe('public tracking (phone verified)', () => {
  it('requires a phone number', async () => {
    const c = await mkComplaint();
    const { status } = await callTrack(getByTrackingNumber)(c.trackingNumber, {});
    assert.equal(status, 400);
    assert.equal(c.reporterPhone, '0967786170');
  });

  it('rejects a mismatching phone number', async () => {
    const c = await mkComplaint();
    const { status } = await callTrack(getByTrackingNumber)(c.trackingNumber, { phone: '0911222333' });
    assert.equal(status, 403);
  });

  it('returns full details when the phone matches', async () => {
    const c = await mkComplaint();
    const { status, json } = await callTrack(getByTrackingNumber)(c.trackingNumber, { phone: '0967786170' });
    assert.equal(status, 200);
    assert.equal(json.data.complaint.trackingNumber, c.trackingNumber);
    assert.equal(json.data.complaint.title, 'Broken streetlight on Bole road');
  });

  it('matches phone numbers despite formatting differences', async () => {
    const c = await mkComplaint({ reporterPhone: '+251 96 778 6170' });
    const { status } = await callTrack(getByTrackingNumber)(c.trackingNumber, { phone: '0967786170' });
    assert.equal(status, 200);
  });
});

// ── Department officer actions ────────────────────────────────────────────────
describe('department officer workflow', () => {
  const asDeptOfficer = (woredaId, departmentId) => ({
    user: {
      _id: new mongoose.Types.ObjectId(),
      role: 'department_officer',
      fullName: 'Officer Dept',
      subcityId: new mongoose.Types.ObjectId(),
      woredaId,
      departmentId,
    },
  });

  it('accepts a Submitted complaint and notifies the citizen', async () => {
    const woredaId = new mongoose.Types.ObjectId();
    const c = await mkComplaint({ woredaId });
    const asOfficer = asDeptOfficer(woredaId, new mongoose.Types.ObjectId());
    // department_officer scope requires subcityId/woredaId/departmentId match —
    // set them so the scoped query finds the complaint.
    await PublicComplaint.updateOne({ _id: c._id }, { $set: { subcityId: asOfficer.user.subcityId, departmentId: asOfficer.user.departmentId } });

    const { status } = await call(acceptComplaint)(c._id, {}, asOfficer);
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.status, 'Accepted');
    assert.ok(fresh.acceptedAt);
    assert.equal(fresh.acceptedByName, 'Officer Dept');
    assert.ok(fresh.timeline.some((t) => t.action === 'accepted'));
    assert.equal(fresh.publicNotifications.length, 1);
    assert.match(fresh.publicNotifications[0].message, /accepted/);
  });

  it('rejects a complaint with a required reason', async () => {
    const c = await mkComplaint();
    const { status: s1 } = await call(rejectComplaint)(c._id, {}, { user: { _id: new mongoose.Types.ObjectId(), role: 'admin', fullName: 'Admin' } });
    assert.equal(s1, 400);

    const { status } = await call(rejectComplaint)(c._id, { reason: 'Duplicate of an existing report.' }, { user: { _id: new mongoose.Types.ObjectId(), role: 'admin', fullName: 'Admin' } });
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.status, 'Rejected');
    assert.equal(fresh.rejectReason, 'Duplicate of an existing report.');
    assert.ok(fresh.rejectedAt);
  });

  it('requests more information', async () => {
    const c = await mkComplaint();
    const { status: s1 } = await call(requestMoreInfo)(c._id, {}, { user: { _id: new mongoose.Types.ObjectId(), role: 'admin', fullName: 'Admin' } });
    assert.equal(s1, 400);

    const { status } = await call(requestMoreInfo)(c._id, { message: 'Please send a photo of the meter.' }, { user: { _id: new mongoose.Types.ObjectId(), role: 'admin', fullName: 'Admin' } });
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.status, 'More Info Requested');
    assert.ok(fresh.publicNotifications.length >= 1);
  });

  it('resumes work on a complaint that was waiting for info', async () => {
    const woredaId = new mongoose.Types.ObjectId();
    const c = await mkComplaint({ woredaId });
    const asOfficer = asDeptOfficer(woredaId, new mongoose.Types.ObjectId());
    await PublicComplaint.updateOne({ _id: c._id }, { $set: { subcityId: asOfficer.user.subcityId, departmentId: asOfficer.user.departmentId } });

    await PublicComplaint.updateOne({ _id: c._id }, { $set: { status: 'More Info Requested' } });
    const { status } = await call(acceptComplaint)(c._id, {}, asOfficer);
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.status, 'Accepted');
    assert.ok(fresh.timeline.some((t) => t.action === 'accepted' && /resumed/.test(t.description)));
  });

  it('marks a complaint as waiting for parts', async () => {
    const c = await mkComplaint({ status: 'In Progress' });
    const { status } = await call(markWaitingParts)(c._id, { note: 'Awaiting transformer delivery.' }, { user: { _id: new mongoose.Types.ObjectId(), role: 'admin', fullName: 'Admin' } });
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.status, 'Waiting for Parts');
  });

  it('forwards to subcity with reason, budget, equipment and priority', async () => {
    const c = await mkComplaint();
    const { status: s1 } = await call(forwardToSubcity)(c._id, {}, { user: { _id: new mongoose.Types.ObjectId(), role: 'admin', fullName: 'Admin' } });
    assert.equal(s1, 400);

    const { status } = await call(forwardToSubcity)(c._id, {
      reason: 'Requires subcity budget approval.',
      estimatedBudget: '750,000 ETB',
      requiredEquipment: 'Crane and excavator',
      forwardPriority: 'Urgent',
    }, { user: { _id: new mongoose.Types.ObjectId(), role: 'admin', fullName: 'Admin' } });
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.status, 'Forwarded to Subcity');
    assert.equal(fresh.assignedLevel, 'SUBCITY');
    assert.equal(fresh.forwardReason, 'Requires subcity budget approval.');
    assert.equal(fresh.estimatedBudget, '750,000 ETB');
    assert.equal(fresh.requiredEquipment, 'Crane and excavator');
    assert.equal(fresh.forwardPriority, 'Urgent');
    assert.equal(fresh.escalatedToSubcity, true);
    assert.ok(fresh.timeline.some((t) => t.action === 'forwarded_to_subcity'));
  });

  it('resolves a complaint at the subcity level', async () => {
    const c = await mkComplaint({ status: 'Forwarded to Subcity', assignedLevel: 'SUBCITY' });
    const { status: s1 } = await call(resolveBySubcity)(c._id, {}, { user: { _id: new mongoose.Types.ObjectId(), role: 'admin', fullName: 'Admin' } });
    assert.equal(s1, 400);

    const { status } = await call(resolveBySubcity)(c._id, { details: 'Road repaired and reopened to traffic.' }, { user: { _id: new mongoose.Types.ObjectId(), role: 'admin', fullName: 'Admin' } });
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.status, 'Resolved by Subcity');
    assert.equal(fresh.resolutionDetails, 'Road repaired and reopened to traffic.');
    assert.ok(fresh.subcityResolvedAt);
  });
});

// ── Audit log ─────────────────────────────────────────────────────────────────
describe('complaint audit log', () => {
  it('records workflow actions and lists them', async () => {
    const woredaId = new mongoose.Types.ObjectId();
    const departmentId = new mongoose.Types.ObjectId();
    const subcityId = new mongoose.Types.ObjectId();

    const created = await call(createComplaint)(undefined, {
      title: 'Audited complaint',
      description: 'desc',
      category: 'Other',
      region: 'Addis Ababa',
      subcity: 'BOLE',
      priority: 'Medium',
    });
    assert.equal(created.status, 201);
    const c = created.json.data.complaint;

    // Scope the complaint to the officer so the workflow actions are allowed.
    await PublicComplaint.updateOne({ _id: c._id }, { $set: { subcityId, woredaId, departmentId } });
    const asOfficer = {
      user: { _id: new mongoose.Types.ObjectId(), role: 'department_officer', fullName: 'Officer Audit', subcityId, woredaId, departmentId },
    };

    assert.equal((await call(acceptComplaint)(c._id, {}, asOfficer)).status, 200);
    assert.equal((await call(forwardToSubcity)(c._id, { reason: 'Needs subcity review.' }, asOfficer)).status, 200);

    const { status, json } = await call(getAuditLog)(c._id, {}, { user: { _id: new mongoose.Types.ObjectId(), role: 'admin', fullName: 'Admin' } });
    assert.equal(status, 200);
    const actions = json.data.entries.map((e) => e.action);
    assert.ok(actions.includes('complaint_created'));
    assert.ok(actions.includes('complaint_accepted'));
    assert.ok(actions.includes('complaint_forwarded'));
  });
});
