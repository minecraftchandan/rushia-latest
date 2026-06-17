require('dotenv').config();
const DatabaseManager = require('./src/database/database.manager');
const Reminder = require('./src/database/reminder.model');

async function checkReminders() {
  try {
    console.log('🔗 Connecting to database...');
    await DatabaseManager.connect();
    console.log('✅ Connected\n');

    // Check all pending reminders
    console.log('📋 Checking all pending reminders...\n');
    const pendingReminders = await Reminder.find({ status: 'pending' }).sort({ remindAt: 1 }).limit(10);
    
    if (pendingReminders.length === 0) {
      console.log('❌ No pending reminders found!');
      console.log('\n💡 This means:');
      console.log('   - No raid reminders were created yet');
      console.log('   - Or all reminders have already been sent');
      console.log('   - Or reminders were deleted');
    } else {
      console.log(`✅ Found ${pendingReminders.length} pending reminder(s):\n`);
      
      pendingReminders.forEach((reminder, index) => {
        const now = new Date();
        const timeUntil = reminder.remindAt - now;
        const minutesUntil = Math.floor(timeUntil / 1000 / 60);
        const secondsUntil = Math.floor((timeUntil / 1000) % 60);
        
        console.log(`📌 Reminder ${index + 1}:`);
        console.log(`   User ID: ${reminder.userId}`);
        console.log(`   Type: ${reminder.type}`);
        console.log(`   Channel ID: ${reminder.channelId}`);
        console.log(`   Override Channel: ${reminder.overrideChannelId || 'None'}`);
        console.log(`   Override Expires: ${reminder.overrideExpiresAt || 'N/A'}`);
        console.log(`   Original Channel: ${reminder.originalChannelId || 'N/A'}`);
        console.log(`   Status: ${reminder.status}`);
        console.log(`   Remind At: ${reminder.remindAt.toISOString()}`);
        console.log(`   Time Until: ${minutesUntil}m ${secondsUntil}s`);
        console.log(`   Message: ${reminder.reminderMessage.substring(0, 60)}...`);
        console.log('');
      });
    }

    // Check claimed reminders (might be stuck)
    console.log('\n🔍 Checking claimed reminders (should be temporary)...\n');
    const claimedReminders = await Reminder.find({ status: 'claimed' });
    if (claimedReminders.length > 0) {
      console.log(`⚠️  Found ${claimedReminders.length} claimed reminder(s) (might be stuck):`);
      claimedReminders.forEach((r, i) => {
        console.log(`   ${i + 1}. User: ${r.userId}, Type: ${r.type}, Claimed: ${r.claimedAt}`);
      });
    } else {
      console.log('✅ No claimed reminders (good!)');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkReminders();
