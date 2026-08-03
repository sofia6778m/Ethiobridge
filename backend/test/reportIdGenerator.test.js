/**
 * Automated tests for the infrastructure report ID generator.
 *
 * Uses mongodb-memory-server with the system mongod binary when available
 * (set MONGOMS_SYSTEM_BINARY in CI for speed) so no network download is
 * required and tests never touch the real database.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const mongoose = require('mongoose');

// ── System binary detection ──────────────────────────────────────────────────
// Skip the download when a local mongod binary is already installed.
const CANDIDATE_PATHS = {
  win32: [
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\MongoDB\\Server\\8.3\\bin\\mongod.exe`,
    process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}\\MongoDB\\Server\\8.3\\bin\\mongod.exe`,
    process.env.ProgramFiles && `${process.env.ProgramFiles}\\MongoDB\\Server\\8.0\\bin\\mongod.exe`,
    process.env['ProgramFiles(x86)'] && `${process.env['ProgramFiles(x86)']}\\MongoDB\\Server\\8.0\\bin\\mongod.exe`,
  ],
  linux: ['/usr/bin/mongod', '/usr/local/bin/mongod'],
  darwin: ['/usr/local/bin/mongod', '/opt/homebrew/bin/mongod'],
};
if (!process.env.MONGOMS_SYSTEM_BINARY) {
  for (const candidate of (CANDIDATE_PATHS[process.platform] || [])) {
    if (candidate && fs.existsSync(candidate)) {
      process.env.MONGOMS_SYSTEM_BINARY = candidate;
      break;
    }
  }
}

const { MongoMemoryServer } = require('mongodb-memory-server');
const Counter = require('../src/models/Counter');
const { generateReportId } = require('../src/utils/reportIdGenerator');
const {
  reportIdFor,
  parseReportId,
  allocateReportNumber,
  ensureReportCounters,
  createInfrastructureReport,
  counterKey,
} = require('../src/utils/reportIdGenerator');

// Force-load the model so we can call save() and deleteMany() in tests.
// Require here (not at top) so the MONGOMS_SYSTEM_BINARY env is set before
// mongoose resolution.
let InfrastructureReport;

let mongod;

// ── Global setup / teardown ──────────────────────────────────────────────────
before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  // Re-require after connection so models bind to the live connection.
  InfrastructureReport = require('../src/models/InfrastructureReport');
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Counter.deleteMany({});
  await InfrastructureReport.deleteMany({});
});

// ── Helpers ──────────────────────────────────────────────────────────────────
const mkPayload = (overrides = {}) => ({
  title: 'Test report',
  description: 'Concurrency smoke test',
  region: 'Addis Ababa',
  submittedBy: new mongoose.Types.ObjectId(),
  ...overrides,
});

const mkReport = (reportId) => new InfrastructureReport({
  reportId,
  title: 'Legacy report',
  description: 'Pre-existing',
  region: 'Amhara',
  submittedBy: new mongoose.Types.ObjectId(),
}).save();

// ── Unit: formatting helpers ─────────────────────────────────────────────────
describe('reportIdFor', () => {
  it('formats as IR-YYYY-000001', () => {
    assert.equal(reportIdFor(2026, 1), 'IR-2026-000001');
    assert.equal(reportIdFor(2026, 42), 'IR-2026-000042');
    assert.equal(reportIdFor(2026, 100000), 'IR-2026-100000');
  });
});

describe('parseReportId', () => {
  it('parses 6-digit format', () => {
    const p = parseReportId('IR-2026-000007');
    assert.deepEqual(p, { year: 2026, seq: 7 });
  });
  it('parses 4-digit legacy format', () => {
    const p = parseReportId('IR-2026-0002');
    assert.deepEqual(p, { year: 2026, seq: 2 });
  });
  it('returns null for invalid input', () => {
    assert.equal(parseReportId(null), null);
    assert.equal(parseReportId('abc'), null);
    assert.equal(parseReportId('IR-2026-abc'), null);
  });
});

// ── Unit: atomic counter allocation ──────────────────────────────────────────
describe('allocateReportNumber', () => {
  it('starts at 1 for a fresh year', async () => {
    const seq = await allocateReportNumber({ year: 2026 });
    assert.equal(seq, 1);
  });

  it('is strictly monotonic', async () => {
    const seqs = [];
    for (let i = 0; i < 50; i++) seqs.push(await allocateReportNumber({ year: 2026 }));
    assert.equal(seqs.length, new Set(seqs).size);
    for (let i = 1; i < seqs.length; i++) assert.ok(seqs[i] > seqs[i - 1]);
  });

  it('uses separate counters per year', async () => {
    await allocateReportNumber({ year: 2026 });
    await allocateReportNumber({ year: 2026 });
    await allocateReportNumber({ year: 2027 });
    assert.equal(await allocateReportNumber({ year: 2026 }), 3);
    assert.equal(await allocateReportNumber({ year: 2027 }), 2);
  });
});

// ── Unit: generateReportId ───────────────────────────────────────────────────
describe('generateReportId', () => {
  it('formats as IR-YYYY-000001', async () => {
    const id = await generateReportId({ year: 2026 });
    assert.match(id, /^IR-2026-000001$/);
  });

  it('returns strictly increasing unique ids', async () => {
    const ids = [];
    for (let i = 0; i < 25; i++) ids.push(await generateReportId({ year: 2026 }));
    assert.equal(new Set(ids).size, ids.length);
    assert.equal(ids[0], 'IR-2026-000001');
    assert.equal(ids[24], 'IR-2026-000025');
  });

  it('restarts the sequence per year', async () => {
    await generateReportId({ year: 2026 });
    await generateReportId({ year: 2026 });
    const id27 = await generateReportId({ year: 2027 });
    assert.equal(id27, 'IR-2027-000001');
  });
});

// ── Concurrency: pure allocation ────────────────────────────────────────────
describe('concurrent allocation', () => {
  it('issues all-unique ids under concurrency', async () => {
    const count = 50;
    const results = await Promise.all(
      Array.from({ length: count }, () => generateReportId({ year: 2026 }))
    );
    assert.equal(new Set(results).size, count, 'all IDs must be unique');
    for (const id of results) assert.match(id, /^IR-2026-\d{6}$/);
  });
});

// ── Concurrency: full document saves (end-to-end) ───────────────────────────
describe('concurrent saves', () => {
  it('saves reports concurrently without E11000', async () => {
    const count = 30;
    const docs = Array.from({ length: count }, () => new InfrastructureReport(mkPayload()));
    const saved = await Promise.all(docs.map((d) => d.save()));
    const ids = saved.map((d) => d.reportId);
    assert.equal(new Set(ids).size, count, 'all generated reportIds must be unique');
    for (const id of ids) assert.match(id, /^IR-2026-\d{6}$/);
  });
});

// ── Persistence across reconnect ("restart") ─────────────────────────────────
describe('survives restart', () => {
  it('continues from the stored counter after a fresh connection', async () => {
    await generateReportId({ year: 2026 }); // 1
    await generateReportId({ year: 2026 }); // 2

    // Simulate a process restart: disconnect, then reconnect to the same DB.
    const uri = mongod.getUri();
    await mongoose.disconnect();
    await mongoose.connect(uri);

    const again = await generateReportId({ year: 2026 }); // must be 3
    assert.equal(again, 'IR-2026-000003');
  });
});

// ── Startup validation (ensureReportCounters) ───────────────────────────────
describe('ensureReportCounters', () => {
  it('raises counters to cover existing reportIds', async () => {
    await mkReport('IR-2026-000002');
    await mkReport('IR-2026-000007');
    await mkReport('IR-2025-000013');
    await mkReport('IR-2026-abc'); // malformed, ignored

    await ensureReportCounters();

    assert.equal(await generateReportId({ year: 2026 }), 'IR-2026-000008');
    assert.equal(await generateReportId({ year: 2025 }), 'IR-2025-000014');
  });

  it('does not lower an existing counter', async () => {
    await Counter.updateOne({ _id: counterKey(2026) }, { $set: { seq: 100 } }, { upsert: true });
    await ensureReportCounters();
    assert.equal(await generateReportId({ year: 2026 }), 'IR-2026-000101');
  });

  it('idempotent — running twice does not change the result', async () => {
    await mkReport('IR-2026-000005');
    await ensureReportCounters();
    await ensureReportCounters();
    assert.equal(await generateReportId({ year: 2026 }), 'IR-2026-000006');
  });
});

// ── Duplicate-key retry (defense in depth) ───────────────────────────────────
describe('createInfrastructureReport retry', () => {
  it('retries on duplicate reportId and returns the next id', async () => {
    // Reserve seq 1 by manually inserting a report with the exact ID the
    // counter would produce first.
    await new InfrastructureReport({
      reportId: 'IR-2026-000001',
      title: 'Pre-existing',
      description: 'Manually inserted',
      region: 'Tigray',
      submittedBy: new mongoose.Types.ObjectId(),
    }).save();

    const report = await createInfrastructureReport(mkPayload());
    assert.equal(report.reportId, 'IR-2026-000002');
  });

  it('retries for several consecutive duplicates', async () => {
    for (let i = 1; i <= 3; i++) {
      await mkReport(reportIdFor(2026, i));
    }
    // Counter is at 0; attempts 1-3 each collide with IR-2026-000001/2/3;
    // attempt 4 gets IR-2026-000004 which is free. Needs maxAttempts >= 4.
    const report = await createInfrastructureReport(mkPayload(), { maxAttempts: 5 });
    assert.equal(report.reportId, 'IR-2026-000004');
  });

  it('throws after maxAttempts exhausted', async () => {
    for (let i = 1; i <= 5; i++) {
      await mkReport(reportIdFor(2026, i));
    }
    await assert.rejects(
      () => createInfrastructureReport(mkPayload(), { maxAttempts: 5 }),
      { code: 11000 }
    );
  });
});
