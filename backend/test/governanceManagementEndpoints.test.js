/**
 * Tests for the Subcity-admin governance management CRUD endpoints:
 *   - Government Offices:  getOffice / getOfficesBySubcityId / updateOffice (subcity move)
 *   - Governance Users:    getOfficer / updateOfficer (email + status) / deleteOfficer
 *   - Delete guards:       offices with linked officers, officers with assigned complaints
 *
 * Subcity isolation is enforced throughout — a Subcity Admin may only read/write
 * records in their own subcity (403 / 404 for anything else).
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
const GovernmentOffice = require('../src/models/GovernmentOffice');
const GovernanceComplaint = require('../src/models/GovernanceComplaint');
const {
  getOffice,
  getOfficesBySubcityId,
  updateOffice,
  getOfficer,
  updateOfficer,
  deleteOfficer,
  deleteOffice,
} = require('../src/controllers/governanceManagementController');

let mongod;

const mockRes = () => {
  const res = { _status: 200, _json: null };
  res.status = function (s) { res._status = s; return res; };
  res.json = function (obj) { res._json = obj; return res; };
  return res;
};

// Subcity admin scoped to "Bole".
const boleAdminReq = (body = {}, params = {}, query = {}) => ({
  body,
  params,
  query,
  user: {
    _id: new mongoose.Types.ObjectId(),
    role: 'subcity_admin',
    subcity: 'Bole',
    fullName: 'Bole Admin',
  },
});

// Anonymous visitor (public read).
const anonymousReq = (params = {}, query = {}) => ({
  body: {},
  params,
  query,
  user: undefined,
});

const call = (fn) => async (req) => {
  const res = mockRes();
  await fn(req, res);
  return { status: res._status, json: res._json };
};

const mkSubcity = (over = {}) =>
  Subcity.create({ name: 'Bole', description: '', status: 'Active', ...over });

const mkOffice = (over = {}) =>
  GovernmentOffice.create({
    name: 'Trade Office',
    subcity: 'Bole',
    subcityId: null,
    isActive: true,
    ...over,
  });

const mkOfficer = (over = {}) =>
  User.create({
    fullName: 'Officer One',
    email: `officer_${Math.random().toString(36).slice(2, 10)}@zda.et`,
    password: 'password123',
    phone: '0911223344',
    role: 'GOVERNANCE_OFFICER',
    subcity: 'Bole',
    ...over,
  });

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  await User.init();
  await Subcity.init();
  await GovernmentOffice.init();
  await GovernanceComplaint.init();
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await User.deleteMany({});
  await Subcity.deleteMany({});
  await GovernmentOffice.deleteMany({});
  await GovernanceComplaint.deleteMany({});
});

describe('GET /api/government-offices/by-subcity/:subcityId — getOfficesBySubcityId', () => {
  it('returns only active offices of the given subcity for public visitors', async () => {
    const bole = await mkSubcity();
    await mkOffice({ subcityId: bole._id });
    await mkOffice({ name: 'Revenue Office', subcityId: bole._id });
    await mkOffice({ name: 'Land Office', subcityId: bole._id, isActive: false });
    const yeka = await Subcity.create({ name: 'Yeka' });
    await mkOffice({ name: 'Civil Registration', subcity: 'Yeka', subcityId: yeka._id });

    const { status, json } = await call(getOfficesBySubcityId)(anonymousReq({ subcityId: bole._id }));
    assert.equal(status, 200);
    const names = json.data.offices.map((o) => o.name).sort();
    assert.deepEqual(names, ['Revenue Office', 'Trade Office']);
  });

  it('lets a subcity admin load offices of their own subcity', async () => {
    const bole = await mkSubcity();
    await mkOffice({ subcityId: bole._id });

    const { status, json } = await call(getOfficesBySubcityId)(boleAdminReq({}, { subcityId: bole._id }));
    assert.equal(status, 200);
    assert.equal(json.data.offices.length, 1);
  });

  it('blocks a subcity admin from loading a different subcity (403)', async () => {
    const bole = await mkSubcity();
    await mkOffice({ subcityId: bole._id });
    const yeka = await Subcity.create({ name: 'Yeka' });
    await mkOffice({ name: 'Civil Registration', subcity: 'Yeka', subcityId: yeka._id });

    const { status, json } = await call(getOfficesBySubcityId)(boleAdminReq({}, { subcityId: yeka._id }));
    assert.equal(status, 403);
    assert.match(json.message, /own subcity/i);
  });

  it('returns 404 for a missing subcity and 400 for an invalid id', async () => {
    const bole = await mkSubcity();
    assert.equal((await call(getOfficesBySubcityId)(anonymousReq({ subcityId: new mongoose.Types.ObjectId() }))).status, 404);
    assert.equal((await call(getOfficesBySubcityId)(anonymousReq({ subcityId: 'nope' }))).status, 400);
    assert.ok(bole);
  });
});

describe('GET /api/government-offices/:id — getOffice', () => {
  it('returns 404 for an unknown or invalid id', async () => {
    const bole = await mkSubcity();
    assert.equal((await call(getOffice)(boleAdminReq({}, { id: new mongoose.Types.ObjectId() }))).status, 404);
    assert.equal((await call(getOffice)(boleAdminReq({}, { id: 'nope' }))).status, 404);
    assert.ok(bole);
  });

  it('hides inactive offices from anonymous visitors (404)', async () => {
    const bole = await mkSubcity();
    const office = await mkOffice({ subcityId: bole._id, isActive: false });
    const { status } = await call(getOffice)(anonymousReq({ id: office._id }));
    assert.equal(status, 404);
  });

  it('lets a subcity admin read their own office', async () => {
    const bole = await mkSubcity();
    const office = await mkOffice({ subcityId: bole._id });
    const { status, json } = await call(getOffice)(boleAdminReq({}, { id: office._id }));
    assert.equal(status, 200);
    assert.equal(json.data.office.name, 'Trade Office');
  });

  it('blocks a subcity admin from reading another subcity office (403)', async () => {
    const yeka = await Subcity.create({ name: 'Yeka' });
    const office = await mkOffice({ name: 'Civil Registration', subcity: 'Yeka', subcityId: yeka._id });
    const { status } = await call(getOffice)(boleAdminReq({}, { id: office._id }));
    assert.equal(status, 403);
  });
});

describe('PUT /api/government-offices/:id — updateOffice (subcity move)', () => {
  it('moves a legacy (null-subcityId) office into the admin subcity', async () => {
    const bole = await mkSubcity();
    const office = await mkOffice({ subcity: 'Bole', subcityId: null });

    const { status, json } = await call(updateOffice)(boleAdminReq(
      { subcityId: bole._id, name: 'Trade & Revenue Office' },
      { id: office._id }
    ));
    assert.equal(status, 200);
    assert.equal(json.data.name, 'Trade & Revenue Office');
    assert.equal(String(json.data.subcityId), String(bole._id));
    assert.equal(json.data.subcity, 'Bole');
  });

  it('rejects a duplicate name when assigning to a subcity (409)', async () => {
    const bole = await mkSubcity();
    const office = await mkOffice({ subcity: 'Bole', subcityId: null });
    await mkOffice({ name: 'Trade Office', subcityId: bole._id });

    const { status, json } = await call(updateOffice)(boleAdminReq(
      { subcityId: bole._id },
      { id: office._id }
    ));
    assert.equal(status, 409);
    assert.match(json.message, /already exists/i);
  });

  it('blocks moving to a subcity outside the admin scope (403)', async () => {
    const bole = await mkSubcity();
    const yeka = await Subcity.create({ name: 'Yeka' });
    const office = await mkOffice({ subcityId: bole._id });

    const { status, json } = await call(updateOffice)(boleAdminReq(
      { subcityId: yeka._id },
      { id: office._id }
    ));
    assert.equal(status, 403);
    assert.match(json.message, /own subcity/i);
  });
});

describe('GET /api/governance-users/:id — getOfficer', () => {
  it('returns the officer for the subcity admin who owns them', async () => {
    const bole = await mkSubcity();
    const office = await mkOffice({ subcityId: bole._id });
    const officer = await mkOfficer({ governmentOfficeId: office._id });

    const { status, json } = await call(getOfficer)(boleAdminReq({}, { id: officer._id }));
    assert.equal(status, 200);
    assert.equal(json.data.officer.fullName, 'Officer One');
    assert.equal(json.data.officer.password, undefined);
  });

  it('blocks a subcity admin from viewing another subcity officer (403)', async () => {
    await mkSubcity();
    const yeka = await Subcity.create({ name: 'Yeka' });
    const officer = await mkOfficer({ subcity: 'Yeka', subcityId: yeka._id });

    const { status, json } = await call(getOfficer)(boleAdminReq({}, { id: officer._id }));
    assert.equal(status, 403);
    assert.match(json.message, /own subcity/i);
  });

  it('returns 404 for non-governance-staff roles', async () => {
    const citizen = await User.create({
      fullName: 'Citizen', email: 'citizen@zda.et', password: 'password123', role: 'citizen',
    });
    const { status } = await call(getOfficer)(boleAdminReq({}, { id: citizen._id }));
    assert.equal(status, 404);
  });
});

describe('PUT /api/governance-users/:id — updateOfficer (email + status)', () => {
  it('updates email (lowercased), phone and status', async () => {
    const bole = await mkSubcity();
    const office = await mkOffice({ subcityId: bole._id });
    const officer = await mkOfficer({ governmentOfficeId: office._id });

    const { status, json } = await call(updateOfficer)(boleAdminReq(
      { email: 'NewEmail@Zda.et', phoneNumber: '0955667788', status: 'inactive' },
      { id: officer._id }
    ));
    assert.equal(status, 200);
    assert.equal(json.data.email, 'newemail@zda.et');
    assert.equal(json.data.phone, '0955667788');
    assert.equal(json.data.isActive, false);
  });

  it('rejects a duplicate email (409)', async () => {
    const bole = await mkSubcity();
    const office = await mkOffice({ subcityId: bole._id });
    const officer = await mkOfficer({ governmentOfficeId: office._id });
    await mkOfficer({ email: 'taken@zda.et', governmentOfficeId: office._id });

    const { status, json } = await call(updateOfficer)(boleAdminReq(
      { email: 'TAKEN@zda.et' },
      { id: officer._id }
    ));
    assert.equal(status, 409);
    assert.match(json.message, /email/i);
  });

  it('rejects an invalid status value (400)', async () => {
    const bole = await mkSubcity();
    const officer = await mkOfficer({ governmentOfficeId: null });
    const { status } = await call(updateOfficer)(boleAdminReq(
      { status: 'suspended' },
      { id: officer._id }
    ));
    assert.equal(status, 400);
    assert.ok(bole);
  });

  it('blocks editing an officer in another subcity (404)', async () => {
    const yeka = await Subcity.create({ name: 'Yeka' });
    const officer = await mkOfficer({ subcity: 'Yeka', subcityId: yeka._id });

    const { status } = await call(updateOfficer)(boleAdminReq(
      { fullName: 'Hacked' },
      { id: officer._id }
    ));
    assert.equal(status, 404);
  });
});

describe('DELETE /api/governance-users/:id — deleteOfficer', () => {
  it('deletes an officer with no assigned complaints', async () => {
    const bole = await mkSubcity();
    const officer = await mkOfficer({ governmentOfficeId: null });

    const { status, json } = await call(deleteOfficer)(boleAdminReq({}, { id: officer._id }));
    assert.equal(status, 200);
    assert.equal(json.success, true);
    assert.equal(await User.findById(officer._id), null);
    assert.ok(bole);
  });

  it('blocks deleting an officer assigned to complaints (409)', async () => {
    const bole = await mkSubcity();
    const office = await mkOffice({ subcityId: bole._id });
    const officer = await mkOfficer({ governmentOfficeId: office._id });
    await GovernanceComplaint.create({
      category: 'Unreasonable Delay',
      description: 'Test complaint',
      subcity: 'Bole',
      subcityId: bole._id,
      officeId: office._id,
      assignedTo: officer._id,
    });

    const { status, json } = await call(deleteOfficer)(boleAdminReq({}, { id: officer._id }));
    assert.equal(status, 409);
    assert.match(json.message, /assigned/i);
    assert.ok(await User.findById(officer._id));
  });

  it('blocks deleting an officer from another subcity (404)', async () => {
    const yeka = await Subcity.create({ name: 'Yeka' });
    const officer = await mkOfficer({ subcity: 'Yeka', subcityId: yeka._id });

    const { status } = await call(deleteOfficer)(boleAdminReq({}, { id: officer._id }));
    assert.equal(status, 404);
  });
});

describe('DELETE /api/government-offices/:id — deleteOffice guards', () => {
  it('blocks deleting an office with linked officers (409)', async () => {
    const bole = await mkSubcity();
    const office = await mkOffice({ subcityId: bole._id });
    await mkOfficer({ governmentOfficeId: office._id });

    const { status, json } = await call(deleteOffice)(boleAdminReq({}, { id: office._id }));
    assert.equal(status, 409);
    assert.match(json.message, /officer/i);
    assert.ok(await GovernmentOffice.findById(office._id));
  });

  it('deletes an unused office (and its categories)', async () => {
    const bole = await mkSubcity();
    const office = await mkOffice({ subcityId: bole._id });

    const { status } = await call(deleteOffice)(boleAdminReq({}, { id: office._id }));
    assert.equal(status, 200);
    assert.equal(await GovernmentOffice.findById(office._id), null);
  });
});
