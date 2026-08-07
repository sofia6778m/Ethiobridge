/**
 * alertDateTime.js
 *
 * Frontend mirror of `backend/src/utils/alertDateUtils.js`. The two modules
 * must stay in sync — the form validates with these exact rules BEFORE the
 * payload is sent, and the backend re-validates the same rules on the server.
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
 * All comparisons happen on real `Date`s / UTC instants, so a browser in any
 * timezone produces the same result as the server. `datetime-local` input
 * values (wall time) are interpreted as Africa/Addis_Ababa (EAT, fixed UTC+3)
 * via `parseLocalAsAddis`, and displayed back via `toAddisInputValue` /
 * `formatAddis` — see below.
 */

export const PUBLISH_MODES = ['immediate', 'schedule'];

/** Operational timezone for display + interpretation of wall-clock times. */
export const DISPLAY_TIMEZONE = 'Africa/Addis_Ababa';

export const MESSAGES = {
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

// ISO-8601 with an explicit timezone designator (Z or ±HH:MM). Ambiguous or
// localized strings are never interpreted against the browser's local time.
const ISO_UTC_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:\d{2})$/;

/**
 * Current UTC offset of Africa/Addis_Ababa as "+HH:MM" (e.g. "+03:00").
 * EAT has no DST, but the offset is derived via Intl so it stays correct.
 */
export function addisAbabaOffset() {
  try {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: DISPLAY_TIMEZONE,
      timeZoneName: 'longOffset',
    }).formatToParts(new Date());
    const tzName = parts.find((p) => p.type === 'timeZoneName')?.value || 'GMT+03:00';
    const m = tzName.match(/GMT([+-]\d{2}:\d{2})/);
    return m ? m[1] : '+03:00';
  } catch {
    return '+03:00';
  }
}

/**
 * Parse a `datetime-local` value ("YYYY-MM-DDTHH:mm") as WALL TIME in
 * Africa/Addis_Ababa and return the equivalent UTC `Date`. Returns null when
 * the value is blank or unparseable.
 */
export function parseLocalAsAddis(value) {
  if (!value) return null;
  const d = new Date(`${value}${addisAbabaOffset()}`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Format a Date as a `datetime-local` input value ("YYYY-MM-DDTHH:mm") in
 * Africa/Addis_Ababa wall time — used for the `min` attribute so the picker
 * hints match the timezone used for validation.
 */
export function toAddisInputValue(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: DISPLAY_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  });
  const p = Object.fromEntries(fmt.formatToParts(date).map((x) => [x.type, x.value]));
  const hour = p.hour === '24' ? '00' : p.hour;
  return `${p.year}-${p.month}-${p.day}T${hour}:${p.minute}`;
}

/** Human-readable display of a Date in Africa/Addis_Ababa (e.g. "07 Aug 2026, 14:00"). */
export function formatAddis(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: DISPLAY_TIMEZONE,
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(date);
}

/**
 * Parse a raw value into a valid Date.
 * Accepts Date instances, numeric timestamps, and strict ISO-8601 strings that
 * carry an explicit UTC timezone designator. Returns null for missing/blank
 * values and for unparseable input.
 */
export function parseDate(value) {
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
export function isValidDate(value) {
  return value instanceof Date && !Number.isNaN(value.getTime());
}

/**
 * Determine the publishing mode from an explicit `publishMode` field, falling
 * back to legacy inference: a future `start` means schedule, otherwise the
 * alert is published immediately.
 */
export function resolvePublishMode(publishMode, start, now) {
  if (publishMode === 'immediate') return 'immediate';
  if (publishMode === 'schedule') return 'schedule';
  if (PUBLISH_MODES.includes(publishMode)) return publishMode;
  return start && start > now ? 'schedule' : 'immediate';
}

/**
 * Validate a publish/expiry window. See the backend module for full docs.
 *
 * @param {Object}   opts
 * @param {string}   [opts.publishMode] 'immediate' | 'schedule'
 * @param {*}        opts.startAt     schedule start (raw value)
 * @param {*}        opts.endAt       expiration (raw value)
 * @param {Date}     [opts.now]       "now" (defaults to new Date())
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
export function validatePublishWindow({
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
    // Publishing time is the clock — any stale schedule value is dropped (or
    // rejected when the caller opts in).
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

  return { mode: 'schedule', start, end, errors };
}

/** First error message for a given field, if any. */
export function firstErrorFor(errors, field) {
  const hit = errors.find((e) => e.field === field);
  return hit ? hit.message : null;
}
