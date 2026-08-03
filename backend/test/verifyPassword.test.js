const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const User = require('../src/models/User');
const { verifySubmissionPassword } = require('../src/utils/verifySubmissionPassword');

const originalFindById = User.findById;

describe('verifySubmissionPassword', () => {
  beforeEach(() => {
    User.findById = originalFindById;
  });

  const rejectsWithStatus = (promise, status, msgPattern) =>
    assert.rejects(promise, (err) => {
      assert.equal(err.status, status);
      if (msgPattern) assert.match(err.message, msgPattern);
      return true;
    });

  it('rejects with 401 when there is no logged-in user', async () => {
    await rejectsWithStatus(verifySubmissionPassword(null, 'pw'), 401, /logged in/i);
  });

  it('rejects with 400 when no password is entered', async () => {
    await rejectsWithStatus(verifySubmissionPassword({ _id: 'u' }, ''), 400, /password is required/i);
  });

  it('rejects with 401 when the account no longer exists', async () => {
    User.findById = () => ({ select: async () => null });
    await rejectsWithStatus(verifySubmissionPassword({ _id: 'missing' }, 'pw'), 401, /no longer exists/i);
  });

  it('rejects with 400 when the password is incorrect', async () => {
    User.findById = () => ({ select: async () => ({ matchPassword: async () => false }) });
    await rejectsWithStatus(verifySubmissionPassword({ _id: 'u' }, 'wrong'), 400, /incorrect password/i);
  });

  it('resolves when the password matches', async () => {
    User.findById = () => ({ select: async () => ({ matchPassword: async () => true }) });
    await assert.doesNotReject(verifySubmissionPassword({ _id: 'u' }, 'right'));
  });

  it('loads the user with the password field selected', async () => {
    let selected = null;
    User.findById = () => ({
      select: async (sel) => {
        selected = sel;
        return { matchPassword: async () => true };
      },
    });
    await verifySubmissionPassword({ _id: 'u' }, 'right');
    assert.equal(selected, '+password');
  });
});
