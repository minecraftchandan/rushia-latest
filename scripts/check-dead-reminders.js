require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function checkDeadReminders() {
  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.collection('reminders');
  const now = new Date();

  const [pastDuePending, stuckClaimed, noStatus] = await Promise.all([
    // Pending but remindAt already passed
    collection.find({ status: 'pending', remindAt: { $lt: now } }).toArray(),
    // Stuck in claimed (never marked sent)
    collection.find({ status: 'claimed' }).toArray(),
    // Missing status field entirely
    collection.find({ status: { $exists: false } }).toArray(),
  ]);

  console.log(`\n=== Dead Reminders Report ===`);
  console.log(`Past-due pending:  ${pastDuePending.length}`);
  pastDuePending.forEach(r => console.log(`  [${r.type}] userId:${r.userId} remindAt:${r.remindAt}`));

  console.log(`Stuck claimed:     ${stuckClaimed.length}`);
  stuckClaimed.forEach(r => console.log(`  [${r.type}] userId:${r.userId} remindAt:${r.remindAt}`));

  console.log(`Missing status:    ${noStatus.length}`);
  noStatus.forEach(r => console.log(`  [${r.type}] userId:${r.userId} remindAt:${r.remindAt}`));

  console.log(`\nTotal dead: ${pastDuePending.length + stuckClaimed.length + noStatus.length}`);

  await mongoose.disconnect();
}

checkDeadReminders().catch(err => {
  console.error(err);
  process.exit(1);
});
