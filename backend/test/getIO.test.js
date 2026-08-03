/**
 * Unit tests for the `getIO` helper exported from the municipal complaint
 * controller. This helper safely pulls the Socket.IO instance off the Express
 * app and must return null in unit-test / non-Express contexts (where the
 * `app.get` function does not exist) instead of crashing.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { getIO } = require('../src/controllers/municipalComplaintController');

describe('getIO helper', () => {
  it('returns null when req is missing or has no app', () => {
    assert.equal(getIO(undefined), null);
    assert.equal(getIO(null), null);
    assert.equal(getIO({}), null);
  });

  it('returns null when req.app is not an Express app (no .get function)', () => {
    assert.equal(getIO({ app: {} }), null);
    assert.equal(getIO({ app: { get: 'not-a-function' } }), null);
  });

  it('returns the io instance exposed via app.get("io")', () => {
    const io = { emit() {} };
    const req = { app: { get: (key) => (key === 'io' ? io : undefined) } };
    assert.equal(getIO(req), io);
  });

  it('returns null when app.get("io") resolves to undefined', () => {
    const req = { app: { get: () => undefined } };
    assert.equal(getIO(req), null);
  });
});
