/**
 * Tests for POST /api/auth/login (the authController.login handler).
 *
 * Covers the password fix requirements:
 *   - Correct password logs in successfully (bcrypt.compare via matchPassword)
 *   - Wrong password → 401 "Invalid password"
 *   - Unknown email → 401 (lockout counter NOT incremented)
 *   - MAX_LOGIN_ATTEMPTS wrong passwords → 429 lockout
 *   - A correct password bypasses an active lockout
 *   - Failed-attempt counter resets after a successful login
 */
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

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

process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret';

const { MongoMemoryServer } = require('mongodb-memory-server');
const User = require('../src/models/User');
const { login } = require('../src/controllers/authController');
const {
  getLockoutRecord,
  recordFailure,
  clearLockout,
  loginAttempts,
} = require('../src/middleware/rateLimiter');

let mongod;
let emailCounter = 0;

const mockRes = () => {
  const res = { _status: 200, _json: null };
  res.status = function (s) { res._status = s; return res; };
  res.json = function (obj) { res._json = obj; return res; };
  return res;
};

const callLogin = async (body, email) => {
  const res = mockRes();
  await login(
    {
      body,
      headers: {},
      ip: '127.0.0.1',
      get: () => 'node:test',
      loginLockout: {
        check: () => {
          const { isLocked, remainingMin } = getLockoutRecord(email);
          return { isLocked, remainingMin };
        },
        fail: () => recordFailure(email),
        clear: () => clearLockout(email),
      },
    },
    res
  );
  return { status: res._status, json: res._json };
};

const uniqueEmail = () => `login_${Date.now()}_${emailCounter++}@zda.et`;

const mkUser = (over = {}) =>
  User.create({
    fullName: 'Login Tester',
    email: uniqueEmail(),
    password: 'CorrectPass1',
    phone: '0911223344',
    role: 'woreda_admin',
    isActive: true,
    isApproved: true,
    ...over,
  });

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  await User.init();
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

describe('POST /api/auth/login — password verification', () => {
  it('logs in with the correct password (bcrypt compare passes)', async () => {
    const user = await mkUser({ role: 'admin' });
    const { status, json } = await callLogin(
      { email: user.email, password: 'CorrectPass1' },
      user.email
    );
    assert.equal(status, 200);
    assert.equal(json.success, true);
    assert.ok(json.token, 'token should be returned');
    assert.equal(json.user.email, user.email.toLowerCase());
    assert.equal(json.user.role, 'admin');
    assert.ok(json.user.id, 'user.id should be present');
  });

  it('normalizes a legacy camelCase role in the login response and token', async () => {
    // The schema validator rejects camelCase roles on save, so legacy records
    // can only exist from older builds / direct DB writes. Simulate that with
    // a raw collection update that bypasses validation.
    const user = await mkUser({ role: 'woreda_admin' });
    await User.collection.updateOne(
      { _id: user._id },
      { $set: { role: 'woredaAdmin' } }
    );

    const { status, json } = await callLogin(
      { email: user.email, password: 'CorrectPass1' },
      user.email
    );
    assert.equal(status, 200);
    assert.equal(json.user.role, 'woreda_admin', 'login response should use the canonical role');

    const decoded = jwt.decode(json.token);
    assert.equal(decoded.role, 'woreda_admin', 'JWT payload should use the canonical role');
  });

  it('rejects a wrong password with 401 Invalid password', async () => {
    const user = await mkUser();
    const { status, json } = await callLogin(
      { email: user.email, password: 'WrongPass1' },
      user.email
    );
    assert.equal(status, 401);
    assert.match(json.message, /Invalid password/i);
  });

  it('rejects an unknown email and does NOT increment the lockout counter', async () => {
    const email = uniqueEmail();
    await callLogin({ email, password: 'Whatever1' }, email);
    assert.equal(loginAttempts.has(email), false);
  });

  it('rejects with 429 after MAX_LOGIN_ATTEMPTS wrong passwords', async () => {
    const user = await mkUser();
    let result;
    for (let i = 0; i < 5; i += 1) {
      result = await callLogin(
        { email: user.email, password: `Wrong${i}` },
        user.email
      );
    }
    assert.equal(result.status, 429);
    assert.match(result.json.message, /Too many failed login attempts/i);
  });

  it('locks the account but a correct password still logs in', async () => {
    const user = await mkUser();
    for (let i = 0; i < 5; i += 1) {
      await callLogin({ email: user.email, password: `Wrong${i}` }, user.email);
    }
    const { status, json } = await callLogin(
      { email: user.email, password: 'CorrectPass1' },
      user.email
    );
    assert.equal(status, 200);
    assert.equal(json.success, true);
  });

  it('resets the failed-attempt counter after a successful login', async () => {
    const user = await mkUser();
    const email = user.email;

    // Two failures, then a success — the counter is cleared.
    await callLogin({ email, password: 'Wrong1' }, email);
    await callLogin({ email, password: 'Wrong2' }, email);
    assert.equal(loginAttempts.has(email), true);

    const success = await callLogin({ email, password: 'CorrectPass1' }, email);
    assert.equal(success.status, 200);
    assert.equal(loginAttempts.has(email), false);

    // One failure after the reset must count as attempt #1, not #3 — which
    // means no lockout (429) yet after just one more failure.
    const { status, json } = await callLogin({ email, password: 'Wrong3' }, email);
    assert.equal(status, 401);
    assert.doesNotMatch(json.message, /Too many failed login attempts/i);
  });

  it('returns a generic message on server error (no technical details)', async () => {
    // Force an error: login against a user document whose email breaks the
    // admin-alias logic, e.g. a null email object is fine because lookup
    // handles it — instead simulate by clearing JWT_SECRET so generateToken
    // throws after password verification succeeds.
    const user = await mkUser();
    const originalSecret = process.env.JWT_SECRET;
    process.env.JWT_SECRET = '';
    try {
      const { status, json } = await callLogin(
        { email: user.email, password: 'CorrectPass1' },
        user.email
      );
      assert.equal(status, 500);
      assert.match(json.message, /Server error/i);
      assert.doesNotMatch(json.message, /jwt|secret/i);
    } finally {
      process.env.JWT_SECRET = originalSecret;
    }
  });
});
