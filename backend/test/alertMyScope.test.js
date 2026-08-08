/**
 * Tests for GET /api/alerts/my-scope — the unified "alerts in MY administrative
 * scope" endpoint:
 *
 *  • Admin/government sees every alert (city-wide scope).
 *  • A subcity admin sees city-wide alerts + alerts targeting their subcity.
 *  • A subcity admin does NOT see alerts for other subcities.
 *  • A citizen sees only LIVE alerts matched to their registered subcity/woreda.
 *  • A non-scoped role is rejected with 403.
 *
 * Uses mongodb-memory-server (system mongod binary when available).
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
const { getMyScopeAlerts } = require('../src/controllers/alertController');
const PublicAlert = require('../src/models/PublicAlert');
const Subcity = require('../src/models/Subcity');
const Woreda = require('../src/models/Woreda');

let mongod;

const mockReq = (user, query = {}) => ({
  user,
  query,
  app: { get: () => null },
  ip: '127.0.0.1',
  connection: { remoteAddress: '127.0.0.1' },
  get: () => '',
});

const mockRes = () => {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.jsonPayload = payload; return res; };
  res.set = () => res;
  return res;
};

const mkUser = (role, overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  role,
  fullName: 'Test User',
  ...overrides,
});

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { dbName: 'alert-my-scope' });
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([
    PublicAlert.deleteMany({}),
    Subcity.deleteMany({}),
    Woreda.deleteMany({}),
  ]);
});

describe('GET /api/alerts/my-scope', () => {
  let bole, yeka, w1, cityAlert, boleSubcityAlert, boleWoredaAlert;

  beforeEach(async () => {
    bole = await Subcity.create({ name: 'Bole' });
    yeka = await Subcity.create({ name: 'Yeka' });
    w1 = await Woreda.create({ name: 'Woreda 01', subcity: 'Bole', subcityId: bole._id });

    cityAlert = await PublicAlert.create({
      title: 'City-wide traffic notice',
      severity: 'information',
      description: 'City-wide.',
      status: 'published',
      isPublished: true,
      targetType: 'city',
      scope: 'all',
      scopeType: 'city',
    });
    boleSubcityAlert = await PublicAlert.create({
      title: 'Bole rainfall',
      severity: 'warning',
      description: 'Rain in Bole.',
      status: 'published',
      isPublished: true,
      targetType: 'subcity',
      scope: 'subcity',
      scopeType: 'subcity',
      subcityIds: [bole._id],
      subcityNames: ['Bole'],
    });
    boleWoredaAlert = await PublicAlert.create({
      title: 'Woreda 01 flood',
      severity: 'high',
      description: 'Flood in Woreda 01.',
      status: 'published',
      isPublished: true,
      targetType: 'woreda',
      scope: 'woreda',
      scopeType: 'woreda',
      subcityIds: [bole._id],
      subcityNames: ['Bole'],
      woredaIds: [w1._id],
      woredaNames: ['Woreda 01'],
    });
  });

  it('System Admin — sees every alert (city-wide scope)', async () => {
    const res = mockRes();
    await getMyScopeAlerts(mockReq(mkUser('admin')), res);

    assert.equal(res.statusCode, undefined);
    const data = res.jsonPayload.data;
    assert.equal(data.scope, 'admin');
    assert.equal(data.total, 3);
    assert.deepEqual(data.alerts.map((a) => a.title).sort(), ['Bole rainfall', 'City-wide traffic notice', 'Woreda 01 flood']);
  });

  it('Bole subcity admin — sees city-wide + their own subcity alerts, not Yeka ones', async () => {
    const res = mockRes();
    await getMyScopeAlerts(mockReq(mkUser('subcity_bole', { subcity: 'Bole', subcityId: bole._id })), res);

    const titles = res.jsonPayload.data.alerts.map((a) => a.title).sort();
    assert.deepEqual(titles, ['Bole rainfall', 'City-wide traffic notice', 'Woreda 01 flood']);
  });

  it('Yeka subcity admin — sees only city-wide alerts', async () => {
    const res = mockRes();
    await getMyScopeAlerts(mockReq(mkUser('subcity_yeka', { subcity: 'Yeka', subcityId: yeka._id })), res);

    const titles = res.jsonPayload.data.alerts.map((a) => a.title);
    assert.deepEqual(titles, ['City-wide traffic notice']);
  });

  it('Citizen in Bole/Woreda 01 — sees live city-wide + Bole-scoped alerts', async () => {
    const res = mockRes();
    await getMyScopeAlerts(mockReq(mkUser('citizen', { subcity: 'Bole', subcityId: bole._id, woredaName: 'Woreda 01', woredaId: w1._id })), res);

    const data = res.jsonPayload.data;
    assert.equal(data.scope, 'citizen');
    assert.equal(data.total, 3);
  });

  it('Citizen in Yeka — sees only city-wide live alerts', async () => {
    const res = mockRes();
    await getMyScopeAlerts(mockReq(mkUser('citizen', { subcity: 'Yeka', subcityId: yeka._id })), res);

    const titles = res.jsonPayload.data.alerts.map((a) => a.title);
    assert.deepEqual(titles, ['City-wide traffic notice']);
  });

  it('Citizen — does not see non-live (expired) alerts', async () => {
    await PublicAlert.create({
      title: 'Expired city alert',
      severity: 'information',
      description: 'Already over.',
      status: 'expired',
      isPublished: false,
      targetType: 'city',
      scope: 'all',
      scopeType: 'city',
    });

    const res = mockRes();
    await getMyScopeAlerts(mockReq(mkUser('citizen', { subcity: 'Bole', subcityId: bole._id })), res);

    assert.equal(res.jsonPayload.data.total, 3);
  });

  it('non-scoped role — rejected with 403', async () => {
    const res = mockRes();
    await getMyScopeAlerts(mockReq(mkUser('volunteer')), res);

    assert.equal(res.statusCode, 403);
    assert.match(res.jsonPayload.message, /not authorized/i);
  });
});
