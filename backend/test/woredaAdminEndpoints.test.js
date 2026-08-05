/**
 * Tests for the Woreda Management endpoints:
 *   - Woreda CRUD        (createWoreda / updateWoreda / getWoredasBySubcity)
 *   - Woreda admin provisioning (createWoredaAdmin)
 *   - Woreda admin user listing  (getUsers ?role=woreda_admin)
 *
 * The woreda_admin role is distinct from WOREDA_ADMIN (hierarchy dashboard).
 * These endpoints are admin-only and enforce one woreda_admin per woreda.
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
const {
  createWoreda,
  updateWoreda,
  getWoredasBySubcity,
  createWoredaAdmin,
  getUsers,
} = require('../src/controllers/adminController');

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

const mkWoredaAdminUser = (over = {}) =>
  User.create({
    fullName: 'Woreda Admin',
    email: `wadmin_${Math.random().toString(36).slice(2, 10)}@zda.et`,
    password: 'password123',
    phone: '0911223344',
    role: 'woreda_admin',
    ...over,
  });

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  await User.init();
  await Subcity.init();
  await Woreda.init();
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Subcity.deleteMany({});
  await Woreda.deleteMany({});
});

describe('POST /api/woredas — createWoreda', () => {
  it('creates a woreda with a live subcityId reference', async () => {
    const subcity = await mkSubcity();
    const { status, json } = await call(createWoreda)(adminReq({
      name: '01', code: 'W01', subcityId: subcity._id, description: 'Test', status: 'Active',
    }));

    assert.equal(status, 201);
    assert.equal(json.success, true);
    assert.equal(json.woreda.name, '01');
    assert.equal(json.woreda.code, 'W01');
    assert.equal(String(json.woreda.subcityId), String(subcity._id));
    assert.equal(json.woreda.subcity, 'Bole');
    assert.equal(json.woreda.status, 'Active');
  });

  it('falls back to a case-insensitive subcity name lookup', async () => {
    await mkSubcity();
    const { status, json } = await call(createWoreda)(adminReq({ name: '02', subcity: 'bOle' }));
    assert.equal(status, 201);
    assert.equal(json.woreda.subcity, 'Bole');
  });

  it('rejects a missing woreda name', async () => {
    const subcity = await mkSubcity();
    const { status } = await call(createWoreda)(adminReq({ subcityId: subcity._id }));
    assert.equal(status, 400);
  });

  it('rejects an unknown subcity', async () => {
    const { status } = await call(createWoreda)(adminReq({ name: '01', subcity: 'Nope' }));
    assert.equal(status, 400);
  });

  it('rejects duplicate woreda names within the same subcity (case-insensitive)', async () => {
    const subcity = await mkSubcity();
    await mkWoreda({ name: '01', subcityId: subcity._id });
    const { status, json } = await call(createWoreda)(adminReq({ name: '01', subcityId: subcity._id }));
    assert.equal(status, 400);
    assert.match(json.message, /already exists/i);
  });

  it('allows the same woreda name in a different subcity', async () => {
    await mkSubcity(); // Bole
    const yeka = await Subcity.create({ name: 'Yeka' });
    await mkWoreda({ name: '01', subcityId: null });
    const { status } = await call(createWoreda)(adminReq({ name: '01', subcityId: yeka._id }));
    assert.equal(status, 201);
  });
});

describe('PUT /api/woredas/:id — updateWoreda', () => {
  it('updates name, code and status', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda({ subcityId: subcity._id });

    const { status, json } = await call(updateWoreda)(adminReq(
      { name: '01 A', code: 'W01A', status: 'Inactive' },
      { id: woreda._id }
    ));

    assert.equal(status, 200);
    assert.equal(json.woreda.name, '01 A');
    assert.equal(json.woreda.code, 'W01A');
    assert.equal(json.woreda.status, 'Inactive');
    assert.equal(json.woreda.isActive, false);
  });

  it('rejects renaming to a duplicate within the same subcity', async () => {
    const subcity = await mkSubcity();
    const a = await mkWoreda({ name: 'A', subcityId: subcity._id });
    await mkWoreda({ name: 'B', subcityId: subcity._id });

    const { status } = await call(updateWoreda)(adminReq({ name: 'B' }, { id: a._id }));
    assert.equal(status, 400);
  });

  it('returns 404 for an unknown woreda', async () => {
    const { status } = await call(updateWoreda)(adminReq(
      { name: 'X' },
      { id: new mongoose.Types.ObjectId() }
    ));
    assert.equal(status, 404);
  });
});

describe('GET /api/woredas/by-subcity/:subcityId — getWoredasBySubcity', () => {
  it('returns only active woredas of the given subcity', async () => {
    const subcity = await mkSubcity();
    await mkWoreda({ name: '01', subcityId: subcity._id });
    await mkWoreda({ name: '02', subcityId: subcity._id });
    await mkWoreda({ name: '03', subcityId: subcity._id, status: 'Inactive', isActive: false });
    const yeka = await Subcity.create({ name: 'Yeka' });
    await mkWoreda({ name: '01', subcity: 'Yeka', subcityId: yeka._id });

    const { status, json } = await call(getWoredasBySubcity)(adminReq({}, { subcityId: subcity._id }));
    assert.equal(status, 200);
    const names = json.woredas.map((w) => w.name).sort();
    assert.deepEqual(names, ['01', '02']);
  });

  it('matches legacy woredas by subcity name when subcityId is null', async () => {
    const subcity = await mkSubcity();
    await mkWoreda({ name: '01', subcityId: null });

    const { status, json } = await call(getWoredasBySubcity)(adminReq({}, { subcityId: subcity._id }));
    assert.equal(status, 200);
    assert.deepEqual(json.woredas.map((w) => w.name), ['01']);
  });

  it('rejects an invalid subcity id', async () => {
    const { status } = await call(getWoredasBySubcity)(adminReq({}, { subcityId: 'nope' }));
    assert.equal(status, 400);
  });

  it('returns 404 for a missing subcity', async () => {
    const { status } = await call(getWoredasBySubcity)(adminReq(
      {}, { subcityId: new mongoose.Types.ObjectId() }
    ));
    assert.equal(status, 404);
  });
});

describe('POST /api/admin/woreda-admins — createWoredaAdmin', () => {
  const validBody = (over = {}) => ({
    subcityId: null,
    woredaId: null,
    fullName: 'Alem Woreda Admin',
    email: 'alem.woreda@zda.et',
    password: 'password123',
    phone: '0911223344',
    ...over,
  });

  it('creates a woreda_admin account scoped to its subcity + woreda', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda({ subcityId: subcity._id });

    const { status, json } = await call(createWoredaAdmin)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id,
    })));

    assert.equal(status, 201);
    assert.equal(json.user.role, 'woreda_admin');
    assert.equal(json.user.subcity, 'Bole');
    assert.equal(json.user.woredaName, '01');
    assert.equal(String(json.user.woredaId), String(woreda._id));

    const saved = await User.findById(json.user._id);
    assert.equal(saved.isApproved, true);
    assert.equal(saved.isActive, true);

    const updatedWoreda = await Woreda.findById(woreda._id);
    assert.equal(String(updatedWoreda.adminId), String(json.user._id));
  });

  it('accepts woredas with a legacy null subcityId via name comparison', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda({ subcityId: null });

    const { status } = await call(createWoredaAdmin)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id,
    })));
    assert.equal(status, 201);
  });

  it('rejects a password shorter than 8 characters', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda({ subcityId: subcity._id });
    const { status } = await call(createWoredaAdmin)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, password: 'short12',
    })));
    assert.equal(status, 400);
  });

  it('rejects an invalid phone number', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda({ subcityId: subcity._id });
    const { status } = await call(createWoredaAdmin)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, phone: '111222333',
    })));
    assert.equal(status, 400);
  });

  it('rejects a duplicate email', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda({ subcityId: subcity._id });
    await mkWoredaAdminUser({ email: 'taken@zda.et' });

    const { status } = await call(createWoredaAdmin)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, email: 'TAKEN@zda.et', phone: '0933445566',
    })));
    assert.equal(status, 400);
  });

  it('rejects a duplicate phone number', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda({ subcityId: subcity._id });
    await mkWoredaAdminUser({ phone: '0955667788' });

    const { status } = await call(createWoredaAdmin)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, email: 'new@zda.et', phone: '0955667788',
    })));
    assert.equal(status, 400);
  });

  it('rejects an inactive subcity', async () => {
    const subcity = await mkSubcity({ status: 'Inactive' });
    const woreda = await mkWoreda({ subcityId: subcity._id });
    const { status } = await call(createWoredaAdmin)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id,
    })));
    assert.equal(status, 400);
  });

  it('rejects an inactive woreda', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda({ subcityId: subcity._id, status: 'Inactive', isActive: false });
    const { status } = await call(createWoredaAdmin)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id,
    })));
    assert.equal(status, 400);
  });

  it('rejects a woreda that belongs to a different subcity', async () => {
    const subcity = await mkSubcity();
    const other = await Subcity.create({ name: 'Yeka' });
    const woreda = await mkWoreda({ subcity: 'Yeka', subcityId: other._id });
    const { status } = await call(createWoredaAdmin)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id,
    })));
    assert.equal(status, 400);
  });

  it('allows only one woreda_admin per woreda (409)', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda({ subcityId: subcity._id });

    const first = await call(createWoredaAdmin)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, email: 'one@zda.et', phone: '0911223344',
    })));
    assert.equal(first.status, 201);

    const second = await call(createWoredaAdmin)(adminReq(validBody({
      subcityId: subcity._id, woredaId: woreda._id, email: 'two@zda.et', phone: '0933445566',
    })));
    assert.equal(second.status, 409);
  });

  it('rejects when subcity or woreda is missing', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda({ subcityId: subcity._id });
    assert.equal((await call(createWoredaAdmin)(adminReq(validBody({ woredaId: woreda._id })))).status, 400);
    assert.equal((await call(createWoredaAdmin)(adminReq(validBody({ subcityId: subcity._id })))).status, 400);
  });
});

describe('GET /api/users?role=woreda_admin — getUsers', () => {
  it('returns only woreda_admin accounts when filtered by role', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda({ subcityId: subcity._id });
    await mkWoredaAdminUser({ woredaId: woreda._id, woredaName: '01', subcity: 'Bole', fullName: 'Alem' });
    await mkWoredaAdminUser({ woredaId: woreda._id, woredaName: '01', subcity: 'Bole', fullName: 'Bini' });
    await User.create({
      fullName: 'Subcity Person', email: 'sub@zda.et', password: 'password123',
      role: 'subcity_bole', subcity: 'Bole',
    });

    const { status, json } = await call(getUsers)(adminReq({}, {}, { role: 'woreda_admin' }));
    assert.equal(status, 200);
    assert.equal(json.total, 2);
    assert.ok(json.users.every((u) => u.role === 'woreda_admin'));
  });
});
