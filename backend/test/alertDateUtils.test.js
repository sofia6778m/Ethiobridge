/**
 * Unit tests for the shared alert publish/expiry window validation
 * (`src/utils/alertDateUtils.js`). These are pure-function tests — no database.
 *
 * Covers the acceptance scenarios:
 *   immediate + future expiry  → valid
 *   immediate + past expiry    → rejected
 *   immediate + current expiry → rejected
 *   schedule + future + later expiry → valid
 *   schedule in the past       → rejected
 *   expiry before schedule     → rejected
 *   expiry equal to schedule   → rejected
 *   empty schedule (immediate) → valid
 *   invalid date format        → rejected
 *   timezone-agnostic comparison → correct
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  validatePublishWindow,
  parseDate,
  MESSAGES,
} = require('../src/utils/alertDateUtils');

// Fixed "server now" so every test is deterministic.
const NOW = new Date('2026-08-07T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;
const MIN = 60 * 1000;

const iso = (offsetMs) => new Date(NOW.getTime() + offsetMs).toISOString();
const hasError = (result, field) => result.errors.some((e) => e.field === field);

describe('alertDateUtils — parseDate', () => {
  it('parses ISO-8601 strings, Date objects and numeric timestamps', () => {
    assert.ok(parseDate('2026-08-07T12:00:00.000Z'));
    assert.ok(parseDate(new Date(NOW)));
    assert.ok(parseDate(NOW.getTime()));
  });

  it('returns null for blank, null, undefined and garbage input', () => {
    assert.equal(parseDate(''), null);
    assert.equal(parseDate(null), null);
    assert.equal(parseDate(undefined), null);
    assert.equal(parseDate('not-a-date'), null);
    assert.equal(parseDate('08/05/2026 04:36 PM'), null); // US-style strings must not silently parse
    assert.equal(parseDate(new Date('invalid')), null);
  });
});

describe('alertDateUtils — immediate publishing', () => {
  it('immediate publish with a future expiration → success', () => {
    const res = validatePublishWindow({
      publishMode: 'immediate',
      startAt: '',
      endAt: iso(24 * HOUR),
      now: NOW,
    });
    assert.equal(res.mode, 'immediate');
    assert.equal(res.errors.length, 0);
    assert.equal(res.start, null); // server time is used, not a stored schedule
    assert.equal(res.end.getTime(), NOW.getTime() + 24 * HOUR);
  });

  it('immediate publish with a past expiration → rejected', () => {
    const res = validatePublishWindow({
      publishMode: 'immediate',
      startAt: '',
      endAt: iso(-1 * HOUR),
      now: NOW,
    });
    assert.ok(hasError(res, 'endAt'));
    assert.equal(res.errors[0].message, MESSAGES.endNotAfterNow);
  });

  it('immediate publish with a current expiration (equal to now) → rejected', () => {
    const res = validatePublishWindow({
      publishMode: 'immediate',
      startAt: '',
      endAt: iso(0),
      now: NOW,
    });
    assert.ok(hasError(res, 'endAt'));
    assert.equal(res.errors[0].message, MESSAGES.endNotAfterNow);
  });

  it('immediate publish without a schedule start (empty schedule) → success', () => {
    const res = validatePublishWindow({
      publishMode: 'immediate',
      startAt: '',
      endAt: iso(2 * HOUR),
      now: NOW,
    });
    assert.equal(res.errors.length, 0);
    assert.equal(res.start, null);
  });

  it('immediate publish without an expiration (empty expiry) → success — expiry is optional', () => {
    const res = validatePublishWindow({
      publishMode: 'immediate',
      startAt: '',
      endAt: '',
      now: NOW,
    });
    assert.equal(res.mode, 'immediate');
    assert.equal(res.errors.length, 0);
    assert.equal(res.start, null);
    assert.equal(res.end, null);
  });

  it('immediate publish REQUIRES an expiration only when strict is explicit', () => {
    const res = validatePublishWindow({
      publishMode: 'immediate',
      startAt: '',
      endAt: '',
      now: NOW,
      strict: true,
    });
    assert.ok(hasError(res, 'endAt'));
    assert.equal(res.errors[0].message, MESSAGES.endRequired);
  });

  it('immediate publish ignores a stale schedule start', () => {
    const res = validatePublishWindow({
      publishMode: 'immediate',
      startAt: iso(-3 * 24 * HOUR), // yesterday
      endAt: iso(24 * HOUR),
      now: NOW,
    });
    assert.equal(res.errors.length, 0);
    assert.equal(res.start, null);
  });
});

describe('alertDateUtils — scheduled publishing', () => {
  it('scheduled publish in the future with a later expiration → success', () => {
    const res = validatePublishWindow({
      publishMode: 'schedule',
      startAt: iso(24 * HOUR),
      endAt: iso(24 * HOUR + 8 * HOUR),
      now: NOW,
    });
    assert.equal(res.mode, 'schedule');
    assert.equal(res.errors.length, 0);
    assert.equal(res.start.getTime(), NOW.getTime() + 24 * HOUR);
    assert.equal(res.end.getTime(), NOW.getTime() + 32 * HOUR);
  });

  it('scheduled publish at exactly the current time is allowed', () => {
    const res = validatePublishWindow({
      publishMode: 'schedule',
      startAt: iso(0),
      endAt: iso(HOUR),
      now: NOW,
    });
    assert.equal(res.errors.length, 0);
  });

  it('scheduled publish in the past → rejected', () => {
    const res = validatePublishWindow({
      publishMode: 'schedule',
      startAt: iso(-1 * HOUR),
      endAt: iso(24 * HOUR),
      now: NOW,
    });
    assert.ok(hasError(res, 'startAt'));
    assert.equal(res.errors[0].message, MESSAGES.startInPast);
  });

  it('expiration before the scheduled publish → rejected', () => {
    const res = validatePublishWindow({
      publishMode: 'schedule',
      startAt: iso(24 * HOUR),
      endAt: iso(24 * HOUR - 2 * HOUR), // earlier than start
      now: NOW,
    });
    assert.ok(hasError(res, 'endAt'));
    assert.equal(res.errors[0].message, MESSAGES.endNotAfterStart);
  });

  it('expiration equal to the scheduled publish → rejected', () => {
    const res = validatePublishWindow({
      publishMode: 'schedule',
      startAt: iso(24 * HOUR),
      endAt: iso(24 * HOUR),
      now: NOW,
    });
    assert.ok(hasError(res, 'endAt'));
    assert.equal(res.errors[0].message, MESSAGES.endNotAfterStart);
  });

  it('scheduled publish without a start time → rejected', () => {
    const res = validatePublishWindow({
      publishMode: 'schedule',
      startAt: '',
      endAt: iso(24 * HOUR),
      now: NOW,
    });
    assert.ok(hasError(res, 'startAt'));
    assert.equal(res.errors[0].message, MESSAGES.startRequired);
  });

  it('scheduled publish without an expiration → success — expiry is optional', () => {
    const res = validatePublishWindow({
      publishMode: 'schedule',
      startAt: iso(24 * HOUR),
      endAt: '',
      now: NOW,
    });
    assert.equal(res.mode, 'schedule');
    assert.equal(res.errors.length, 0);
    assert.ok(res.start);
    assert.equal(res.end, null);
  });
});

describe('alertDateUtils — product scenarios (requirement 9)', () => {
  it('empty Schedule Publish → immediate publish succeeds (no future-date validation)', () => {
    const res = validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: '', now: NOW });
    assert.equal(res.errors.length, 0);
    assert.equal(res.mode, 'immediate');
  });

  it('future Schedule Publish → scheduled publish succeeds', () => {
    const res = validatePublishWindow({ publishMode: 'schedule', startAt: iso(24 * HOUR), endAt: '', now: NOW });
    assert.equal(res.errors.length, 0);
    assert.equal(res.mode, 'schedule');
  });

  it('past Schedule Publish → rejected with the exact product error', () => {
    const res = validatePublishWindow({ publishMode: 'schedule', startAt: iso(-2 * HOUR), endAt: '', now: NOW });
    assert.ok(hasError(res, 'startAt'));
    assert.equal(res.errors[0].message, MESSAGES.startInPast);
  });

  it('empty Expires At → succeeds', () => {
    const res = validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: '', now: NOW });
    assert.equal(res.errors.length, 0);
    assert.equal(res.end, null);
  });

  it('future Expires At → succeeds', () => {
    const res = validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: iso(6 * HOUR), now: NOW });
    assert.equal(res.errors.length, 0);
  });

  it('Expires At before the publish time → rejected', () => {
    const res = validatePublishWindow({ publishMode: 'schedule', startAt: iso(4 * HOUR), endAt: iso(2 * HOUR), now: NOW });
    assert.ok(hasError(res, 'endAt'));
    assert.equal(res.errors[0].message, MESSAGES.endNotAfterStart);
  });
});

describe('alertDateUtils — invalid input', () => {
  it('invalid startAt format → rejected', () => {
    const res = validatePublishWindow({
      publishMode: 'schedule',
      startAt: '08/06/2026 10:00 AM',
      endAt: iso(24 * HOUR),
      now: NOW,
    });
    assert.ok(hasError(res, 'startAt'));
    assert.equal(res.errors[0].message, MESSAGES.invalidStartAt);
  });

  it('invalid endAt format → rejected', () => {
    const res = validatePublishWindow({
      publishMode: 'immediate',
      startAt: '',
      endAt: 'tomorrow at noon',
      now: NOW,
    });
    assert.ok(hasError(res, 'endAt'));
  });

  it('unknown publishMode → rejected', () => {
    const res = validatePublishWindow({
      publishMode: 'asap',
      startAt: '',
      endAt: iso(HOUR),
      now: NOW,
    });
    assert.ok(hasError(res, 'publishMode'));
  });
});

describe('alertDateUtils — timezone handling', () => {
  it('compares absolute instants regardless of the client timezone', () => {
    // A browser in UTC+3 at 15:00 local sends the UTC instant 12:00Z.
    const futureUtc = '2026-08-07T14:00:00.000Z'; // 17:00 in UTC+3
    const pastUtc = '2026-08-07T10:00:00.000Z'; // 13:00 in UTC+3

    assert.equal(validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: futureUtc, now: NOW }).errors.length, 0);
    assert.ok(hasError(validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: pastUtc, now: NOW }), 'endAt'));

    // The same instant expressed with an explicit offset equals the Z version.
    assert.equal(parseDate('2026-08-07T17:00:00+03:00').getTime(), parseDate('2026-08-07T14:00:00.000Z').getTime());
    assert.ok(parseDate('2026-08-07T17:00:00+03:00') > NOW);
  });

  it('rejects a time in the past expressed in a different timezone', () => {
    // A UTC-5 browser at 07:00 local is actually 12:00Z (== NOW).
    const res = validatePublishWindow({
      publishMode: 'immediate',
      startAt: '',
      endAt: '2026-08-07T07:00:00-05:00',
      now: NOW,
    });
    assert.ok(hasError(res, 'endAt'));
  });
});

describe('alertDateUtils — legacy inference (no publishMode)', () => {
  it('no startAt → immediate (end optional, validated when provided)', () => {
    const res = validatePublishWindow({ startAt: '', endAt: iso(HOUR), now: NOW });
    assert.equal(res.mode, 'immediate');
    assert.equal(res.errors.length, 0);
  });

  it('future startAt → scheduled', () => {
    const res = validatePublishWindow({ startAt: iso(2 * HOUR), endAt: iso(4 * HOUR), now: NOW });
    assert.equal(res.mode, 'schedule');
    assert.equal(res.errors.length, 0);
  });

  it('legacy immediate without any expiry stays allowed', () => {
    const res = validatePublishWindow({ startAt: '', endAt: '', now: NOW, strict: false });
    assert.equal(res.mode, 'immediate');
    assert.equal(res.errors.length, 0);
  });
});
