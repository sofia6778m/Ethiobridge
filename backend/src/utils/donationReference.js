/**
 * donationReference.js
 * ─────────────────────
 * Atomic, safe generation of donation tracking references (`DON-YYYY-000001`).
 *
 * Mirrors `reportIdGenerator.js`: a MongoDB counters collection is advanced
 * with `findOneAndUpdate({ $inc: { seq: 1 } }, { upsert: true })`, which is
 * atomic per counter document — concurrent callers can never receive the same
 * number, and the unique `donationRef` index guarantees a duplicate can never
 * persist.
 */
const Counter = require('../models/Counter');

const DONATION_PREFIX = 'DON';
const COUNTER_NAMESPACE = 'donation';
const SEQUENCE_PAD = 6;

const counterKey = (year) => `${COUNTER_NAMESPACE}:${year}`;

const isDuplicateKeyError = (err) =>
  !!(err && (err.code === 11000 || err.code === 11001 || /duplicate key/i.test(String(err.message || ''))));

/** Parse an existing `DON-YYYY-NNNNNN` reference → { year, seq }, or null. */
const parseDonationRef = (donationRef) => {
  if (typeof donationRef !== 'string') return null;
  const match = String(donationRef).trim().match(/^DON-(\d{4})-(\d+)$/i);
  if (!match) return null;
  return { year: Number(match[1]), seq: Number(match[2]) };
};

/** Atomically allocate the next sequence number for a year. */
const allocateDonationNumber = async ({ year = new Date().getFullYear(), retries = 3 } = {}) => {
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
      await new Promise((resolve) => setTimeout(resolve, 10 * attempt));
    }
  }
};

/** Allocate and format the next donation reference for a year. */
const generateDonationRef = async ({ year = new Date().getFullYear(), retries = 3 } = {}) => {
  const seq = await allocateDonationNumber({ year, retries });
  return `${DONATION_PREFIX}-${year}-${String(seq).padStart(SEQUENCE_PAD, '0')}`;
};

/**
 * Startup validation: scan existing DON-* references, raise each year's counter
 * to the highest sequence already used so the next allocation never re-issues
 * an existing reference. Idempotent — never lowers a counter.
 */
const ensureDonationCounters = async () => {
  const Donation = require('../models/Donation');
  try {
    const docs = await Donation.find({ donationRef: { $regex: '^DON-\\d{4}-\\d+' } })
      .select('donationRef')
      .lean();

    const maxSeqByYear = {};
    for (const doc of docs) {
      const parsed = parseDonationRef(doc.donationRef);
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
      console.log(`[COUNTERS] Donation references aligned: ${years.map((y) => `${y} up to ${maxSeqByYear[y]}`).join(', ')}. Next refs will never repeat.`);
    } else {
      console.log('[COUNTERS] No existing DON references — donation refs start fresh at 000001 per year.');
    }
  } catch (err) {
    console.warn('[COUNTERS] Could not validate donation counters:', err.message);
  }
};

module.exports = {
  DONATION_PREFIX,
  SEQUENCE_PAD,
  counterKey,
  parseDonationRef,
  allocateDonationNumber,
  generateDonationRef,
  ensureDonationCounters,
  isDuplicateKeyError,
};
