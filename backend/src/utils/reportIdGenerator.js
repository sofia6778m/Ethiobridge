/**
 * reportIdGenerator.js
 * ────────────────────
 * Safe, atomic generation of infrastructure report IDs (`IR-YYYY-000001`).
 *
 * The old implementation counted documents (`countDocuments() + 1`) inside the
 * model's pre-save hook. That is racy — two concurrent submissions both read the
 * same count and then collide on `reportId`, producing MongoDB E11000 duplicate
 * key errors (e.g. two reports both trying to become `IR-2026-0002`). It also
 * repeats IDs after deletions, restores or deployments over existing data.
 *
 * This module replaces it with a MongoDB counters collection:
 *
 *   • `allocateReportNumber`   — atomic `findOneAndUpdate({ $inc: { seq: 1 } },
 *                                { upsert: true })`. MongoDB applies the $inc to
 *                                a single counter document atomically, so every
 *                                caller gets a distinct number even under
 *                                concurrency, across restarts and across
 *                                multiple server processes.
 *   • `generateReportId`       — formats a freshly allocated number.
 *   • `ensureReportCounters`   — startup validation: scans existing `IR-*`
 *                                reportIds and raises each year's counter so the
 *                                next allocation never re-issues an existing ID.
 *   • `createInfrastructureReport` — saves a report and retries on the (now
 *                                nearly impossible) duplicate-key case, pulling
 *                                the next number each attempt.
 *
 * A MongoDB transaction is deliberately NOT used for "claim number + insert
 * report". The claim step is a single atomic document update, which is all the
 * atomicity the counter needs. Wrapping both steps in a transaction would
 * serialize every submission, require a replica set (transactions fail on
 * standalone servers), and provide no extra safety because the unique
 * `reportId` index already guarantees a duplicate can never persist.
 */
const Counter = require('../models/Counter');

const REPORT_PREFIX = 'IR';
const COUNTER_NAMESPACE = 'infra_report';
const SEQUENCE_PAD = 6;
const DEFAULT_YEAR = () => new Date().getFullYear();

const counterKey = (year) => `${COUNTER_NAMESPACE}:${year}`;

/** Format a raw sequence number as a zero-padded reportId. */
const reportIdFor = (year, seq) =>
  `${REPORT_PREFIX}-${year}-${String(seq).padStart(SEQUENCE_PAD, '0')}`;

/** True for MongoDB duplicate-key errors (E11000 / E11001). */
const isDuplicateKeyError = (err) =>
  !!(err && (err.code === 11000 || err.code === 11001 || /duplicate key/i.test(String(err.message || ''))));

/** Parse an existing `IR-YYYY-NNNNNN` reportId → { year, seq }, or null. */
const parseReportId = (reportId) => {
  if (typeof reportId !== 'string') return null;
  const match = String(reportId).trim().match(/^IR-(\d{4})-(\d+)$/i);
  if (!match) return null;
  return { year: Number(match[1]), seq: Number(match[2]) };
};

const smallBackoff = (attempt) => new Promise((resolve) => setTimeout(resolve, 10 * attempt));

/**
 * Atomically allocate the next sequence number for a year.
 *
 * `findOneAndUpdate` with `$inc` + `upsert` is atomic per counter document, so
 * concurrent callers can never receive the same number. The retry loop only
 * covers the rare MongoDB upsert race where two processes try to insert the same
 * counter document at the same instant (E11000 on the counter's own `_id`).
 */
const allocateReportNumber = async ({ year = DEFAULT_YEAR(), retries = 3 } = {}) => {
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

/** Allocate and format the next reportId for a year. */
const generateReportId = async ({ year = DEFAULT_YEAR(), retries = 3 } = {}) => {
  const seq = await allocateReportNumber({ year, retries });
  return reportIdFor(year, seq);
};

/**
 * Startup validation for existing counters.
 *
 * Deploying over a database that already contains reports (e.g. `IR-2026-0002`)
 * must never cause the generator to start from 1 again. This scans existing
 * `IR-YYYY-NNNNNN` reportIds, computes the highest sequence already used per
 * year, and raises each year's counter to at least that number using `$max`
 * (idempotent — never lowers a counter). Call once after the DB connects.
 */
const ensureReportCounters = async () => {
  const InfrastructureReport = require('../models/InfrastructureReport');
  try {
    const docs = await InfrastructureReport.find({
      reportId: { $regex: '^IR-\\d{4}-\\d+' },
    }).select('reportId').lean();

    const maxSeqByYear = {};
    for (const doc of docs) {
      const parsed = parseReportId(doc.reportId);
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
      console.log(`[COUNTERS] ✅ Infrastructure report counters aligned: ${years.map((y) => `${y} up to ${maxSeqByYear[y]}`).join(', ')}. Next IDs will never repeat.`);
    } else {
      console.log('[COUNTERS] ℹ️  No existing IR reports — counters start fresh at 000001 per year.');
    }
  } catch (err) {
    console.warn('[COUNTERS] ⚠️  Could not validate report counters:', err.message);
  }
};

/**
 * Create an infrastructure report with the atomic ID generator.
 *
 * The pre-save hook assigns the reportId (from the counters collection) when the
 * document has none. If the insert nevertheless collides with an existing
 * reportId (manual inserts, stale counters, restored data), retry with a fresh
 * number — a new document is built each attempt so the hook allocates the next
 * sequential ID.
 */
const createInfrastructureReport = async (payload, { maxAttempts = 3 } = {}) => {
  const InfrastructureReport = require('../models/InfrastructureReport');
  let attempt = 0;
  for (;;) {
    attempt += 1;
    try {
      return await InfrastructureReport.create(payload);
    } catch (err) {
      if (attempt >= maxAttempts || !isDuplicateKeyError(err)) throw err;
      await smallBackoff(attempt);
    }
  }
};

module.exports = {
  REPORT_PREFIX,
  SEQUENCE_PAD,
  counterKey,
  reportIdFor,
  isDuplicateKeyError,
  parseReportId,
  allocateReportNumber,
  generateReportId,
  ensureReportCounters,
  createInfrastructureReport,
};
