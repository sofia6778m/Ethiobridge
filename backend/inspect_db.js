require('dotenv').config({ path: 'C:/Users/p/Pictures/dagi/ethiobridge/backend/.env' });
const mongoose = require('mongoose');
(async () => {
  await mongoose.connect(process.env.MONGO_URI);
  const Woreda = require('C:/Users/p/Pictures/dagi/ethiobridge/backend/src/models/Woreda');
  const Subcity = require('C:/Users/p/Pictures/dagi/ethiobridge/backend/src/models/Subcity');
  const Department = require('C:/Users/p/Pictures/dagi/ethiobridge/backend/src/models/Department');
  const User = require('C:/Users/p/Pictures/dagi/ethiobridge/backend/src/models/User');
  console.log('Woredas:', JSON.stringify(await Woreda.find().select('name subcity departments').lean(), null, 2));
  console.log('Subcities:', JSON.stringify(await Subcity.find().select('name').lean(), null, 2));
  console.log('Departments:', JSON.stringify(await Department.find().select('name').lean(), null, 2));
  console.log('Users by role:', JSON.stringify(await User.aggregate([{ $group: { _id: '$role', count: { $sum: 1 } } }]), null, 2));
  console.log('dept users:', JSON.stringify(await User.find({ role: 'department' }).select('fullName woredaId department').lean(), null, 2));
  console.log('subcity users:', JSON.stringify(await User.find({ role: { $in: ['subcity_bole', 'subcity_yeka', 'subcity_lemmi_kura'] } }).select('fullName role subcity').lean(), null, 2));
  console.log('woreda users:', JSON.stringify(await User.find({ role: 'woreda' }).select('fullName woredaId woredaName').lean(), null, 2));
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
