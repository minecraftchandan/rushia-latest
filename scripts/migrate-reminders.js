require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to MongoDB');

  const collection = mongoose.connection.collection('reminders');

  const pending = await collection.updateMany(
    { status: { $exists: false }, sent: false },
    { $set: { status: 'pending' }, $unset: { sent: '' } }
  );
  console.log(`Migrated ${pending.modifiedCount} pending reminders (sent:false → status:'pending')`);

  const sent = await collection.updateMany(
    { status: { $exists: false }, sent: true },
    { $set: { status: 'sent' }, $unset: { sent: '' } }
  );
  console.log(`Migrated ${sent.modifiedCount} sent reminders (sent:true → status:'sent')`);

  console.log('Migration complete.');
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
