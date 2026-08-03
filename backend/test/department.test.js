/**
 * Automated tests for department duplicate prevention:
 *   • normalized-name unit tests (casing + whitespace)
 *   • model-level unique-index enforcement
 *   • controller create/update duplicate detection with reactivation codes
 *   • migration de-duplication
 *
 * Uses mongodb-memory-server with the system mongod binary when available so
 * no network download is required and tests never touch the real database.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const mongoose = require('mongoose');

// ── System binary detection ──────────────────────────────────────────────────
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
const express = require('express');
const Department = require('../src/models/Department');
const Subcity = require('../src/models/Subcity');
const Woreda = require('../src/models/Woreda');
const { normalizeDepartmentName } = require('../src/utils/departmentNames');
const { migrateDepartments } = require('../src/utils/migrateDepartments');
const {
  createDepartment,
  updateDepartment,
  deleteDepartment,
} = require('../src/controllers/adminController');
const {
  getSubcityDepartments,
  createSubcityDepartment,
  updateSubcityDepartment,
  deleteSubcityDepartment,
} = require('../src/controllers/subcityDepartmentController');
const { authorize } = require('../src/middleware/auth');

let mongod;

// ── Mock req/res helpers for controller tests ────────────────────────────────
const mockRes = () => {
  const res = { _status: 200, _json: null };
  res.status = function (s) { res._status = s; return res; };
  res.json = function (obj) { res._json = obj; return res; };
  return res;
};

const callCreate = async (body) => {
  const res = mockRes();
  await createDepartment({ body }, res);
  return { status: res._status, json: res._json };
};

const callUpdate = async (id, body) => {
  const res = mockRes();
  await updateDepartment({ params: { id }, body }, res);
  return { status: res._status, json: res._json };
};

const mkDept = (name, status = 'Active', subcityId = null) =>
  Department.create({
    name,
    normalizedDepartmentName: normalizeDepartmentName(name),
    subcityId,
    status,
  });

// ── Global setup / teardown ──────────────────────────────────────────────────
before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  await Department.init(); // ensure the unique index exists before any writes
});

after(async () => {
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Department.deleteMany({});
  await Subcity.deleteMany({});
  await Woreda.deleteMany({});
});

// ── Unit: normalizeDepartmentName ────────────────────────────────────────────
describe('normalizeDepartmentName', () => {
  it('lower-cases', () => {
    assert.equal(normalizeDepartmentName('Water'), 'water');
    assert.equal(normalizeDepartmentName('WATER'), 'water');
    assert.equal(normalizeDepartmentName('wAtEr'), 'water');
  });

  it('trims leading and trailing whitespace', () => {
    assert.equal(normalizeDepartmentName('  water  '), 'water');
    assert.equal(normalizeDepartmentName('\twater\n'), 'water');
  });

  it('collapses internal whitespace runs to a single space', () => {
    assert.equal(normalizeDepartmentName('wa  ter'), 'wa ter');
    assert.equal(normalizeDepartmentName('Electricity     Supply'), 'electricity supply');
  });

  it('treats empty input as an empty string', () => {
    assert.equal(normalizeDepartmentName(''), '');
    assert.equal(normalizeDepartmentName(undefined), '');
    assert.equal(normalizeDepartmentName(null), '');
  });
});

// ── Model-level unique index ─────────────────────────────────────────────────
describe('Department model unique index', () => {
  it('rejects a second department with different casing', async () => {
    await mkDept('Water');
    await assert.rejects(
      () => mkDept('WATER'),
      (err) => err.code === 11000
    );
  });

  it('rejects a second department with extra whitespace', async () => {
    await mkDept('Health');
    await assert.rejects(
      () => mkDept('  health  '),
      (err) => err.code === 11000
    );
  });

  it('allows genuinely distinct department names', async () => {
    await mkDept('Health');
    await mkDept('Education');
    const count = await Department.countDocuments();
    assert.equal(count, 2);
  });

  it('blocks concurrent duplicate inserts even when they race', async () => {
    await mkDept('Water');
    const attempts = ['water', 'WATER', ' water '].map((n) =>
      Department.create({ name: n }).then(() => 'resolved', (e) => e)
    );
    const results = await Promise.all(attempts);
    assert.ok(results.every((r) => r instanceof Error), 'all concurrent duplicates must fail');
    assert.ok(results.every((e) => e.code === 11000), 'failures must be unique-index violations');
    assert.equal(await Department.countDocuments(), 1);
  });
});

// ── API authorization: department CRUD is Admin-only ─────────────────────────
describe('Department API authorization (admin-only)', () => {
  // Mirrors adminRoutes.js wiring: protect → authorize('admin') → controller.
  // The role is injected via the request body so the same endpoints can be
  // exercised for both admin and non-admin roles.
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    const requireAdmin = (req, res, next) => {
      req.user = { role: req.body.role };
      next();
    };
    app.post('/departments', requireAdmin, authorize('admin'), createDepartment);
    app.put('/departments/:id', requireAdmin, authorize('admin'), updateDepartment);
    app.delete('/departments/:id', requireAdmin, authorize('admin'), deleteDepartment);
    return app;
  };

  let server;
  let baseUrl;

  before(async () => {
    server = buildApp().listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  it('blocks every non-admin role from creating a department with a 403 authorization error', async () => {
    for (const role of ['citizen', 'government', 'ngo', 'volunteer', 'woreda', 'subcity_bole', 'department']) {
      const res = await fetch(`${baseUrl}/departments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `Test ${role}`, role }),
      });
      assert.equal(res.status, 403, `${role} must be rejected`);
      const body = await res.json();
      assert.equal(body.success, false);
      assert.match(body.message, /not authorized/i);
    }
  });

  it('allows an admin to create a department', async () => {
    const res = await fetch(`${baseUrl}/departments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Agriculture', role: 'admin' }),
    });
    assert.equal(res.status, 201);
    const body = await res.json();
    assert.equal(body.department.normalizedDepartmentName, 'agriculture');
  });

  it('blocks non-admin users from editing (activate/deactivate/rename)', async () => {
    const d = await mkDept('Transport');
    for (const role of ['woreda', 'department', 'citizen']) {
      const res = await fetch(`${baseUrl}/departments/${d._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'Inactive', role }),
      });
      assert.equal(res.status, 403, `${role} must not be able to edit`);
      assert.equal(await Department.findById(d._id).then((x) => x.status), 'Active');
    }
  });

  it('blocks non-admin users from deleting a department', async () => {
    const d = await mkDept('Revenue');
    const res = await fetch(`${baseUrl}/departments/${d._id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'citizen' }),
    });
    assert.equal(res.status, 403);
    assert.ok(await Department.findById(d._id));
  });
});

// ── Controller: createDepartment ─────────────────────────────────────────────
describe('createDepartment controller', () => {
  it('creates a department and stores trimmed name + normalizedDepartmentName', async () => {
    const { status, json } = await callCreate({ name: '  Water  ', description: ' H2O ' });
    assert.equal(status, 201);
    assert.equal(json.success, true);
    assert.equal(json.department.name, 'water');
    assert.equal(json.department.normalizedDepartmentName, 'water');
    assert.equal(json.department.description, 'H2O');
    assert.equal(json.department.status, 'Active');
  });

  it('rejects a duplicate (different casing) with a structured code', async () => {
    await mkDept('Water');
    const { status, json } = await callCreate({ name: 'WATER' });
    assert.equal(status, 409);
    assert.equal(json.code, 'DEPARTMENT_NAME_EXISTS');
    assert.equal(json.department.name, 'Water');
  });

  it('rejects a duplicate (leading/trailing spaces) with a structured code', async () => {
    await mkDept('Water');
    const { status, json } = await callCreate({ name: '  water  ' });
    assert.equal(status, 409);
    assert.equal(json.code, 'DEPARTMENT_NAME_EXISTS');
  });

  it('returns an INACTIVE reactivation code when a deactivated copy exists', async () => {
    await mkDept('Water', 'Inactive');
    const { status, json } = await callCreate({ name: 'water' });
    assert.equal(status, 409);
    assert.equal(json.code, 'DEPARTMENT_EXISTS_INACTIVE');
    assert.equal(json.department.status, 'Inactive');
    assert.ok(json.department._id);
  });

  it('does not create a second record when an inactive duplicate exists', async () => {
    await mkDept('Water', 'Inactive');
    await callCreate({ name: '  WATER ' });
    const count = await Department.countDocuments();
    assert.equal(count, 1);
  });

  it('rejects an empty name', async () => {
    const { status, json } = await callCreate({ name: '   ' });
    assert.equal(status, 400);
    assert.match(json.message, /required/i);
  });
});

// ── Controller: updateDepartment ─────────────────────────────────────────────
describe('updateDepartment controller', () => {
  it('renames to a unique name and updates normalizedDepartmentName', async () => {
    const d = await mkDept('Water');
    const { status, json } = await callUpdate(d._id, { name: '  Water & Sanitation  ' });
    assert.equal(status, 200);
    assert.equal(json.department.name, 'water & sanitation');
    assert.equal(json.department.normalizedDepartmentName, 'water & sanitation');
  });

  it('rejects a rename to an existing name', async () => {
    await mkDept('Water');
    const other = await mkDept('Health');
    const { status, json } = await callUpdate(other._id, { name: 'WATER' });
    assert.equal(status, 409);
    assert.equal(json.code, 'DEPARTMENT_NAME_EXISTS');
  });

  it('allows keeping the same name on edit (excludes self)', async () => {
    const d = await mkDept('Water');
    const { status } = await callUpdate(d._id, { name: '  Water  ' });
    assert.equal(status, 200);
  });

  it('reactivates a deactivated department via status update', async () => {
    const d = await mkDept('Water', 'Inactive');
    const { status, json } = await callUpdate(d._id, { status: 'Active' });
    assert.equal(status, 200);
    assert.equal(json.department.status, 'Active');
    // Still exactly one record — no duplicate created.
    assert.equal(await Department.countDocuments({ normalizedDepartmentName: 'water' }), 1);
  });

  it('updating only status does not touch the name', async () => {
    const d = await mkDept('Water', 'Active');
    const { json } = await callUpdate(d._id, { status: 'Inactive' });
    assert.equal(json.department.name, 'Water');
    assert.equal(json.department.status, 'Inactive');
  });
});

// ── Migration ────────────────────────────────────────────────────────────────
describe('migrateDepartments', () => {
  // Legacy data predates the unique normalizedDepartmentName index. Simulate it
  // by dropping the index and inserting raw documents (no hooks, no
  // normalizedDepartmentName).
  const dropUniqueIndex = async () => {
    for (const name of ['unique_department_normalized_name', 'unique_subcity_department', 'unique_subcity_woreda_department']) {
      try {
        await Department.collection.dropIndex(name);
      } catch {
        /* already absent — fine */
      }
    }
  };

  const seedLegacy = (rows) =>
    Department.collection.insertMany(rows.map((r) => ({
      name: r.name,
      status: r.status || 'Active',
      description: '',
      createdAt: r.createdAt || new Date(),
      updatedAt: new Date(),
    })));

  it('backfills normalizedDepartmentName, removes duplicates, keeps Active copy', async () => {
    await dropUniqueIndex();
    await seedLegacy([
      { name: 'Water', status: 'Active', createdAt: new Date(2024, 0, 1) },
      { name: '  WATER ', status: 'Active', createdAt: new Date(2024, 0, 2) },
      { name: 'Water  ', status: 'Inactive', createdAt: new Date(2024, 0, 3) },
      { name: 'Health', status: 'Active', createdAt: new Date(2024, 0, 4) },
      { name: 'HEALTH', status: 'Inactive', createdAt: new Date(2024, 0, 5) },
    ]);

    const summary = await migrateDepartments();

    assert.equal(summary.removed, 3); // 2 water dups + 1 health dup
    const remaining = await Department.find().lean();
    assert.equal(remaining.length, 2);

    const water = remaining.find((d) => d.normalizedDepartmentName === 'water');
    const health = remaining.find((d) => d.normalizedDepartmentName === 'health');
    assert.ok(water, 'kept the water record');
    assert.ok(health, 'kept the health record');
    assert.equal(water.status, 'Active');
    assert.equal(health.status, 'Active', 'prefers the Active copy over the Inactive one');
    for (const d of remaining) {
      assert.equal(d.normalizedDepartmentName, normalizeDepartmentName(d.name), 'normalizedDepartmentName matches name');
    }
  });

  it('is idempotent — running twice changes nothing', async () => {
    await dropUniqueIndex();
    await seedLegacy([
      { name: 'Water', status: 'Active', createdAt: new Date(2024, 0, 1) },
      { name: 'WATER', status: 'Inactive', createdAt: new Date(2024, 0, 2) },
    ]);

    const first = await migrateDepartments();
    const second = await migrateDepartments();

    assert.equal(first.removed, 1);
    assert.equal(second.removed, 0);
    assert.equal(await Department.countDocuments(), 1);
  });

  it('assigns global departments into every Active subcity', async () => {
    await dropUniqueIndex();
    await seedLegacy([
      { name: 'Water', status: 'Active' },
      { name: 'Road', status: 'Active' },
    ]);
    await Subcity.create({ name: 'bole', status: 'Active' });
    await Subcity.create({ name: 'yeka', status: 'Active' });

    const summary = await migrateDepartments();

    assert.equal(summary.subcities, 2);
    assert.equal(summary.moved, 2, 'originals are reused (moved) into the first subcity');
    assert.equal(summary.created, 2, 'copies are created for the remaining subcity');

    // One Water per subcity, never two inside the same subcity.
    const waters = await Department.find({ normalizedDepartmentName: 'water' }).lean();
    assert.equal(waters.length, 2);
    assert.equal(new Set(waters.map((d) => String(d.subcityId))).size, 2);
    for (const w of waters) {
      assert.ok(w.subcityName, 'denormalized subcityName is populated');
    }
  });
});

// ── Subcity-scoped uniqueness (model level) ─────────────────────────────────
describe('Department model subcity scoping', () => {
  it('allows the same department name in different subcities', async () => {
    const bole = await Subcity.create({ name: 'bole', status: 'Active' });
    const yeka = await Subcity.create({ name: 'yeka', status: 'Active' });
    await mkDept('Water', 'Active', bole._id);
    await mkDept('Water', 'Active', yeka._id);
    assert.equal(await Department.countDocuments({ normalizedDepartmentName: 'water' }), 2);
  });

  it('rejects the same department name twice in one subcity (casing-insensitive)', async () => {
    const bole = await Subcity.create({ name: 'bole', status: 'Active' });
    await mkDept('Water', 'Active', bole._id);
    await assert.rejects(
      () => mkDept('WATER', 'Active', bole._id),
      (err) => err.code === 11000
    );
  });

  it('allows the same name in two subcities but rejects a duplicate in one', async () => {
    const bole = await Subcity.create({ name: 'bole', status: 'Active' });
    const yeka = await Subcity.create({ name: 'yeka', status: 'Active' });
    await mkDept('Water', 'Active', bole._id);
    await mkDept('Water', 'Active', yeka._id);
    await assert.rejects(
      () => mkDept('water', 'Active', bole._id),
      (err) => err.code === 11000
    );
  });
});

// ── Admin controller: subcity-scoped create ─────────────────────────────────
describe('createDepartment subcity scoping', () => {
  it('scopes duplicate detection to the chosen subcity', async () => {
    const bole = await Subcity.create({ name: 'bole', status: 'Active' });
    const yeka = await Subcity.create({ name: 'yeka', status: 'Active' });
    await mkDept('Water', 'Active', bole._id);

    // Same name in a different subcity is fine.
    const { status: createdStatus } = await callCreate({ name: 'Water', subcityId: yeka._id });
    assert.equal(createdStatus, 201);

    // Duplicate inside the same subcity is rejected.
    const dup = await callCreate({ name: 'WATER', subcityId: yeka._id });
    assert.equal(dup.status, 409);
    assert.equal(dup.json.code, 'DEPARTMENT_NAME_EXISTS');
  });

  it('rejects an unknown subcityId', async () => {
    const { status, json } = await callCreate({ name: 'Water', subcityId: new mongoose.Types.ObjectId() });
    assert.equal(status, 404);
    assert.match(json.message, /subcity/i);
  });
});

// ── Admin controller: woreda-level department scoping ─────────────────────────
describe('createDepartment woreda scoping', () => {
  it('creates a woreda-level department and saves subcityId + woredaId', async () => {
    const bole = await Subcity.create({ name: 'Bole', status: 'Active' });
    const w = await Woreda.create({ name: 'Woreda 07', subcity: 'Bole', status: 'Active' });
    const { status, json } = await callCreate({ name: 'Water', subcityId: bole._id, woredaId: w._id });
    assert.equal(status, 201);
    assert.equal(String(json.department.subcityId), bole._id.toString());
    assert.equal(json.department.subcityName, 'Bole');
    assert.equal(String(json.department.woredaId), w._id.toString());
    assert.equal(json.department.woredaName, 'Woreda 07');
  });

  it('creates a subcity-level department when only a subcity is chosen', async () => {
    const bole = await Subcity.create({ name: 'Bole', status: 'Active' });
    const { status, json } = await callCreate({ name: 'Health', subcityId: bole._id });
    assert.equal(status, 201);
    assert.equal(String(json.department.subcityId), bole._id.toString());
    assert.equal(json.department.woredaId, null);
  });

  it('creates a general department when neither subcity nor woreda is chosen', async () => {
    const { status, json } = await callCreate({ name: 'Revenue' });
    assert.equal(status, 201);
    assert.equal(json.department.subcityId, null);
    assert.equal(json.department.woredaId, null);
  });

  it('rejects a woreda without a subcity', async () => {
    const w = await Woreda.create({ name: 'Woreda 07', subcity: 'Bole', status: 'Active' });
    const { status, json } = await callCreate({ name: 'Water', woredaId: w._id });
    assert.equal(status, 400);
    assert.match(json.message, /select a Subcity when selecting a Woreda/i);
  });

  it('rejects a woreda that does not belong to the selected subcity', async () => {
    const bole = await Subcity.create({ name: 'Bole', status: 'Active' });
    const yeka = await Subcity.create({ name: 'Yeka', status: 'Active' });
    const w = await Woreda.create({ name: 'Woreda 03', subcity: 'Yeka', status: 'Active' });
    const { status, json } = await callCreate({ name: 'Water', subcityId: bole._id, woredaId: w._id });
    assert.equal(status, 400);
    assert.match(json.message, /does not belong/i);
  });

  it('allows the same name at subcity-level and woreda-level in one subcity', async () => {
    const bole = await Subcity.create({ name: 'Bole', status: 'Active' });
    const w = await Woreda.create({ name: 'Woreda 07', subcity: 'Bole', status: 'Active' });
    const first = await callCreate({ name: 'Water', subcityId: bole._id });
    assert.equal(first.status, 201);
    const second = await callCreate({ name: 'Water', subcityId: bole._id, woredaId: w._id });
    assert.equal(second.status, 201);
    assert.equal(await Department.countDocuments({ normalizedDepartmentName: 'water' }), 2);
  });

  it('rejects a duplicate name at the same woreda', async () => {
    const bole = await Subcity.create({ name: 'Bole', status: 'Active' });
    const w = await Woreda.create({ name: 'Woreda 07', subcity: 'Bole', status: 'Active' });
    await callCreate({ name: 'Water', subcityId: bole._id, woredaId: w._id });
    const dup = await callCreate({ name: '  WATER ', subcityId: bole._id, woredaId: w._id });
    assert.equal(dup.status, 409);
    assert.equal(dup.json.code, 'DEPARTMENT_NAME_EXISTS');
  });
});

// ── Subcity Department controller (Admin-only HTTP endpoints) ───────────────
describe('subcityDepartmentController (HTTP)', () => {
  const buildApp = () => {
    const app = express();
    app.use(express.json());
    const requireAdmin = (req, res, next) => {
      req.user = { _id: new mongoose.Types.ObjectId(), role: req.body.role || req.query.role };
      next();
    };
    app.get('/subcities/:id/departments', requireAdmin, authorize('admin'), getSubcityDepartments);
    app.post('/subcities/:id/departments', requireAdmin, authorize('admin'), createSubcityDepartment);
    app.put('/subcities/:id/departments/:deptId', requireAdmin, authorize('admin'), updateSubcityDepartment);
    app.delete('/subcities/:id/departments/:deptId', requireAdmin, authorize('admin'), deleteSubcityDepartment);
    return app;
  };

  let server;
  let baseUrl;

  before(async () => {
    server = buildApp().listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    if (server) await new Promise((resolve) => server.close(resolve));
  });

  const post = (url, body) =>
    fetch(`${baseUrl}${url}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  it('rejects non-admin roles with 403', async () => {
    const bole = await Subcity.create({ name: 'bole', status: 'Active' });
    for (const role of ['citizen', 'woreda', 'department', 'subcity_bole']) {
      const res = await post(`/subcities/${bole._id}/departments`, { name: `Test ${role}`, role });
      assert.equal(res.status, 403, `${role} must be rejected`);
    }
  });

  it('lists, creates, updates and deletes departments within a subcity', async () => {
    const bole = await Subcity.create({ name: 'bole', status: 'Active' });
    const yeka = await Subcity.create({ name: 'yeka', status: 'Active' });

    // Create one in each subcity with the same name.
    const created = await post(`/subcities/${bole._id}/departments`, { name: 'Water', role: 'admin' });
    assert.equal(created.status, 201);
    const boleWater = (await created.json()).department;
    assert.equal(boleWater.subcityName, 'bole');
    assert.equal(boleWater.subcityId, bole._id.toString());

    const createdYeka = await post(`/subcities/${yeka._id}/departments`, { name: 'Water', role: 'admin' });
    assert.equal(createdYeka.status, 201);

    // Duplicate in the same subcity → 409.
    const dup = await post(`/subcities/${bole._id}/departments`, { name: '  WATER ', role: 'admin' });
    assert.equal(dup.status, 409);
    assert.equal((await dup.json()).code, 'DEPARTMENT_NAME_EXISTS');

    // List is scoped: bole has exactly one department.
    const list = await fetch(`${baseUrl}/subcities/${bole._id}/departments?role=admin`);
    assert.equal(list.status, 200);
    const listed = (await list.json()).departments;
    assert.equal(listed.length, 1);
    assert.equal(listed[0].name, 'water');

    // Rename within the subcity, collision rejected.
    const renameOk = await fetch(`${baseUrl}/subcities/${bole._id}/departments/${boleWater._id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Water & Sanitation', role: 'admin' }),
    });
    assert.equal(renameOk.status, 200);

    // Delete removes only that subcity's department.
    const del = await fetch(`${baseUrl}/subcities/${bole._id}/departments/${boleWater._id}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'admin' }),
    });
    assert.equal(del.status, 200);
    assert.equal(await Department.countDocuments({ subcityId: bole._id }), 0);
    assert.equal(await Department.countDocuments({ subcityId: yeka._id }), 1);
  });

  it('404s for an unknown subcity', async () => {
    const res = await fetch(`${baseUrl}/subcities/${new mongoose.Types.ObjectId()}/departments?role=admin`);
    assert.equal(res.status, 404);
  });
});
