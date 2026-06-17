require('dotenv').config();
const DatabaseManager = require('./src/database/database.manager');
const Reminder = require('./src/database/reminder.model');

async function checkOverrides() {
  try {
    console.log('🔗 Connecting to database...');
    await DatabaseManager.connect();
    console.log('✅ Connected\n');

    // Find all reminders with override fields
    const remindersWithOverride = await Reminder.find({
      overrideChannelId: { $exists: true, $ne: null }
    }).lean();

    console.log('📊 Total reminders with override fields:', remindersWithOverride.length);
    console.log('');

    if (remindersWithOverride.length === 0) {
      console.log('❌ No reminders found with channel overrides in the database.');
      console.log('');
      console.log('This means:');
      console.log('  - You used @bot here with the OLD in-memory system');
      console.log('  - OR you never used @bot here yet');
      console.log('  - OR the override already expired and was cleaned up');
      console.log('');
      console.log('✅ Solution: Type @bot here again to activate the new MongoDB system!');
      process.exit(0);
    }

    console.log('✅ Found reminders with overrides!\n');

    // Check each one
    const now = new Date();
    let activeCount = 0;
    let expiredCount = 0;

    for (const reminder of remindersWithOverride) {
      const isExpired = new Date(reminder.overrideExpiresAt) <= now;
      const status = isExpired ? '⏰ EXPIRED' : '✅ ACTIVE';
      
      if (isExpired) {
        expiredCount++;
      } else {
        activeCount++;
      }

      console.log(`${status} Reminder:`);
      console.log('  User ID:', reminder.userId);
      console.log('  Type:', reminder.type);
      console.log('  Status:', reminder.status);
      console.log('  Original Channel:', reminder.channelId);
      console.log('  Override Channel:', reminder.overrideChannelId);
      console.log('  Expires At:', new Date(reminder.overrideExpiresAt).toISOString());
      console.log('  Remind At:', new Date(reminder.remindAt).toISOString());
      
      if (isExpired) {
        const expiredAgo = Math.floor((now - new Date(reminder.overrideExpiresAt)) / 1000 / 60);
        console.log(`  ⚠️  Expired ${expiredAgo} minutes ago (needs cleanup)`);
      } else {
        const expiresIn = Math.floor((new Date(reminder.overrideExpiresAt) - now) / 1000 / 60);
        console.log(`  ⏳ Expires in ${expiresIn} minutes`);
      }
      console.log('');
    }

    console.log('📈 Summary:');
    console.log(`  ✅ Active overrides: ${activeCount}`);
    console.log(`  ⏰ Expired overrides: ${expiredCount}`);
    console.log('');

    if (activeCount > 0) {
      console.log('🎉 You have ACTIVE channel overrides!');
      console.log('   Your raid reminders will be sent to the override channel.');
    }

    if (expiredCount > 0) {
      console.log('🧹 Expired overrides will be cleaned up automatically by the scheduler.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkOverrides();
