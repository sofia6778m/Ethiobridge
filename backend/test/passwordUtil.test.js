const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  hashPassword,
  verifyPassword,
  isHashedPassword,
  SALT_ROUNDS,
} = require('../src/utils/password');

describe('password util', () => {
  it('SALT_ROUNDS is 10', () => {
    assert.equal(SALT_ROUNDS, 10);
  });

  it('hashPassword returns a bcrypt hash ($2…, 60 chars)', async () => {
    const hash = await hashPassword('Secret123');
    assert.match(hash, /^\$2[abxy]\$/);
    assert.equal(hash.length, 60);
  });

  it('hashes are unique per call (random salt)', async () => {
    const a = await hashPassword('same-password');
    const b = await hashPassword('same-password');
    assert.notEqual(a, b);
  });

  it('verifyPassword accepts the correct password', async () => {
    const hash = await hashPassword('my-password');
    assert.equal(await verifyPassword('my-password', hash), true);
  });

  it('verifyPassword rejects a wrong password', async () => {
    const hash = await hashPassword('my-password');
    assert.equal(await verifyPassword('wrong-password', hash), false);
  });

  it('verifyPassword returns false for a legacy plain-text stored value (no throw)', async () => {
    // This is the exact bug the migration script fixes: a stored value that is
    // not a bcrypt hash must never crash login with "Illegal arguments".
    assert.equal(await verifyPassword('plaintext', 'plaintext'), false);
    assert.equal(await verifyPassword('anything', '123456'), false);
    assert.equal(await verifyPassword('anything', ''), false);
  });

  it('verifyPassword returns false for missing input', async () => {
    const hash = await hashPassword('pw');
    assert.equal(await verifyPassword('', hash), false);
    assert.equal(await verifyPassword(undefined, hash), false);
    assert.equal(await verifyPassword('pw', undefined), false);
    assert.equal(await verifyPassword('pw', null), false);
  });

  it('isHashedPassword detects bcrypt hashes', async () => {
    const hash = await hashPassword('pw');
    assert.equal(isHashedPassword(hash), true);
    assert.equal(isHashedPassword('plaintext'), false);
    assert.equal(isHashedPassword(''), false);
    assert.equal(isHashedPassword(null), false);
    assert.equal(isHashedPassword(123), false);
  });
});
