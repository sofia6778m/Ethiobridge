const mongoose = require('mongoose');
async function main() {
  await mongoose.connect('mongodb://localhost:27017/zda');
  const admins = await mongoose.connection.db.collection('users').find({ 
    $or: [
      { role: 'admin' },
      { email: 'admin@zda.et' }
    ]
  }).toArray();
  console.log('Admin users in DB:');
  admins.forEach(u => console.log('  -', u.email, '| role:', u.role, '| fullName:', u.fullName));
  
  // Check for any systemAdmin role
  const systemAdmins = await mongoose.connection.db.collection('users').find({
    role: { $regex: /system/i }
  }).toArray();
  if (systemAdmins.length > 0) {
    console.log('\nUsers with "system" in role:');
    systemAdmins.forEach(u => console.log('  -', u.email, '| role:', u.role));
  } else {
    console.log('\nNo users with "system" in role found.');
  }
  await mongoose.disconnect();
}
main().catch(console.error);
