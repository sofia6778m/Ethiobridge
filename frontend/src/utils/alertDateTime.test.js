import { describe, it, expect } from 'vitest';
import {
  parseDate,
  parseLocalAsAddis,
  toAddisInputValue,
  formatAddis,
  validatePublishWindow,
  MESSAGES,
} from './alertDateTime';

const NOW = new Date('2026-08-07T12:00:00.000Z');
const HOUR = 60 * 60 * 1000;

const iso = (offsetMs) => new Date(NOW.getTime() + offsetMs).toISOString();
const hasError = (result, field) => result.errors.some((e) => e.field === field);

describe('alertDateTime — parseDate', () => {
  it('parses ISO-8601 strings, Date objects and numeric timestamps', () => {
    expect(parseDate('2026-08-07T12:00:00.000Z')).toBeTruthy();
    expect(parseDate(new Date(NOW))).toBeTruthy();
    expect(parseDate(NOW.getTime())).toBeTruthy();
  });

  it('returns null for blank, null, undefined and ambiguous input', () => {
    expect(parseDate('')).toBeNull();
    expect(parseDate(null)).toBeNull();
    expect(parseDate(undefined)).toBeNull();
    expect(parseDate('not-a-date')).toBeNull();
    expect(parseDate('08/05/2026 04:36 PM')).toBeNull(); // US-style — never silently parsed
    expect(parseDate('2026-08-07T12:00')).toBeNull(); // missing timezone designator
    expect(parseDate(new Date('invalid'))).toBeNull();
  });

  it('accepts ISO-8601 with an explicit offset as the same instant as Z', () => {
    expect(parseDate('2026-08-07T17:00:00+03:00').getTime())
      .toBe(parseDate('2026-08-07T14:00:00.000Z').getTime());
  });
});

describe('alertDateTime — immediate publishing', () => {
  it('immediate publish with a future expiration → valid', () => {
    const res = validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: iso(24 * HOUR), now: NOW });
    expect(res.mode).toBe('immediate');
    expect(res.errors.length).toBe(0);
    expect(res.start).toBeNull();
  });

  it('immediate publish with a past expiration → invalid', () => {
    const res = validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: iso(-1 * HOUR), now: NOW });
    expect(hasError(res, 'endAt')).toBe(true);
    expect(res.errors[0].message).toBe(MESSAGES.endNotAfterNow);
  });

  it('immediate publish with an expiration equal to now → invalid', () => {
    const res = validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: iso(0), now: NOW });
    expect(hasError(res, 'endAt')).toBe(true);
  });

  it('immediate publish without a schedule start (empty schedule) → valid', () => {
    const res = validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: iso(2 * HOUR), now: NOW });
    expect(res.errors.length).toBe(0);
    expect(res.start).toBeNull();
  });

  it('immediate publish with an empty expiration → valid (expiry is optional)', () => {
    const res = validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: '', now: NOW });
    expect(res.errors.length).toBe(0);
    expect(res.end).toBeNull();
  });

  it('immediate publish REQUIRES an expiration only when strict is explicit', () => {
    const res = validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: '', now: NOW, strict: true });
    expect(hasError(res, 'endAt')).toBe(true);
    expect(res.errors[0].message).toBe(MESSAGES.endRequired);
  });

  it('immediate publish ignores a stale schedule start', () => {
    const res = validatePublishWindow({ publishMode: 'immediate', startAt: iso(-3 * 24 * HOUR), endAt: iso(24 * HOUR), now: NOW });
    expect(res.errors.length).toBe(0);
    expect(res.start).toBeNull();
  });
});

describe('alertDateTime — scheduled publishing', () => {
  it('scheduled publish in the future with a later expiration → valid', () => {
    const res = validatePublishWindow({ publishMode: 'schedule', startAt: iso(24 * HOUR), endAt: iso(32 * HOUR), now: NOW });
    expect(res.mode).toBe('schedule');
    expect(res.errors.length).toBe(0);
  });

  it('scheduled publish at exactly now is allowed', () => {
    const res = validatePublishWindow({ publishMode: 'schedule', startAt: iso(0), endAt: iso(HOUR), now: NOW });
    expect(res.errors.length).toBe(0);
  });

  it('scheduled publish in the past → invalid', () => {
    const res = validatePublishWindow({ publishMode: 'schedule', startAt: iso(-1 * HOUR), endAt: iso(24 * HOUR), now: NOW });
    expect(hasError(res, 'startAt')).toBe(true);
    expect(res.errors[0].message).toBe(MESSAGES.startInPast);
  });

  it('expiration before the scheduled publish → invalid', () => {
    const res = validatePublishWindow({ publishMode: 'schedule', startAt: iso(24 * HOUR), endAt: iso(22 * HOUR), now: NOW });
    expect(hasError(res, 'endAt')).toBe(true);
    expect(res.errors[0].message).toBe(MESSAGES.endNotAfterStart);
  });

  it('expiration equal to the scheduled publish → invalid', () => {
    const res = validatePublishWindow({ publishMode: 'schedule', startAt: iso(24 * HOUR), endAt: iso(24 * HOUR), now: NOW });
    expect(hasError(res, 'endAt')).toBe(true);
  });

  it('scheduled publish without a start time → invalid', () => {
    const res = validatePublishWindow({ publishMode: 'schedule', startAt: '', endAt: iso(24 * HOUR), now: NOW });
    expect(hasError(res, 'startAt')).toBe(true);
    expect(res.errors[0].message).toBe(MESSAGES.startRequired);
  });

  it('scheduled publish without an expiration → valid (expiry is optional)', () => {
    const res = validatePublishWindow({ publishMode: 'schedule', startAt: iso(24 * HOUR), endAt: '', now: NOW });
    expect(res.errors.length).toBe(0);
    expect(res.end).toBeNull();
  });
});

describe('alertDateTime — product scenarios (requirement 9)', () => {
  it('empty Schedule Publish → immediate publish succeeds (no future-date validation)', () => {
    const res = validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: '', now: NOW });
    expect(res.errors.length).toBe(0);
    expect(res.mode).toBe('immediate');
  });

  it('future Schedule Publish → scheduled publish succeeds', () => {
    const res = validatePublishWindow({ publishMode: 'schedule', startAt: iso(24 * HOUR), endAt: '', now: NOW });
    expect(res.errors.length).toBe(0);
    expect(res.mode).toBe('schedule');
  });

  it('past Schedule Publish → rejected with the exact product error', () => {
    const res = validatePublishWindow({ publishMode: 'schedule', startAt: iso(-2 * HOUR), endAt: '', now: NOW });
    expect(hasError(res, 'startAt')).toBe(true);
    expect(res.errors[0].message).toBe(MESSAGES.startInPast);
  });

  it('empty Expires At → succeeds', () => {
    const res = validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: '', now: NOW });
    expect(res.errors.length).toBe(0);
    expect(res.end).toBeNull();
  });

  it('future Expires At → succeeds', () => {
    const res = validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: iso(6 * HOUR), now: NOW });
    expect(res.errors.length).toBe(0);
  });

  it('Expires At before the publish time → rejected', () => {
    const res = validatePublishWindow({ publishMode: 'schedule', startAt: iso(4 * HOUR), endAt: iso(2 * HOUR), now: NOW });
    expect(hasError(res, 'endAt')).toBe(true);
    expect(res.errors[0].message).toBe(MESSAGES.endNotAfterStart);
  });
});

describe('alertDateTime — Africa/Addis_Ababa timezone helpers', () => {
  it('parseLocalAsAddis interprets wall time as EAT (UTC+3)', () => {
    const d = parseLocalAsAddis('2026-08-07T14:00');
    expect(d.toISOString()).toBe('2026-08-07T11:00:00.000Z');
  });

  it('parseLocalAsAddis returns null for blank or garbage input', () => {
    expect(parseLocalAsAddis('')).toBeNull();
    expect(parseLocalAsAddis('not-a-date')).toBeNull();
  });

  it('toAddisInputValue formats a Date as wall time in EAT', () => {
    const d = new Date('2026-08-07T11:00:00.000Z'); // 14:00 in Addis Ababa
    expect(toAddisInputValue(d)).toBe('2026-08-07T14:00');
  });

  it('formatAddis renders a human-readable EAT time', () => {
    const d = new Date('2026-08-07T11:00:00.000Z');
    expect(formatAddis(d)).toMatch(/07 Aug 2026.*14:00/);
  });
});

describe('alertDateTime — invalid input', () => {
  it('invalid startAt format → invalid', () => {
    const res = validatePublishWindow({ publishMode: 'schedule', startAt: '08/06/2026 10:00 AM', endAt: iso(24 * HOUR), now: NOW });
    expect(hasError(res, 'startAt')).toBe(true);
    expect(res.errors[0].message).toBe(MESSAGES.invalidStartAt);
  });

  it('invalid endAt format → invalid', () => {
    const res = validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: 'tomorrow at noon', now: NOW });
    expect(hasError(res, 'endAt')).toBe(true);
  });

  it('unknown publishMode → invalid', () => {
    const res = validatePublishWindow({ publishMode: 'asap', startAt: '', endAt: iso(HOUR), now: NOW });
    expect(hasError(res, 'publishMode')).toBe(true);
  });
});

describe('alertDateTime — timezone handling', () => {
  it('compares absolute instants regardless of the browser timezone', () => {
    const futureUtc = '2026-08-07T14:00:00.000Z'; // 17:00 in UTC+3
    const pastUtc = '2026-08-07T10:00:00.000Z'; // 13:00 in UTC+3

    expect(validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: futureUtc, now: NOW }).errors.length).toBe(0);
    expect(hasError(validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: pastUtc, now: NOW }), 'endAt')).toBe(true);
  });

  it('rejects a time in the past expressed in a different timezone', () => {
    const res = validatePublishWindow({ publishMode: 'immediate', startAt: '', endAt: '2026-08-07T07:00:00-05:00', now: NOW });
    expect(hasError(res, 'endAt')).toBe(true);
  });
});
