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
const {
  getPublicComplaints,
  getComplaintById,
  assignOfficer,
  assignTechnician,
  escalateToSubcityManual,
  addInternalNote,
  getAssignableUsers,
  getStats,
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
  await fn({ params: { id }, body, user, query: extra.query || {}, app: { get: () => null } }, res);
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
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await PublicComplaint.deleteMany({});
  await User.deleteMany({});
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
  it('assigns an eligible officer, updates status and records the timeline', async () => {
    const c = await mkComplaint();
    const officer = await mkUser({ role: 'department', fullName: 'Officer Adem' });

    const { status, json } = await call(assignOfficer)(c._id, { officerId: officer._id, note: 'Please review' });
    assert.equal(status, 200);
    const fresh = await PublicComplaint.findById(c._id).lean();
    assert.equal(fresh.assignedOfficerId.toString(), officer._id.toString());
    assert.equal(fresh.assignedOfficerName, 'Officer Adem');
    assert.ok(fresh.assignedOfficerAt);
    assert.equal(fresh.status, 'Assigned');
    assert.ok(fresh.timeline.some((t) => t.action === 'officer_assigned'));
  });

  it('rejects a non-officer (citizen) user', async () => {
    const c = await mkComplaint();
    const citizen = await mkUser({ role: 'citizen' });
    const { status } = await call(assignOfficer)(c._id, { officerId: citizen._id });
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
  it('assigns a technician with due date + work instruction', async () => {
    const c = await mkComplaint();
    const tech = await mkUser({ role: 'technician', fullName: 'Tech Gebre' });

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
    assert.ok(fresh.timeline.some((t) => t.action === 'technician_assigned'));
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
  it('lists officers and technicians separately', async () => {
    await mkUser({ role: 'department', fullName: 'Officer A' });
    await mkUser({ role: 'technician', fullName: 'Tech B' });
    await mkUser({ role: 'citizen', fullName: 'Not Eligible' });
    const { status, json } = await call(getAssignableUsers)();
    assert.equal(status, 200);
    assert.ok(json.data.officers.some((o) => o.fullName === 'Officer A'));
    assert.ok(!json.data.officers.some((o) => o.fullName === 'Not Eligible'));
    assert.ok(json.data.technicians.some((t) => t.fullName === 'Tech B'));
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
