/**
 * governanceIdGenerator.js
 * ────────────────────────
 * Atomic generation of governance complaint tracking IDs (`GOV-YYYY-000001`).
 *
 * Uses the same Mongo counters-collection technique as reportIdGenerator.js so
 * concurrent submissions can never collide on the same tracking ID:
 *   • `allocateGovernanceNumber` — atomic `findOneAndUpdate({ $inc: { seq: 1 } },
 *     { upsert: true })`. Every caller gets a distinct number.
 *   • `generateGovernanceId`     — formats a freshly allocated number.
 *   • `ensureGovernanceCounters` — startup validation so existing GOV-* IDs are
 *     never re-issued after deploys/restores.
 */
const Counter = require('../models/Counter');

const GOVERNANCE_PREFIX = 'GOV';
const COUNTER_NAMESPACE = 'governance_complaint';
const SEQUENCE_PAD = 6;
const DEFAULT_YEAR = () => new Date().getFullYear();

const counterKey = (year) => `${COUNTER_NAMESPACE}:${year}`;

/** Format a raw sequence number as a zero-padded trackingId. */
const governanceIdFor = (year, seq) =>
  `${GOVERNANCE_PREFIX}-${year}-${String(seq).padStart(SEQUENCE_PAD, '0')}`;

/** True for MongoDB duplicate-key errors (E11000 / E11001). */
const isDuplicateKeyError = (err) =>
  !!(err && (err.code === 11000 || err.code === 11001 || /duplicate key/i.test(String(err.message || ''))));

/** Parse an existing `GOV-YYYY-NNNNNN` id → { year, seq }, or null. */
const parseGovernanceId = (trackingId) => {
  if (typeof trackingId !== 'string') return null;
  const match = String(trackingId).trim().match(/^GOV-(\d{4})-(\d+)$/i);
  if (!match) return null;
  return { year: Number(match[1]), seq: Number(match[2]) };
};

const smallBackoff = (attempt) => new Promise((resolve) => setTimeout(resolve, 10 * attempt));

/** Atomically allocate the next sequence number for a year. */
const allocateGovernanceNumber = async ({ year = DEFAULT_YEAR(), retries = 3 } = {}) => {
  const key = counterKey(year);
  let attempt = 0;
  for (;;) {
    try {
      const counter = await Counter.findOneAndUpdate(
        { _id: key },
        { $inc: { seq: 1 } },
        { new: true, upsert: true, setDefaultsOnInsert: true }
      );
      return counter.seq;
    } catch (err) {
      if (attempt >= retries || !isDuplicateKeyError(err)) throw err;
      attempt += 1;
      await smallBackoff(attempt);
    }
  }
};

/** Allocate and format the next trackingId for a year. */
const generateGovernanceId = async ({ year = DEFAULT_YEAR(), retries = 3 } = {}) => {
  const seq = await allocateGovernanceNumber({ year, retries });
  return governanceIdFor(year, seq);
};

/** Startup validation: raise each year's counter past any existing GOV-* ID. */
const ensureGovernanceCounters = async () => {
  const GovernanceComplaint = require('../models/GovernanceComplaint');
  try {
    const docs = await GovernanceComplaint.find({
      trackingId: { $regex: '^GOV-\\d{4}-\\d+' },
    }).select('trackingId').lean();

    const maxSeqByYear = {};
    for (const doc of docs) {
      const parsed = parseGovernanceId(doc.trackingId);
      if (!parsed) continue;
      maxSeqByYear[parsed.year] = Math.max(maxSeqByYear[parsed.year] || 0, parsed.seq);
    }

    for (const [year, maxSeq] of Object.entries(maxSeqByYear)) {
      await Counter.findOneAndUpdate(
        { _id: counterKey(year) },
        { $max: { seq: maxSeq } },
        { upsert: true, new: true, setDefaultsOnInsert: true }
      );
    }

    const years = Object.keys(maxSeqByYear);
    if (years.length) {
      console.log(`[COUNTERS] ✅ Governance complaint counters aligned: ${years.map((y) => `${y} up to ${maxSeqByYear[y]}`).join(', ')}.`);
    } else {
      console.log('[COUNTERS] ℹ️  No existing GOV complaints — counters start fresh at 000001 per year.');
    }
  } catch (err) {
    console.warn('[COUNTERS] ⚠️  Could not validate governance complaint counters:', err.message);
  }
};

module.exports = {
  GOVERNANCE_PREFIX,
  SEQUENCE_PAD,
  counterKey,
  governanceIdFor,
  isDuplicateKeyError,
  parseGovernanceId,
  allocateGovernanceNumber,
  generateGovernanceId,
  ensureGovernanceCounters,
};
