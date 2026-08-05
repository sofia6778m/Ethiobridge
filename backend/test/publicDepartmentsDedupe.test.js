/**
 * Regression test for the public department dropdown dedupe.
 *
 * Department names are unique per subcity+woreda, not globally, so the same
 * name (e.g. "Electricity") can exist once for every subcity. GET
 * /api/public/departments must collapse those duplicates so the public
 * complaint form dropdown lists each department exactly once, while still
 * respecting the optional ?subcity= scope.
 *
 * Uses mongodb-memory-server with the system mongod binary when available.
 */
const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const express = require('express');
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
const Department = require('../src/models/Department');
const publicRoutes = require('../src/routes/publicRoutes');

let mongod;
let server;
let baseUrl;

const mkSubcity = (name) =>
  Subcity.create({ name, description: `Description for ${name}` });

const mkDepartment = (name, subcity) =>
  Department.create({ name, subcityId: subcity._id, subcityName: subcity.name });

const getDepartments = async (subcity) => {
  const query = subcity ? `?subcity=${encodeURIComponent(subcity)}` : '';
  const res = await fetch(`${baseUrl}/api/public/departments${query}`);
  const body = await res.json();
  return { status: res.status, body };
};

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  await Subcity.init();
  await Department.init();

  const app = express();
  app.use('/api/public', publicRoutes);
  server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  if (server) await new Promise((resolve) => server.close(resolve));
  await mongoose.disconnect();
  if (mongod) await mongod.stop();
});

beforeEach(async () => {
  await Subcity.deleteMany({});
  await Department.deleteMany({});
});

describe('GET /api/public/departments', () => {
  it('dedupes department names that repeat across subcities', async () => {
    const bole = await mkSubcity('Bole');
    const yeka = await mkSubcity('Yeka');
    const koye = await mkSubcity('Koye');

    // The same three names exist in every subcity — this is the regression
    // case that used to render 9 rows in the dropdown.
    for (const sc of [bole, yeka, koye]) {
      await mkDepartment('Electricity', sc);
      await mkDepartment('Water', sc);
    }
    // "Road" only exists in Bole; a differently-cased "ROAD" exists in Yeka
    // to prove the dedupe is case-insensitive.
    await mkDepartment('Road', bole);
    await mkDepartment('ROAD', yeka);
    // Whitespace must be trimmed before comparing. Lives in Koye only — the
    // model's own unique index forbids a "Water" and "  Water  " in the same
    // subcity because both normalize to the same key.
    await Subcity.create({ name: 'Kirkos', description: 'Kirkos' });
    const kirkos = await Subcity.findOne({ name: 'Kirkos' });
    await mkDepartment('  Water  ', kirkos);

    const { status, body } = await getDepartments();
    assert.equal(status, 200);
    assert.equal(body.success, true);
    assert.equal(body.departments.length, 3);
    assert.deepEqual(body.departments.map((n) => n.toLowerCase()), ['electricity', 'road', 'water']);
  });

  it('includes every unique department exactly once', async () => {
    const bole = await mkSubcity('Bole');
    const yeka = await mkSubcity('Yeka');
    const koye = await mkSubcity('Koye');

    await mkDepartment('Electricity', bole);
    await mkDepartment('Health', bole);
    await mkDepartment('Road', bole);
    await mkDepartment('Water', bole);
    await mkDepartment('Education', yeka);
    await mkDepartment('Revenue', koye);

    const { status, body } = await getDepartments();
    assert.equal(status, 200);
    const names = body.departments.map((n) => n.toLowerCase());
    assert.deepEqual(names, ['education', 'electricity', 'health', 'revenue', 'road', 'water']);
    assert.equal(new Set(names).size, names.length, 'no duplicate names returned');
  });

  it('excludes inactive departments from the dropdown', async () => {
    const bole = await mkSubcity('Bole');
    await mkDepartment('Electricity', bole);
    await Department.create({
      name: 'Retired',
      subcityId: bole._id,
      subcityName: 'Bole',
      status: 'Inactive',
    });

    const { status, body } = await getDepartments();
    assert.equal(status, 200);
    assert.deepEqual(body.departments.map((n) => n.toLowerCase()), ['electricity']);
  });

  it('scopes to a single subcity via ?subcity= and still dedupes', async () => {
    const bole = await mkSubcity('Bole');
    const yeka = await mkSubcity('Yeka');
    const koye = await mkSubcity('Koye');

    for (const sc of [bole, yeka, koye]) {
      await mkDepartment('Electricity', sc);
      await mkDepartment('Water', sc);
    }
    await mkDepartment('Road', bole);
    await mkDepartment('Health', yeka);
    await mkDepartment('Revenue', koye);

    const yekaResult = await getDepartments('yeka');
    assert.equal(yekaResult.status, 200);
    assert.deepEqual(
      yekaResult.body.departments.map((n) => n.toLowerCase()),
      ['electricity', 'health', 'water']
    );

    const koyeResult = await getDepartments('koye');
    assert.equal(koyeResult.status, 200);
    assert.deepEqual(
      koyeResult.body.departments.map((n) => n.toLowerCase()),
      ['electricity', 'revenue', 'water']
    );
  });

  it('tolerates underscore/space spelling variants of the subcity name', async () => {
    const lemmi = await mkSubcity('Lemmi Kura');
    await mkDepartment('Electricity', lemmi);

    const { status, body } = await getDepartments('LEMMI_KURA');
    assert.equal(status, 200);
    assert.deepEqual(body.departments.map((n) => n.toLowerCase()), ['electricity']);
  });

  it('returns 404 for an unknown subcity', async () => {
    await mkSubcity('Bole');
    await mkDepartment('Electricity', (await Subcity.findOne({ name: 'Bole' })));

    const { status } = await getDepartments('nowhere');
    assert.equal(status, 404);
  });
});
