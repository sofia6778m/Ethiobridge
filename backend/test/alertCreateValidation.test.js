/**
 * Integration-style tests for the alert create endpoint's date/time validation.
 * Calls `createAlert` directly with mocked req/res so we verify the SERVER
 * rules (not just the frontend): immediate vs scheduled publishing, past/
 * future expiration rejection, and the same rules for System / Subcity / Woreda
 * admins.
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
const AuditLog = require('../src/models/AuditLog');

let mongod;
const HOUR = 60 * 60 * 1000;

const mkUser = (role, overrides = {}) => ({
  _id: new mongoose.Types.ObjectId(),
  role,
  fullName: 'Test Admin',
  organizationName: 'EthioBridge',
  ...overrides,
});

const baseBody = () => ({
  title: 'Heavy rain expected',
  category: 'heavy_rainfall',
  severity: 'warning',
  description: 'Heavy rainfall expected across the subcity.',
});

const futureIso = (offsetMs = 24 * HOUR) => new Date(Date.now() + offsetMs).toISOString();
const pastIso = (offsetMs = -1 * HOUR) => new Date(Date.now() + offsetMs).toISOString();

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
  await mongoose.connect(mongod.getUri(), { dbName: 'alert-create-validation' });
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([
    PublicAlert.deleteMany({}),
    AuditLog.deleteMany({}),
  ]);
});

describe('createAlert — category is optional and free-text', () => {
  it('empty category (undefined) → success, category stored as null', async () => {
    const body = { ...baseBody() };
    delete body.category;
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.jsonPayload.success, true);
    assert.equal(res.jsonPayload.data.alert.category, null);
  });

  it('empty category ("") → success, category stored as null', async () => {
    const body = { ...baseBody(), category: '' };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.jsonPayload.data.alert.category, null);
  });

  it('free-text typed category → success, category stored verbatim', async () => {
    const body = { ...baseBody(), category: 'Flood Warning' };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.jsonPayload.data.alert.category, 'Flood Warning');
  });

  it('free-text typed category with surrounding whitespace → trimmed', async () => {
    const body = { ...baseBody(), category: '  Road Closure  ' };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.jsonPayload.data.alert.category, 'Road Closure');
  });

  it('subcity admin can create an alert with no category', async () => {
    const body = {
      ...baseBody(),
      category: '',
      woredaNames: ['Woreda 01'],
    };
    const res = mockRes();
    await createAlert(mockReq(mkUser('subcity_bole', { subcity: 'Bole' }), body), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.jsonPayload.data.alert.category, null);
  });

  it('woreda admin can create an alert with no category', async () => {
    const body = { ...baseBody(), category: '' };
    const res = mockRes();
    await createAlert(
      mockReq(mkUser('woreda', { subcity: 'Bole', subcityId: new mongoose.Types.ObjectId(), woredaName: 'Woreda 01', woredaId: new mongoose.Types.ObjectId() }), body),
      res
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.jsonPayload.data.alert.category, null);
  });
});

describe('createAlert — System Admin validation', () => {
  it('immediate publish with future expiration → success (published, server publish time)', async () => {
    const body = { ...baseBody(), publishMode: 'immediate', startAt: '', endAt: futureIso() };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.jsonPayload.success, true);
    const alert = res.jsonPayload.data.alert;
    assert.equal(alert.status, 'published');
    assert.equal(alert.isPublished, true);
    assert.ok(alert.publishedAt);
    // No schedule start stored for immediate publish.
    assert.equal(alert.schedule.startAt, undefined);
    assert.ok(new Date(alert.expiresAt).getTime() > Date.now());
  });

  it('immediate publish with past expiration → rejected (400)', async () => {
    const body = { ...baseBody(), publishMode: 'immediate', startAt: '', endAt: pastIso() };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonPayload.field, 'endAt');
    assert.match(res.jsonPayload.message, /later than the current time/i);
  });

  it('immediate publish with current expiration → rejected (400)', async () => {
    const body = { ...baseBody(), publishMode: 'immediate', startAt: '', endAt: new Date().toISOString() };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonPayload.field, 'endAt');
  });

  it('immediate publish with empty Schedule Publish and empty Expires At → success (expiry optional)', async () => {
    const body = { ...baseBody(), publishMode: 'immediate', startAt: '', endAt: '' };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 201);
    const alert = res.jsonPayload.data.alert;
    assert.equal(alert.status, 'published');
    assert.equal(alert.expiresAt, undefined);
    assert.equal(alert.schedule.startAt, undefined);
  });

  it('scheduled publish in the future without an expiration → success (expiry optional)', async () => {
    const body = {
      ...baseBody(),
      publishMode: 'schedule',
      startAt: futureIso(24 * HOUR),
      endAt: '',
    };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 201);
    const alert = res.jsonPayload.data.alert;
    assert.equal(alert.status, 'scheduled');
    assert.equal(alert.expiresAt, undefined);
  });

  it('scheduled publish in the future with later expiration → success (scheduled)', async () => {
    const body = {
      ...baseBody(),
      publishMode: 'schedule',
      startAt: futureIso(24 * HOUR),
      endAt: futureIso(32 * HOUR),
    };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 201);
    const alert = res.jsonPayload.data.alert;
    assert.equal(alert.status, 'scheduled');
    assert.equal(alert.isPublished, false);
    assert.ok(new Date(alert.scheduledAt).getTime() > Date.now());
  });

  it('scheduled publish in the past → rejected (400)', async () => {
    const body = {
      ...baseBody(),
      publishMode: 'schedule',
      startAt: pastIso(),
      endAt: futureIso(),
    };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonPayload.field, 'startAt');
    assert.match(res.jsonPayload.message, /future/i);
  });

  it('expiration before the scheduled publish → rejected (400)', async () => {
    const body = {
      ...baseBody(),
      publishMode: 'schedule',
      startAt: futureIso(24 * HOUR),
      endAt: futureIso(22 * HOUR), // before start
    };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonPayload.field, 'endAt');
    assert.match(res.jsonPayload.message, /later than the scheduled publish time/i);
  });

  it('expiration equal to the scheduled publish → rejected (400)', async () => {
    const start = futureIso(24 * HOUR);
    const body = { ...baseBody(), publishMode: 'schedule', startAt: start, endAt: start };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonPayload.field, 'endAt');
  });

  it('invalid date format → rejected (400)', async () => {
    const body = { ...baseBody(), publishMode: 'immediate', startAt: '', endAt: '08/07/2026 04:00 PM' };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonPayload.field, 'endAt');
  });

  it('legacy request (no publishMode) with stale dates and past expiry → rejected (400)', async () => {
    // Reproduces the reported bug: stale schedule + stale expiry, immediate intent.
    const body = { ...baseBody(), startAt: pastIso(3 * 24 * HOUR), endAt: pastIso(2 * 24 * HOUR) };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonPayload.field, 'endAt');
  });

  it('legacy request with future schedule and future expiry → success (scheduled)', async () => {
    const body = { ...baseBody(), scheduledAt: futureIso(24 * HOUR), expiresAt: futureIso(30 * HOUR) };
    const res = mockRes();
    await createAlert(mockReq(mkUser('admin'), body), res);

    assert.equal(res.statusCode, 201);
    assert.equal(res.jsonPayload.data.alert.status, 'scheduled');
  });
});

describe('createAlert — Subcity Admin validation', () => {
  it('subcity admin immediate publish with future expiration → success', async () => {
    const body = {
      ...baseBody(),
      publishMode: 'immediate',
      startAt: '',
      endAt: futureIso(),
      woredaNames: ['Woreda 01'],
    };
    const res = mockRes();
    await createAlert(mockReq(mkUser('subcity_bole', { subcity: 'Bole' }), body), res);

    assert.equal(res.statusCode, 201);
    const alert = res.jsonPayload.data.alert;
    assert.equal(alert.status, 'published');
    assert.equal(alert.scope, 'woreda');
  });

  it('subcity admin scheduled publish in the past → rejected (400)', async () => {
    const body = {
      ...baseBody(),
      publishMode: 'schedule',
      startAt: pastIso(),
      endAt: futureIso(),
      woredaNames: ['Woreda 01'],
    };
    const res = mockRes();
    await createAlert(mockReq(mkUser('subcity_bole', { subcity: 'Bole' }), body), res);

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonPayload.field, 'startAt');
  });
});

describe('createAlert — Woreda Admin validation', () => {
  it('woreda admin immediate publish with future expiration → success', async () => {
    const body = { ...baseBody(), publishMode: 'immediate', startAt: '', endAt: futureIso() };
    const res = mockRes();
    await createAlert(
      mockReq(mkUser('woreda', { subcity: 'Bole', subcityId: new mongoose.Types.ObjectId(), woredaName: 'Woreda 01', woredaId: new mongoose.Types.ObjectId() }), body),
      res
    );

    assert.equal(res.statusCode, 201);
    assert.equal(res.jsonPayload.data.alert.status, 'published');
  });

  it('woreda admin scheduled publish with past schedule → rejected (400)', async () => {
    const body = { ...baseBody(), publishMode: 'schedule', startAt: pastIso(), endAt: futureIso() };
    const res = mockRes();
    await createAlert(
      mockReq(mkUser('woreda', { subcity: 'Bole', subcityId: new mongoose.Types.ObjectId(), woredaName: 'Woreda 01', woredaId: new mongoose.Types.ObjectId() }), body),
      res
    );

    assert.equal(res.statusCode, 400);
    assert.equal(res.jsonPayload.field, 'startAt');
  });
});
