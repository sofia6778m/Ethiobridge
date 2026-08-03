const mongoose = require('mongoose');

// Atomic sequence counters used to generate unique report IDs.
//
// Each document is keyed by a descriptive name (e.g. `infra_report:2026`) and
// holds a single monotonically increasing `seq` number. Callers advance the
// counter with `findOneAndUpdate({ _id }, { $inc: { seq: 1 } }, { upsert: true })`
// which MongoDB serializes per document, so concurrent writers (and concurrent
// server processes) can never observe the same sequence number — no E11000
// duplicate `reportId` collisions. Using `_id` as the key gives us a unique
// index for free.
const counterSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  seq: { type: Number, default: 0 },
});

module.exports = mongoose.model('Counter', counterSchema);
