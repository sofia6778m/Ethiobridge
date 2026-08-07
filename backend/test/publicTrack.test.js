/**
 * Tests for POST /api/public-track — unauthenticated complaint tracking.
 *   • works for governance (GOV-), municipal (CMP-) and infrastructure (IR-) ids
 *   • validates the phone number against the record
 *   • returns a generic 404 for wrong phone OR unknown id (no enumeration)
 *   • never exposes reporter identity / phone in the response
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
const GovernanceComplaint = require('../src/models/GovernanceComplaint');
const MunicipalComplaint = require('../src/models/MunicipalComplaint');
const InfrastructureReport = require('../src/models/InfrastructureReport');
const { publicTrack, normalizePhone } = require('../src/controllers/publicTrackController');

let mongod;

const mockRes = () => {
  const res = { _status: 200, _json: null };
  res.status = function (s) { res._status = s; return res; };
  res.json = function (obj) { res._json = obj; return res; };
  return res;
};

const callTrack = async (body) => {
  const res = mockRes();
  await publicTrack({ body, ip: '127.0.0.1' }, res);
  return { status: res._status, json: res._json };
};

const mkGovernance = (over = {}) =>
  GovernanceComplaint.create({
    category: 'Unreasonable Delay',
    title: 'Licence renewal delayed over three weeks',
    description: 'I submitted my renewal application and never received a response.',
    subcity: 'Bole',
    woredaName: 'Woreda 01',
    office: 'Bole Trade Bureau',
    reporterName: 'Citizen Bole',
    reporterPhone: '0967786170',
    status: 'Under Review',
    timeline: [{
      action: 'Submitted',
      title: 'Complaint Submitted',
      message: 'Submitted to the office',
      performedByRole: 'Citizen',
      performedByName: 'Citizen',
      at: new Date(),
    }],
    officerResponses: [{
      message: 'We are reviewing your case.',
      userName: 'Officer Bole',
      at: new Date(),
    }],
    ...over,
  });

const mkMunicipal = (over = {}) =>
  MunicipalComplaint.create({
    category: 'Road',
    title: 'Street light out near roundabout',
    description: 'The street light has not worked for a week.',
    subcity: 'Bole',
    woredaName: 'Woreda 01',
    department: 'Road',
    reporterPhone: '0967786170',
    status: 'In Review',
    auditTrail: [{ action: 'Created', userName: 'System', details: 'Complaint created', at: new Date() }],
    responses: [{ message: 'A technician has been dispatched.', officerName: 'Dept Officer', at: new Date() }],
    ...over,
  });

const mkInfrastructure = (over = {}) =>
  InfrastructureReport.create({
    title: 'Broken water pipe',
    description: 'Water pipe burst on the main road.',
    region: 'Addis Ababa',
    subcity: 'Bole',
    woredaName: 'Woreda 01',
    department: 'Water',
    reporterName: 'Citizen Bole',
    reporterPhone: '0967786170',
    status: 'Assigned',
    timeline: [{
      action: 'created',
      description: 'Report submitted and routed to Water',
      performedByRole: 'citizen',
      performedByName: 'Citizen Bole',
      at: new Date(),
    }],
    ...over,
  });

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  for (const model of [GovernanceComplaint, MunicipalComplaint, InfrastructureReport]) {
    await model.init();
  }
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await GovernanceComplaint.deleteMany({});
  await MunicipalComplaint.deleteMany({});
  await InfrastructureReport.deleteMany({});
});

describe('normalizePhone', () => {
  it('collapses formatting differences', () => {
    assert.equal(normalizePhone('+251 967 786 170'), '967786170');
    assert.equal(normalizePhone('0967786170'), '967786170');
    assert.equal(normalizePhone('0 967-786-170'), '967786170');
    assert.equal(normalizePhone(''), '');
  });
});

describe('publicTrack', () => {
  it('requires a tracking ID and phone number', async () => {
    assert.equal((await callTrack({ trackingId: 'GOV-2026-000001' })).status, 400);
    assert.equal((await callTrack({ phone: '0967786170' })).status, 400);
    assert.equal((await callTrack({})).status, 400);
  });

  it('returns a redacted public complaint when tracking ID + phone match', async () => {
    const c = await mkGovernance();
    const { status, json } = await callTrack({ trackingId: c.trackingId, phone: '0967786170' });
    assert.equal(status, 200);
    assert.equal(json.data.trackingId, c.trackingId);
    assert.equal(json.data.type, 'Public Complaint');
    assert.equal(json.data.title, 'Licence renewal delayed over three weeks');
    assert.equal(json.data.status, 'Under Review');
    assert.equal(json.data.displayStatus, 'Received');
    assert.equal(json.data.subcity, 'Bole');
    assert.equal(json.data.woreda, 'Woreda 01');
    assert.equal(json.data.office, 'Bole Trade Bureau');
    assert.ok(json.data.submittedDate);
    assert.ok(json.data.lastUpdated);
    assert.equal(json.data.latestResponse.message, 'We are reviewing your case.');
    assert.ok(json.data.timeline.length >= 1);

    // Privacy — never leak reporter identity or phone.
    const raw = JSON.stringify(json);
    assert.equal(raw.includes('0967786170'), false);
    assert.equal(raw.includes('Citizen Bole'), false);
    assert.equal(raw.includes('reporter'), false);
  });

  it('maps an Under Review + assigned public complaint to displayStatus Assigned', async () => {
    const c = await mkGovernance({
      status: 'Under Review',
      assignedTo: new mongoose.Types.ObjectId(),
      assignedToOffice: 'Subcity Governance Office',
    });
    const { json } = await callTrack({ trackingId: c.trackingId, phone: '0967786170' });
    assert.equal(json.data.displayStatus, 'Assigned');
  });

  it('returns a generic 404 when the phone number does not match', async () => {
    const c = await mkGovernance();
    const { status, json } = await callTrack({ trackingId: c.trackingId, phone: '0911222333' });
    assert.equal(status, 404);
    assert.equal(json.success, false);
    assert.equal(json.data, undefined);
  });

  it('returns a generic 404 for an unknown tracking ID', async () => {
    const { status } = await callTrack({ trackingId: 'GOV-2099-999999', phone: '0967786170' });
    assert.equal(status, 404);
  });

  it('returns the same 404 message for a wrong phone and an unknown id', async () => {
    const c = await mkGovernance();
    const wrongPhone = await callTrack({ trackingId: c.trackingId, phone: '0911222333' });
    const unknownId = await callTrack({ trackingId: 'GOV-2099-999999', phone: '0967786170' });
    assert.equal(wrongPhone.json.message, unknownId.json.message);
  });

  it('tracks municipal complaints by CMP- id', async () => {
    const c = await mkMunicipal();
    const { status, json } = await callTrack({ trackingId: c.trackingId, phone: '0967786170' });
    assert.equal(status, 200);
    assert.equal(json.data.type, 'Municipal Complaint');
    assert.equal(json.data.department, 'Road');
    assert.equal(json.data.latestResponse.message, 'A technician has been dispatched.');
    assert.ok(json.data.timeline.length >= 1);
  });

  it('tracks infrastructure reports by IR- id', async () => {
    const r = await mkInfrastructure();
    const { status, json } = await callTrack({ trackingId: r.reportId, phone: '0967786170' });
    assert.equal(status, 200);
    assert.equal(json.data.type, 'Infrastructure Report');
    assert.equal(json.data.trackingId, r.reportId);
    assert.equal(json.data.department, 'Water');
    assert.equal(json.data.status, 'Assigned');
    assert.ok(json.data.timeline.length >= 1);
  });

  it('does not reveal infrastructure reports when the phone does not match', async () => {
    const r = await mkInfrastructure();
    const { status } = await callTrack({ trackingId: r.reportId, phone: '0911222333' });
    assert.equal(status, 404);
  });
});
