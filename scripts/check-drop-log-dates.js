require('dotenv').config();
const mongoose = require('mongoose');

async function checkDropLogDates() {
  try {
    console.log('🔌 Connecting to logs database...');
    await mongoose.connect(process.env.LOGS_URI);
    console.log('✅ Connected to logs database');

    const Log = mongoose.model('Log', new mongoose.Schema({}, { strict: false, collection: 'logs' }));

    console.log('\n🎴 Checking DROP COUNT logs...\n');

    // Query for drop logs
    const dropQuery = { 'metadata.category': 'DROP_COUNT' };

    // Get earliest drop log
    const earliestDrop = await Log.findOne(dropQuery).sort({ timestamp: 1 }).lean();
    
    // Get latest drop log
    const latestDrop = await Log.findOne(dropQuery).sort({ timestamp: -1 }).lean();
    
    // Get total count
    const totalDropLogs = await Log.countDocuments(dropQuery);

    if (!earliestDrop || !latestDrop) {
      console.log('⚠️ No drop logs found in database');
      await mongoose.disconnect();
      return;
    }

    console.log('📅 DROP COUNT LOG RANGE:');
    console.log(`   First Drop: ${earliestDrop.timestamp.toISOString()}`);
    console.log(`   Last Drop:  ${latestDrop.timestamp.toISOString()}`);
    console.log(`   Total Logs: ${totalDropLogs.toLocaleString()}`);

    // Calculate days of drop data
    const timeDiff = new Date(latestDrop.timestamp) - new Date(earliestDrop.timestamp);
    const daysDiff = Math.floor(timeDiff / (1000 * 60 * 60 * 24));
    const hoursDiff = Math.floor(timeDiff / (1000 * 60 * 60));
    
    console.log(`\n📈 Data Span: ${daysDiff} days (${hoursDiff} hours)`);

    // Get drops per day for last 7 days
    console.log('\n📊 Drops per day (last 7 days):');
    const today = new Date();
    for (let i = 6; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      date.setHours(0, 0, 0, 0);
      
      const nextDate = new Date(date);
      nextDate.setDate(nextDate.getDate() + 1);
      
      const count = await Log.countDocuments({
        ...dropQuery,
        timestamp: { $gte: date, $lt: nextDate }
      });
      
      const dateStr = date.toISOString().split('T')[0];
      console.log(`   ${dateStr}: ${count} drops`);
    }

    // Get unique users and guilds
    const uniqueUsers = await Log.distinct('userId', dropQuery);
    const uniqueGuilds = await Log.distinct('guildId', dropQuery);
    
    console.log(`\n👥 Unique Users: ${uniqueUsers.filter(u => u).length}`);
    console.log(`🏰 Unique Guilds: ${uniqueGuilds.filter(g => g).length}`);

    // Get top 5 users by drop count
    console.log('\n🏆 Top 5 Users (by log entries):');
    const topUsers = await Log.aggregate([
      { $match: dropQuery },
      { $group: { _id: '$userId', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 5 }
    ]);
    
    topUsers.forEach((user, index) => {
      console.log(`   ${index + 1}. User ${user._id}: ${user.count} drops`);
    });

    await mongoose.disconnect();
    console.log('\n✅ Done!');
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

checkDropLogDates();
