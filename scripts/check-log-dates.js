require('dotenv').config();
const mongoose = require('mongoose');

async function checkLogDateRange() {
  try {
    console.log('🔌 Connecting to logs database...');
    await mongoose.connect(process.env.LOGS_URI);
    console.log('✅ Connected to logs database');

    const Log = mongoose.model('Log', new mongoose.Schema({}, { strict: false, collection: 'logs' }));

    console.log('\n📊 Checking log date ranges...\n');

    // Get earliest log
    const earliest = await Log.findOne().sort({ timestamp: 1 }).lean();
    
    // Get latest log
    const latest = await Log.findOne().sort({ timestamp: -1 }).lean();
    
    // Get total count
    const totalLogs = await Log.countDocuments();

    if (!earliest || !latest) {
      console.log('⚠️ No logs found in database');
      await mongoose.disconnect();
      return;
    }

    console.log('📅 ALL LOGS:');
    console.log(`   Earliest: ${earliest.timestamp} (${earliest.message})`);
    console.log(`   Latest:   ${latest.timestamp} (${latest.message})`);
    console.log(`   Total:    ${totalLogs.toLocaleString()} logs`);

    // Check drop-specific logs
    const earliestDrop = await Log.findOne({ 'metadata.category': 'DROP_COUNT' }).sort({ timestamp: 1 }).lean();
    const latestDrop = await Log.findOne({ 'metadata.category': 'DROP_COUNT' }).sort({ timestamp: -1 }).lean();
    const totalDropLogs = await Log.countDocuments({ 'metadata.category': 'DROP_COUNT' });

    if (earliestDrop && latestDrop) {
      console.log('\n🎴 DROP LOGS:');
      console.log(`   Earliest: ${earliestDrop.timestamp}`);
      console.log(`   Latest:   ${latestDrop.timestamp}`);
      console.log(`   Total:    ${totalDropLogs.toLocaleString()} drop logs`);
    } else {
      console.log('\n🎴 DROP LOGS: None found');
    }

    // Check other log categories
    const categories = await Log.distinct('metadata.category');
    console.log('\n📂 Log Categories Found:');
    for (const category of categories) {
      if (category) {
        const count = await Log.countDocuments({ 'metadata.category': category });
        console.log(`   - ${category}: ${count.toLocaleString()} logs`);
      }
    }

    // Check operations
    const operations = await Log.distinct('operation');
    console.log('\n⚙️ Operations Found:');
    for (const operation of operations) {
      if (operation) {
        const count = await Log.countDocuments({ operation });
        console.log(`   - ${operation}: ${count.toLocaleString()} logs`);
      }
    }

    // Calculate days of data
    const timeDiff = new Date(latest.timestamp) - new Date(earliest.timestamp);
    const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    console.log(`\n📈 Data Span: ${daysDiff} days`);

    await mongoose.disconnect();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkLogDateRange();
