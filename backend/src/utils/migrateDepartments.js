/**
 * Department migration — makes departments subcity-owned.
 *
 *  1. Backfills `normalizedDepartmentName` on the Department collection
 *     (renamed from the legacy `normalizedName`).
 *  2. Moves legacy global departments into subcities: every Active subcity
 *     gets a copy of each existing department name. The original record (kept
 *     `_id` intact, preserving any plain-string references) is assigned to the
 *     first subcity; additional subcities receive newly created copies.
 *  3. De-duplicates departments per (subcityId, normalizedDepartmentName) —
 *     the same name may exist in different subcities but never twice in one.
 *  4. Aligns indexes with the schema: drops the legacy `name_1` /
 *     `unique_department_name_ci` / `unique_department_normalized_name` /
 *     `unique_subcity_department` indexes and creates the unique compound index
 *     `unique_subcity_woreda_department` on
 *     { subcityId, woredaId, normalizedDepartmentName }.
 *
 * Idempotent: safe to re-run.
 * Run: npm run migrate:departments
 *
 * The migrateDepartments() function is exported so the automated tests can
 * exercise the same logic against an in-memory database.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const mongoose = require('mongoose');
const Department = require('../models/Department');
const Subcity = require('../models/Subcity');
const { normalizeDepartmentName } = require('./departmentNames');

const migrateDepartments = async () => {
  const summary = { backfilled: 0, moved: 0, created: 0, groups: 0, removed: 0, subcities: 0 };

  // 1) Backfill normalizedDepartmentName for every record.
  const all = await Department.find().sort({ createdAt: 1, _id: 1 }).lean();
  for (const d of all) {
    const normalizedDepartmentName = normalizeDepartmentName(d.name);
    if (!d.normalizedDepartmentName || d.normalizedDepartmentName !== normalizedDepartmentName) {
      await Department.updateOne(
        { _id: d._id },
        { $set: { normalizedDepartmentName } }
      );
      summary.backfilled++;
    }
  }
  console.log(`Backfilled normalizedDepartmentName on ${summary.backfilled} record(s).`);

  // Name casing to use for any copies created below.
  const nameByNorm = new Map();
  for (const d of all) {
    const norm = normalizeDepartmentName(d.name);
    if (!nameByNorm.has(norm)) nameByNorm.set(norm, d.name);
  }

  // 2) Drop legacy indexes before creating/moving records. New documents only
  //    carry normalizedDepartmentName (the legacy normalizedName is absent),
  //    so the old unique index on normalizedName would reject the copies.
  const indexes = await Department.collection.indexes();
  const legacy = indexes.filter(
    (i) =>
      i.name === 'name_1' ||
      i.name === 'unique_department_name_ci' ||
      i.name === 'unique_department_normalized_name' ||
      i.name === 'unique_subcity_department' ||
      i.name === 'normalizedName_1'
  );
  for (const i of legacy) {
    await Department.collection.dropIndex(i.name);
    console.log(`Dropped legacy index: ${i.name}`);
  }

  // 3) Give every Active subcity its own copy of each department name.
  const subcities = await Subcity.find({ status: 'Active' }).sort({ createdAt: 1, _id: 1 }).lean();
  summary.subcities = subcities.length;

  for (const sc of subcities) {
    for (const [norm, originalName] of nameByNorm) {
      const existing = await Department.findOne({ subcityId: sc._id, normalizedDepartmentName: norm }).lean();
      if (existing) continue;

      // Reuse a legacy/global record first so the original _id survives.
      const global = await Department.findOne({ subcityId: null, normalizedDepartmentName: norm })
        .sort({ createdAt: 1, _id: 1 })
        .lean();
      if (global) {
        await Department.updateOne(
          { _id: global._id },
          { $set: { subcityId: sc._id, subcityName: sc.name } }
        );
        summary.moved++;
        console.log(`  "${norm}" → moved ${global._id} to ${sc.name}`);
      } else {
        await Department.create({
          name: originalName,
          normalizedDepartmentName: norm,
          subcityId: sc._id,
          subcityName: sc.name,
        });
        summary.created++;
        console.log(`  "${norm}" → created copy in ${sc.name}`);
      }
    }
  }
  console.log(`Assigned departments to ${summary.subcities} subcit(ies): ${summary.moved} moved, ${summary.created} created.`);

  // 4) De-duplicate per (subcityId, normalizedDepartmentName). Prefer keeping
  //    an Active record, then the earliest created. References from complaints,
  //    reports, users etc. are plain strings, so deleting duplicate documents
  //    never orphans anything.
  const groups = await Department.aggregate([
    {
      $group: {
        _id: { sc: '$subcityId', norm: '$normalizedDepartmentName' },
        ids: { $push: '$_id' },
        statuses: { $push: '$status' },
        createdAt: { $push: '$createdAt' },
      },
    },
    { $match: { $expr: { $gt: [{ $size: '$ids' }, 1] } } },
  ]);

  for (const group of groups) {
    const members = group.ids
      .map((id, i) => ({ id, status: group.statuses[i], createdAt: group.createdAt[i] }))
      .sort((a, b) => {
        const aActive = a.status === 'Active' ? 0 : 1;
        const bActive = b.status === 'Active' ? 0 : 1;
        if (aActive !== bActive) return aActive - bActive;
        return new Date(a.createdAt || 0) - new Date(b.createdAt || 0);
      });
    const dupIds = members.slice(1).map((m) => m.id);
    const res = await Department.deleteMany({ _id: { $in: dupIds } });
    summary.groups++;
    summary.removed += res.deletedCount;
    console.log(`  "${group._id.norm}" [${group._id.sc || 'global'}] → keeping ${members[0].id}, removed ${res.deletedCount} duplicate(s).`);
  }
  console.log(`Removed ${summary.removed} duplicate record(s).`);

  // 5) Sync indexes so the unique compound index `unique_subcity_department`
  //    ({ subcityId, normalizedDepartmentName }) is created.
  await Department.syncIndexes();
  console.log('Indexes now:', (await Department.collection.indexes()).map((i) => i.name).join(', '));

  return summary;
};

if (require.main === module) {
  const main = async () => {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
    console.log('Connected to MongoDB');
    await migrateDepartments();
    const after = await Department.find().sort({ subcityName: 1, name: 1 }).select('name normalizedDepartmentName subcityName status');
    console.log(`\nCurrent departments (${after.length}):`);
    after.forEach((d) => console.log(`  - [${d.subcityName || 'global'}] ${d.name} [${d.normalizedDepartmentName}] | ${d.status}`));
    process.exit(0);
  };
  main().catch((err) => { console.error(err); process.exit(1); });
}

module.exports = { migrateDepartments };
