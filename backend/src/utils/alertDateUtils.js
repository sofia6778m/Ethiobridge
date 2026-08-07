/**
 * alertDateUtils.js
 *
 * Single source of truth for alert publish/expiry window validation.
 * Used by the alert controller (create + update) so the backend never
 * trusts client-supplied dates and always compares against the SERVER
 * clock (stored as UTC `Date`s in MongoDB).
 *
 * The frontend mirrors these exact rules in
 * `frontend/src/utils/alertDateTime.js`.
 *
 * Behaviour (matches the product spec):
 *   - An EMPTY schedule start means "publish immediately" — the publishing
 *     time is the server clock and NO future-date validation runs.
 *   - A supplied schedule start means a scheduled broadcast — it must be in
 *     the future.
 *   - The expiration is ALWAYS optional. When supplied it must be later than
 *     the actual publishing time (server now for immediate, the schedule start
 *     for scheduled).
 *
 * All comparisons use UTC `Date` instants so results are identical regardless
 * of the client or server timezone. Times are treated as wall time in the
 * operational timezone `Africa/Addis_Ababa` (EAT, fixed UTC+03:00).
 */

const PUBLISH_MODES = ['immediate', 'schedule'];

const TIMEZONE = 'Africa/Addis_Ababa';

const MESSAGES = {
  invalidStartAt: 'Invalid schedule publish time.',
  invalidEndAt: 'Invalid expiration time.',
  startRequired: 'Schedule publish time is required.',
  endRequired: 'Expiration time is required.',
  startInPast: 'Schedule publish time must be in the future.',
  endNotAfterNow: 'Expiration time must be later than the current time.',
  endNotAfterStart: 'Expiration time must be later than the scheduled publish time.',
  startNotAllowedImmediate: 'Schedule publish time must be empty when publishing immediately.',
  invalidMode: 'Publishing mode must be "immediate" or "schedule".',
};

// ISO-8601 with an explicit timezone designator (Z or ±HH:MM). Seconds and
// fractional seconds are optional so a broad set of well-formed UTC timestamps
// are accepted, while ambiguous/localized strings (e.g. "08/05/2026 04:36 PM"
// or "2026-08-07T12:00" without a timezone) are rejected outright.
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Parse a raw value into a valid Date.
 * Accepts Date instances, numeric timestamps, and STRICT ISO-8601 strings
 * that carry an explicit UTC timezone designator. Ambiguous/localized strings
 * are never interpreted against the server's local time.
 * Returns null for missing/blank values and for unparseable input.
 */
function parseDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  if (typeof value === 'number') {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  if (typeof value === 'string') {
    if (!ISO_UTC_RE.test(value.trim())) return null;
    const d = new Date(value.trim());
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

/** True when the value is a real, parseable Date. */
function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Determine the publishing mode from an explicit `publishMode` field, falling
 * back to legacy inference: a future `start` means schedule, otherwise the
 * alert is published immediately.
 */
function resolvePublishMode(publishMode, start, now) {
  if (publishMode === 'immediate') return 'immediate';
  if (publishMode === 'schedule') return 'schedule';
  if (PUBLISH_MODES.includes(publishMode)) return publishMode;
  return start && start > now ? 'schedule' : 'immediate';
}

/**
 * Validate a publish/expiry window.
 *
 * @param {Object}   opts
 * @param {string}   [opts.publishMode] 'immediate' | 'schedule' (optional —
 *                   inferred when absent for legacy clients)
 * @param {*}        opts.startAt     schedule start (raw value)
 * @param {*}        opts.endAt       expiration (raw value)
 * @param {Date}     [opts.now]       server "now" (defaults to new Date())
 * @param {boolean}  [opts.strict]    when true, an EXPIRATION is mandatory in
 *                                    both modes (default false — expiry is
 *                                    optional, but any expiry supplied is
 *                                    still fully validated)
 * @param {boolean}  [opts.rejectStartInImmediate] when true, a schedule start
 *                   supplied in immediate mode is an error instead of being
 *                   silently dropped (default false)
 *
 * @returns {{ mode: 'immediate'|'schedule', start: Date|null, end: Date|null,
 *             errors: Array<{field: 'startAt'|'endAt'|'publishMode', message: string}> }}
 */
function validatePublishWindow({
  publishMode,
  startAt,
  endAt,
  now = new Date(),
  strict = false,
  rejectStartInImmediate = false,
}) {
  const errors = [];

  const startRaw = startAt === undefined || startAt === null || startAt === '' ? null : startAt;
  const endRaw = endAt === undefined || endAt === null || endAt === '' ? null : endAt;

  const start = parseDate(startRaw);
  const end = parseDate(endRaw);

  if (startRaw !== null && start === null) {
    errors.push({ field: 'startAt', message: MESSAGES.invalidStartAt });
  }
  if (endRaw !== null && end === null) {
    errors.push({ field: 'endAt', message: MESSAGES.invalidEndAt });
  }

  const explicitMode = publishMode !== undefined && publishMode !== null && publishMode !== '';
  const mode = resolvePublishMode(publishMode, start, now);

  // An explicit but unknown publishing mode is a client bug — never silently
  // reinterpret it as a legacy (immediate) request.
  if (explicitMode && !PUBLISH_MODES.includes(publishMode)) {
    errors.push({ field: 'publishMode', message: MESSAGES.invalidMode });
    return { mode, start, end, errors };
  }

  if (mode === 'immediate') {
    // Publishing time is the server clock — any stale schedule value is
    // dropped (or rejected when the caller opts in).
    if (startRaw !== null && start !== null && rejectStartInImmediate) {
      errors.push({ field: 'startAt', message: MESSAGES.startNotAllowedImmediate });
    }
    if (strict && endRaw === null) {
      errors.push({ field: 'endAt', message: MESSAGES.endRequired });
    } else if (endRaw !== null && end !== null && end <= now) {
      errors.push({ field: 'endAt', message: MESSAGES.endNotAfterNow });
    } else if (endRaw !== null && end === null && errors.length === 0) {
      errors.push({ field: 'endAt', message: MESSAGES.invalidEndAt });
    }
    return { mode: 'immediate', start: null, end, errors };
  }

  if (mode === 'schedule') {
    if (startRaw === null) {
      errors.push({ field: 'startAt', message: MESSAGES.startRequired });
    } else if (start !== null && start < now) {
      errors.push({ field: 'startAt', message: MESSAGES.startInPast });
    }
    // Expiry is optional; when supplied it must be later than the schedule
    // start (an invalid-format endAt was already reported above).
    if (endRaw !== null && end !== null && start !== null && end <= start) {
      errors.push({ field: 'endAt', message: MESSAGES.endNotAfterStart });
    }
    if (endRaw === null && strict) {
      errors.push({ field: 'endAt', message: MESSAGES.endRequired });
    }
    return { mode: 'schedule', start, end, errors };
  }
}

/** First error message for a given field, if any. */
function firstErrorFor(errors, field) {
  const hit = errors.find((e) => e.field === field);
  return hit ? hit.message : null;
}

module.exports = {
  PUBLISH_MODES,
  TIMEZONE,
  MESSAGES,
  parseDate,
  isValidDate,
  resolvePublishMode,
  validatePublishWindow,
  firstErrorFor,
};
