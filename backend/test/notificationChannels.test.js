/**
 * Tests for notification delivery:
 *   • emailService  — SMTP not configured ⇒ safe no-op; configured + mocked
 *                     Nodemailer ⇒ builds the right mail object.
 *   • smsService    — disabled ⇒ safe no-op; enabled ⇒ POSTs JSON to the
 *                     configured gateway with the bearer key (fetch stubbed).
 *   • dispatchNotification — dedupes targets, writes Notification docs,
 *                     records channel history, and invokes the email/SMS
 *                     services based on each user's notification flags.
 *
 * Uses mongodb-memory-server with the system mongod binary when available.
 */
const { describe, it, before, after, beforeEach, mock } = require('node:test');
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
const nodemailer = require('nodemailer');
const Notification = require('../src/models/Notification');
const MunicipalComplaint = require('../src/models/MunicipalComplaint');
const { sendEmail, isConfigured: emailConfigured } = require('../src/services/emailService');
const { sendSms, isConfigured: smsConfigured } = require('../src/services/smsService');
const { dispatchNotification } = require('../src/controllers/municipalComplaintController');

let mongod;
const originalFetch = globalThis.fetch;
const originalEnv = { ...process.env };

const mkComplaint = () =>
  MunicipalComplaint.create({
    title: 'Broken streetlight',
    description: 'Streetlight not working',
    subcity: 'Bole',
    woredaId: new mongoose.Types.ObjectId(),
    woredaName: 'Woreda 07',
    department: 'Electricity',
    reporter: new mongoose.Types.ObjectId(),
    reporterName: 'Kebede',
    reporterPhone: '+251911000001',
    reporterEmail: 'kebede@example.com',
    status: 'Submitted',
  });

// Capture [EMAIL-HOOK] / [SMS-HOOK] no-op logs so we can assert which services
// dispatchNotification actually invoked without touching a real gateway.
const captureHooks = async (fn) => {
  const logs = [];
  const realLog = console.log;
  console.log = (...args) => { logs.push(args.join(' ')); };
  try {
    await fn();
  } finally {
    console.log = realLog;
  }
  return logs;
};

// ── Global setup / teardown ──────────────────────────────────────────────────
before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  await MunicipalComplaint.init();
  await Notification.init();
});

after(async () => {
  if (originalFetch) globalThis.fetch = originalFetch;
  process.env = originalEnv;
  mock.restoreAll();
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await MunicipalComplaint.deleteMany({});
  await Notification.deleteMany({});
});

// ── Email service ─────────────────────────────────────────────────────────────
describe('emailService', () => {
  it('is unconfigured when SMTP host/port are not set', () => {
    const { SMTP_HOST, SMTP_PORT } = process.env;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    try {
      assert.equal(emailConfigured(), false);
    } finally {
      if (SMTP_HOST) process.env.SMTP_HOST = SMTP_HOST;
      if (SMTP_PORT) process.env.SMTP_PORT = SMTP_PORT;
    }
  });

  it('skips (never throws) when SMTP is not configured', async () => {
    const { SMTP_HOST, SMTP_PORT } = process.env;
    delete process.env.SMTP_HOST;
    delete process.env.SMTP_PORT;
    try {
      const res = await sendEmail({ to: 'x@example.com', subject: 'Hi', text: 'Body' });
      assert.equal(res.ok, false);
      assert.equal(res.skipped, true);
    } finally {
      if (SMTP_HOST) process.env.SMTP_HOST = SMTP_HOST;
      if (SMTP_PORT) process.env.SMTP_PORT = SMTP_PORT;
    }
  });

  it('skips when there is no recipient even if SMTP is configured', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    try {
      const res = await sendEmail({ subject: 'Hi', text: 'Body' });
      assert.equal(res.ok, false);
      assert.equal(res.skipped, true);
    } finally {
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
    }
  });

  it('sends via Nodemailer with the correct mail envelope when configured', async () => {
    process.env.SMTP_HOST = 'smtp.example.com';
    process.env.SMTP_PORT = '587';
    process.env.SMTP_USER = 'sender@example.com';
    process.env.SMTP_PASS = 'secret';
    let sent = null;
    mock.method(nodemailer, 'createTransport', () => ({
      sendMail: async (mail) => { sent = mail; return { messageId: 'msg-123' }; },
    }));
    try {
      const res = await sendEmail({
        to: 'target@example.com',
        subject: 'Complaint updated',
        text: 'Your complaint was accepted.',
      });
      assert.equal(res.ok, true);
      assert.equal(res.messageId, 'msg-123');
      assert.equal(sent.to, 'target@example.com');
      assert.equal(sent.subject, 'Complaint updated');
      assert.equal(sent.text, 'Your complaint was accepted.');
      assert.match(sent.from, /sender@example.com/);
    } finally {
      mock.restoreAll();
      delete process.env.SMTP_HOST;
      delete process.env.SMTP_PORT;
      delete process.env.SMTP_USER;
      delete process.env.SMTP_PASS;
    }
  });
});

// ── SMS service ───────────────────────────────────────────────────────────────
describe('smsService', () => {
  it('is disabled until SMS_ENABLED=true', () => {
    process.env.SMS_ENABLED = 'false';
    process.env.SMS_API_URL = 'https://example.com/sms';
    try {
      assert.equal(smsConfigured(), false);
    } finally {
      delete process.env.SMS_ENABLED;
      delete process.env.SMS_API_URL;
    }
  });

  it('skips (never throws) when SMS is disabled', async () => {
    process.env.SMS_ENABLED = 'false';
    try {
      const res = await sendSms({ to: '+251911000001', message: 'Hello' });
      assert.equal(res.ok, false);
      assert.equal(res.skipped, true);
    } finally {
      delete process.env.SMS_ENABLED;
    }
  });

  it('posts JSON with bearer auth and returns ok on 2xx', async () => {
    process.env.SMS_ENABLED = 'true';
    process.env.SMS_API_URL = 'https://provider.example/sms/send';
    process.env.SMS_API_KEY = 'k-123';
    process.env.SMS_SENDER_ID = 'EthioBridge';
    let captured = null;
    globalThis.fetch = async (url, opts) => {
      captured = { url, opts };
      return { ok: true, status: 200 };
    };
    try {
      const res = await sendSms({ to: '+251911000001', message: 'Your complaint was accepted.' });
      assert.equal(res.ok, true);
      assert.equal(captured.url, 'https://provider.example/sms/send');
      assert.equal(captured.opts.method, 'POST');
      assert.equal(captured.opts.headers.Authorization, 'Bearer k-123');
      const body = JSON.parse(captured.opts.body);
      assert.equal(body.phone, '+251911000001');
      assert.equal(body.message, 'Your complaint was accepted.');
      assert.equal(body.sender, 'EthioBridge');
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.SMS_ENABLED;
      delete process.env.SMS_API_URL;
      delete process.env.SMS_API_KEY;
      delete process.env.SMS_SENDER_ID;
    }
  });

  it('reports provider errors without throwing', async () => {
    process.env.SMS_ENABLED = 'true';
    process.env.SMS_API_URL = 'https://provider.example/sms/send';
    globalThis.fetch = async () => ({ ok: false, status: 503 });
    try {
      const res = await sendSms({ to: '+251911000001', message: 'Hello' });
      assert.equal(res.ok, false);
      assert.equal(res.status, 503);
    } finally {
      globalThis.fetch = originalFetch;
      delete process.env.SMS_ENABLED;
      delete process.env.SMS_API_URL;
    }
  });
});

// ── dispatchNotification ──────────────────────────────────────────────────────
describe('dispatchNotification', () => {
  it('dedupes targets and records one notification + history entry per unique user', async () => {
    const complaint = await mkComplaint();
    const user = { _id: new mongoose.Types.ObjectId(), email: 'a@example.com', emailNotifications: true };
    const logs = await captureHooks(() =>
      dispatchNotification(null, complaint, [user, user, user, null], {
        event: 'Test',
        title: 'T',
        message: 'M',
        type: 'complaint_status',
      })
    );

    assert.equal(complaint.notificationHistory.length, 1);
    assert.equal(await Notification.countDocuments({ recipient: user._id }), 1);
    assert.match(logs.join('\n'), /EMAIL-HOOK/);
  });

  it('channels: in-app only when no email/phone; adds email + sms by preference', async () => {
    const complaint = await mkComplaint();
    const plain = { _id: new mongoose.Types.ObjectId(), emailNotifications: false, smsNotifications: false };
    const emailOnly = { _id: new mongoose.Types.ObjectId(), email: 'e@example.com', emailNotifications: true, smsNotifications: false };
    const smsOnly = { _id: new mongoose.Types.ObjectId(), phone: '+251911000002', emailNotifications: false, smsNotifications: true };
    const both = { _id: new mongoose.Types.ObjectId(), email: 'b@example.com', phone: '+251911000003', emailNotifications: true, smsNotifications: true };

    await dispatchNotification(null, complaint, [plain, emailOnly, smsOnly, both], {
      event: 'Test',
      title: 'T',
      message: 'M',
    });

    const channels = complaint.notificationHistory.map((h) => h.channels);
    assert.deepEqual(
      channels.sort(),
      ['in-app', 'in-app, email', 'in-app, sms', 'in-app, sms, email'].sort()
    );
  });

  it('emits socket events when io is provided', async () => {
    const complaint = await mkComplaint();
    const user = { _id: new mongoose.Types.ObjectId(), emailNotifications: false, smsNotifications: false };
    const rooms = {};
    const io = {
      to: (id) => ({
        emit: (event, payload) => { rooms[event] = rooms[event] || []; rooms[event].push({ id, payload }); },
      }),
    };
    await dispatchNotification(io, complaint, [user], { event: 'Test', title: 'T', message: 'M' });
    assert.equal(rooms['notification:new'].length, 1);
    assert.equal(rooms['notification:new'][0].id, user._id.toString());
    assert.equal(rooms['notification:new'][0].payload.title, 'T');
  });

  it('guards against targets missing an _id', async () => {
    const complaint = await mkComplaint();
    const logs = await captureHooks(() =>
      dispatchNotification(null, complaint, [{ email: 'x@example.com', emailNotifications: true }], {
        event: 'Test', title: 'T', message: 'M',
      })
    );
    assert.equal(complaint.notificationHistory.length, 0);
    assert.equal(logs.length, 0);
  });
});
