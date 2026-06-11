require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function cleanDeadReminders() {
  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.collection('reminders');
  const now = new Date();

  const pastDue = await collection.deleteMany({ status: 'pending', remindAt: { $lt: now } });
  console.log(`Deleted ${pastDue.deletedCount} past-due pending reminders`);

  const stuckClaimed = await collection.updateMany({ status: 'claimed' }, { $set: { status: 'pending' } });
  console.log(`Reverted ${stuckClaimed.modifiedCount} stuck claimed reminders to pending`);

  const noStatus = await collection.deleteMany({ status: { $exists: false } });
  console.log(`Deleted ${noStatus.deletedCount} reminders with missing status`);

  await mongoose.disconnect();
}

cleanDeadReminders().catch(err => {
  console.error(err);
  process.exit(1);
});
