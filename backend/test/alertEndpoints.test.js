/**
 * Tests for the Public Alert & Broadcast system:
 *   • PublicAlert model — category/severity enums, auto safety instructions.
 *   • notifyCitizens  — respects subscription toggle + category filters,
 *     always delivers emergency alerts, writes AlertDelivery rows + in-app
 *     Notifications.
 *   • buildAlertScope / canManageAlert — role-based scoping.
 *   • runAlertSchedulerPass — publishes due scheduled alerts and expires
 *     overdue active alerts.
 *
 * Uses mongodb-memory-server with the system mongod binary when available.
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
const PublicAlert = require('../src/models/PublicAlert');
const AlertDelivery = require('../src/models/AlertDelivery');
const User = require('../src/models/User');
const Notification = require('../src/models/Notification');
const {
  notifyCitizens,
  buildAlertScope,
  canManageAlert,
} = require('../src/controllers/alertController');
const { runAlertSchedulerPass } = require('../src/utils/alertScheduler');

let mongod;

const mkUser = (overrides = {}) =>
  User.create({
    fullName: 'Test Citizen',
    email: `citizen-${Math.random().toString(36).slice(2)}@example.com`,
    password: 'secret123',
    role: 'citizen',
    alertSubscriptions: {
      enabled: true,
      categories: [],
      channels: { inApp: true, email: false, sms: false, push: false },
    },
    ...overrides,
  });

const mkAlert = (overrides = {}) =>
  PublicAlert.create({
    title: 'Heavy rain expected',
    category: 'heavy_rainfall',
    severity: 'warning',
    description: 'Heavy rainfall expected across the subcity.',
    scope: 'all',
    status: 'active',
    createdByName: 'Admin',
    createdByRole: 'admin',
    ...overrides,
  });

// ── Global setup / teardown ──────────────────────────────────────────────────
before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { dbName: 'alert-test' });
});

after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

beforeEach(async () => {
  await Promise.all([
    PublicAlert.deleteMany({}),
    AlertDelivery.deleteMany({}),
    User.deleteMany({}),
    Notification.deleteMany({}),
  ]);
});

// ── Model ────────────────────────────────────────────────────────────────────
describe('PublicAlert model', () => {
  it('rejects an unknown category', async () => {
    await assert.rejects(
      PublicAlert.create({ title: 'x', category: 'nonsense', severity: 'warning', description: 'd' }),
      /category/
    );
  });

  it('rejects an unknown severity', async () => {
    await assert.rejects(
      PublicAlert.create({ title: 'x', category: 'flood', severity: 'Critical', description: 'd' }),
      /severity/
    );
  });

  it('auto-populates safety instructions from the category', async () => {
    const alert = await mkAlert({ category: 'flood' });
    assert.ok(alert.safetyInstructions.length >= 3);
    assert.ok(alert.safetyInstructions.some((s) => /higher ground/i.test(s)));
  });

  it('pins emergency alerts', async () => {
    const alert = await mkAlert({ severity: 'emergency' });
    assert.equal(alert.pinned, true);
  });

  it('defaults unpinned for information alerts', async () => {
    const alert = await mkAlert({ severity: 'information' });
    assert.equal(alert.pinned, false);
  });
});

// ── notifyCitizens ───────────────────────────────────────────────────────────
describe('notifyCitizens', () => {
  it('notifies subscribed citizens via in-app channel', async () => {
    const user = await mkUser();
    const alert = await mkAlert({ severity: 'warning' });

    const stats = await notifyCitizens(alert, null);

    assert.equal(stats.inApp, 1);
    const delivery = await AlertDelivery.findOne({ alert: alert._id, user: user._id });
    assert.ok(delivery);
    assert.ok(delivery.channels.includes('inApp'));
    const notif = await Notification.findOne({ recipient: user._id, type: 'public_alert' });
    assert.ok(notif);
  });

  it('skips users who disabled non-emergency alerts', async () => {
    await mkUser({ alertSubscriptions: { enabled: false, categories: [], channels: { inApp: true, email: false, sms: false, push: false } } });
    const alert = await mkAlert({ severity: 'warning' });

    const stats = await notifyCitizens(alert, null);
    assert.equal(stats.notifiedCitizens, 0);
  });

  it('respects the category filter', async () => {
    await mkUser({ alertSubscriptions: { enabled: true, categories: ['flood'], channels: { inApp: true, email: false, sms: false, push: false } } });
    const alert = await mkAlert({ category: 'power_outage', severity: 'warning' });

    const stats = await notifyCitizens(alert, null);
    assert.equal(stats.notifiedCitizens, 0);
  });

  it('always delivers emergency alerts even when disabled', async () => {
    await mkUser({ alertSubscriptions: { enabled: false, categories: [], channels: { inApp: true, email: false, sms: false, push: false } } });
    const alert = await mkAlert({ severity: 'emergency' });

    const stats = await notifyCitizens(alert, null);
    assert.equal(stats.notifiedCitizens, 1);
    const notif = await Notification.findOne({ type: 'emergency_alert' });
    assert.ok(notif);
  });

  it('records the enabled SMS/email channels', async () => {
    const user = await mkUser({
      emailNotifications: true,
      smsNotifications: true,
      alertSubscriptions: { enabled: true, categories: [], channels: { inApp: true, email: true, sms: true, push: false } },
    });
    const alert = await mkAlert({ severity: 'warning' });

    const stats = await notifyCitizens(alert, null);
    assert.equal(stats.email, 1);
    assert.equal(stats.sms, 1);
    const delivery = await AlertDelivery.findOne({ alert: alert._id, user: user._id });
    assert.ok(delivery.channels.includes('email'));
    assert.ok(delivery.channels.includes('sms'));
  });
});

// ── Scoping ──────────────────────────────────────────────────────────────────
describe('alert role scoping', () => {
  it('admin sees everything', () => {
    assert.deepEqual(buildAlertScope({ role: 'admin' }), {});
  });

  it('subcity admin sees all-scope + their own subcity', () => {
    const scope = buildAlertScope({ role: 'subcity_bole', subcity: 'Bole' });
    const hasOwnSubcity = scope.$or.some((c) => c.subcityName && c.subcityName.$options === 'i');
    assert.equal(hasOwnSubcity, true);
    assert.ok(scope.$or.some((c) => c.scope === 'all'));
  });

  it('woreda officer sees all-scope + their woreda', () => {
    const woredaId = new mongoose.Types.ObjectId();
    const scope = buildAlertScope({ role: 'woreda', woredaId });
    assert.ok(scope.$or.some((c) => String(c.woredaId) === String(woredaId)));
    assert.ok(scope.$or.some((c) => c.scope === 'all'));
  });

  it('canManageAlert: subcity admin may manage their own subcity alert', () => {
    const user = { role: 'subcity_bole', subcity: 'Bole' };
    assert.equal(canManageAlert(user, { scope: 'subcity', subcityName: 'bole' }), true);
    assert.equal(canManageAlert(user, { scope: 'subcity', subcityName: 'Yeka' }), false);
    assert.equal(canManageAlert(user, { scope: 'all' }), true);
  });

  it('canManageAlert: woreda officer may manage their own woreda alert', () => {
    const woredaId = new mongoose.Types.ObjectId();
    const user = { role: 'woreda', woredaId };
    assert.equal(canManageAlert(user, { scope: 'woreda', woredaId }), true);
    assert.equal(canManageAlert(user, { scope: 'woreda', woredaId: new mongoose.Types.ObjectId() }), false);
  });
});

// ── Scheduler ────────────────────────────────────────────────────────────────
describe('runAlertSchedulerPass', () => {
  it('publishes scheduled alerts whose time has come', async () => {
    const user = await mkUser();
    const alert = await PublicAlert.create({
      title: 'Scheduled water outage',
      category: 'water_interruption',
      severity: 'information',
      description: 'Planned maintenance.',
      scope: 'all',
      status: 'scheduled',
      scheduledAt: new Date(Date.now() - 60 * 1000),
      createdByName: 'Admin',
      createdByRole: 'admin',
    });

    await runAlertSchedulerPass(null);

    const fresh = await PublicAlert.findById(alert._id);
    assert.equal(fresh.status, 'published');
    assert.ok(fresh.publishedAt);
    assert.equal(fresh.deliveryStats.inApp, 1);
    assert.ok(await AlertDelivery.findOne({ alert: alert._id, user: user._id }));
  });

  it('does not publish scheduled alerts in the future', async () => {
    const alert = await PublicAlert.create({
      title: 'Future alert',
      category: 'flood',
      severity: 'warning',
      description: 'Later.',
      scope: 'all',
      status: 'scheduled',
      scheduledAt: new Date(Date.now() + 60 * 60 * 1000),
      createdByName: 'Admin',
      createdByRole: 'admin',
    });

    await runAlertSchedulerPass(null);

    const fresh = await PublicAlert.findById(alert._id);
    assert.equal(fresh.status, 'scheduled');
  });

  it('expires active alerts past their expiry', async () => {
    const alert = await mkAlert({ expiresAt: new Date(Date.now() - 60 * 1000) });

    await runAlertSchedulerPass(null);

    const fresh = await PublicAlert.findById(alert._id);
    assert.equal(fresh.status, 'expired');
  });
});
