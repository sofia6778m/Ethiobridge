/**
 * Automated tests for the municipal complaint operational workflow:
 *   • accept / reject
 *   • inspector + technician assignment
 *   • start work / complete work (with photos)
 *   • resolution verification (department officer)
 *   • reopen / close
 *   • citizen feedback + assignable-user lookup
 *
 * Uses mongodb-memory-server with the system mongod binary when available so
 * no network download is required and tests never touch the real database.
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
const MunicipalComplaint = require('../src/models/MunicipalComplaint');
const User = require('../src/models/User');
const Woreda = require('../src/models/Woreda');
const Subcity = require('../src/models/Subcity');
const {
  acceptComplaint,
  rejectComplaint,
  assignInspector,
  assignTechnician,
  startWork,
  completeWork,
  verifyResolution,
  reopenComplaint,
  closeComplaint,
  submitFeedback,
  getAssignableUsers,
} = require('../src/controllers/municipalComplaintController');

let mongod;

const mockRes = () => {
  const res = { _status: 200, _json: null };
  res.status = function (s) { res._status = s; return res; };
  res.json = function (obj) { res._json = obj; return res; };
  return res;
};

const call = (fn) => async (id, body = {}, extra = {}) => {
  const res = mockRes();
  const user = extra.user || { _id: new mongoose.Types.ObjectId(), role: 'admin', fullName: 'Admin User' };
  await fn({ params: { id }, body, user, files: extra.files, app: {}, query: extra.query || {} }, res);
  return { status: res._status, json: res._json };
};

const mkComplaint = (over = {}) =>
  MunicipalComplaint.create({
    title: 'Broken streetlight',
    description: 'Streetlight not working',
    subcity: 'Bole',
    woredaId: new mongoose.Types.ObjectId(),
    woredaName: 'Woreda 07',
    department: 'Electricity',
    reporter: new mongoose.Types.ObjectId(),
    reporterName: 'Kebede',
    status: 'Submitted',
    ...over,
  });

const mkUser = (over = {}) =>
  User.create({
    fullName: 'Agent One',
    email: `agent_${Math.random().toString(36).slice(2, 10)}@zda.et`,
    password: 'password123',
    role: 'inspector',
    ...over,
  });

// ── Global setup / teardown ──────────────────────────────────────────────────
before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  await MunicipalComplaint.init();
  await User.init();
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await MunicipalComplaint.deleteMany({});
  await User.deleteMany({});
  await Woreda.deleteMany({});
  await Subcity.deleteMany({});
});

// ── Accept / Reject ───────────────────────────────────────────────────────────
describe('complaint accept / reject', () => {
  it('accepts a Submitted complaint into In Review', async () => {
    const c = await mkComplaint();
    const { status, json } = await call(acceptComplaint)(c._id);
    assert.equal(status, 200);
    assert.equal(json.data.status, 'In Review');
    assert.ok(json.data.acceptedAt);
    assert.equal(json.data.acceptedByName, 'Admin User');
  });

  it('rejects accepting a complaint that is not Submitted', async () => {
    const c = await mkComplaint({ status: 'In Progress' });
    const { status, json } = await call(acceptComplaint)(c._id);
    assert.equal(status, 400);
    assert.match(json.message, /only 'Submitted'/i);
  });

  it('rejects without a reason', async () => {
    const c = await mkComplaint();
    const { status, json } = await call(rejectComplaint)(c._id, {});
    assert.equal(status, 400);
    assert.match(json.message, /reason/i);
  });

  it('rejects with a reason and records it', async () => {
    const c = await mkComplaint();
    const { status, json } = await call(rejectComplaint)(c._id, { reason: 'Duplicate report' });
    assert.equal(status, 200);
    assert.equal(json.data.status, 'Rejected');
    assert.equal(json.data.rejectReason, 'Duplicate report');
    assert.equal(json.data.rejectedByName, 'Admin User');
  });
});

// ── Inspector / technician assignment ─────────────────────────────────────────
describe('inspector / technician assignment', () => {
  it('assigns an inspector and moves the complaint to Assigned', async () => {
    const inspector = await mkUser({ role: 'inspector', fullName: 'Inspector Iman' });
    const c = await mkComplaint();
    const { status, json } = await call(assignInspector)(c._id, {
      inspectorId: inspector._id,
      visitAt: '2026-08-10T09:00:00.000Z',
      notes: 'Inspect pole site',
    });
    assert.equal(status, 200);
    assert.equal(String(json.data.inspectorId), String(inspector._id));
    assert.equal(json.data.inspectorName, 'Inspector Iman');
    assert.equal(json.data.inspectorNotes, 'Inspect pole site');
    assert.equal(json.data.status, 'Assigned');
  });

  it('rejects assigning a non-inspector user', async () => {
    const citizen = await mkUser({ role: 'citizen' });
    const c = await mkComplaint();
    const { status, json } = await call(assignInspector)(c._id, { inspectorId: citizen._id });
    assert.equal(status, 404);
    assert.match(json.message, /inspector/i);
  });

  it('assigns a technician with priority, due date and work order notes', async () => {
    const tech = await mkUser({ role: 'technician', fullName: 'Tech Tola' });
    const c = await mkComplaint();
    const { status, json } = await call(assignTechnician)(c._id, {
      technicianId: tech._id,
      priority: 'High',
      dueAt: '2026-08-15T00:00:00.000Z',
      workOrderNotes: 'Replace bulb and test circuit',
    });
    assert.equal(status, 200);
    assert.equal(json.data.technicianName, 'Tech Tola');
    assert.equal(json.data.technicianPriority, 'High');
    assert.equal(json.data.workOrderNotes, 'Replace bulb and test circuit');
    assert.equal(json.data.status, 'Assigned');
  });
});

// ── Start / complete / verify ─────────────────────────────────────────────────
describe('start work → complete work → verify resolution', () => {
  it('starts work only from Assigned', async () => {
    const c = await mkComplaint({ status: 'Assigned', technicianId: new mongoose.Types.ObjectId() });
    const { status, json } = await call(startWork)(c._id);
    assert.equal(status, 200);
    assert.equal(json.data.status, 'In Progress');
    assert.ok(json.data.startedAt);
    assert.equal(json.data.workProgress[0].step, 'started');
  });

  it('refuses to start work when not Assigned', async () => {
    const c = await mkComplaint({ status: 'In Review' });
    const { status, json } = await call(startWork)(c._id);
    assert.equal(status, 400);
    assert.match(json.message, /only 'Assigned'/i);
  });

  it('completes work with notes + photos and moves to Completed', async () => {
    const c = await mkComplaint({ status: 'In Progress' });
    const { status, json } = await call(completeWork)(c._id, { notes: 'Bulb replaced' }, {
      files: [{ path: '/uploads/after1.jpg' }, { path: '/uploads/after2.jpg' }],
    });
    assert.equal(status, 200);
    assert.equal(json.data.status, 'Completed');
    assert.ok(json.data.completedAt);
    const entry = json.data.workProgress[json.data.workProgress.length - 1];
    assert.equal(entry.step, 'completed');
    assert.equal(entry.notes, 'Bulb replaced');
    assert.equal(entry.afterPhotos.length, 2);
  });

  it('requires notes to complete work', async () => {
    const c = await mkComplaint({ status: 'In Progress' });
    const { status, json } = await call(completeWork)(c._id, { notes: '' });
    assert.equal(status, 400);
    assert.match(json.message, /notes/i);
  });

  it('verifies completed work and marks Resolved with a note', async () => {
    const c = await mkComplaint({ status: 'Completed' });
    const { status, json } = await call(verifyResolution)(c._id, { note: 'Confirmed working' });
    assert.equal(status, 200);
    assert.equal(json.data.status, 'Resolved');
    assert.equal(json.data.resolutionVerification.verified, true);
    assert.equal(json.data.resolutionVerification.verificationNote, 'Confirmed working');
    assert.ok(json.data.resolvedAt);
  });

  it('requires a verification note', async () => {
    const c = await mkComplaint({ status: 'Completed' });
    const { status, json } = await call(verifyResolution)(c._id, {});
    assert.equal(status, 400);
    assert.match(json.message, /verification note/i);
  });

  it('sends work back for rework when verification fails', async () => {
    const c = await mkComplaint({ status: 'Completed' });
    const { status, json } = await call(verifyResolution)(c._id, { note: 'Still broken', verified: 'false' });
    assert.equal(status, 200);
    assert.equal(json.data.status, 'In Progress');
    assert.equal(json.data.resolutionVerification.verified, false);
  });
});

// ── Reopen / close ────────────────────────────────────────────────────────────
describe('reopen / close', () => {
  it('closes a resolved complaint', async () => {
    const c = await mkComplaint({ status: 'Resolved' });
    const { status, json } = await call(closeComplaint)(c._id);
    assert.equal(status, 200);
    assert.equal(json.data.status, 'Closed');
  });

  it('refuses to close a non-resolved complaint', async () => {
    const c = await mkComplaint({ status: 'In Progress' });
    const { status, json } = await call(closeComplaint)(c._id);
    assert.equal(status, 400);
    assert.match(json.message, /only resolved/i);
  });

  it('reopens a closed complaint and increments reopenedCount', async () => {
    const c = await mkComplaint({ status: 'Closed', reopenedCount: 1 });
    const { status, json } = await call(reopenComplaint)(c._id);
    assert.equal(status, 200);
    assert.equal(json.data.status, 'In Review');
    assert.equal(json.data.reopenedCount, 2);
  });

  it('refuses to reopen an open complaint', async () => {
    const c = await mkComplaint({ status: 'In Review' });
    const { status, json } = await call(reopenComplaint)(c._id);
    assert.equal(status, 400);
    assert.match(json.message, /only closed/i);
  });
});

// ── Citizen feedback ──────────────────────────────────────────────────────────
describe('citizen feedback', () => {
  it('records a rating + comment from the reporter after resolution', async () => {
    const reporterId = new mongoose.Types.ObjectId();
    const c = await mkComplaint({ status: 'Resolved', reporter: reporterId });
    const { status, json } = await call(submitFeedback)(c._id, { rating: 5, comment: 'Great service' }, {
      user: { _id: reporterId, role: 'citizen', fullName: 'Kebede' },
    });
    assert.equal(status, 200);
    assert.equal(json.data.citizenFeedback.rating, 5);
    assert.equal(json.data.citizenFeedback.comment, 'Great service');
    assert.ok(json.data.citizenFeedback.at);
  });

  it('rejects feedback before the complaint is resolved', async () => {
    const reporterId = new mongoose.Types.ObjectId();
    const c = await mkComplaint({ status: 'In Progress', reporter: reporterId });
    const { status, json } = await call(submitFeedback)(c._id, { rating: 4 }, {
      user: { _id: reporterId, role: 'citizen', fullName: 'Kebede' },
    });
    assert.equal(status, 400);
    assert.match(json.message, /resolved/i);
  });

  it('rejects feedback from a user who is not the reporter', async () => {
    const c = await mkComplaint({ status: 'Resolved' });
    const stranger = new mongoose.Types.ObjectId();
    const { status, json } = await call(submitFeedback)(c._id, { rating: 4 }, {
      user: { _id: stranger, role: 'citizen', fullName: 'Stranger' },
    });
    assert.equal(status, 403);
  });

  it('rejects invalid ratings', async () => {
    const reporterId = new mongoose.Types.ObjectId();
    const c = await mkComplaint({ status: 'Resolved', reporter: reporterId });
    const { status, json } = await call(submitFeedback)(c._id, { rating: 9 }, {
      user: { _id: reporterId, role: 'citizen', fullName: 'Kebede' },
    });
    assert.equal(status, 400);
    assert.match(json.message, /between 1 and 5/i);
  });
});

// ── Assignable user lookup ────────────────────────────────────────────────────
describe('getAssignableUsers', () => {
  it('returns only active inspectors filtered by subcity', async () => {
    const bole = await mkUser({ role: 'inspector', subcity: 'Bole', fullName: 'Bole Inspector' });
    await mkUser({ role: 'inspector', subcity: 'Yeka', fullName: 'Yeka Inspector' });
    await mkUser({ role: 'technician', fullName: 'Tech' });

    const { status, json } = await call(getAssignableUsers)(null, {}, {
      query: { role: 'inspector', subcity: 'Bole' },
    });
    assert.equal(status, 200);
    assert.equal(json.data.length, 1);
    assert.equal(String(json.data[0]._id), String(bole._id));
  });

  it('returns only active technicians filtered by woreda', async () => {
    const w1 = new mongoose.Types.ObjectId();
    const w2 = new mongoose.Types.ObjectId();
    const t1 = await mkUser({ role: 'technician', woredaId: w1, fullName: 'T1' });
    await mkUser({ role: 'technician', woredaId: w2, fullName: 'T2' });

    const { status, json } = await call(getAssignableUsers)(null, {}, { query: { role: 'technician', woredaId: w1 } });
    assert.equal(status, 200);
    assert.equal(json.data.length, 1);
    assert.equal(String(json.data[0]._id), String(t1._id));
  });

  it('rejects an unknown role', async () => {
    const { status, json } = await call(getAssignableUsers)(null, {}, { query: { role: 'wizard' } });
    assert.equal(status, 400);
    assert.match(json.message, /inspector or technician/i);
  });
});
