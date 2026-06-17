require('dotenv').config();
const DatabaseManager = require('./src/database/database.manager');
const Reminder = require('./src/database/reminder.model');

async function createTestReminder() {
  try {
    console.log('🔗 Connecting to database...');
    await DatabaseManager.connect();
    console.log('✅ Connected\n');

    const userId = process.argv[2];
    const channelId = process.argv[3];
    const guildId = process.argv[4];

    if (!userId || !channelId || !guildId) {
      console.log('❌ Usage: node create-test-reminder.js <userId> <channelId> <guildId>');
      console.log('');
      console.log('Example:');
      console.log('  node create-test-reminder.js 123456789 987654321 111222333');
      console.log('');
      console.log('This will create a raid reminder that fires in 30 seconds.');
      process.exit(1);
    }

    // Create a raid reminder that fires in 30 seconds
    const remindAt = new Date(Date.now() + 30000);
    
    const reminder = await Reminder.create({
      userId,
      channelId,
      guildId,
      remindAt,
      type: 'raid',
      reminderMessage: `<@${userId}>, your raid fatigue has worn off! This is a TEST reminder.`,
      status: 'pending'
    });

    console.log('✅ Test raid reminder created!');
    console.log('');
    console.log('Details:');
    console.log('  User ID:', userId);
    console.log('  Channel ID:', channelId);
    console.log('  Guild ID:', guildId);
    console.log('  Fires at:', remindAt.toISOString());
    console.log('  Fires in: 30 seconds');
    console.log('');
    console.log('📋 Next steps:');
    console.log('  1. Wait for the reminder to fire (30 seconds)');
    console.log('  2. OR type @bot here in another channel BEFORE it fires');
    console.log('  3. The reminder should go to the new channel!');
    console.log('');

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  }
}

createTestReminder();
