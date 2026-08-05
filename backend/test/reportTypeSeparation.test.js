/**
 * Tests for report-type routing and dashboard separation.
 *
 * Guarantees that infrastructure submissions and public complaints are stamped
 * with their own report_type discriminator (plus live subcityId/departmentId
 * scope refs) and that each dashboard list only ever returns its own type, so
 * reports never leak into the wrong tab.
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
const InfrastructureReport = require('../src/models/InfrastructureReport');
const PublicComplaint = require('../src/models/PublicComplaint');
const Woreda = require('../src/models/Woreda');
const Subcity = require('../src/models/Subcity');
const Department = require('../src/models/Department');
const { createInfrastructure } = require('../src/controllers/reportController');
const { createComplaint } = require('../src/controllers/publicComplaintController');
const { getAllReports, getMyReports } = require('../src/controllers/infrastructureController');
const { getPublicComplaints } = require('../src/controllers/publicComplaintController');
const { getDepartmentReports, getDepartmentComplaints } = require('../src/controllers/departmentController');

let mongod;

const mockRes = () => {
  const res = { _status: 200, _json: null };
  res.status = function (s) { res._status = s; return res; };
  res.json = function (obj) { res._json = obj; return res; };
  return res;
};

const call = (fn, user) => async (body = {}, query = {}) => {
  const res = mockRes();
  await fn({
    body,
    query,
    params: {},
    user: user || { _id: new mongoose.Types.ObjectId(), role: 'admin', fullName: 'Admin' },
    ip: '127.0.0.1',
    connection: { remoteAddress: '127.0.0.1' },
    get: () => 'node-test',
    app: { get: () => null },
  }, res);
  return { status: res._status, json: res._json };
};

const mkSubcity = () => Subcity.create({ name: 'Bole' });
const mkWoreda = (subcity) =>
  Woreda.create({
    name: 'Woreda 01',
    subcity: 'Bole',
    subcityId: subcity._id,
    departments: ['Electricity', 'Road', 'Water'],
  });
const mkDepartment = (subcity, woreda) =>
  Department.create({
    name: 'Electricity',
    subcityId: subcity._id,
    subcityName: 'Bole',
    woredaId: woreda._id,
    woredaName: 'Woreda 01',
    status: 'Active',
  });

const mkInfra = (over = {}) =>
  InfrastructureReport.create({
    title: 'Broken streetlight',
    description: 'Streetlight out near the gate.',
    category: 'electricity_issue',
    region: 'Addis Ababa',
    subcity: 'BOLE',
    woredaName: 'Woreda 01',
    department: 'Electricity',
    status: 'Assigned',
    ...over,
  });

const mkComplaint = (over = {}) =>
  PublicComplaint.create({
    title: 'Public complaint',
    description: 'Service delay complaint.',
    category: 'Government Service Complaint',
    region: 'Addis Ababa',
    subcity: 'BOLE',
    department: 'Electricity',
    priority: 'Medium',
    status: 'Submitted',
    ...over,
  });

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  await InfrastructureReport.init();
  await PublicComplaint.init();
  await Woreda.init();
  await Subcity.init();
  await Department.init();
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await InfrastructureReport.deleteMany({});
  await PublicComplaint.deleteMany({});
  await Woreda.deleteMany({});
  await Subcity.deleteMany({});
  await Department.deleteMany({});
});

describe('report_type stamping on create', () => {
  it('stamps infrastructure submissions with report_type + subcityId + departmentId', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda(subcity);
    await mkDepartment(subcity, woreda);

    const { status, json } = await call(createInfrastructure)({
      title: 'Broken streetlight',
      description: 'Streetlight out near the gate.',
      region: 'Addis Ababa',
      category: 'electricity_issue',
      woredaId: woreda._id.toString(),
      department: 'Electricity',
      severityLevel: 'High',
      reporterName: 'Dagi',
      reporterPhone: '0967786170',
    });
    assert.equal(status, 201);
    const saved = await InfrastructureReport.findById(json.data.report._id).lean();
    assert.equal(saved.report_type, 'infrastructure');
    assert.equal(saved.subcityId.toString(), subcity._id.toString());
    assert.equal(saved.woredaId.toString(), woreda._id.toString());
    assert.ok(saved.departmentId, 'departmentId should be resolved');
  });

  it('stamps public complaints with report_type + subcityId + departmentId', async () => {
    const subcity = await mkSubcity();
    const woreda = await mkWoreda(subcity);
    await mkDepartment(subcity, woreda);

    const { status, json } = await call(createComplaint)({
      title: 'Complaint about service',
      description: 'Slow service.',
      category: 'Government Service Complaint',
      region: 'Addis Ababa',
      priority: 'High',
      subcity: 'BOLE',
      woredaId: woreda._id.toString(),
      department: 'Electricity',
    });
    assert.equal(status, 201);
    const saved = await PublicComplaint.findById(json.data.complaint._id).lean();
    assert.equal(saved.report_type, 'public_complaint');
    assert.equal(saved.subcityId.toString(), subcity._id.toString());
    assert.equal(saved.woredaId.toString(), woreda._id.toString());
    assert.ok(saved.departmentId, 'departmentId should be resolved');
  });

  it('keeps report_type default on model-level creates', async () => {
    const r = await mkInfra();
    const c = await mkComplaint();
    assert.equal(r.report_type, 'infrastructure');
    assert.equal(c.report_type, 'public_complaint');
  });
});

describe('dashboard list separation', () => {
  it('admin infrastructure list only returns infrastructure reports', async () => {
    await mkInfra();
    await mkInfra({ title: 'Water pipe burst' });
    await mkComplaint();
    await mkComplaint({ title: 'Another complaint' });

    const { status, json } = await call(getAllReports)({}, { page: 1, limit: 10 });
    assert.equal(status, 200);
    assert.equal(json.total, 2);
    assert.ok(json.reports.every((r) => r.report_type === 'infrastructure'));
  });

  it('public complaint list only returns public complaints', async () => {
    await mkComplaint();
    await mkComplaint({ title: 'Second complaint' });
    await mkInfra();

    const { status, json } = await call(getPublicComplaints)({}, { page: 1, limit: 10 });
    assert.equal(status, 200);
    assert.equal(json.data.total, 2);
    assert.ok(json.data.complaints.every((c) => c.report_type === 'public_complaint'));
  });

  it('citizen my-reports only returns infrastructure reports', async () => {
    const citizen = { _id: new mongoose.Types.ObjectId(), role: 'citizen', fullName: 'Citizen' };
    await mkInfra({ submittedBy: citizen._id });
    await mkInfra({ title: 'Second', submittedBy: citizen._id });
    await mkInfra({ title: 'Not mine', submittedBy: new mongoose.Types.ObjectId() });

    const { status, json } = await call(getMyReports, citizen)({}, { page: 1, limit: 10 });
    assert.equal(status, 200);
    assert.equal(json.total, 2);
    assert.ok(json.reports.every((r) => r.report_type === 'infrastructure'));
  });

  it('department report list is infrastructure-only and woreda-scoped', async () => {
    const woredaId = new mongoose.Types.ObjectId();
    const deptUser = { _id: new mongoose.Types.ObjectId(), role: 'department', department: 'Electricity', woredaId };
    await mkInfra({ woredaId, department: 'Electricity' });
    await mkInfra({ woredaId, department: 'Electricity', title: 'Second report' });
    await mkInfra({ woredaId: new mongoose.Types.ObjectId(), department: 'Electricity', title: 'Other woreda' });
    await mkComplaint({ woredaId, department: 'Electricity' });

    const { status, json } = await call(getDepartmentReports, deptUser)({}, { page: 1, limit: 20 });
    assert.equal(status, 200);
    assert.equal(json.total, 2);
    assert.ok(json.reports.every((r) => r.report_type === 'infrastructure'));
  });

  it('department complaint list is complaints-only and woreda-scoped', async () => {
    const woredaId = new mongoose.Types.ObjectId();
    const deptUser = { _id: new mongoose.Types.ObjectId(), role: 'department', department: 'Electricity', woredaId };
    await mkComplaint({ woredaId, department: 'Electricity' });
    await mkComplaint({ woredaId, department: 'Electricity', title: 'Second complaint' });
    await mkComplaint({ woredaId: new mongoose.Types.ObjectId(), department: 'Electricity', title: 'Other woreda' });
    await mkInfra({ woredaId, department: 'Electricity' });

    const { status, json } = await call(getDepartmentComplaints, deptUser)({}, { page: 1, limit: 20 });
    assert.equal(status, 200);
    assert.equal(json.total, 2);
    assert.ok(json.complaints.every((c) => c.report_type === 'public_complaint'));
  });

  it('excludes records that carry the wrong discriminator', async () => {
    // Raw collection insert bypasses the schema enum so we can plant a
    // document with a foreign report_type and prove the filter rejects it.
    await mkInfra();
    await InfrastructureReport.collection.insertOne({
      title: 'Impostor',
      description: 'planted with a foreign discriminator',
      category: 'other',
      region: 'Addis Ababa',
      report_type: 'public_complaint',
    });

    const { status, json } = await call(getAllReports)({}, { page: 1, limit: 10 });
    assert.equal(status, 200);
    assert.equal(json.total, 1);
    assert.ok(json.reports.every((r) => r.report_type === 'infrastructure'));
  });
});
