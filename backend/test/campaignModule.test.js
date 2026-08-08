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

const del = (url, token) =>
  fetch(baseUrl + url, { method: 'DELETE', headers: token ? { Authorization: `Bearer ${token}` } : {} });

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
    assert.equal(donation.status, 'verified');
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

  it('guests and any logged-in role can donate; money raises the total immediately', async () => {
    const subcity = await Subcity.create({ name: 'Bole' });
    const subcityAdmin = await makeUser({ role: 'subcity_admin', subcity: 'Bole', subcityId: subcity._id });
    const systemAdmin = await makeUser({ role: 'admin' });

    let res = await post('/api/campaigns', {
      title: 'Guest appeal', description: 'Help the community', campaignLevel: 'subcity', goalAmount: 50000,
    }, signToken(subcityAdmin));
    const { campaign } = (await res.json()).data;
    await post(`/api/campaigns/${campaign._id}/submit`, {}, signToken(subcityAdmin));
    await post(`/api/campaigns/${campaign._id}/approve`, {}, signToken(systemAdmin));

    // A logged-out guest can donate without a token; donor info is saved and
    // the raised total updates immediately.
    res = await post('/api/donations', {
      campaignId: campaign._id, type: 'money', amount: 700, paymentMethod: 'telebirr',
      donorName: 'Guest Donor', donorPhone: '0911223344',
    });
    assert.equal(res.status, 201);
    const guestDonation = (await res.json()).data.donation;
    assert.equal(guestDonation.status, 'verified');
    assert.equal(guestDonation.donorName, 'Guest Donor');
    assert.equal(guestDonation.donorPhone, '0911223344');
    assert.equal(guestDonation.donor, null);
    let updated = await Campaign.findById(campaign._id);
    assert.equal(updated.raisedAmount, 700);

    // A subcity admin (not a citizen role) can donate too.
    res = await post('/api/donations', {
      campaignId: campaign._id, type: 'money', amount: 300, paymentMethod: 'chapa',
      donorName: 'Admin Donor', donorPhone: '0922223333',
    }, signToken(subcityAdmin));
    assert.equal(res.status, 201);
    updated = await Campaign.findById(campaign._id);
    assert.equal(updated.raisedAmount, 1000);

    // Anonymous guest donations store a masked identity.
    res = await post('/api/donations', {
      campaignId: campaign._id, type: 'money', amount: 50, paymentMethod: 'cbe_birr',
      donorName: 'Hidden', donorPhone: '0911556677', isAnonymous: true,
    });
    assert.equal(res.status, 201);
    const anon = (await res.json()).data.donation;
    assert.equal(anon.isAnonymous, true);
    assert.equal(anon.donorName, 'Anonymous');
    assert.equal(anon.donorPhone, '');

    // A non-anonymous guest must supply name + phone.
    res = await post('/api/donations', { campaignId: campaign._id, type: 'money', amount: 100, paymentMethod: 'telebirr' });
    assert.equal(res.status, 400);
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

  it('lets the owning manager delete a campaign only from dead statuses (ownership enforced)', async () => {
    const subcity = await Subcity.create({ name: 'Bole' });
    const woreda = await Woreda.create({ name: 'Woreda 01', subcity: 'Bole', subcityId: subcity._id });
    const woredaAdmin = await makeUser({
      role: 'woreda_admin', subcity: 'Bole', subcityId: subcity._id,
      woredaId: woreda._id, woredaName: 'Woreda 01',
    });
    const otherWoredaAdmin = await makeUser({ role: 'woreda_admin', subcity: 'Yeka', subcityId: undefined, woredaName: 'Woreda 02' });

    let res = await post('/api/campaigns', {
      title: 'Temporary drive', description: 'To be removed', campaignLevel: 'woreda', goalAmount: 10000,
    }, signToken(woredaAdmin));
    assert.equal(res.status, 201);
    const { campaign } = (await res.json()).data;

    // A woreda admin from another woreda cannot delete it.
    res = await del(`/api/campaigns/${campaign._id}`, signToken(otherWoredaAdmin));
    assert.equal(res.status, 403);

    // A DRAFT campaign with zero donations can be deleted by its owner.
    res = await del(`/api/campaigns/${campaign._id}`, signToken(woredaAdmin));
    assert.equal(res.status, 200);
    assert.equal(await Campaign.countDocuments({ _id: campaign._id }), 0);
  });

  it('blocks deletion of a PENDING campaign even by its owner', async () => {
    const subcity = await Subcity.create({ name: 'Bole' });
    const woreda = await Woreda.create({ name: 'Woreda 01', subcity: 'Bole', subcityId: subcity._id });
    const woredaAdmin = await makeUser({
      role: 'woreda_admin', subcity: 'Bole', subcityId: subcity._id,
      woredaId: woreda._id, woredaName: 'Woreda 01',
    });

    let res = await post('/api/campaigns', {
      title: 'In review', description: 'Awaiting approval', campaignLevel: 'woreda', goalAmount: 10000,
    }, signToken(woredaAdmin));
    const { campaign } = (await res.json()).data;
    await post(`/api/campaigns/${campaign._id}/submit`, {}, signToken(woredaAdmin));
    assert.equal((await Campaign.findById(campaign._id)).status, 'pending');

    res = await del(`/api/campaigns/${campaign._id}`, signToken(woredaAdmin));
    assert.equal(res.status, 403);
    const body = await res.json();
    assert.match(body.message, /pending/i);
    assert.equal(await Campaign.countDocuments({ _id: campaign._id }), 1);
  });

  it('blocks deletion of an active campaign and of any campaign with donations', async () => {
    const subcity = await Subcity.create({ name: 'Bole' });
    const subcityAdmin = await makeUser({ role: 'subcity_admin', subcity: 'Bole', subcityId: subcity._id });
    const systemAdmin = await makeUser({ role: 'admin' });
    const citizen = await makeUser({ role: 'citizen', phone: '0911111112' });

    let res = await post('/api/campaigns', {
      title: 'Live campaign', description: 'Cannot be deleted', campaignLevel: 'subcity', goalAmount: 50000,
    }, signToken(subcityAdmin));
    const { campaign } = (await res.json()).data;
    await post(`/api/campaigns/${campaign._id}/submit`, {}, signToken(subcityAdmin));
    await post(`/api/campaigns/${campaign._id}/approve`, {}, signToken(systemAdmin));
    assert.equal((await Campaign.findById(campaign._id)).status, 'active');

    // Active campaigns are protected even for the system admin.
    res = await del(`/api/campaigns/${campaign._id}`, signToken(systemAdmin));
    assert.equal(res.status, 403);
    assert.match((await res.json()).message, /active or has donation records/i);
    assert.equal(await Campaign.countDocuments({ _id: campaign._id }), 1);

    // Add a donation while the campaign is active, then suspend it.
    res = await post('/api/donations', { campaignId: campaign._id, type: 'money', amount: 500, paymentMethod: 'telebirr' }, signToken(citizen));
    assert.equal(res.status, 201);
    const { donation } = (await res.json()).data;

    await post(`/api/campaigns/${campaign._id}/suspend`, { reason: 'Internal review' }, signToken(systemAdmin));
    assert.equal((await Campaign.findById(campaign._id)).status, 'suspended');

    // Even a suspended campaign is protected once it has any donation record.
    res = await del(`/api/campaigns/${campaign._id}`, signToken(systemAdmin));
    assert.equal(res.status, 403);
    assert.match((await res.json()).message, /donation records/i);
    assert.equal(await Campaign.countDocuments({ _id: campaign._id }), 1);
    assert.equal(await Donation.countDocuments({ _id: donation._id }), 1);
  });

  it('deletes a suspended or cancelled campaign immediately when it has zero donations', async () => {
    const subcity = await Subcity.create({ name: 'Bole' });
    const subcityAdmin = await makeUser({ role: 'subcity_admin', subcity: 'Bole', subcityId: subcity._id });
    const systemAdmin = await makeUser({ role: 'admin' });

    let res = await post('/api/campaigns', {
      title: 'Suspend me', description: 'To be suspended then removed', campaignLevel: 'subcity', goalAmount: 20000,
    }, signToken(subcityAdmin));
    let { campaign } = (await res.json()).data;
    await post(`/api/campaigns/${campaign._id}/submit`, {}, signToken(subcityAdmin));
    await post(`/api/campaigns/${campaign._id}/approve`, {}, signToken(systemAdmin));
    await post(`/api/campaigns/${campaign._id}/suspend`, { reason: 'Ended early' }, signToken(systemAdmin));

    res = await del(`/api/campaigns/${campaign._id}`, signToken(systemAdmin));
    assert.equal(res.status, 200);
    assert.equal(await Campaign.countDocuments({ _id: campaign._id }), 0);

    res = await post('/api/campaigns', {
      title: 'Cancel me', description: 'To be cancelled then removed', campaignLevel: 'subcity', goalAmount: 20000,
    }, signToken(subcityAdmin));
    campaign = (await res.json()).data.campaign;

    res = await del(`/api/campaigns/${campaign._id}`, signToken(subcityAdmin));
    assert.equal(res.status, 200);
    assert.equal(await Campaign.countDocuments({ _id: campaign._id }), 0);
  });

  it('includes donationCount in the manage list for delete decisions', async () => {
    const subcity = await Subcity.create({ name: 'Bole' });
    const subcityAdmin = await makeUser({ role: 'subcity_admin', subcity: 'Bole', subcityId: subcity._id });
    const systemAdmin = await makeUser({ role: 'admin' });
    const citizen = await makeUser({ role: 'citizen', phone: '0911111113' });

    let res = await post('/api/campaigns', {
      title: 'Empty one', description: 'No donations', campaignLevel: 'subcity', goalAmount: 20000,
    }, signToken(subcityAdmin));
    const { campaign } = (await res.json()).data;
    await post(`/api/campaigns/${campaign._id}/submit`, {}, signToken(subcityAdmin));
    await post(`/api/campaigns/${campaign._id}/approve`, {}, signToken(systemAdmin));

    res = await post('/api/donations', { campaignId: campaign._id, type: 'money', amount: 300, paymentMethod: 'telebirr' }, signToken(citizen));
    const { donation } = (await res.json()).data;

    res = await get('/api/campaigns/manage', signToken(subcityAdmin));
    assert.equal(res.status, 200);
    const list = (await res.json()).data.campaigns;
    const found = list.find((c) => c._id === campaign._id);
    assert.ok(found);
    assert.equal(found.donationCount, 1);
    assert.ok(list.some((c) => typeof c.donationCount === 'number'));
    assert.equal(await Donation.countDocuments({ _id: donation._id }), 1);
  });

  it('subcity admin cannot delete a campaign outside their subcity', async () => {
    const bole = await Subcity.create({ name: 'Bole' });
    const yeka = await Subcity.create({ name: 'Yeka' });
    const boleAdmin = await makeUser({ role: 'subcity_admin', subcity: 'Bole', subcityId: bole._id });
    const yekaAdmin = await makeUser({ role: 'subcity_admin', subcity: 'Yeka', subcityId: yeka._id });

    let res = await post('/api/campaigns', {
      title: 'Bole initiative', description: 'Only for Bole', campaignLevel: 'subcity', goalAmount: 20000,
    }, signToken(boleAdmin));
    const { campaign } = (await res.json()).data;

    res = await del(`/api/campaigns/${campaign._id}`, signToken(yekaAdmin));
    assert.equal(res.status, 403);
    assert.equal(await Campaign.countDocuments({ _id: campaign._id }), 1);

    res = await del(`/api/campaigns/${campaign._id}`, signToken(boleAdmin));
    assert.equal(res.status, 200);
    assert.equal(await Campaign.countDocuments({ _id: campaign._id }), 0);
  });

  it('hides expired campaigns from public endpoints but keeps them in manage', async () => {
    const subcity = await Subcity.create({ name: 'Bole' });
    const subcityAdmin = await makeUser({ role: 'subcity_admin', subcity: 'Bole', subcityId: subcity._id });
    const systemAdmin = await makeUser({ role: 'admin' });

    let res = await post('/api/campaigns', {
      title: 'Expired drive', description: 'Past its end date',
      campaignLevel: 'subcity', goalAmount: 40000, endDate: '2020-01-01',
    }, signToken(subcityAdmin));
    assert.equal(res.status, 201);
    const { campaign } = (await res.json()).data;
    await post(`/api/campaigns/${campaign._id}/submit`, {}, signToken(subcityAdmin));
    await post(`/api/campaigns/${campaign._id}/approve`, {}, signToken(systemAdmin));
    assert.equal((await Campaign.findById(campaign._id)).status, 'active');

    res = await get('/api/campaigns/');
    assert.ok(!(await res.json()).data.campaigns.some((c) => c._id === campaign._id));

    res = await get('/api/campaigns/featured');
    assert.ok(!(await res.json()).data.campaigns.some((c) => c._id === campaign._id));

    res = await get(`/api/campaigns/${campaign._id}`);
    assert.equal(res.status, 404);

    res = await get('/api/campaigns/manage', signToken(systemAdmin));
    assert.ok((await res.json()).data.campaigns.some((c) => c._id === campaign._id));
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
