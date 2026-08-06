/**
 * Tests for the service governance complaint management workflow:
 *   • citizen/guest submission with DB-driven subcity → woreda → office →
 *     category routing, required-field validation and GOV-YYYY-000001 IDs
 *   • public tracking by tracking ID + phone verification
 *   • role-scoped lists/details (officer → own office, subcity admin → own
 *     subcity, citizen → own complaints only) with 403 on out-of-scope access
 *   • officer assignment, citizen responses, more-info requests
 *   • resolve / reject / reopen lifecycle
 *   • displayStatus alias layer (New / Received / Assigned / Under Investigation)
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
const Subcity = require('../src/models/Subcity');
const Woreda = require('../src/models/Woreda');
const GovernmentOffice = require('../src/models/GovernmentOffice');
const ComplaintCategory = require('../src/models/ComplaintCategory');
const User = require('../src/models/User');
const AuditLog = require('../src/models/AuditLog');
const Notification = require('../src/models/Notification');
const GovernanceComplaint = require('../src/models/GovernanceComplaint');
const {
  createComplaint,
  getComplaints,
  getComplaintById,
  trackComplaint,
  reopenByTracking,
  assignOfficer,
  respondToCitizen,
  requestMoreInfo,
  resolveComplaint,
  rejectComplaint,
  STATUS_ALIASES,
  displayStatusFor,
} = require('../src/controllers/governanceComplaintController');

let mongod;

const mockRes = () => {
  const res = { _status: 200, _json: null };
  res.status = function (s) { res._status = s; return res; };
  res.json = function (obj) { res._json = obj; return res; };
  return res;
};

const call = (fn) => async (id, body = {}, extra = {}) => {
  const res = mockRes();
  const user = extra.user || { _id: new mongoose.Types.ObjectId(), role: 'admin', fullName: 'Admin' };
  await fn({
    params: { id },
    body,
    user,
    query: extra.query || {},
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    get: () => 'node-test',
    app: { get: () => null },
  }, res);
  return { status: res._status, json: res._json };
};

const callTrack = (fn) => async (trackingId, query = {}) => {
  const res = mockRes();
  await fn({
    params: { trackingId },
    body: {},
    query,
    user: null,
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    get: () => 'node-test',
    app: { get: () => null },
  }, res);
  return { status: res._status, json: res._json };
};

// ── Master data (Bole subcity + woreda + office + category, and a second
//    Bole office used to prove officer-level isolation) ────────────────────────
let subcity;
let woreda;
let office;
let category;
let otherOffice;
let otherCategory;
let citizen;
let otherCitizen;
let officer;
let otherOfficer;
let subcityAdmin;

const mkUser = (over = {}) =>
  User.create({
    fullName: 'Dagi Test',
    email: `user_${Math.random().toString(36).slice(2, 10)}@ethiobridge.et`,
    password: 'password123',
    phone: '0967786170',
    subcity: 'Bole',
    isActive: true,
    ...over,
  });

const mkComplaint = (over = {}) =>
  GovernanceComplaint.create({
    category: category.name,
    categoryId: category._id,
    title: 'Licence renewal delayed over three weeks',
    description: 'I submitted my renewal application and never received a response.',
    incidentDate: new Date('2026-07-01T09:00:00Z'),
    incidentLocation: 'Bole, near the roundabout',
    serviceReceived: 'Business licence renewal',
    subcity: 'Bole',
    subcityId: subcity._id,
    woredaId: woreda._id,
    woredaName: woreda.name,
    office: office.name,
    officeId: office._id,
    reporter: citizen._id,
    reporterName: citizen.fullName,
    reporterPhone: citizen.phone,
    status: 'Submitted',
    timeline: [{
      action: 'Submitted',
      title: 'Complaint Submitted',
      message: 'Submitted to the office',
      performedByRole: 'Citizen',
      performedByName: 'Citizen',
      at: new Date(),
    }],
    ...over,
  });

const validPayload = (over = {}) => ({
  phone: citizen.phone,
  subcity: 'Bole',
  woredaId: woreda._id,
  officeId: office._id,
  categoryId: category._id,
  title: 'Licence renewal delayed over three weeks',
  description: 'I submitted my renewal application and never received a response.',
  incidentDate: '2026-07-01',
  incidentLocation: 'Bole, near the roundabout',
  serviceReceived: 'Business licence renewal',
  consent: true,
  ...over,
});

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  for (const model of [Subcity, Woreda, GovernmentOffice, ComplaintCategory, User, AuditLog, Notification, GovernanceComplaint]) {
    await model.init();
  }

  subcity = await Subcity.create({ name: 'Bole', status: 'Active' });
  woreda = await Woreda.create({ name: 'Woreda 01', subcity: 'Bole', subcityId: subcity._id });
  office = await GovernmentOffice.create({ name: 'Bole Trade Bureau', subcity: 'Bole', subcityId: subcity._id, isActive: true });
  otherOffice = await GovernmentOffice.create({ name: 'Bole Revenue Bureau', subcity: 'Bole', subcityId: subcity._id, isActive: true });
  category = await ComplaintCategory.create({ name: 'Unreasonable Delay', officeId: office._id, isActive: true });
  otherCategory = await ComplaintCategory.create({ name: 'Billing Error', officeId: otherOffice._id, isActive: true });

  citizen = await mkUser({ fullName: 'Citizen Bole', role: 'citizen', email: 'citizen_bole@ethiobridge.et' });
  otherCitizen = await mkUser({ fullName: 'Citizen Two', role: 'citizen', email: 'citizen_two@ethiobridge.et', phone: '0911000000' });
  officer = await mkUser({ fullName: 'Officer Bole', role: 'GOVERNANCE_OFFICER', governmentOfficeId: office._id, email: 'officer_bole@ethiobridge.et' });
  otherOfficer = await mkUser({ fullName: 'Officer Revenue', role: 'GOVERNANCE_OFFICER', governmentOfficeId: otherOffice._id, email: 'officer_rev@ethiobridge.et' });
  subcityAdmin = await mkUser({ fullName: 'Subcity Admin', role: 'subcity_admin', email: 'subcity_admin@ethiobridge.et' });
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await GovernanceComplaint.deleteMany({});
  await AuditLog.deleteMany({});
  await Notification.deleteMany({});
});

// ── Submission: validation + routing ──────────────────────────────────────────
describe('createComplaint', () => {
  it('requires serviceReceived (the service the citizen received)', async () => {
    const { status } = await call(createComplaint)(undefined, validPayload({ serviceReceived: '' }), { user: citizen });
    assert.equal(status, 400);
  });

  it('requires incidentDate', async () => {
    const { status } = await call(createComplaint)(undefined, validPayload({ incidentDate: '' }), { user: citizen });
    assert.equal(status, 400);
  });

  it('requires incidentLocation', async () => {
    const { status } = await call(createComplaint)(undefined, validPayload({ incidentLocation: '' }), { user: citizen });
    assert.equal(status, 400);
  });

  it('rejects a category that does not belong to the selected office', async () => {
    const { status } = await call(createComplaint)(undefined, validPayload({ categoryId: otherCategory._id }), { user: citizen });
    assert.equal(status, 400);
  });

  it('creates a complaint with a GOV tracking ID, routes it, auto-assigns and exposes displayStatus New', async () => {
    const { status, json } = await call(createComplaint)(undefined, validPayload(), { user: citizen });
    assert.equal(status, 201);
    assert.match(json.data.trackingId, /^GOV-\d{4}-\d{6}$/);
    assert.equal(json.data.status, 'Submitted');
    assert.equal(json.data.displayStatus, 'New');
    assert.equal(json.data.subcity, 'Bole');
    assert.equal(json.data.office, 'Bole Trade Bureau');
    assert.equal(json.data.category, 'Unreasonable Delay');
    assert.equal(String(json.data.subcityId), String(subcity._id));
    assert.equal(String(json.data.officeId), String(office._id));

    const fresh = await GovernanceComplaint.findById(json.data._id).lean();
    assert.equal(String(fresh.assignedTo), String(officer._id));
    assert.ok(fresh.slaDueAt);
    assert.ok(fresh.timeline.some((t) => t.action === 'Submitted'));
  });
});

// ── Public tracking (phone verified) ──────────────────────────────────────────
describe('trackComplaint', () => {
  it('rejects a mismatching phone number', async () => {
    const c = await mkComplaint();
    const { status } = await callTrack(trackComplaint)(c.trackingId, { phone: '0911222333' });
    assert.equal(status, 403);
  });

  it('returns status + displayStatus when the phone matches', async () => {
    const c = await mkComplaint();
    const { status, json } = await callTrack(trackComplaint)(c.trackingId, { phone: citizen.phone });
    assert.equal(status, 200);
    assert.equal(json.data.status, 'Submitted');
    assert.equal(json.data.displayStatus, 'New');
    assert.ok(json.data.timeline.length >= 1);
  });
});

// ── Role-scoped access ────────────────────────────────────────────────────────
describe('RBAC scoping', () => {
  it('lists only its own office complaints for a GOVERNANCE_OFFICER', async () => {
    const c1 = await mkComplaint();
    await mkComplaint({
      officeId: otherOffice._id,
      office: otherOffice.name,
      categoryId: otherCategory._id,
      category: otherCategory.name,
      reporter: otherCitizen._id,
    });
    const { status, json } = await call(getComplaints)(undefined, {}, { user: officer, query: { page: 1, limit: 10 } });
    assert.equal(status, 200);
    assert.equal(json.data.total, 1);
    assert.equal(json.data.complaints[0]._id.toString(), c1._id.toString());
    assert.equal(json.data.complaints[0].displayStatus, 'New');
  });

  it('lists only its own complaints for a citizen', async () => {
    await mkComplaint();
    const c2 = await mkComplaint({ reporter: otherCitizen._id, reporterName: otherCitizen.fullName, reporterPhone: otherCitizen.phone });
    const { status, json } = await call(getComplaints)(undefined, {}, { user: citizen, query: { page: 1, limit: 10 } });
    assert.equal(status, 200);
    assert.equal(json.data.total, 1);
    assert.notEqual(json.data.complaints[0]._id.toString(), c2._id.toString());
  });

  it('lists only its own subcity complaints for a subcity admin', async () => {
    await mkComplaint();
    await mkComplaint({
      officeId: otherOffice._id,
      office: otherOffice.name,
      categoryId: otherCategory._id,
      category: otherCategory.name,
      reporter: otherCitizen._id,
    });
    await mkComplaint({ subcity: 'Yeka', subcityId: null, reporter: otherCitizen._id });
    const { status, json } = await call(getComplaints)(undefined, {}, { user: subcityAdmin, query: { page: 1, limit: 10 } });
    assert.equal(status, 200);
    assert.equal(json.data.total, 2);
  });

  it('forbids a citizen from viewing another citizen’s complaint', async () => {
    const c2 = await mkComplaint({ reporter: otherCitizen._id, reporterName: otherCitizen.fullName, reporterPhone: otherCitizen.phone });
    const { status } = await call(getComplaintById)(c2._id, {}, { user: citizen });
    assert.equal(status, 403);
  });

  it('forbids an officer from viewing another office’s complaint', async () => {
    const c2 = await mkComplaint({
      officeId: otherOffice._id,
      office: otherOffice.name,
      categoryId: otherCategory._id,
      category: otherCategory.name,
      reporter: otherCitizen._id,
    });
    const { status } = await call(getComplaintById)(c2._id, {}, { user: officer });
    assert.equal(status, 403);
  });

  it('allows the assigned officer to view its office complaint', async () => {
    const c1 = await mkComplaint();
    const { status, json } = await call(getComplaintById)(c1._id, {}, { user: officer });
    assert.equal(status, 200);
    assert.equal(json.data.displayStatus, 'New');
  });
});

// ── Officer assignment ────────────────────────────────────────────────────────
describe('assignOfficer', () => {
  it('assigns an officer of the complaint’s office, moves to Under Review, displayStatus Assigned', async () => {
    const c1 = await mkComplaint();
    const { status, json } = await call(assignOfficer)(c1._id, { officerId: officer._id, note: 'Please review' }, { user: subcityAdmin });
    assert.equal(status, 200);
    assert.equal(json.data.status, 'Under Review');
    assert.equal(json.data.displayStatus, 'Assigned');
    const fresh = await GovernanceComplaint.findById(c1._id).lean();
    assert.equal(String(fresh.assignedTo), String(officer._id));
    assert.ok(fresh.timeline.some((t) => t.action === 'Assigned'));
  });

  it('rejects an officer belonging to a different office', async () => {
    const c1 = await mkComplaint();
    const { status } = await call(assignOfficer)(c1._id, { officerId: otherOfficer._id }, { user: subcityAdmin });
    assert.equal(status, 400);
  });

  it('forbids an officer from assigning outside their own office', async () => {
    const c1 = await mkComplaint();
    const { status } = await call(assignOfficer)(c1._id, { officerId: officer._id }, { user: otherOfficer });
    assert.equal(status, 403);
  });
});

// ── Citizen responses + information requests ──────────────────────────────────
describe('officer <> citizen communication', () => {
  it('responds to the citizen and records the response', async () => {
    const c1 = await mkComplaint();
    const { status: s1 } = await call(respondToCitizen)(c1._id, {}, { user: officer });
    assert.equal(s1, 400);
    const { status, json } = await call(respondToCitizen)(c1._id, { message: 'We have located your file and will process it this week.' }, { user: officer });
    assert.equal(status, 200);
    const fresh = await GovernanceComplaint.findById(c1._id).lean();
    assert.equal(fresh.officerResponses.length, 1);
    assert.equal(fresh.officerResponses[0].message, 'We have located your file and will process it this week.');
    const notif = await Notification.findOne({ recipient: citizen._id });
    assert.ok(notif, 'citizen should receive an in-app notification of the response');
    assert.equal(json.data.displayStatus, 'New');
  });

  it('requests more information and moves the complaint to Need More Information', async () => {
    const c1 = await mkComplaint();
    const { status, json } = await call(requestMoreInfo)(c1._id, { message: 'Please upload a copy of your receipt.' }, { user: officer });
    assert.equal(status, 200);
    assert.equal(json.data.status, 'Need More Information');
    const fresh = await GovernanceComplaint.findById(c1._id).lean();
    assert.equal(fresh.status, 'Need More Information');
    assert.equal(fresh.officerResponses[0].message, 'Additional information requested: Please upload a copy of your receipt.');
  });
});

// ── Resolution / rejection / reopen ───────────────────────────────────────────
describe('resolve / reject / reopen lifecycle', () => {
  it('resolves a complaint (note required) and sets resolved fields', async () => {
    const c1 = await mkComplaint();
    const { status: s1 } = await call(resolveComplaint)(c1._id, {}, { user: officer });
    assert.equal(s1, 400);
    const { status, json } = await call(resolveComplaint)(c1._id, { resolutionNote: 'File processed and licence issued.' }, { user: officer });
    assert.equal(status, 200);
    assert.equal(json.data.status, 'Resolved');
    assert.equal(json.data.displayStatus, 'Resolved');
    const fresh = await GovernanceComplaint.findById(c1._id).lean();
    assert.equal(fresh.status, 'Resolved');
    assert.ok(fresh.resolvedAt);
    assert.equal(fresh.resolutionNote, 'File processed and licence issued.');
  });

  it('rejects a complaint (reason required)', async () => {
    const c1 = await mkComplaint();
    const { status: s1 } = await call(rejectComplaint)(c1._id, {}, { user: officer });
    assert.equal(s1, 400);
    const { status, json } = await call(rejectComplaint)(c1._id, { rejectionReason: 'Duplicate of complaint GOV-2026-000002.' }, { user: officer });
    assert.equal(status, 200);
    assert.equal(json.data.status, 'Rejected');
    assert.equal(json.data.displayStatus, 'Rejected');
  });

  it('reopens a closed complaint by tracking ID + phone', async () => {
    const c1 = await mkComplaint({ status: 'Resolved', resolvedAt: new Date(), resolutionNote: 'Done.' });

    const callBody = (body) => {
      const res = mockRes();
      return (async () => {
        await reopenByTracking({
          params: {},
          body,
          user: null,
          query: {},
          ip: '127.0.0.1',
          connection: { remoteAddress: '127.0.0.1' },
          get: () => 'node-test',
          app: { get: () => null },
        }, res);
        return { status: res._status, json: res._json };
      })();
    };

    const missing = await callBody({ trackingId: c1.trackingId, reason: 'Outcome unsatisfactory' });
    assert.equal(missing.status, 403);

    const wrongPhone = await callBody({ trackingId: c1.trackingId, phone: '0911222333', reason: 'Outcome unsatisfactory' });
    assert.equal(wrongPhone.status, 403);

    const { status, json } = await callBody({ trackingId: c1.trackingId, phone: citizen.phone, reason: 'Outcome unsatisfactory' });
    assert.equal(status, 200);
    assert.equal(json.data.status, 'Reopened');
    assert.equal(json.data.displayStatus, 'Reopened');
    const fresh = await GovernanceComplaint.findById(c1._id).lean();
    assert.equal(fresh.status, 'Reopened');
    assert.equal(fresh.reopenedCount, 1);
  });
});

// ── displayStatus alias layer ─────────────────────────────────────────────────
describe('displayStatus alias layer', () => {
  it('maps the granular enum onto the simplified citizen vocabulary', () => {
    assert.equal(STATUS_ALIASES['Submitted'], 'New');
    assert.equal(STATUS_ALIASES['Under Review'], 'Received');
    assert.equal(STATUS_ALIASES['In Progress'], 'Under Investigation');
    assert.equal(STATUS_ALIASES['Investigation in Progress'], 'Under Investigation');
    assert.equal(STATUS_ALIASES['Need More Information'], 'Need More Information');
    assert.equal(STATUS_ALIASES['Resolved'], 'Resolved');
    assert.equal(STATUS_ALIASES['Rejected'], 'Rejected');
    assert.equal(STATUS_ALIASES['Closed'], 'Closed');
  });

  it('surfaces Assigned once an officer is assigned to an Under Review complaint', () => {
    const assigned = { _id: new mongoose.Types.ObjectId() };
    assert.equal(displayStatusFor({ status: 'Under Review', assignedTo: assigned }), 'Assigned');
    assert.equal(displayStatusFor({ status: 'Under Review', assignedTo: null, assignedToOffice: 'Bole Trade Bureau' }), 'Assigned');
    assert.equal(displayStatusFor({ status: 'Under Review', assignedTo: null, assignedToOffice: '' }), 'Received');
  });
});
