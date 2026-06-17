require('dotenv').config();
const DatabaseManager = require('./src/database/database.manager');
const ChannelOverride = require('./src/database/channel-override.model');

async function checkUserOverrides() {
  try {
    console.log('🔗 Connecting to database...');
    await DatabaseManager.connect();
    console.log('✅ Connected\n');

    // Find all active overrides
    const allOverrides = await ChannelOverride.find({}).lean();

    console.log('📊 Total user overrides:', allOverrides.length);
    console.log('');

    if (allOverrides.length === 0) {
      console.log('❌ No user-level channel overrides found in the database.');
      console.log('');
      console.log('✅ Solution: Type @bot here to create one!');
      process.exit(0);
    }

    console.log('✅ Found user overrides!\n');

    const now = new Date();
    let activeCount = 0;
    let expiredCount = 0;

    for (const override of allOverrides) {
      const isExpired = new Date(override.expiresAt) <= now;
      const status = isExpired ? '⏰ EXPIRED' : '✅ ACTIVE';
      
      if (isExpired) {
        expiredCount++;
      } else {
        activeCount++;
      }

      console.log(`${status} Override:`);
      console.log('  User ID:', override.userId);
      console.log('  Guild ID:', override.guildId);
      console.log('  Channel ID:', override.channelId);
      console.log('  Expires At:', new Date(override.expiresAt).toISOString());
      console.log('  Created At:', new Date(override.createdAt).toISOString());
      
      if (isExpired) {
        const expiredAgo = Math.floor((now - new Date(override.expiresAt)) / 1000 / 60);
        console.log(`  ⚠️  Expired ${expiredAgo} minutes ago (will be cleaned up)`);
      } else {
        const expiresIn = Math.floor((new Date(override.expiresAt) - now) / 1000 / 60);
        console.log(`  ⏳ Expires in ${expiresIn} minutes`);
      }
      console.log('');
    }

    console.log('📈 Summary:');
    console.log(`  ✅ Active overrides: ${activeCount}`);
    console.log(`  ⏰ Expired overrides: ${expiredCount}`);
    console.log('');

    if (activeCount > 0) {
      console.log('🎉 Active overrides found!');
      console.log('   ALL new raid reminders for these users will use override channels.');
    }

    if (expiredCount > 0) {
      console.log('🧹 Expired overrides will be cleaned up by the scheduler every 5 minutes.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkUserOverrides();
