/**
 * Tests for the role-scoped user assignment endpoints (/api/users/officers and
 * /api/users/technicians).
 *
 * These endpoints are the ONLY allowed source for the assign-officer and
 * assign-technician dropdowns. They must never return admins, managers,
 * heads or citizens — only dedicated OFFICER (and TECHNICIAN / CONTRACTOR)
 * accounts, filtered to the complaint's department / subcity / woreda.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const mongoose = require('mongoose');

const CANDIDATE_PATHS = {
  win32: [
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\MongoDB\\Server\\8.3\\bin\\mongod.exe`,
    process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}\\MongoDB\\Server\\8.0\\bin\\mongod.exe`,
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\MongoDB\\Server\\8.0\\bin\\mongod.exe`,
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
const { getOfficers, getTechnicians } = require('../src/controllers/userController');

let mongod;

const mockRes = () => {
  const res = { _status: 200, _json: null };
  res.status = function (s) { res._status = s; return res; };
  res.json = function (obj) { res._json = obj; return res; };
  return res;
};

const call = (fn) => async (query = {}) => {
  const res = mockRes();
  const req = {
    query,
    user: { _id: new mongoose.Types.ObjectId(), role: 'ADMIN', fullName: 'Admin' },
    app: { get: () => null },
  };
  await fn(req, res);
  return { status: res._status, json: res._json };
};

const mkUser = (over = {}) =>
  User.create({
    fullName: 'Agent One',
    email: `agent_${Math.random().toString(36).slice(2, 10)}@zda.et`,
    password: 'password123',
    role: 'admin',
    ...over,
  });

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

describe('GET /api/users/officers', () => {
  it('returns ONLY OFFICER users — admins and managers never appear', async () => {
    const officer = await mkUser({ role: 'OFFICER', fullName: 'Endris' });
    await mkUser({ role: 'admin', fullName: 'System Administrator' });
    await mkUser({ role: 'ADMIN', fullName: 'Admin Uppercase' });
    await mkUser({ role: 'DEPARTMENT_ADMIN', fullName: 'Dept Admin' });
    await mkUser({ role: 'SUBCITY_HEAD', fullName: 'Subcity Head' });
    await mkUser({ role: 'WOREDA_HEAD', fullName: 'Woreda Head' });
    await mkUser({ role: 'CITIZEN', fullName: 'Citizen' });
    await mkUser({ role: 'TECHNICIAN', fullName: 'Tech' });

    const { status, json } = await call(getOfficers)();
    assert.equal(status, 200);
    const names = json.data.officers.map((o) => o.fullName);
    assert.deepEqual(names, ['Endris']);
    assert.ok(json.data.officers.every((o) => o.role === 'OFFICER'));
  });

  it('filters officers by the complaint department / subcity / woreda', async () => {
    const woreda01 = new mongoose.Types.ObjectId();
    const complaint = await mkComplaint({ woredaId: woreda01 });

    await mkUser({ role: 'OFFICER', fullName: 'Endris', department: 'Electricity', subcity: 'BOLE', woredaId: woreda01 });
    await mkUser({ role: 'OFFICER', fullName: 'Wrong Dept', department: 'Water', subcity: 'BOLE', woredaId: woreda01 });
    await mkUser({ role: 'OFFICER', fullName: 'Wrong Subcity', department: 'Electricity', subcity: 'YEKA', woredaId: woreda01 });
    await mkUser({ role: 'OFFICER', fullName: 'Wrong Woreda', department: 'Electricity', subcity: 'BOLE', woredaId: new mongoose.Types.ObjectId() });
    await mkUser({ role: 'ADMIN', fullName: 'Offscope Admin' });

    const { status, json } = await call(getOfficers)({ complaintId: complaint._id.toString() });
    assert.equal(status, 200);
    const names = json.data.officers.map((o) => o.fullName);
    assert.deepEqual(names, ['Endris']);
  });

  it('returns 404 when the complaint does not exist', async () => {
    const { status, json } = await call(getOfficers)({ complaintId: new mongoose.Types.ObjectId().toString() });
    assert.equal(status, 404);
  });
});

describe('GET /api/users/technicians', () => {
  it('returns ONLY TECHNICIAN / CONTRACTOR users', async () => {
    const tech = await mkUser({ role: 'TECHNICIAN', fullName: 'Alemu' });
    const contractor = await mkUser({ role: 'CONTRACTOR', fullName: 'Contractor' });
    await mkUser({ role: 'admin', fullName: 'System Administrator' });
    await mkUser({ role: 'OFFICER', fullName: 'Endris' });
    await mkUser({ role: 'DEPARTMENT_ADMIN', fullName: 'Dept Admin' });
    await mkUser({ role: 'CITIZEN', fullName: 'Citizen' });

    const { status, json } = await call(getTechnicians)();
    assert.equal(status, 200);
    const names = json.data.technicians.map((t) => t.fullName);
    assert.deepEqual(names.sort(), [contractor.fullName, tech.fullName].sort());
    assert.ok(json.data.technicians.every((t) => t.role === 'TECHNICIAN' || t.role === 'CONTRACTOR'));
  });

  it('filters technicians by the complaint department / subcity / woreda', async () => {
    const woreda01 = new mongoose.Types.ObjectId();
    const complaint = await mkComplaint({ woredaId: woreda01 });

    await mkUser({ role: 'TECHNICIAN', fullName: 'Alemu', department: 'Electricity', subcity: 'BOLE', woredaId: woreda01 });
    await mkUser({ role: 'CONTRACTOR', fullName: 'Outsourced', department: 'Electricity', subcity: 'BOLE', woredaId: woreda01 });
    await mkUser({ role: 'TECHNICIAN', fullName: 'Wrong Dept', department: 'Water', subcity: 'BOLE', woredaId: woreda01 });
    await mkUser({ role: 'TECHNICIAN', fullName: 'Wrong Woreda', department: 'Electricity', subcity: 'BOLE', woredaId: new mongoose.Types.ObjectId() });

    const { status, json } = await call(getTechnicians)({ complaintId: complaint._id.toString() });
    assert.equal(status, 200);
    const names = json.data.technicians.map((t) => t.fullName);
    assert.deepEqual(names.sort(), ['Alemu', 'Outsourced'].sort());
  });
});
