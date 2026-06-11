require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.collection('usernotificationsettings');

  const result = await collection.updateMany({}, {
    $set: {
      expedition: true,
      stamina: true,
      raid: true,
      drop: true,
      raidSpawnReminder: true
    }
  });

  console.log(`Updated ${result.modifiedCount} users`);
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
