require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const run = async () => {
  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 6000 });
  const db = mongoose.connection.db;
  const col = db.collection('users');

  const distinct = await col.distinct('role');
  console.log('=== distinct roles ===');
  console.log(distinct.join('\n'));

  const counts = await col.aggregate([{ $group: { _id: '$role', n: { $sum: 1 } } }, { $sort: { _id: 1 } }]).toArray();
  console.log('\n=== role counts ===');
  for (const r of counts) console.log(`${r._id}: ${r.n}`);

  process.exit(0);
};

run().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
