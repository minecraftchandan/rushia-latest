require('dotenv').config();
const DatabaseManager = require('./src/database/database.manager');
const Reminder = require('./src/database/reminder.model');

async function checkRecentActivity() {
  try {
    console.log('🔗 Connecting to database...');
    await DatabaseManager.connect();
    console.log('✅ Connected\n');

    const userId = process.argv[2];

    if (!userId) {
      console.log('Usage: node check-reminder-activity.js <userId>');
      console.log('Example: node check-reminder-activity.js 123456789');
      process.exit(1);
    }

    // Check for any reminders for this user (any status)
    console.log('🔍 Checking reminders for user:', userId);
    console.log('');

    const allReminders = await Reminder.find({ userId }).sort({ createdAt: -1 }).limit(10).lean();

    if (allReminders.length === 0) {
      console.log('❌ No reminders found for this user in the database.');
      console.log('');
      console.log('Possible reasons:');
      console.log('  - You haven\'t attacked a raid yet');
      console.log('  - Reminders already fired and were deleted (TTL after 60s)');
      console.log('  - Wrong user ID');
      process.exit(0);
    }

    console.log(`📊 Found ${allReminders.length} reminder(s):\n`);

    const now = new Date();

    for (let i = 0; i < allReminders.length; i++) {
      const r = allReminders[i];
      const age = Math.floor((now - new Date(r.createdAt)) / 1000 / 60);
      
      console.log(`[${i + 1}] Reminder:`);
      console.log('  Type:', r.type);
      console.log('  Status:', r.status);
      console.log('  Created:', new Date(r.createdAt).toISOString(), `(${age} min ago)`);
      console.log('  Remind At:', new Date(r.remindAt).toISOString());
      
      if (r.status === 'sent' && r.sentAt) {
        console.log('  ✅ Sent At:', new Date(r.sentAt).toISOString());
        console.log('  🎯 This reminder WAS sent (by one of your bot instances)');
      } else if (r.status === 'claimed' && r.claimedAt) {
        console.log('  🔒 Claimed At:', new Date(r.claimedAt).toISOString());
        console.log('  ⚠️  Claimed but not sent yet (may be stuck)');
      } else if (r.status === 'pending') {
        const remindIn = Math.floor((new Date(r.remindAt) - now) / 1000 / 60);
        if (remindIn > 0) {
          console.log(`  ⏳ Will fire in ${remindIn} minutes`);
        } else {
          console.log(`  ⚠️  Should have fired ${Math.abs(remindIn)} minutes ago!`);
        }
      }

      // Check for override
      if (r.overrideChannelId) {
        const overrideActive = r.overrideExpiresAt && new Date(r.overrideExpiresAt) > now;
        console.log('  📍 Override Channel:', r.overrideChannelId, overrideActive ? '✅ ACTIVE' : '⏰ EXPIRED');
      } else {
        console.log('  📍 Original Channel:', r.channelId);
      }

      console.log('');
    }

    // Count by status
    const pending = allReminders.filter(r => r.status === 'pending').length;
    const claimed = allReminders.filter(r => r.status === 'claimed').length;
    const sent = allReminders.filter(r => r.status === 'sent').length;

    console.log('📈 Status Summary:');
    console.log(`  Pending: ${pending}`);
    console.log(`  Claimed: ${claimed}`);
    console.log(`  Sent: ${sent}`);
    console.log('');

    if (sent > 0) {
      console.log('✅ Reminders were sent! Check your Discord to see where they went.');
      console.log('   If you didn\'t receive them, one of your bot instances sent them.');
    }

    if (claimed > 0) {
      console.log('⚠️  Claimed reminders detected - one bot instance claimed them but may not have sent.');
    }

    if (pending > 0) {
      console.log('⏳ Pending reminders will fire when their time comes.');
    }

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkRecentActivity();
