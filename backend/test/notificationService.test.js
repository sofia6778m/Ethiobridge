/**
 * Tests for the centralized NotificationService:
 *   • notifyUser   — writes a Notification + emits a socket event to the
 *                    recipient's personal room
 *   • actor exclusion — a user never receives a notification about their own
 *                    action (actorId === userId ⇒ skipped)
 *   • notifyUsers  — dedupes ids and excludes the actor
 *   • markAsRead / markAllAsRead / getUnreadCount — ownership-scoped
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
const Notification = require('../src/models/Notification');
const createNotification = require('../src/utils/createNotification');
const {
  notifyUser,
  notifyUsers,
  markAsRead,
  markAllAsRead,
  getUnreadCount,
  isActor,
} = require('../src/services/notificationService');

let mongod;

const mkId = () => new mongoose.Types.ObjectId();

const captureRooms = () => {
  const rooms = {};
  return {
    rooms,
    io: {
      to: (id) => ({
        emit: (event, payload) => {
          rooms[event] = rooms[event] || [];
          rooms[event].push({ id, payload });
        },
      }),
    },
  };
};

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  await Notification.init();
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Notification.deleteMany({});
});

// ── notifyUser ────────────────────────────────────────────────────────────────
describe('notifyUser', () => {
  it('writes a Notification and emits a socket event to the recipient room', async () => {
    const recipient = mkId();
    const complaintId = mkId();
    const { rooms, io } = captureRooms();

    const notification = await notifyUser({
      userId: recipient,
      actorId: mkId(),
      title: 'Complaint GOV-2026-000001 resolved',
      message: 'Your complaint has been resolved.',
      type: 'governance_resolved',
      relatedReport: complaintId,
      relatedReportType: 'governance_complaint',
      complaintId,
      io,
    });

    assert.ok(notification);
    const stored = await Notification.findById(notification._id).lean();
    assert.equal(String(stored.recipient), String(recipient));
    assert.equal(String(stored.complaintId), String(complaintId));
    assert.equal(stored.isRead, false);

    assert.equal(rooms['notification:new'].length, 1);
    assert.equal(rooms['notification:new'][0].id, recipient.toString());
    assert.equal(rooms['notification:new'][0].payload.title, 'Complaint GOV-2026-000001 resolved');
  });

  it('skips creation when the recipient is the actor', async () => {
    const actor = mkId();
    const notification = await notifyUser({
      userId: actor,
      actorId: actor,
      title: 'T',
      message: 'M',
      type: 'system',
    });
    assert.equal(notification, null);
    assert.equal(await Notification.countDocuments({}), 0);
  });

  it('handles string vs ObjectId actor ids interchangeably', async () => {
    const actor = mkId();
    assert.equal(await notifyUser({ userId: actor, actorId: actor.toString(), title: 'T', message: 'M' }), null);
    assert.equal(await notifyUser({ userId: actor.toString(), actorId: actor, title: 'T', message: 'M' }), null);
    assert.equal(await Notification.countDocuments({}), 0);
  });

  it('is a no-op when there is no recipient', async () => {
    const notification = await notifyUser({ userId: null, actorId: mkId(), title: 'T', message: 'M' });
    assert.equal(notification, null);
  });
});

// ── notifyUsers ───────────────────────────────────────────────────────────────
describe('notifyUsers', () => {
  it('dedupes duplicate ids and excludes the actor', async () => {
    const recipient = mkId();
    const actor = mkId();
    const created = await notifyUsers({
      userIds: [recipient, recipient, actor, null, recipient],
      actorId: actor,
      title: 'T',
      message: 'M',
    });
    assert.equal(created.length, 1);
    assert.equal(await Notification.countDocuments({}), 1);
    assert.equal(await Notification.countDocuments({ recipient }), 1);
    assert.equal(await Notification.countDocuments({ recipient: actor }), 0);
  });

  it('records the actor on notifications created for others', async () => {
    const actor = mkId();
    const recipient = mkId();
    await notifyUsers({ userIds: [recipient], actorId: actor, title: 'T', message: 'M' });
    const stored = await Notification.findOne({ recipient }).lean();
    assert.equal(String(stored.actorId), String(actor));
  });
});

// ── createNotification (global guard) ─────────────────────────────────────────
// The util is the single funnel for every notification path, so the actor
// exclusion must hold even when callers invoke it directly.
describe('createNotification', () => {
  it('never creates a notification whose recipient is the actor', async () => {
    const actor = mkId();
    const result = await createNotification({ recipient: actor, actorId: actor, title: 'T', message: 'M', type: 'system' });
    assert.equal(result, null);
    assert.equal(await Notification.countDocuments({}), 0);
  });

  it('accepts string vs ObjectId actor ids interchangeably', async () => {
    const actor = mkId();
    assert.equal(await createNotification({ recipient: actor, actorId: actor.toString(), title: 'T', message: 'M', type: 'system' }), null);
    assert.equal(await createNotification({ recipient: actor.toString(), actorId: actor, title: 'T', message: 'M', type: 'system' }), null);
    assert.equal(await Notification.countDocuments({}), 0);
  });

  it('still creates the notification when actor differs from recipient', async () => {
    const actor = mkId();
    const recipient = mkId();
    const notification = await createNotification({ recipient, actorId: actor, title: 'T', message: 'M', type: 'system' });
    assert.ok(notification);
    assert.equal(String(notification.actorId), String(actor));
  });

  it('creates notifications for calls that carry no actor', async () => {
    const recipient = mkId();
    const notification = await createNotification({ recipient, title: 'T', message: 'M', type: 'system' });
    assert.ok(notification);
    assert.equal(notification.actorId, undefined);
  });
});

// ── markAsRead / markAllAsRead / getUnreadCount ───────────────────────────────
describe('markAsRead / markAllAsRead / getUnreadCount', () => {
  it('marks a notification read only for its owner', async () => {
    const owner = mkId();
    const stranger = mkId();
    const n = await Notification.create({ recipient: owner, title: 'T', message: 'M', type: 'system' });

    const strangerResult = await markAsRead(stranger, n._id);
    assert.equal(strangerResult, null);
    assert.equal(await getUnreadCount(owner), 1);

    const ownerResult = await markAsRead(owner, n._id);
    assert.ok(ownerResult);
    assert.equal(ownerResult.isRead, true);
    assert.ok(ownerResult.readAt);
    assert.equal(await getUnreadCount(owner), 0);
  });

  it('marks all of a user notifications read without touching others', async () => {
    const owner = mkId();
    const other = mkId();
    await Notification.create([{ recipient: owner, title: 'A', message: 'M', type: 'system' }, { recipient: owner, title: 'B', message: 'M', type: 'system' }]);
    await Notification.create({ recipient: other, title: 'C', message: 'M', type: 'system' });

    const result = await markAllAsRead(owner);
    assert.equal(result.modifiedCount, 2);
    assert.equal(await getUnreadCount(owner), 0);
    assert.equal(await getUnreadCount(other), 1);
  });
});

// ── isActor helper ────────────────────────────────────────────────────────────
describe('isActor', () => {
  it('compares ObjectId and string ids', () => {
    const a = mkId();
    assert.equal(isActor(a, a), true);
    assert.equal(isActor(a.toString(), a), true);
    assert.equal(isActor(a, a.toString()), true);
    assert.equal(isActor(a, mkId()), false);
    assert.equal(isActor(null, a), false);
    assert.equal(isActor(a, null), false);
  });
});
