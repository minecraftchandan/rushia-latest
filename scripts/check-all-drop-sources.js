require('dotenv').config();
const mongoose = require('mongoose');

async function checkAllDropData() {
  try {
    console.log('🔌 Connecting to main database...');
    const mainConnection = await mongoose.createConnection(process.env.MONGODB_URI).asPromise();
    console.log('✅ Connected to main database');

    console.log('🔌 Connecting to logs database...');
    const logsConnection = await mongoose.createConnection(process.env.LOGS_URI).asPromise();
    console.log('✅ Connected to logs database');

    // Models
    const Drops = mainConnection.model('Drops', new mongoose.Schema({}, { strict: false, collection: 'drops' }));
    const RarityDrop = mainConnection.model('RarityDrop', new mongoose.Schema({}, { strict: false, collection: 'rarity' }));
    const Log = logsConnection.model('Log', new mongoose.Schema({}, { strict: false, collection: 'logs' }));

    console.log('\n' + '='.repeat(80));
    console.log('📊 CHECKING ALL DROP DATA SOURCES');
    console.log('='.repeat(80));

    // 1. DROPS COLLECTION
    console.log('\n📦 DROPS COLLECTION (Total drops per user):');
    const dropsCount = await Drops.countDocuments();
    console.log(`   Total Documents: ${dropsCount}`);
    
    if (dropsCount > 0) {
      const oldestDrop = await Drops.findOne().sort({ droppedAt: 1 }).lean();
      const newestDrop = await Drops.findOne().sort({ droppedAt: -1 }).lean();
      console.log(`   Oldest droppedAt: ${oldestDrop.droppedAt} (User: ${oldestDrop.userId})`);
      console.log(`   Newest droppedAt: ${newestDrop.droppedAt} (User: ${newestDrop.userId})`);
      
      const totalDrops = await Drops.aggregate([
        { $group: { _id: null, total: { $sum: '$drop_count' } } }
      ]);
      console.log(`   Total Drops Tracked: ${totalDrops[0]?.total || 0}`);
      
      // Sample a few documents
      const samples = await Drops.find().limit(3).lean();
      console.log('\n   Sample Documents:');
      samples.forEach((doc, i) => {
        console.log(`   ${i + 1}. User ${doc.userId}: ${doc.drop_count} drops, last at ${doc.droppedAt}`);
      });
    }

    // 2. RARITY COLLECTION
    console.log('\n\n✨ RARITY COLLECTION (Legendary/Exotic drops per user):');
    const rarityCount = await RarityDrop.countDocuments();
    console.log(`   Total Documents: ${rarityCount}`);
    
    if (rarityCount > 0) {
      const oldestRarity = await RarityDrop.findOne().sort({ droppedAt: 1 }).lean();
      const newestRarity = await RarityDrop.findOne().sort({ droppedAt: -1 }).lean();
      console.log(`   Oldest droppedAt: ${oldestRarity.droppedAt} (User: ${oldestRarity.userId})`);
      console.log(`   Newest droppedAt: ${newestRarity.droppedAt} (User: ${newestRarity.userId})`);
      
      const totals = await RarityDrop.aggregate([
        { 
          $group: { 
            _id: null, 
            legendary: { $sum: '$legendary_count' },
            exotic: { $sum: '$exotic_count' }
          } 
        }
      ]);
      console.log(`   Total Legendary: ${totals[0]?.legendary || 0}`);
      console.log(`   Total Exotic: ${totals[0]?.exotic || 0}`);
      
      // Sample a few documents
      const raritySamples = await RarityDrop.find().limit(3).lean();
      console.log('\n   Sample Documents:');
      raritySamples.forEach((doc, i) => {
        console.log(`   ${i + 1}. User ${doc.userId}: ${doc.legendary_count} legendary, ${doc.exotic_count} exotic, last at ${doc.droppedAt}`);
      });
    }

    // 3. LOGS COLLECTION
    console.log('\n\n📝 LOGS COLLECTION (Historical drop events):');
    const dropLogQuery = { 'metadata.category': 'DROP_COUNT' };
    const dropLogsCount = await Log.countDocuments(dropLogQuery);
    console.log(`   Total Drop Logs: ${dropLogsCount}`);
    
    if (dropLogsCount > 0) {
      const earliestLog = await Log.findOne(dropLogQuery).sort({ timestamp: 1 }).lean();
      const latestLog = await Log.findOne(dropLogQuery).sort({ timestamp: -1 }).lean();
      console.log(`   First Log: ${earliestLog.timestamp}`);
      console.log(`   Last Log:  ${latestLog.timestamp}`);
      
      const timeDiff = new Date(latestLog.timestamp) - new Date(earliestLog.timestamp);
      const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
      console.log(`   Data Span: ${daysDiff} days`);
      
      // Sample a few logs
      const logSamples = await Log.find(dropLogQuery).sort({ timestamp: -1 }).limit(3).lean();
      console.log('\n   Recent Logs:');
      logSamples.forEach((log, i) => {
        console.log(`   ${i + 1}. ${log.timestamp}: [${log.metadata?.rarity}] ${log.metadata?.cardName} by User ${log.userId}`);
      });
    }

    // 4. SUMMARY
    console.log('\n' + '='.repeat(80));
    console.log('📋 SUMMARY:');
    console.log('='.repeat(80));
    console.log('\n⚠️  IMPORTANT NOTES:');
    console.log('   - drops & rarity collections: Only store CURRENT totals + LAST drop time');
    console.log('   - These are NOT historical - they update the same document each drop');
    console.log('   - logs collection: Has FULL historical data with individual events');
    console.log('\n💡 RECOMMENDATION:');
    console.log('   - For historical data (like June 7th): Use LOGS collection');
    console.log('   - For current user totals: Use DROPS/RARITY collections');
    console.log('   - Run: node scripts/query-drops-by-date.js 2024-06-07');

    await mainConnection.close();
    await logsConnection.close();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkAllDropData();
