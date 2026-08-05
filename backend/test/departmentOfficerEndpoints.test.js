/**
 * Tests for the Department Management endpoints:
 *   - Department CRUD          (createDepartment / updateDepartment / getDepartmentsBySubcity)
 *   - Department officer provisioning (createDepartmentOfficer)
 *   - Department officer user listing  (getUsers ?role=department_officer)
 *   - department_officer complaint scope (buildComplaintScope / isComplaintInScope)
 *
 * The department_officer role is distinct from department / DEPARTMENT_ADMIN
 * (complaint-management hierarchy). These endpoints are admin-only.
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
const Woreda = require('../src/models/Woreda');
const Department = require('../src/models/Department');
const {
  createDepartment,
  updateDepartment,
  getDepartmentsBySubcity,
  createDepartmentOfficer,
  getUsers,
} = require('../src/controllers/adminController');
const { buildComplaintScope, isComplaintInScope } = require('../src/utils/scopeFilter');

let mongod;

const mockRes = () => {
  const res = { _status: 200, _json: null };
  res.status = function (s) { res._status = s; return res; };
  res.json = function (obj) { res._json = obj; return res; };
  return res;
};

const adminReq = (body = {}, params = {}, query = {}) => ({
  body,
  params,
  query,
  user: { _id: new mongoose.Types.ObjectId(), role: 'ADMIN', fullName: 'Admin' },
  app: { get: () => null },
});

const call = (fn) => async (req) => {
  const res = mockRes();
  await fn(req, res);
  return { status: res._status, json: res._json };
};

const mkSubcity = (over = {}) =>
  Subcity.create({ name: 'Bole', description: '', status: 'Active', ...over });

const mkWoreda = (over = {}) =>
  Woreda.create({
    name: '01',
    code: 'W01',
    subcity: 'Bole',
    description: '',
    status: 'Active',
    ...over,
  });

const mkDepartment = (over = {}) =>
  Department.create({
    name: 'Electricity',
    subcityId: null,
    subcityName: 'Bole',
    woredaId: null,
    woredaName: '',
    description: '',
    status: 'Active',
    ...over,
  });

const mkOfficer = (over = {}) =>
  User.create({
    fullName: 'Dept Officer',
    email: `dofficer_${Math.random().toString(36).slice(2, 10)}@zda.et`,
    password: 'password123',
    phone: '0911223344',
    role: 'department_officer',
    ...over,
  });

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  await User.init();
  await Subcity.init();
  await Woreda.init();
  await Department.init();
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Subcity.deleteMany({});
  await Woreda.deleteMany({});
  await Department.deleteMany({});
});

describe('POST /api/departments — createDepartment', () => {
  it('creates a department with a live subcityId and code', async () => {
    const subcity = await mkSubcity();
    const { status, json } = await call(createDepartment)(adminReq({
      name: 'Electricity', code: 'ELEC', subcityId: subcity._id, description: 'Power', status: 'Active',
    }));

    assert.equal(status, 201);
    assert.equal(json.success, true);
    assert.equal(json.department.name, 'electricity');
    assert.equal(json.department.code, 'ELEC');
    assert.equal(String(json.department.subcityId), String(subcity._id));
    assert.equal(json.department.subcityName, 'Bole');
    assert.equal(json.department.status, 'Active');
  });

  it('rejects a missing department name', async () => {
    const subcity = await mkSubcity();
    const { status } = await call(createDepartment)(adminReq({ subcityId: subcity._id }));
    assert.equal(status, 400);
  });

  it('rejects an unknown subcity', async () => {
    const { status } = await call(createDepartment)(adminReq({ name: 'Electricity', subcityId: new mongoose.Types.ObjectId() }));
    assert.equal(status, 404);
  });

  it('rejects duplicate department names within the same subcity (409)', async () => {
    const subcity = await mkSubcity();
    await mkDepartment({ subcityId: subcity._id });
    const { status, json } = await call(createDepartment)(adminReq({ name: 'electricity ', subcityId: subcity._id }));
    assert.equal(status, 409);
    assert.match(json.message, /already exists/i);
  });

  it('allows the same department name in a different subcity', async () => {
    const subcity = await mkSubcity();
    await mkDepartment({ subcityId: subcity._id });
    const yeka = await Subcity.create({ name: 'Yeka' });
    const { status } = await call(createDepartment)(adminReq({ name: 'Electricity', subcityId: yeka._id }));
    assert.equal(status, 201);
  });
});

describe('PUT /api/departments/:id — updateDepartment', () => {
  it('updates name, code and status', async () => {
    const subcity = await mkSubcity();
    const department = await mkDepartment({ subcityId: subcity._id });

    const { status, json } = await call(updateDepartment)(adminReq(
      { name: 'Power Distribution', code: 'PD-1', status: 'Inactive' },
      { id: department._id }
    ));

    assert.equal(status, 200);
    assert.equal(json.department.name, 'power distribution');
    assert.equal(json.department.code, 'PD-1');
    assert.equal(json.department.status, 'Inactive');
  });

  it('rejects renaming to a duplicate within the same subcity (409)', async () => {
    const subcity = await mkSubcity();
    const a = await mkDepartment({ name: 'Electricity', subcityId: subcity._id });
    await mkDepartment({ name: 'Water', subcityId: subcity._id });

    const { status } = await call(updateDepartment)(adminReq({ name: 'Water' }, { id: a._id }));
    assert.equal(status, 409);
  });

  it('returns 404 for an unknown department', async () => {
    const { status } = await call(updateDepartment)(adminReq(
      { name: 'X' },
      { id: new mongoose.Types.ObjectId() }
    ));
    assert.equal(status, 404);
  });
});

describe('GET /api/departments/by-subcity/:subcityId — getDepartmentsBySubcity', () => {
  it('returns only active departments of the given subcity', async () => {
    const subcity = await mkSubcity();
    await mkDepartment({ name: 'Electricity', subcityId: subcity._id });
    await mkDepartment({ name: 'Water', subcityId: subcity._id });
    await mkDepartment({ name: 'Road', subcityId: subcity._id, status: 'Inactive' });
    const yeka = await Subcity.create({ name: 'Yeka' });
    await mkDepartment({ name: 'Electricity', subcityId: yeka._id, subcityName: 'Yeka' });

    const { status, json } = await call(getDepartmentsBySubcity)(adminReq({}, { subcityId: subcity._id }));
    assert.equal(status, 200);
    const names = json.departments.map((d) => d.name).sort();
    assert.deepEqual(names, ['Electricity', 'Water']);
  });

  it('matches legacy departments by subcityName when subcityId is null', async () => {
    const subcity = await mkSubcity();
    await mkDepartment({ name: 'Health', subcityId: null });

    const { status, json } = await call(getDepartmentsBySubcity)(adminReq({}, { subcityId: subcity._id }));
    assert.equal(status, 200);
    assert.deepEqual(json.departments.map((d) => d.name), ['Health']);
  });

  it('rejects an invalid subcity id', async () => {
    const { status } = await call(getDepartmentsBySubcity)(adminReq({}, { subcityId: 'nope' }));
    assert.equal(status, 400);
  });

  it('returns 404 for a missing subcity', async () => {
    const { status } = await call(getDepartmentsBySubcity)(adminReq(
      {}, { subcityId: new mongoose.Types.ObjectId() }
    ));
    assert.equal(status, 404);
  });
});

describe('POST /api/admin/department-officers — createDepartmentOfficer', () => {
  const validBody = (over = {}) => ({
    subcityId: null,
    woredaId: null,
    departmentId: null,
    fullName: 'Alem Department Officer',
    email: 'alem.officer@zda.et',
    password: 'password123',
    phone: '0911223344',
    ...over,
  });

  const scopeFixtures = async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda({ subcityId: subcity._id });
    const department = await mkDepartment({ subcityId: subcity._id });
    return { subcity, woreda, department };
  };

  it('creates a department_officer scoped to subcity + woreda + department', async () => {
    const { subcity, woreda, department } = await scopeFixtures();

    const { status, json } = await call(createDepartmentOfficer)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, departmentId: department._id,
    })));

    assert.equal(status, 201);
    assert.equal(json.user.role, 'department_officer');
    assert.equal(json.user.subcity, 'Bole');
    assert.equal(json.user.woredaName, '01');
    assert.equal(json.user.department, 'Electricity');
    assert.equal(String(json.user.woredaId), String(woreda._id));
    assert.equal(String(json.user.departmentId), String(department._id));

    const saved = await User.findById(json.user._id);
    assert.equal(saved.isApproved, true);
    assert.equal(saved.isActive, true);
    assert.equal(String(saved.subcityId), String(subcity._id));
  });

  it('allows multiple officers in the same department', async () => {
    const { subcity, woreda, department } = await scopeFixtures();
    const first = await call(createDepartmentOfficer)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, departmentId: department._id, email: 'one@zda.et', phone: '0911223344',
    })));
    const second = await call(createDepartmentOfficer)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, departmentId: department._id, email: 'two@zda.et', phone: '0933445566',
    })));
    assert.equal(first.status, 201);
    assert.equal(second.status, 201);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const { subcity, woreda, department } = await scopeFixtures();
    const { status } = await call(createDepartmentOfficer)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, departmentId: department._id, password: 'short12',
    })));
    assert.equal(status, 400);
  });

  it('rejects an invalid phone number', async () => {
    const { subcity, woreda, department } = await scopeFixtures();
    const { status } = await call(createDepartmentOfficer)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, departmentId: department._id, phone: '111222333',
    })));
    assert.equal(status, 400);
  });

  it('rejects a duplicate email', async () => {
    const { subcity, woreda, department } = await scopeFixtures();
    await mkOfficer({ email: 'taken@zda.et' });

    const { status } = await call(createDepartmentOfficer)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, departmentId: department._id, email: 'TAKEN@zda.et', phone: '0933445566',
    })));
    assert.equal(status, 400);
  });

  it('rejects a duplicate phone number', async () => {
    const { subcity, woreda, department } = await scopeFixtures();
    await mkOfficer({ phone: '0955667788' });

    const { status } = await call(createDepartmentOfficer)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, departmentId: department._id, email: 'new@zda.et', phone: '0955667788',
    })));
    assert.equal(status, 400);
  });

  it('rejects an inactive subcity', async () => {
    const subcity = await mkSubcity({ status: 'Inactive' });
    const woreda = await mkWoreda({ subcityId: subcity._id });
    const department = await mkDepartment({ subcityId: subcity._id });
    const { status } = await call(createDepartmentOfficer)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, departmentId: department._id,
    })));
    assert.equal(status, 400);
  });

  it('rejects an inactive woreda', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda({ subcityId: subcity._id, status: 'Inactive', isActive: false });
    const department = await mkDepartment({ subcityId: subcity._id });
    const { status } = await call(createDepartmentOfficer)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, departmentId: department._id,
    })));
    assert.equal(status, 400);
  });

  it('rejects an inactive department', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda({ subcityId: subcity._id });
    const department = await mkDepartment({ subcityId: subcity._id, status: 'Inactive' });
    const { status } = await call(createDepartmentOfficer)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, departmentId: department._id,
    })));
    assert.equal(status, 400);
  });

  it('rejects a woreda that belongs to a different subcity', async () => {
    const subcity = await mkSubcity();
    const other = await Subcity.create({ name: 'Yeka' });
    const woreda = await mkWoreda({ subcity: 'Yeka', subcityId: other._id });
    const department = await mkDepartment({ subcityId: subcity._id });
    const { status } = await call(createDepartmentOfficer)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, departmentId: department._id,
    })));
    assert.equal(status, 400);
  });

  it('rejects a department that belongs to a different subcity', async () => {
    const subcity = await mkSubcity();
    const other = await Subcity.create({ name: 'Yeka' });
    const woreda = await mkWoreda({ subcityId: subcity._id });
    const department = await mkDepartment({ subcity: 'Yeka', subcityId: other._id, subcityName: 'Yeka' });
    const { status } = await call(createDepartmentOfficer)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, departmentId: department._id,
    })));
    assert.equal(status, 400);
  });

  it('rejects when subcity, woreda or department is missing', async () => {
    const { subcity, woreda, department } = await scopeFixtures();
    assert.equal((await call(createDepartmentOfficer)(adminReq(validBody({ woredaId: woreda._id, departmentId: department._id })))).status, 400);
    assert.equal((await call(createDepartmentOfficer)(adminReq(validBody({ subcityId: subcity._id, departmentId: department._id })))).status, 400);
    assert.equal((await call(createDepartmentOfficer)(adminReq(validBody({ subcityId: subcity._id, woredaId: woreda._id })))).status, 400);
  });
});

describe('GET /api/users?role=department_officer — getUsers', () => {
  it('returns only department_officer accounts when filtered by role', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda({ subcityId: subcity._id });
    const department = await mkDepartment({ subcityId: subcity._id });
    await mkOfficer({ woredaId: woreda._id, departmentId: department._id, fullName: 'Officer A' });
    await mkOfficer({ woredaId: woreda._id, departmentId: department._id, fullName: 'Officer B' });
    await User.create({
      fullName: 'Subcity Person', email: 'sub@zda.et', password: 'password123',
      role: 'subcity_bole', subcity: 'Bole',
    });

    const { status, json } = await call(getUsers)(adminReq({}, {}, { role: 'department_officer' }));
    assert.equal(status, 200);
    assert.equal(json.total, 2);
    assert.ok(json.users.every((u) => u.role === 'department_officer'));
  });
});

describe('department_officer complaint scope', () => {
  it('builds an exact subcity + woreda + department ObjectId filter', () => {
    const scope = buildComplaintScope({
      role: 'department_officer',
      subcityId: 's1',
      woredaId: 'w1',
      departmentId: 'd1',
    });
    assert.deepEqual(scope, { subcityId: 's1', woredaId: 'w1', departmentId: 'd1' });
  });

  it('matches only complaints with the same subcityId, woredaId AND departmentId', () => {
    const user = { role: 'department_officer', subcityId: 's1', woredaId: 'w1', departmentId: 'd1', _id: 'u1' };
    assert.equal(isComplaintInScope(user, { subcityId: 's1', woredaId: 'w1', departmentId: 'd1' }), true);
    assert.equal(isComplaintInScope(user, { subcityId: 's2', woredaId: 'w1', departmentId: 'd1' }), false);
    assert.equal(isComplaintInScope(user, { subcityId: 's1', woredaId: 'w2', departmentId: 'd1' }), false);
    assert.equal(isComplaintInScope(user, { subcityId: 's1', woredaId: 'w1', departmentId: 'd2' }), false);
    assert.equal(isComplaintInScope(user, { subcityId: 's1', woredaId: 'w1' }), false);
  });
});
