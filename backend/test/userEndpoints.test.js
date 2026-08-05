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
const Subcity = require('../src/models/Subcity');
const Department = require('../src/models/Department');
const Woreda = require('../src/models/Woreda');
const { getOfficers, getTechnicians } = require('../src/controllers/userController');
const { createUser } = require('../src/controllers/adminController');

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
  await Subcity.init();
  await Department.init();
  await Woreda.init();
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await PublicComplaint.deleteMany({});
  await User.deleteMany({});
  await Subcity.deleteMany({});
  await Department.deleteMany({});
  await Woreda.deleteMany({});
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

  it('matches officers by subcityId when a Subcity record exists for the complaint', async () => {
    const sc = await Subcity.create({ name: 'Bole' });
    const woreda01 = new mongoose.Types.ObjectId();
    const complaint = await mkComplaint({ subcity: 'BOLE', woredaId: woreda01 });

    await mkUser({ role: 'OFFICER', fullName: 'Endris', department: 'Electricity', subcityId: sc._id, woredaId: woreda01 });
    await mkUser({ role: 'OFFICER', fullName: 'Other Subcity', department: 'Electricity', subcityId: new mongoose.Types.ObjectId(), woredaId: woreda01 });

    const { status, json } = await call(getOfficers)({ complaintId: complaint._id.toString() });
    assert.equal(status, 200);
    const names = json.data.officers.map((o) => o.fullName);
    assert.deepEqual(names, ['Endris']);
  });

  it('matches officers by departmentId when a Department record exists for the complaint', async () => {
    const woreda01 = new mongoose.Types.ObjectId();
    const dept = await Department.create({ name: 'Electricity', woredaId: woreda01 });
    const complaint = await mkComplaint({ subcity: '', department: 'Electricity', woredaId: woreda01 });

    await mkUser({ role: 'OFFICER', fullName: 'Endris', departmentId: dept._id, woredaId: woreda01 });
    await mkUser({ role: 'OFFICER', fullName: 'Wrong Dept', departmentId: new mongoose.Types.ObjectId(), woredaId: woreda01 });

    const { status, json } = await call(getOfficers)({ complaintId: complaint._id.toString() });
    assert.equal(status, 200);
    const names = json.data.officers.map((o) => o.fullName);
    assert.deepEqual(names, ['Endris']);
  });

  it('finds a legacy string-only officer for a subcity-scoped department complaint (production data shape)', async () => {
    // Production departments are stored per-subcity with lowercase names, and
    // legacy officers carry no subcityId / departmentId — only string fields.
    const koye = await Subcity.create({ name: 'Koye' });
    const koyeWoreda03 = new mongoose.Types.ObjectId();
    await Department.create({ name: 'electricity', subcityId: koye._id });
    await Department.create({ name: 'road', subcityId: koye._id });

    const complaint = await mkComplaint({
      subcity: 'KOYE',
      woredaId: koyeWoreda03,
      woredaName: '03',
      department: 'Electricity',
    });

    await mkUser({
      role: 'OFFICER', fullName: 'Alex',
      department: 'Electricity', subcity: 'koye',
      woredaId: koyeWoreda03, woredaName: '03',
    });
    await mkUser({
      role: 'OFFICER', fullName: 'Wrong Dept',
      department: 'Road', subcity: 'koye',
      woredaId: koyeWoreda03, woredaName: '03',
    });

    const { status, json } = await call(getOfficers)({ complaintId: complaint._id.toString() });
    assert.equal(status, 200);
    const names = json.data.officers.map((o) => o.fullName);
    assert.deepEqual(names, ['Alex']);
  });

  it('matches an officer by departmentId when the department is subcity-scoped', async () => {
    const bole = await Subcity.create({ name: 'Bole' });
    const boleWoreda01 = new mongoose.Types.ObjectId();
    const dept = await Department.create({ name: 'electricity', subcityId: bole._id });

    const complaint = await mkComplaint({ subcity: 'BOLE', woredaId: boleWoreda01, department: 'Electricity' });

    await mkUser({
      role: 'OFFICER', fullName: 'Endris',
      departmentId: dept._id, subcityId: bole._id, woredaId: boleWoreda01,
    });
    await mkUser({
      role: 'OFFICER', fullName: 'Other Dept',
      departmentId: new mongoose.Types.ObjectId(), subcityId: bole._id, woredaId: boleWoreda01,
    });

    const { status, json } = await call(getOfficers)({ complaintId: complaint._id.toString() });
    assert.equal(status, 200);
    const names = json.data.officers.map((o) => o.fullName);
    assert.deepEqual(names, ['Endris']);
  });

  it('matches a legacy officer by woredaName when the complaint has no woredaId', async () => {
    const complaint = await mkComplaint({ woredaId: undefined, woredaName: '01', subcity: 'BOLE', department: 'Electricity' });

    await mkUser({ role: 'OFFICER', fullName: 'Legacy', department: 'Electricity', subcity: 'BOLE', woredaName: '01' });
    await mkUser({ role: 'OFFICER', fullName: 'Wrong Name', department: 'Electricity', subcity: 'BOLE', woredaName: '02' });
    await mkUser({ role: 'OFFICER', fullName: 'Has WoredaId', department: 'Electricity', subcity: 'BOLE', woredaName: '01', woredaId: new mongoose.Types.ObjectId() });

    const { status, json } = await call(getOfficers)({ complaintId: complaint._id.toString() });
    assert.equal(status, 200);
    const names = json.data.officers.map((o) => o.fullName);
    assert.deepEqual(names, ['Legacy']);
  });

  it('returns 404 when the complaint does not exist', async () => {
    const { status, json } = await call(getOfficers)({ complaintId: new mongoose.Types.ObjectId().toString() });
    assert.equal(status, 404);
  });
});

describe('createUser (admin) departmentId resolution', () => {
  it('captures subcityId + departmentId for an OFFICER against subcity-scoped lowercase departments', async () => {
    const koye = await Subcity.create({ name: 'Koye' });
    const woreda = await Woreda.create({ name: '03', subcity: 'koye', departments: ['Electricity', 'Road'] });
    const dept = await Department.create({ name: 'electricity', subcityId: koye._id });

    const res = mockRes();
    await createUser({
      body: {
        fullName: 'Alex', email: 'alex2@example.com', password: 'secret123', phone: '0911223344',
        role: 'OFFICER', subcity: 'koye', woredaId: woreda._id.toString(), woredaName: '03', department: 'Electricity',
        subcityId: koye._id.toString(), departmentId: dept._id.toString(),
      },
      user: { _id: new mongoose.Types.ObjectId(), role: 'ADMIN', fullName: 'Admin' },
    }, res);

    assert.equal(res._status, 201, JSON.stringify(res._json));
    const saved = await User.findOne({ email: 'alex2@example.com' }).lean();
    assert.equal(saved.role, 'OFFICER');
    assert.equal(String(saved.subcityId), String(koye._id));
    assert.equal(String(saved.departmentId), String(dept._id));
    const savedDept = await Department.findById(saved.departmentId).lean();
    assert.equal(savedDept.normalizedDepartmentName, 'electricity');
  });

  it('creates an OFFICER and saves subcityId + departmentId', async () => {
    const bole = await Subcity.create({ name: 'Bole' });
    const woreda = await Woreda.create({ name: '01', subcity: 'Bole', departments: ['Water'] });
    const dept = await Department.create({ name: 'Water', subcityId: bole._id, woredaId: woreda._id });

    const res = mockRes();
    await createUser({
      body: {
        fullName: 'Sara', email: 'sara@example.com', password: 'secret123', phone: '0911223344',
        role: 'OFFICER', subcity: 'Bole', woredaId: woreda._id.toString(), woredaName: '01', department: 'Water',
        subcityId: bole._id.toString(), departmentId: dept._id.toString(),
      },
      user: { _id: new mongoose.Types.ObjectId(), role: 'ADMIN', fullName: 'Admin' },
    }, res);

    assert.equal(res._status, 201, JSON.stringify(res._json));
    const saved = await User.findOne({ email: 'sara@example.com' }).lean();
    assert.equal(saved.role, 'OFFICER');
    assert.equal(String(saved.subcityId), String(bole._id));
    assert.equal(String(saved.departmentId), String(dept._id));
  });

  it('rejects an OFFICER when subcityId is missing', async () => {
    const koye = await Subcity.create({ name: 'Koye' });
    const woreda = await Woreda.create({ name: '03', subcity: 'koye', departments: ['Electricity'] });
    const dept = await Department.create({ name: 'electricity', subcityId: koye._id });

    const res = mockRes();
    await createUser({
      body: {
        fullName: 'No Subcity', email: 'nosubcity@example.com', password: 'secret123', phone: '0911223344',
        role: 'OFFICER', subcity: 'koye', woredaId: woreda._id.toString(), woredaName: '03', department: 'Electricity',
        departmentId: dept._id.toString(),
      },
      user: { _id: new mongoose.Types.ObjectId(), role: 'ADMIN', fullName: 'Admin' },
    }, res);

    assert.equal(res._status, 400);
    assert.match(res._json.message, /subcity/i);
    const saved = await User.findOne({ email: 'nosubcity@example.com' }).lean();
    assert.equal(saved, null);
  });

  it('rejects an OFFICER when departmentId is missing', async () => {
    const koye = await Subcity.create({ name: 'Koye' });
    const woreda = await Woreda.create({ name: '03', subcity: 'koye', departments: ['Electricity'] });

    const res = mockRes();
    await createUser({
      body: {
        fullName: 'No Dept', email: 'nodept@example.com', password: 'secret123', phone: '0911223344',
        role: 'OFFICER', subcity: 'koye', woredaId: woreda._id.toString(), woredaName: '03', department: 'Electricity',
        subcityId: koye._id.toString(),
      },
      user: { _id: new mongoose.Types.ObjectId(), role: 'ADMIN', fullName: 'Admin' },
    }, res);

    assert.equal(res._status, 400);
    assert.match(res._json.message, /department/i);
    const saved = await User.findOne({ email: 'nodept@example.com' }).lean();
    assert.equal(saved, null);
  });

  it('rejects an OFFICER when departmentId is invalid', async () => {
    const koye = await Subcity.create({ name: 'Koye' });
    const woreda = await Woreda.create({ name: '03', subcity: 'koye', departments: ['Electricity'] });

    const res = mockRes();
    await createUser({
      body: {
        fullName: 'Bad Dept', email: 'baddept@example.com', password: 'secret123', phone: '0911223344',
        role: 'OFFICER', subcity: 'koye', woredaId: woreda._id.toString(), woredaName: '03', department: 'Electricity',
        subcityId: koye._id.toString(), departmentId: new mongoose.Types.ObjectId().toString(),
      },
      user: { _id: new mongoose.Types.ObjectId(), role: 'ADMIN', fullName: 'Admin' },
    }, res);

    assert.equal(res._status, 400);
    assert.match(res._json.message, /department/i);
    const saved = await User.findOne({ email: 'baddept@example.com' }).lean();
    assert.equal(saved, null);
  });

  it('rejects an OFFICER when subcityId is invalid', async () => {
    const woreda = await Woreda.create({ name: '03', subcity: 'koye', departments: ['Electricity'] });
    const dept = await Department.create({ name: 'electricity', woredaId: woreda._id });

    const res = mockRes();
    await createUser({
      body: {
        fullName: 'Bad Subcity', email: 'badsubcity@example.com', password: 'secret123', phone: '0911223344',
        role: 'OFFICER', subcity: 'koye', woredaId: woreda._id.toString(), woredaName: '03', department: 'Electricity',
        subcityId: new mongoose.Types.ObjectId().toString(), departmentId: dept._id.toString(),
      },
      user: { _id: new mongoose.Types.ObjectId(), role: 'ADMIN', fullName: 'Admin' },
    }, res);

    assert.equal(res._status, 400);
    assert.match(res._json.message, /subcity/i);
    const saved = await User.findOne({ email: 'badsubcity@example.com' }).lean();
    assert.equal(saved, null);
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
