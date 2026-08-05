/**
 * Tests for the donation reference number generator (DON-YYYY-000001).
 *
 * Uses mongodb-memory-server with the system mongod binary when available.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const mongoose = require('mongoose');

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
const Donation = require('../src/models/Donation');
const {
  donationRefFor,
  parseDonationReference,
  generateDonationReference,
  ensureDonationCounters,
  counterKey,
} = require('../src/utils/donationReference');
const { buildQrPayload } = require('../src/controllers/donationController')._internal;

let mongod;

const mkLegacyDonation = (overrides = {}) =>
  Donation.create({
    campaign: new mongoose.Types.ObjectId(),
    fullName: 'Test Donor',
    phone: '0911000001',
    amount: 250,
    paymentMethod: 'telebirr',
    paymentStatus: 'pending',
    ...overrides,
  });

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Counter.deleteMany({});
  await Donation.deleteMany({});
});

describe('donationRefFor', () => {
  it('formats as DON-YYYY-000001', () => {
    assert.equal(donationRefFor(2026, 1), 'DON-2026-000001');
    assert.equal(donationRefFor(2026, 42), 'DON-2026-000042');
    assert.equal(donationRefFor(2026, 100000), 'DON-2026-100000');
  });
});

describe('parseDonationReference', () => {
  it('parses valid references', () => {
    assert.deepEqual(parseDonationReference('DON-2026-000007'), { year: 2026, seq: 7 });
  });
  it('returns null for invalid input', () => {
    assert.equal(parseDonationReference(null), null);
    assert.equal(parseDonationReference('abc'), null);
    assert.equal(parseDonationReference('RCP-2026-0001'), null);
  });
});

describe('generateDonationReference', () => {
  it('starts at DON-YYYY-000001', async () => {
    const ref = await generateDonationReference();
    assert.match(ref, /^DON-\d{4}-000001$/);
  });

  it('is strictly monotonic under concurrency', async () => {
    const count = 50;
    const refs = await Promise.all(Array.from({ length: count }, () => generateDonationReference()));
    assert.equal(new Set(refs).size, count, 'all references must be unique');
    const seqs = refs.map((r) => parseDonationReference(r).seq).sort((a, b) => a - b);
    for (let i = 1; i < seqs.length; i++) {
      assert.ok(seqs[i] > seqs[i - 1], 'references must never repeat');
    }
    assert.equal(seqs[0], 1);
    assert.equal(seqs[seqs.length - 1], count);
  });

  it('restarts per year', async () => {
    await generateDonationReference();
    await generateDonationReference();
    const next = await generateDonationReference({ year: new Date().getFullYear() + 1 });
    assert.equal(parseDonationReference(next).seq, 1);
  });
});

describe('ensureDonationCounters', () => {
  it('back-fills references for legacy donations and never repeats them', async () => {
    await mkLegacyDonation();
    await mkLegacyDonation();

    await ensureDonationCounters();

    const donations = await Donation.find({}).sort({ createdAt: 1 }).lean();
    assert.equal(donations.length, 2);
    assert.ok(donations[0].referenceNumber);
    assert.ok(donations[1].referenceNumber);
    assert.notEqual(donations[0].referenceNumber, donations[1].referenceNumber);

    const next = await generateDonationReference();
    assert.notEqual(next, donations[0].referenceNumber);
    assert.notEqual(next, donations[1].referenceNumber);
  });

  it('raises counters above existing references (idempotent)', async () => {
    await mkLegacyDonation({ referenceNumber: 'DON-2026-000005' });
    await ensureDonationCounters();
    assert.equal(await generateDonationReference(), 'DON-2026-000006');
    await ensureDonationCounters();
    assert.equal(await generateDonationReference(), 'DON-2026-000007');
  });

  it('does not lower an existing counter', async () => {
    await Counter.updateOne({ _id: counterKey(2026) }, { $set: { seq: 100 } }, { upsert: true });
    await ensureDonationCounters();
    assert.equal(await generateDonationReference(), 'DON-2026-000101');
  });
});

describe('buildQrPayload', () => {
  it('produces a unique, scannable payload per payment method', () => {
    const donation = {
      _id: new mongoose.Types.ObjectId(),
      referenceNumber: 'DON-2026-000001',
      amount: 500,
      currency: 'ETB',
      paymentMethod: 'telebirr',
      campaign: new mongoose.Types.ObjectId(),
    };
    const method = { code: 'telebirr', name: 'Telebirr', accountNumber: '0900000000', accountHolder: 'EthioBridge Fund' };
    const campaign = { _id: donation.campaign, title: 'Water project' };

    const payload = buildQrPayload(donation, method, campaign);
    assert.equal(payload.platform, 'EthioBridge');
    assert.equal(payload.reference, 'DON-2026-000001');
    assert.equal(payload.account, '0900000000');
    assert.equal(payload.campaignTitle, 'Water project');

    const other = buildQrPayload({ ...donation, paymentMethod: 'awash_bank' }, { ...method, code: 'awash_bank', accountNumber: '01300000' }, campaign);
    assert.notEqual(JSON.stringify(payload), JSON.stringify(other));
  });
});
