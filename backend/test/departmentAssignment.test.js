/**
 * Tests for department-based report assignment.
 *
 * Guarantees that:
 *   1. A submitted infrastructure report is stamped status 'Submitted' and
 *      auto-assigned (department field + departmentId) to the selected
 *      department's woreda scope.
 *   2. A department_officer account sees only its own department's reports,
 *      regardless of department-name casing ("water" vs "Water").
 *   3. Notifications reach BOTH the legacy `department` role and the canonical
 *      `department_officer` role for the same woreda + department.
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
const Woreda = require('../src/models/Woreda');
const Subcity = require('../src/models/Subcity');
const Department = require('../src/models/Department');
const User = require('../src/models/User');
const { createInfrastructure } = require('../src/controllers/reportController');
const { getDepartmentReports } = require('../src/controllers/departmentController');
const { findDepartmentRecipients } = require('../src/utils/departmentRecipients');

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

const fixtures = async () => {
  const subcity = await Subcity.create({ name: 'Bole' });
  const woreda = await Woreda.create({
    name: 'Woreda 01',
    subcity: 'Bole',
    subcityId: subcity._id,
    departments: ['Electricity', 'Road', 'Water'],
  });
  const department = await Department.create({
    name: 'Water',
    subcityId: subcity._id,
    subcityName: 'Bole',
    woredaId: woreda._id,
    woredaName: 'Woreda 01',
    status: 'Active',
  });
  return { subcity, woreda, department };
};

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  await InfrastructureReport.init();
  await Woreda.init();
  await Subcity.init();
  await Department.init();
  await User.init();
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await InfrastructureReport.deleteMany({});
  await Woreda.deleteMany({});
  await Subcity.deleteMany({});
  await Department.deleteMany({});
  await User.deleteMany({});
});

describe('department-based report assignment', () => {
  it('stamps submitted infrastructure reports with status Submitted + auto-assignment', async () => {
    const { subcity, woreda, department } = await fixtures();

    const { status, json } = await call(createInfrastructure)({
      title: 'Water pipe burst',
      description: 'Leaking pipe near the corner.',
      region: 'Addis Ababa',
      category: 'water_supply_issue',
      subcity: 'BOLE',
      woredaId: woreda._id.toString(),
      department: 'Water',
      reporterName: 'Dagi',
      reporterPhone: '0967786170',
    });
    assert.equal(status, 201);

    const saved = await InfrastructureReport.findById(json.data.report._id).lean();
    assert.equal(saved.status, 'Submitted');
    assert.equal(saved.department, 'Water');
    assert.equal(saved.report_type, 'infrastructure');
    assert.equal(saved.subcityId.toString(), subcity._id.toString());
    assert.equal(saved.woredaId.toString(), woreda._id.toString());
    assert.equal(saved.departmentId.toString(), department._id.toString());
  });

  it('lets a department_officer see reports for their department despite name casing', async () => {
    const { woreda, department } = await fixtures();

    // Officer account stores the department name lower-cased ("water") — the
    // exact shape seen in live data created through the admin UI.
    const officer = await User.create({
      fullName: 'Zda Officer',
      email: 'zda@dept.et',
      password: 'password123',
      phone: '0911223344',
      role: 'department_officer',
      subcity: 'Bole',
      subcityId: woreda.subcityId,
      woredaId: woreda._id,
      woredaName: 'Woreda 01',
      departmentId: department._id,
      department: 'water',
      isActive: true,
      isApproved: true,
    });

    await call(createInfrastructure)({
      title: 'Low pressure',
      description: 'No water since morning.',
      region: 'Addis Ababa',
      category: 'water_supply_issue',
      subcity: 'BOLE',
      woredaId: woreda._id.toString(),
      department: 'Water',
      reporterName: 'Dagi',
      reporterPhone: '0967786170',
    });

    const { status, json } = await call(getDepartmentReports, officer)({}, { page: 1, limit: 20 });
    assert.equal(status, 200);
    assert.equal(json.total, 1);
    assert.equal(json.reports[0].title, 'Low pressure');
  });

  it('keeps departments fully isolated (Water does not see Electricity)', async () => {
    const { woreda } = await fixtures();

    await call(createInfrastructure)({
      title: 'Water pipe burst',
      description: 'Leaking pipe.',
      region: 'Addis Ababa',
      category: 'water_supply_issue',
      subcity: 'BOLE',
      woredaId: woreda._id.toString(),
      department: 'Water',
      reporterName: 'Dagi',
      reporterPhone: '0967786170',
    });

    const roadOfficer = {
      _id: new mongoose.Types.ObjectId(),
      role: 'department_officer',
      department: 'road',
      woredaId: woreda._id,
    };

    const { status, json } = await call(getDepartmentReports, roadOfficer)({}, { page: 1, limit: 20 });
    assert.equal(status, 200);
    assert.equal(json.total, 0);
  });

  it('scopes to the officer woreda as well as the department', async () => {
    const { woreda } = await fixtures();
    const otherWoreda = await Woreda.create({
      name: 'Woreda 02',
      subcity: 'Bole',
      subcityId: woreda.subcityId,
      departments: ['Electricity', 'Road', 'Water'],
    });

    await call(createInfrastructure)({
      title: 'Water pipe burst',
      description: 'Leaking pipe.',
      region: 'Addis Ababa',
      category: 'water_supply_issue',
      subcity: 'BOLE',
      woredaId: woreda._id.toString(),
      department: 'Water',
      reporterName: 'Dagi',
      reporterPhone: '0967786170',
    });

    const otherOfficer = {
      _id: new mongoose.Types.ObjectId(),
      role: 'department_officer',
      department: 'water',
      woredaId: otherWoreda._id,
    };

    const { status, json } = await call(getDepartmentReports, otherOfficer)({}, { page: 1, limit: 20 });
    assert.equal(status, 200);
    assert.equal(json.total, 0);
  });

  it('finds both department and department_officer recipients for notifications', async () => {
    const { woreda, department } = await fixtures();

    const legacyDept = await User.create({
      fullName: 'Legacy Dept',
      email: 'legacy@dept.et',
      password: 'password123',
      phone: '0922334455',
      role: 'department',
      department: 'Water',
      woredaId: woreda._id,
      isActive: true,
      isApproved: true,
    });

    const officer = await User.create({
      fullName: 'Officer',
      email: 'officer@dept.et',
      password: 'password123',
      phone: '0933445566',
      role: 'department_officer',
      department: 'water',
      subcityId: woreda.subcityId,
      woredaId: woreda._id,
      departmentId: department._id,
      isActive: true,
      isApproved: true,
    });

    // Title-case department name on the report, woreda-scoped — must match both.
    const recipients = await findDepartmentRecipients({
      woredaId: woreda._id,
      department: 'Water',
      departmentId: department._id,
    });
    const ids = recipients.map((u) => u._id.toString()).sort();
    assert.deepEqual(ids, [legacyDept._id.toString(), officer._id.toString()].sort());
  });
});
