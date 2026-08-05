/**
 * backfillReportType.js
 * ─────────────────────
 * One-time migration that stamps the report_type discriminator onto historical
 * records that predate it:
 *
 *   InfrastructureReport → report_type = 'infrastructure'
 *   PublicComplaint      → report_type = 'public_complaint'
 *
 * Records created after the discriminator was added already carry it; only
 * documents where the field is missing/null are touched, so the migration is
 * idempotent.
 *
 * It also backfills subcityId / departmentId on infrastructure reports that
 * already have a woredaId but no subcityId / departmentId (resolved from the
 * Woreda and Department collections), mirroring the submission-time behaviour.
 *
 * Run (from backend/):
 *   npm run migrate:report-type
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');
const InfrastructureReport = require('../src/models/InfrastructureReport');
const PublicComplaint = require('../src/models/PublicComplaint');
const Woreda = require('../src/models/Woreda');
const Department = require('../src/models/Department');
const { normalizeDepartmentName } = require('../src/utils/departmentNames');

const backfill = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // ── report_type ────────────────────────────────────────────────────────────
  const infraMissing = await InfrastructureReport.countDocuments({ report_type: { $in: [null, undefined] } });
  const complaintMissing = await PublicComplaint.countDocuments({ report_type: { $in: [null, undefined] } });

  if (infraMissing) {
    const r = await InfrastructureReport.updateMany(
      { report_type: { $in: [null, undefined] } },
      { $set: { report_type: 'infrastructure' } }
    );
    console.log(`✓ InfrastructureReport: stamped report_type='infrastructure' on ${r.modifiedCount} record(s)`);
  } else {
    console.log('✓ InfrastructureReport: no records missing report_type');
  }

  if (complaintMissing) {
    const r = await PublicComplaint.updateMany(
      { report_type: { $in: [null, undefined] } },
      { $set: { report_type: 'public_complaint' } }
    );
    console.log(`✓ PublicComplaint: stamped report_type='public_complaint' on ${r.modifiedCount} record(s)`);
  } else {
    console.log('✓ PublicComplaint: no records missing report_type');
  }

  // ── subcityId / departmentId on infrastructure reports ─────────────────────
  const scopeMissing = await InfrastructureReport.countDocuments({
    woredaId: { $ne: null },
    $or: [{ subcityId: { $in: [null, undefined] } }, { departmentId: { $in: [null, undefined] } }],
  });
  console.log(`Found ${scopeMissing} infrastructure report(s) missing subcityId/departmentId`);

  const woredas = await Woreda.find({}).select('_id subcity subcityId departments').lean();
  const woredaById = new Map(woredas.map((w) => [String(w._id), w]));

  const depts = await Department.find({ status: 'Active', subcityId: { $ne: null } })
    .select('_id subcityId woredaId normalizedDepartmentName name')
    .lean();
  const deptByKey = new Map();
  for (const d of depts) {
    const wkey = d.woredaId ? String(d.woredaId) : 'GLOBAL';
    deptByKey.set(`${String(d.subcityId)}|${wkey}|${d.normalizedDepartmentName}`, d);
    deptByKey.set(`${String(d.subcityId)}|${wkey}|${String(d.name || '').trim().toLowerCase()}`, d);
  }

  const reports = await InfrastructureReport.find({
    woredaId: { $ne: null },
    $or: [{ subcityId: { $in: [null, undefined] } }, { departmentId: { $in: [null, undefined] } }],
  })
    .select('_id reportId woredaId department subcity')
    .lean();

  let scopeFixed = 0;
  for (const report of reports) {
    const woredaDoc = woredaById.get(String(report.woredaId));
    const set = {};
    if (!report.subcityId && woredaDoc && woredaDoc.subcityId) {
      set.subcityId = woredaDoc.subcityId;
    }
    if (!report.departmentId && woredaDoc && woredaDoc.subcityId && report.department) {
      const normalized = normalizeDepartmentName(report.department);
      const woredaKey = `${String(woredaDoc.subcityId)}|${String(report.woredaId)}|${normalized}`;
      const globalKey = `${String(woredaDoc.subcityId)}|GLOBAL|${normalized}`;
      const deptRef = deptByKey.get(woredaKey) || deptByKey.get(globalKey);
      if (deptRef) set.departmentId = deptRef._id;
    }
    if (Object.keys(set).length) {
      await InfrastructureReport.updateOne({ _id: report._id }, { $set: set });
      scopeFixed += 1;
    }
  }
  if (scopeFixed) {
    console.log(`✓ InfrastructureReport: backfilled scope refs on ${scopeFixed} record(s)`);
  } else {
    console.log('✓ InfrastructureReport: no scope refs to backfill');
  }

  console.log('\nBackfill complete.');
  process.exit(0);
};

backfill().catch((err) => {
  console.error('Backfill failed:', err.message);
  process.exit(1);
});
