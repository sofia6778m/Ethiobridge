/**
 * Tests for the role-scoped user assignment endpoints (/api/users/officers and
 * /api/users/technicians).
 *
 * These endpoints are the ONLY allowed source for the assign-officer and
 * assign-technician dropdowns. They must never return admins, managers,
 * heads or citizens — only dedicated OFFICER (and TECHNICIAN / CONTRACTOR)
 * accounts.
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

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
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

  it('filters officers by explicit location params', async () => {
    const woreda01 = new mongoose.Types.ObjectId();

    await mkUser({ role: 'OFFICER', fullName: 'Endris', department: 'Electricity', subcity: 'BOLE', woredaId: woreda01 });
    await mkUser({ role: 'OFFICER', fullName: 'Wrong Woreda', department: 'Electricity', subcity: 'BOLE', woredaId: new mongoose.Types.ObjectId() });
    await mkUser({ role: 'ADMIN', fullName: 'Offscope Admin' });

    const { status, json } = await call(getOfficers)({ woredaId: woreda01.toString() });
    assert.equal(status, 200);
    const names = json.data.officers.map((o) => o.fullName);
    assert.deepEqual(names, ['Endris']);
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
});
