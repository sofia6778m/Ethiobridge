/**
 * donationReference.js
 * ────────────────────
 * Safe, atomic generation of donation reference numbers (`DON-YYYY-000001`).
 *
 * Mirrors src/utils/reportIdGenerator.js — allocation is an atomic
 * `findOneAndUpdate({ $inc: { seq: 1 } }, { upsert: true })` on the shared
 * Counter collection, so concurrent submissions (and concurrent server
 * processes) can never observe the same sequence number.
 *
 * `ensureDonationCounters` is the startup hook: it back-fills reference
 * numbers for donations created before this system existed and raises each
 * year's counter so a restart / restore never re-issues an existing reference.
 */
const Counter = require('../models/Counter');

const DONATION_PREFIX = 'DON';
const COUNTER_NAMESPACE = 'donation_ref';
const SEQUENCE_PAD = 6;
const DEFAULT_YEAR = () => new Date().getFullYear();

const counterKey = (year) => `${COUNTER_NAMESPACE}:${year}`;

/** Format a raw sequence number as a zero-padded donation reference. */
const donationRefFor = (year, seq) =>
  `${DONATION_PREFIX}-${year}-${String(seq).padStart(SEQUENCE_PAD, '0')}`;

/** True for MongoDB duplicate-key errors (E11000 / E11001). */
const isDuplicateKeyError = (err) =>
  !!(err && (err.code === 11000 || err.code === 11001 || /duplicate key/i.test(String(err.message || ''))));

/** Parse an existing `DON-YYYY-NNNNNN` reference → { year, seq }, or null. */
const parseDonationReference = (referenceNumber) => {
  if (typeof referenceNumber !== 'string') return null;
  const match = String(referenceNumber).trim().match(/^DON-(\d{4})-(\d+)$/i);
  if (!match) return null;
  return { year: Number(match[1]), seq: Number(match[2]) };
};

const smallBackoff = (attempt) => new Promise((resolve) => setTimeout(resolve, 10 * attempt));

/**
 * Atomically allocate the next sequence number for a year. Returns a number,
 * NOT a reference string — callers should use generateDonationReference().
 */
const allocateDonationNumber = async ({ year = DEFAULT_YEAR(), retries = 3 } = {}) => {
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

/** Allocate and format the next donation reference for a year. */
const generateDonationReference = async ({ year = DEFAULT_YEAR(), retries = 3 } = {}) => {
  const seq = await allocateDonationNumber({ year, retries });
  return donationRefFor(year, seq);
};

/**
 * Startup validation:
 *   1. Back-fills reference numbers for donations that predate this system
 *      (oldest first, so numbering is chronological).
 *   2. Raises each year's counter so the next allocation never re-issues an
 *      existing reference.
 * Idempotent — safe to call on every boot.
 */
const ensureDonationCounters = async () => {
  const Donation = require('../models/Donation');
  try {
    // 1. Back-fill legacy donations that have no DON reference yet.
    const legacy = await Donation.find({
      $or: [{ referenceNumber: null }, { referenceNumber: '' }],
    }).sort({ createdAt: 1 }).select('_id').lean();

    for (const doc of legacy) {
      const referenceNumber = await generateDonationReference();
      await Donation.updateOne({ _id: doc._id }, { $set: { referenceNumber } });
    }

    // 2. Raise counters above any existing references.
    const docs = await Donation.find({
      referenceNumber: { $regex: '^DON-\\d{4}-\\d+' },
    }).select('referenceNumber').lean();

    const maxSeqByYear = {};
    for (const doc of docs) {
      const parsed = parseDonationReference(doc.referenceNumber);
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
    if (legacy.length) {
      console.log(`[DONATIONS] ✅ Back-filled ${legacy.length} legacy donation(s) with DON references.`);
    }
    if (years.length) {
      console.log(`[DONATIONS] ✅ Donation reference counters aligned: ${years.map((y) => `${y} up to ${maxSeqByYear[y]}`).join(', ')}.`);
    }
  } catch (err) {
    console.warn('[DONATIONS] ⚠️  Could not align donation reference counters:', err.message);
  }
};

module.exports = {
  DONATION_PREFIX,
  SEQUENCE_PAD,
  counterKey,
  donationRefFor,
  isDuplicateKeyError,
  parseDonationReference,
  allocateDonationNumber,
  generateDonationReference,
  ensureDonationCounters,
};
