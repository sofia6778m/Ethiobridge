/**
 * Regression + targeting tests for the Public Alert creation flow:
 *
 *  • Parallel-array regression — a stale compound multikey index over BOTH
 *    `subcityIds` and `woredaIds` (left over from an older schema) makes every
 *    INSERT fail with "cannot index parallel arrays [woredaIds] [subcityIds]".
 *    We reproduce the exact failure, then verify the fix: dropping the stale
 *    compound index (kept in src/index.js) lets both arrays persist normally.
 *  • createAlert targeting — System Admin can create city-wide / specific
 *    subcity / subcity + multiple woreda alerts; Subcity Admin is locked to
 *    their own subcity; Woreda Admin is locked to their subcity + woreda;
 *    selected woreda checkboxes (arrays) are saved verbatim.
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
const { createAlert } = require('../src/controllers/alertController');
const PublicAlert = require('../src/models/PublicAlert');
const Subcity = require('../src/models/Subcity');
const Woreda = require('../src/models/Woreda');
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

const mockReq = (user, body, files = []) => ({
  user,
  body,
  files,
  app: { get: () => null },
  ip: '127.0.0.1',
  connection: { remoteAddress: '127.0.0.1' },
  get: () => '',
});

const mockRes = () => {
  const res = {};
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (payload) => { res.jsonPayload = payload; return res; };
  return res;
};

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { dbName: 'alert-targeting' });
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
    AuditLog.deleteMany({}),
  ]);
});

// ── Parallel-array index regression ──────────────────────────────────────────
describe('parallel-array compound index regression', () => {
  it('a stale { targetType, subcityIds, woredaIds } index blocks inserts and must be dropped', async () => {
    const collection = mongoose.connection.db.collection('publicalerts');
    // Reset to a clean slate so the legacy index is the only one present.
    await collection.dropIndexes();

    // Simulate the old schema: one compound index over BOTH array fields.
    await collection.createIndex({ targetType: 1, subcityIds: 1, woredaIds: 1 });

    // Reproduce the reported bug: a document with values in BOTH arrays is
    // rejected by MongoDB ("cannot index parallel arrays [woredaIds] [subcityIds]").
    await assert.rejects(
      PublicAlert.create({
        title: 'Parallel arrays failure',
        severity: 'warning',
        description: 'd',
        targetType: 'woreda',
        scope: 'woreda',
        subcityIds: [new mongoose.Types.ObjectId()],
        woredaIds: [new mongoose.Types.ObjectId()],
      }),
      /parallel arrays/i
    );

    // The fix: drop the stale compound index, restore single-field multikey
    // indexes (mirrors the startup fix-up in src/index.js + PublicAlert schema).
    await collection.dropIndex('targetType_1_subcityIds_1_woredaIds_1');
    await collection.createIndex({ subcityIds: 1 });
    await collection.createIndex({ woredaIds: 1 });

    // Same payload now persists both arrays correctly.
    const alert = await PublicAlert.create({
      title: 'Works after dropping the index',
      severity: 'warning',
      description: 'd',
      targetType: 'woreda',
      scope: 'woreda',
      subcityIds: [new mongoose.Types.ObjectId()],
      woredaIds: [new mongoose.Types.ObjectId()],
    });
    assert.equal(alert.subcityIds.length, 1);
    assert.equal(alert.woredaIds.length, 1);

    // Restore the rest of the schema indexes so later suites are unaffected.
    await PublicAlert.init();
  });
});

// ── createAlert targeting ────────────────────────────────────────────────────
describe('createAlert targeting', () => {
  let bole, yeka, w1, w2, yekaW1;

  beforeEach(async () => {
    bole = await Subcity.create({ name: 'Bole' });
    yeka = await Subcity.create({ name: 'Yeka' });
    w1 = await Woreda.create({ name: 'Woreda 01', subcity: 'Bole', subcityId: bole._id });
    w2 = await Woreda.create({ name: 'Woreda 02', subcity: 'Bole', subcityId: bole._id });
    yekaW1 = await Woreda.create({ name: 'Woreda 03', subcity: 'Yeka', subcityId: yeka._id });
  });

  it('System Admin — whole Addis Ababa (city-wide)', async () => {
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), baseBody()), res);

    assert.equal(res.statusCode, 201);
    const alert = res.jsonPayload.data.alert;
    assert.equal(alert.scope, 'all');
    assert.equal(alert.targetType, 'city');
    assert.deepEqual(alert.subcityIds, []);
    assert.deepEqual(alert.woredaIds, []);

    const saved = await PublicAlert.findById(alert._id);
    assert.equal(saved.targetType, 'city');
    assert.equal(saved.isPublished, true);
  });

  it('System Admin — specific subcity alert', async () => {
    const body = { ...baseBody(), scope: 'subcity', subcityIds: [String(bole._id)] };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 201);
    const alert = res.jsonPayload.data.alert;
    assert.equal(alert.scope, 'subcity');
    assert.equal(alert.targetType, 'subcity');
    assert.deepEqual(alert.subcityIds.map(String), [String(bole._id)]);
    assert.deepEqual(alert.woredaIds, []);
  });

  it('System Admin — subcity + multiple woredas', async () => {
    const body = {
      ...baseBody(),
      scope: 'woreda',
      subcityIds: [String(bole._id)],
      woredaIds: [String(w1._id), String(w2._id)],
    };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 201);
    const alert = res.jsonPayload.data.alert;
    assert.equal(alert.scope, 'woreda');
    assert.equal(alert.targetType, 'woreda');
    assert.deepEqual(alert.subcityIds.map(String), [String(bole._id)]);
    assert.deepEqual(alert.woredaIds.map(String), [String(w1._id), String(w2._id)]);
  });

  it('Subcity Admin — whole-subcity alert (no woredas)', async () => {
    const res = mockRes();
    await createAlert(mockReq(mkUser('subcity_bole', { subcity: 'Bole', subcityId: bole._id }), baseBody()), res);

    assert.equal(res.statusCode, 201);
    const alert = res.jsonPayload.data.alert;
    assert.equal(alert.scope, 'subcity');
    assert.equal(alert.targetType, 'subcity');
    assert.deepEqual(alert.subcityIds.map(String), [String(bole._id)]);
    assert.deepEqual(alert.woredaIds, []);
  });

  it('Subcity Admin — multiple woredas within their subcity (checkboxes saved)', async () => {
    const body = { ...baseBody(), woredaIds: [String(w1._id), String(w2._id)] };
    const res = mockRes();
    await createAlert(mockReq(mkUser('subcity_bole', { subcity: 'Bole', subcityId: bole._id }), body), res);

    assert.equal(res.statusCode, 201);
    const alert = res.jsonPayload.data.alert;
    assert.equal(alert.targetType, 'woreda');
    assert.deepEqual(alert.subcityIds.map(String), [String(bole._id)]);
    assert.deepEqual(alert.woredaIds.map(String), [String(w1._id), String(w2._id)]);
  });

  it('Subcity Admin — cannot target another subcity (locked to their own)', async () => {
    const body = { ...baseBody(), subcityIds: [String(yeka._id)] };
    const res = mockRes();
    await createAlert(mockReq(mkUser('subcity_bole', { subcity: 'Bole', subcityId: bole._id }), body), res);

    assert.equal(res.statusCode, 201);
    const alert = res.jsonPayload.data.alert;
    assert.deepEqual(alert.subcityIds.map(String), [String(bole._id)]);
  });

  it('Woreda Admin — locked to their subcity + woreda', async () => {
    const body = { ...baseBody(), woredaIds: [String(w2._id)] };
    const res = mockRes();
    await createAlert(
      mockReq(mkUser('woreda', { subcity: 'Bole', subcityId: bole._id, woredaName: 'Woreda 01', woredaId: w1._id }), body),
      res
    );

    assert.equal(res.statusCode, 201);
    const alert = res.jsonPayload.data.alert;
    assert.deepEqual(alert.subcityIds.map(String), [String(bole._id)]);
    assert.deepEqual(alert.woredaIds.map(String), [String(w1._id)]);
  });

  it('System Admin — rejects a woreda that does not belong to the selected subcity', async () => {
    // Woreda 03 lives in Yeka, but only Bole is targeted → must be rejected.
    const body = {
      ...baseBody(),
      scope: 'woreda',
      subcityIds: [String(bole._id)],
      woredaIds: [String(yekaW1._id)],
    };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.jsonPayload.message, /not in a targeted subcity/i);
    assert.equal(res.jsonPayload.field, 'targeting');
  });

  it('System Admin — allows woredas from multiple selected subcities (Bole + Yeka)', async () => {
    const body = {
      ...baseBody(),
      scope: 'woreda',
      subcityIds: [String(bole._id), String(yeka._id)],
      woredaIds: [String(w1._id), String(yekaW1._id)],
    };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 201);
    const alert = res.jsonPayload.data.alert;
    assert.deepEqual(alert.subcityIds.map(String).sort(), [String(bole._id), String(yeka._id)].sort());
    assert.deepEqual(alert.woredaIds.map(String).sort(), [String(w1._id), String(yekaW1._id)].sort());
  });

  it('Subcity Admin — cannot target a woreda from another subcity', async () => {
    const body = { ...baseBody(), woredaIds: [String(yekaW1._id)] };
    const res = mockRes();
    await createAlert(mockReq(mkUser('subcity_bole', { subcity: 'Bole', subcityId: bole._id }), body), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.jsonPayload.message, /not in a targeted subcity/i);
  });

  it('Subcity Admin — rejects a woreda id that does not exist', async () => {
    const body = { ...baseBody(), woredaIds: [new mongoose.Types.ObjectId().toString()] };
    const res = mockRes();
    await createAlert(mockReq(mkUser('subcity_bole', { subcity: 'Bole', subcityId: bole._id }), body), res);

    assert.equal(res.statusCode, 400);
    assert.match(res.jsonPayload.message, /no longer exist/i);
  });
});
