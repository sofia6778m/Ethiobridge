/**
 * Public Alert CRUD — edit/delete scope + notification cleanup.
 *
 *  • canModifyAlert — System Admin may edit/delete ANY alert; Subcity Admins may
 *    only modify alerts that specifically target their own subcity; Woreda
 *    officers only their own woreda. City-wide alerts are visible in a
 *    subcity/woreda admin's list but are NOT modifiable by them.
 *  • Editing a LIVE alert re-notifies affected citizens (✏️ Updated: …).
 *  • Deleting an alert also removes the citizen bell notifications for it.
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
const {
  createAlert,
  updateAlert,
  deleteAlert,
  canModifyAlert,
} = require('../src/controllers/alertController');
const PublicAlert = require('../src/models/PublicAlert');
const Subcity = require('../src/models/Subcity');
const Woreda = require('../src/models/Woreda');
const User = require('../src/models/User');
const Notification = require('../src/models/Notification');
const AlertDelivery = require('../src/models/AlertDelivery');
const AlertRecipient = require('../src/models/AlertRecipient');
const AlertRead = require('../src/models/AlertRead');
const AlertAnalytics = require('../src/models/AlertAnalytics');
const AuditLog = require('../src/models/AuditLog');

let mongod;

const mkUser = (role, overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  role,
  fullName: 'Test Admin',
  organizationName: 'EthioBridge',
  ...overrides,
});

const baseBody = () => ({
  title: 'Heavy rain expected',
  category: 'Flood Warning',
  severity: 'warning',
  description: 'Heavy rainfall expected across the targeted area.',
  publishMode: 'immediate',
  startAt: '',
  endAt: '',
});

const mockReq = (user, body, files = [], params = {}) => ({
  user,
  body,
  files,
  params,
  app: { get: () => null },
  ip: '127.0.0.1',
  connection: { remoteAddress: '127.0.0.1' },
  get: () => '',
});

const mockRes = () => {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { if (res.statusCode === undefined) res.statusCode = 200; res.jsonPayload = payload; return res; };
  return res;
};

// Create an alert through the real createAlert controller and return it.
const makeAlert = async (user, body = baseBody()) => {
  const res = mockRes();
  await createAlert(mockReq(user, body), res);
  assert.equal(res.statusCode, 201, res.jsonPayload?.message);
  return res.jsonPayload.data.alert;
};

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { dbName: 'alert-crud' });
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
    User.deleteMany({}),
    Notification.deleteMany({}),
    AlertDelivery.deleteMany({}),
    AlertRecipient.deleteMany({}),
    AlertRead.deleteMany({}),
    AlertAnalytics.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);
});

describe('canModifyAlert — strict edit/delete scope', () => {
  let bole, yeka, w1, w2;

  beforeEach(async () => {
    bole = await Subcity.create({ name: 'Bole' });
    yeka = await Subcity.create({ name: 'Yeka' });
    w1 = await Woreda.create({ name: 'Woreda 01', subcity: 'Bole', subcityId: bole._id });
    w2 = await Woreda.create({ name: 'Woreda 02', subcity: 'Bole', subcityId: bole._id });
  });

  const admin = () => mkUser('admin');
  const boleAdmin = () => mkUser('subcity_bole', { subcity: 'Bole', subcityId: bole._id });
  const yekaAdmin = () => mkUser('subcity_yeka', { subcity: 'Yeka', subcityId: yeka._id });
  const woreda01 = () => mkUser('woreda', { subcity: 'Bole', subcityId: bole._id, woredaName: 'Woreda 01', woredaId: w1._id });
  const woreda02 = () => mkUser('woreda', { subcity: 'Bole', subcityId: bole._id, woredaName: 'Woreda 02', woredaId: w2._id });

  it('System Admin edits any alert (city-wide, subcity, woreda)', async () => {
    const city = await makeAlert(admin());
    const sub = await makeAlert(admin(), { ...baseBody(), scope: 'subcity', subcityIds: [String(bole._id)] });
    const wor = await makeAlert(admin(), { ...baseBody(), scope: 'woreda', subcityIds: [String(bole._id)], woredaIds: [String(w1._id)] });

    assert.equal(canModifyAlert(admin(), city), true);
    assert.equal(canModifyAlert(admin(), sub), true);
    assert.equal(canModifyAlert(admin(), wor), true);
  });

  it('Subcity Admin can modify only alerts that specifically target their subcity', async () => {
    const sub = await makeAlert(admin(), { ...baseBody(), scope: 'subcity', subcityIds: [String(bole._id)] });
    const yekaOnly = await makeAlert(admin(), { ...baseBody(), scope: 'subcity', subcityIds: [String(yeka._id)] });

    assert.equal(canModifyAlert(boleAdmin(), sub), true);
    assert.equal(canModifyAlert(boleAdmin(), yekaOnly), false);
  });

  it('Subcity Admin CANNOT modify a city-wide alert', async () => {
    const city = await makeAlert(admin());
    assert.equal(canModifyAlert(boleAdmin(), city), false);
  });

  it('Woreda officer can modify only alerts targeting their own woreda', async () => {
    const w1Alert = await makeAlert(admin(), { ...baseBody(), scope: 'woreda', subcityIds: [String(bole._id)], woredaIds: [String(w1._id)] });
    const w2Alert = await makeAlert(admin(), { ...baseBody(), scope: 'woreda', subcityIds: [String(bole._id)], woredaIds: [String(w2._id)] });
    const subWide = await makeAlert(admin(), { ...baseBody(), scope: 'subcity', subcityIds: [String(bole._id)] });

    assert.equal(canModifyAlert(woreda01(), w1Alert), true);
    assert.equal(canModifyAlert(woreda01(), w2Alert), false);
    // A whole-subcity alert is NOT the woreda officer's own woreda.
    assert.equal(canModifyAlert(woreda01(), subWide), false);
  });
});

describe('updateAlert — scoped editing', () => {
  let bole, yeka, w1, w2;

  beforeEach(async () => {
    bole = await Subcity.create({ name: 'Bole' });
    yeka = await Subcity.create({ name: 'Yeka' });
    w1 = await Woreda.create({ name: 'Woreda 01', subcity: 'Bole', subcityId: bole._id });
    w2 = await Woreda.create({ name: 'Woreda 02', subcity: 'Bole', subcityId: bole._id });
  });

  const admin = () => mkUser('admin');
  const boleAdmin = () => mkUser('subcity_bole', { subcity: 'Bole', subcityId: bole._id });
  const woreda02 = () => mkUser('woreda', { subcity: 'Bole', subcityId: bole._id, woredaName: 'Woreda 02', woredaId: w2._id });

  const updateBody = (overrides = {}) => ({
    title: 'Updated alert title',
    category: 'Road Closure',
    description: 'Updated details for citizens.',
    ...overrides,
  });

  it('System Admin edits an alert successfully', async () => {
    const alert = await makeAlert(admin(), { ...baseBody(), scope: 'subcity', subcityIds: [String(bole._id)] });

    const res = mockRes();
    await updateAlert(mockReq(admin(), updateBody(), [], { id: alert._id }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonPayload.data.alert.title, 'Updated alert title');
    assert.equal(res.jsonPayload.data.alert.category, 'Road Closure');

    const saved = await PublicAlert.findById(alert._id);
    assert.equal(saved.description, 'Updated details for citizens.');
    // Targeting is untouched when no targeting keys are sent.
    assert.deepEqual(saved.subcityIds.map(String), [String(bole._id)]);
  });

  it('Subcity Admin edits an alert within their subcity', async () => {
    const alert = await makeAlert(admin(), { ...baseBody(), scope: 'subcity', subcityIds: [String(bole._id)] });

    const res = mockRes();
    await updateAlert(mockReq(boleAdmin(), updateBody(), [], { id: alert._id }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(res.jsonPayload.data.alert.title, 'Updated alert title');
    void alert;
  });

  it('Subcity Admin CANNOT edit a city-wide alert (403)', async () => {
    const alert = await makeAlert(admin());

    const res = mockRes();
    await updateAlert(mockReq(boleAdmin(), updateBody(), [], { id: alert._id }), res);

    assert.equal(res.statusCode, 403);
    const saved = await PublicAlert.findById(alert._id);
    assert.equal(saved.title, 'Heavy rain expected');
  });

  it('Woreda officer CANNOT edit another woreda\u2019s alert (403)', async () => {
    const alert = await makeAlert(admin(), { ...baseBody(), scope: 'woreda', subcityIds: [String(bole._id)], woredaIds: [String(w1._id)] });

    const res = mockRes();
    await updateAlert(mockReq(woreda02(), updateBody(), [], { id: alert._id }), res);

    assert.equal(res.statusCode, 403);
    const saved = await PublicAlert.findById(alert._id);
    assert.equal(saved.title, 'Heavy rain expected');
  });

  it('Subcity Admin CANNOT edit another subcity\u2019s alert (403)', async () => {
    const alert = await makeAlert(admin(), { ...baseBody(), scope: 'subcity', subcityIds: [String(yeka._id)] });

    const res = mockRes();
    await updateAlert(mockReq(boleAdmin(), updateBody(), [], { id: alert._id }), res);

    assert.equal(res.statusCode, 403);
  });

  it('editing a LIVE alert notifies the affected citizens (✏️ Updated)', async () => {
    await User.create({
      fullName: 'Bole Resident',
      email: 'resident@test.et',
      password: 'password123',
      role: 'citizen',
      subcity: 'Bole',
      subcityId: bole._id,
    });

    const alert = await makeAlert(admin(), { ...baseBody(), scope: 'subcity', subcityIds: [String(bole._id)] });
    // The initial broadcast delivered one in-app notification.
    const before = await Notification.find({ alertId: alert._id }).lean();
    assert.equal(before.length, 1);

    const res = mockRes();
    await updateAlert(mockReq(admin(), updateBody(), [], { id: alert._id }), res);
    assert.equal(res.statusCode, 200);

    const after = await Notification.find({ alertId: alert._id }).sort({ createdAt: 1 }).lean();
    assert.equal(after.length, 2);
    assert.match(after[after.length - 1].title, /Updated:/);
    assert.equal(after[after.length - 1].type, 'public_alert');
  });
});

describe('deleteAlert — scoped deletion + notification cleanup', () => {
  let bole, w1;

  beforeEach(async () => {
    bole = await Subcity.create({ name: 'Bole' });
    w1 = await Woreda.create({ name: 'Woreda 01', subcity: 'Bole', subcityId: bole._id });
  });

  const admin = () => mkUser('admin');
  const boleAdmin = () => mkUser('subcity_bole', { subcity: 'Bole', subcityId: bole._id });

  it('System Admin deletes an alert and its citizen notifications', async () => {
    await User.create({
      fullName: 'Bole Resident',
      email: 'resident@test.et',
      password: 'password123',
      role: 'citizen',
      subcity: 'Bole',
      subcityId: bole._id,
    });
    const alert = await makeAlert(admin(), { ...baseBody(), scope: 'subcity', subcityIds: [String(bole._id)] });
    assert.equal((await Notification.find({ alertId: alert._id })).length, 1);

    const res = mockRes();
    await deleteAlert(mockReq(admin(), {}, [], { id: alert._id }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(await PublicAlert.findById(alert._id), null);
    assert.equal(await Notification.countDocuments({ alertId: alert._id }), 0);
  });

  it('Subcity Admin deletes an alert within their subcity', async () => {
    const alert = await makeAlert(admin(), { ...baseBody(), scope: 'subcity', subcityIds: [String(bole._id)] });

    const res = mockRes();
    await deleteAlert(mockReq(boleAdmin(), {}, [], { id: alert._id }), res);

    assert.equal(res.statusCode, 200);
    assert.equal(await PublicAlert.findById(alert._id), null);
  });

  it('Subcity Admin CANNOT delete a city-wide alert (403)', async () => {
    const alert = await makeAlert(admin());

    const res = mockRes();
    await deleteAlert(mockReq(boleAdmin(), {}, [], { id: alert._id }), res);

    assert.equal(res.statusCode, 403);
    assert.ok(await PublicAlert.findById(alert._id));
  });

  it('Woreda officer CANNOT delete a whole-subcity alert (403)', async () => {
    const alert = await makeAlert(admin(), { ...baseBody(), scope: 'subcity', subcityIds: [String(bole._id)] });
    const woreda01 = mkUser('woreda', { subcity: 'Bole', subcityId: bole._id, woredaName: 'Woreda 01', woredaId: w1._id });

    const res = mockRes();
    await deleteAlert(mockReq(woreda01, {}, [], { id: alert._id }), res);

    assert.equal(res.statusCode, 403);
    assert.ok(await PublicAlert.findById(alert._id));
  });
});
