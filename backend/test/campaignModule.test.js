const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const http = require('http');
const express = require('express');
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');

// mongod binary auto-discovery (same pattern as the other in-repo tests).
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

process.env.JWT_SECRET = 'campaign-module-test-secret';

const { MongoMemoryServer } = require('mongodb-memory-server');

const User = require('../src/models/User');
const Subcity = require('../src/models/Subcity');
const Woreda = require('../src/models/Woreda');
const Campaign = require('../src/models/Campaign');
const Donation = require('../src/models/Donation');
const SavedCampaign = require('../src/models/SavedCampaign');

const campaignRoutes = require('../src/routes/campaignRoutes');
const donationRoutes = require('../src/routes/donationRoutes');

let mongod;
let server;
let baseUrl;

const signToken = (user) =>
  jwt.sign({ id: user._id, role: user.role }, process.env.JWT_SECRET, { expiresIn: '1h' });

let emailCounter = 0;
const makeUser = async (overrides = {}) =>
  User.create({
    fullName: 'Test Person',
    email: `t${Date.now()}_${emailCounter += 1}@test.local`,
    password: 'password123',
    role: 'citizen',
    ...overrides,
  });

const get = (url, token) =>
  fetch(baseUrl + url, { headers: token ? { Authorization: `Bearer ${token}` } : {} });

const post = (url, body, token) =>
  fetch(baseUrl + url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });

before(async () => {
  mongod = await MongoMemoryServer.create({ version: '8.3' });
  await mongoose.connect(mongod.getUri(), { serverSelectionTimeoutMS: 4000 });
  await Subcity.init();
  await Woreda.init();
  await User.init();
  await Campaign.init();
  await Donation.init();
  await SavedCampaign.init();

  const app = express();
  app.use(express.json());
  app.use('/api/campaigns', campaignRoutes);
  app.use('/api/donations', donationRoutes);

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
  await Promise.all([
    Campaign.deleteMany({}),
    Donation.deleteMany({}),
    SavedCampaign.deleteMany({}),
    User.deleteMany({}),
    Subcity.deleteMany({}),
    Woreda.deleteMany({}),
  ]);
});

describe('Campaign module', () => {
  it('runs the woreda campaign approval workflow (woreda admin → subcity admin)', async () => {
    const subcity = await Subcity.create({ name: 'Bole' });
    const woreda = await Woreda.create({ name: 'Woreda 01', subcity: 'Bole', subcityId: subcity._id });
    const woredaAdmin = await makeUser({
      role: 'woreda_admin', subcity: 'Bole', subcityId: subcity._id,
      woredaId: woreda._id, woredaName: 'Woreda 01',
    });
    const subcityAdmin = await makeUser({ role: 'subcity_admin', subcity: 'Bole', subcityId: subcity._id });

    let res = await post('/api/campaigns', {
      title: 'Clinic rebuild', description: 'Rebuild the local clinic',
      campaignLevel: 'woreda', category: 'health', goalAmount: 100000,
    }, signToken(woredaAdmin));
    assert.equal(res.status, 201);
    const { campaign } = (await res.json()).data;
    assert.equal(campaign.status, 'draft');
    assert.equal(campaign.campaignLevel, 'woreda');
    assert.equal(campaign.woredaId, woreda._id.toString());

    res = await post(`/api/campaigns/${campaign._id}/submit`, {}, signToken(woredaAdmin));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.campaign.status, 'pending');

    res = await post(`/api/campaigns/${campaign._id}/approve`, {}, signToken(subcityAdmin));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.campaign.status, 'active');
  });

  it('subcity campaigns can only be approved by the system admin', async () => {
    const subcity = await Subcity.create({ name: 'Yeka' });
    const subcityAdmin = await makeUser({ role: 'subcity_admin', subcity: 'Yeka', subcityId: subcity._id });
    const systemAdmin = await makeUser({ role: 'admin' });
    const woredaAdmin = await makeUser({ role: 'woreda_admin', subcity: 'Yeka', subcityId: subcity._id });

    let res = await post('/api/campaigns', {
      title: 'School supplies', description: 'Supplies for the school',
      campaignLevel: 'subcity', goalAmount: 50000,
    }, signToken(subcityAdmin));
    assert.equal(res.status, 201);
    const { campaign } = (await res.json()).data;

    res = await post(`/api/campaigns/${campaign._id}/submit`, {}, signToken(subcityAdmin));
    assert.equal(res.status, 200);

    res = await post(`/api/campaigns/${campaign._id}/approve`, {}, signToken(woredaAdmin));
    assert.equal(res.status, 403);

    res = await post(`/api/campaigns/${campaign._id}/approve`, {}, signToken(systemAdmin));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.campaign.status, 'active');
  });

  it('rejects pending campaigns with a reason and allows resubmission', async () => {
    const subcity = await Subcity.create({ name: 'Bole' });
    const woreda = await Woreda.create({ name: 'Woreda 01', subcity: 'Bole', subcityId: subcity._id });
    const woredaAdmin = await makeUser({
      role: 'woreda_admin', subcity: 'Bole', subcityId: subcity._id,
      woredaId: woreda._id, woredaName: 'Woreda 01',
    });
    const subcityAdmin = await makeUser({ role: 'subcity_admin', subcity: 'Bole', subcityId: subcity._id });

    let res = await post('/api/campaigns', {
      title: 'Road repair', description: 'Fix the potholes', campaignLevel: 'woreda', goalAmount: 30000,
    }, signToken(woredaAdmin));
    const { campaign } = (await res.json()).data;
    await post(`/api/campaigns/${campaign._id}/submit`, {}, signToken(woredaAdmin));

    res = await post(`/api/campaigns/${campaign._id}/reject`, { reason: 'Incomplete budget detail' }, signToken(subcityAdmin));
    assert.equal(res.status, 200);
    let updated = (await res.json()).data.campaign;
    assert.equal(updated.status, 'rejected');
    assert.equal(updated.rejectReason, 'Incomplete budget detail');

    res = await post(`/api/campaigns/${campaign._id}/submit`, {}, signToken(woredaAdmin));
    assert.equal(res.status, 200);
    updated = (await res.json()).data.campaign;
    assert.equal(updated.status, 'pending');
    assert.equal(updated.rejectReason, '');
  });

  it('managers can upload proofs and the approver can verify them', async () => {
    const subcity = await Subcity.create({ name: 'Bole' });
    const woreda = await Woreda.create({ name: 'Woreda 01', subcity: 'Bole', subcityId: subcity._id });
    const woredaAdmin = await makeUser({
      role: 'woreda_admin', subcity: 'Bole', subcityId: subcity._id,
      woredaId: woreda._id, woredaName: 'Woreda 01',
    });
    const subcityAdmin = await makeUser({ role: 'subcity_admin', subcity: 'Bole', subcityId: subcity._id });

    let res = await post('/api/campaigns', {
      title: 'Well drilling', description: 'Drill a community well', campaignLevel: 'woreda', goalAmount: 80000,
    }, signToken(woredaAdmin));
    const { campaign } = (await res.json()).data;
    await post(`/api/campaigns/${campaign._id}/submit`, {}, signToken(woredaAdmin));

    res = await post(`/api/campaigns/${campaign._id}/proofs`, { title: 'Expense receipt', description: 'First disbursement receipt' }, signToken(woredaAdmin));
    assert.equal(res.status, 201);
    const { proof } = (await res.json()).data;
    assert.equal(proof.status, 'pending');

    res = await post(`/api/campaigns/${campaign._id}/proofs/${proof._id}/verify`, { note: 'Verified' }, signToken(subcityAdmin));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.proof.status, 'verified');

    res = await post(`/api/campaigns/${campaign._id}/approve`, {}, signToken(subcityAdmin));
    assert.equal(res.status, 200);
  });

  it('citizens can donate money and pledge items, and managers verify payments', async () => {
    const subcity = await Subcity.create({ name: 'Bole' });
    const subcityAdmin = await makeUser({ role: 'subcity_admin', subcity: 'Bole', subcityId: subcity._id });
    const systemAdmin = await makeUser({ role: 'admin' });
    const citizen = await makeUser({ role: 'citizen', fullName: 'Abebe', phone: '0911111111' });

    let res = await post('/api/campaigns', {
      title: 'Water project', description: 'Clean water for the kebele', campaignLevel: 'subcity', goalAmount: 200000,
    }, signToken(subcityAdmin));
    const { campaign } = (await res.json()).data;
    await post(`/api/campaigns/${campaign._id}/submit`, {}, signToken(subcityAdmin));
    await post(`/api/campaigns/${campaign._id}/approve`, {}, signToken(systemAdmin));

    res = await post('/api/donations', { campaignId: campaign._id, type: 'money', amount: 500, paymentMethod: 'telebirr' }, signToken(citizen));
    assert.equal(res.status, 201);
    let { donation } = (await res.json()).data;
    assert.ok(donation.donationRef && donation.donationRef.startsWith('DON-'));
    assert.equal(donation.status, 'pending');
    assert.equal(donation.isAnonymous, false);

    res = await post('/api/donations', { campaignId: campaign._id, type: 'in_kind', items: [{ name: 'Blankets', quantity: 10 }] }, signToken(citizen));
    assert.equal(res.status, 201);
    const pledge = (await res.json()).data.donation;
    assert.equal(pledge.type, 'in_kind');
    assert.equal(pledge.items.length, 1);

    res = await post(`/api/donations/${donation._id}/verify`, { status: 'verified', note: 'Paid via Telebirr' }, signToken(subcityAdmin));
    assert.equal(res.status, 200);

    const updated = await Campaign.findById(campaign._id);
    assert.equal(updated.raisedAmount, 500);

    res = await get('/api/donations/my', signToken(citizen));
    assert.equal(res.status, 200);
    const my = (await res.json()).data;
    assert.equal(my.donations.length, 2);
    assert.ok(my.donations.every((d) => d.campaign && d.campaign.title === 'Water project'));
  });

  it('public endpoints list active campaigns and citizens can save them', async () => {
    const subcity = await Subcity.create({ name: 'Bole' });
    const subcityAdmin = await makeUser({ role: 'subcity_admin', subcity: 'Bole', subcityId: subcity._id });
    const systemAdmin = await makeUser({ role: 'admin' });
    const citizen = await makeUser({ role: 'citizen' });

    let res = await post('/api/campaigns', {
      title: 'Community kitchen', description: 'Feed the needy', campaignLevel: 'subcity', goalAmount: 60000,
    }, signToken(subcityAdmin));
    const { campaign } = (await res.json()).data;
    await post(`/api/campaigns/${campaign._id}/submit`, {}, signToken(subcityAdmin));
    await post(`/api/campaigns/${campaign._id}/approve`, {}, signToken(systemAdmin));

    res = await get('/api/campaigns/');
    assert.equal(res.status, 200);
    const list = (await res.json()).data;
    assert.ok(list.campaigns.length >= 1);
    assert.equal(list.campaigns[0].status, 'active');

    res = await get('/api/campaigns/featured');
    assert.equal(res.status, 200);
    assert.ok((await res.json()).data.campaigns.length >= 1);

    res = await post(`/api/campaigns/${campaign._id}/save`, {}, signToken(citizen));
    assert.equal(res.status, 201);

    res = await get('/api/campaigns/my/saved', signToken(citizen));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).data.campaigns.length, 1);
  });

  it('screens campaigns for fraud on submission and lets admins review flags', async () => {
    const subcity = await Subcity.create({ name: 'Bole' });
    const subcityAdmin = await makeUser({ role: 'subcity_admin', subcity: 'Bole', subcityId: subcity._id });
    const systemAdmin = await makeUser({ role: 'admin' });
    const citizen = await makeUser({ role: 'citizen' });

    let res = await post('/api/campaigns', {
      title: 'Mega airport', description: 'Help us', campaignLevel: 'subcity', goalAmount: 6000000,
    }, signToken(subcityAdmin));
    assert.equal(res.status, 201);
    const { campaign } = (await res.json()).data;

    res = await post(`/api/campaigns/${campaign._id}/submit`, {}, signToken(subcityAdmin));
    assert.equal(res.status, 200);
    const submitted = (await res.json()).data.campaign;
    assert.ok(submitted.fraudScore >= 40, `expected fraud score >= 40, got ${submitted.fraudScore}`);
    assert.ok(submitted.fraudFlags.length >= 2);

    res = await post(`/api/campaigns/${campaign._id}/report`, { reason: 'Suspicious promoter' }, signToken(citizen));
    assert.equal(res.status, 201);

    res = await get('/api/campaigns/fraud-review', signToken(systemAdmin));
    assert.equal(res.status, 200);
    const review = (await res.json()).data;
    assert.ok(review.campaigns.some((c) => c._id === campaign._id));

    res = await get('/api/campaigns/fraud-review', signToken(citizen));
    assert.equal(res.status, 403);

    const flagged = await Campaign.findById(campaign._id);
    const autoFlag = flagged.fraudFlags.find((f) => f.source === 'auto');
    res = await post(`/api/campaigns/fraud-review/${autoFlag._id}`, { decision: 'dismissed', note: 'Legitimate' }, signToken(systemAdmin));
    assert.equal(res.status, 200);
    const reviewed = (await res.json()).data.campaign;
    assert.equal(
      reviewed.fraudFlags.find((f) => String(f._id) === String(autoFlag._id)).status,
      'dismissed'
    );

    res = await post(`/api/campaigns/${campaign._id}/approve`, {}, signToken(systemAdmin));
    assert.equal(res.status, 200);

    res = await get(`/api/campaigns/${campaign._id}`);
    assert.equal(res.status, 200);
    const pub = (await res.json()).data.campaign;
    assert.equal(pub.fraudScore, undefined);
    assert.equal(pub.fraudFlags, undefined);
  });
});
