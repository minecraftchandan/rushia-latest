require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function migrate() {
  await mongoose.connect(process.env.MONGODB_URI);
  const collection = mongoose.connection.collection('reminders');

  for (const name of ['idx_unique_type', 'idx_unique_expedition']) {
    try {
      await collection.dropIndex(name);
      console.log(`Dropped index: ${name}`);
    } catch (e) {
      console.log(`Index ${name} not found, skipping`);
    }
  }

  // Remove duplicate pending/claimed reminders, keep only the latest per userId+type
  for (const type of ['stamina', 'raid', 'raidSpawn', 'drop']) {
    const duplicates = await collection.aggregate([
      { $match: { type, status: { $in: ['pending', 'claimed'] } } },
      { $sort: { createdAt: -1 } },
      { $group: { _id: { userId: '$userId', type: '$type' }, ids: { $push: '$_id' } } },
      { $match: { 'ids.1': { $exists: true } } }
    ]).toArray();

    for (const group of duplicates) {
      const toDelete = group.ids.slice(1);
      await collection.deleteMany({ _id: { $in: toDelete } });
      console.log(`Removed ${toDelete.length} duplicate ${type} reminders for user ${group._id.userId}`);
    }
  }

  await collection.createIndex(
    { userId: 1, type: 1 },
    {
      unique: true,
      partialFilterExpression: { type: { $in: ['stamina', 'raid', 'raidSpawn', 'drop'] }, status: { $in: ['pending', 'claimed'] } },
      name: 'idx_unique_type'
    }
  );
  console.log('Created idx_unique_type');

  await collection.createIndex(
    { userId: 1, cardId: 1, type: 1 },
    {
      unique: true,
      partialFilterExpression: { type: 'expedition', status: { $in: ['pending', 'claimed'] } },
      name: 'idx_unique_expedition'
    }
  );
  console.log('Created idx_unique_expedition');

  console.log('Done.');
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error(err);
  process.exit(1);
});
