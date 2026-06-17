require('dotenv').config();
const DatabaseManager = require('./src/database/database.manager');
const Reminder = require('./src/database/reminder.model');

async function testChannelOverride() {
  try {
    console.log('🔗 Connecting to database...');
    await DatabaseManager.connect();
    console.log('✅ Connected\n');

    const testUserId = 'TEST_USER_123';
    const originalChannelId = 'CHANNEL_ORIGINAL';
    const overrideChannelId = 'CHANNEL_OVERRIDE';

    // Clean up any existing test data
    await Reminder.deleteMany({ userId: testUserId });
    console.log('🧹 Cleaned up test data\n');

    // Step 1: Create a test raid reminder
    console.log('📝 Creating test raid reminder...');
    const reminder = await Reminder.create({
      userId: testUserId,
      channelId: originalChannelId,
      guildId: 'TEST_GUILD',
      remindAt: new Date(Date.now() + 60000), // 1 minute from now
      type: 'raid',
      reminderMessage: 'Test reminder message',
      status: 'pending'
    });
    console.log('✅ Reminder created:', {
      _id: reminder._id,
      channelId: reminder.channelId,
      overrideChannelId: reminder.overrideChannelId,
      overrideExpiresAt: reminder.overrideExpiresAt
    });
    console.log('');

    // Step 2: Set channel override
    console.log('⚙️  Setting channel override...');
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    const result = await Reminder.setChannelOverride(testUserId, overrideChannelId, expiresAt);
    console.log('✅ Override set:', result);
    console.log('');

    // Step 3: Fetch and check the reminder
    console.log('🔍 Fetching updated reminder...');
    const updatedReminder = await Reminder.findById(reminder._id);
    console.log('✅ Updated reminder:', {
      _id: updatedReminder._id,
      channelId: updatedReminder.channelId,
      overrideChannelId: updatedReminder.overrideChannelId,
      overrideExpiresAt: updatedReminder.overrideExpiresAt,
      originalChannelId: updatedReminder.originalChannelId
    });
    console.log('');

    // Step 4: Test getEffectiveChannel
    console.log('🧪 Testing getEffectiveChannel()...');
    const effectiveChannel = updatedReminder.getEffectiveChannel();
    console.log('✅ Effective channel:', effectiveChannel);
    console.log('Expected:', overrideChannelId);
    console.log('Match:', effectiveChannel === overrideChannelId ? '✅ YES' : '❌ NO');
    console.log('');

    // Step 5: Test hasActiveOverride
    console.log('🧪 Testing hasActiveOverride()...');
    const hasOverride = updatedReminder.hasActiveOverride();
    console.log('✅ Has active override:', hasOverride);
    console.log('Expected: true');
    console.log('Match:', hasOverride === true ? '✅ YES' : '❌ NO');
    console.log('');

    // Step 6: Test with lean query (like scheduler does)
    console.log('🧪 Testing with lean query (scheduler simulation)...');
    const leanReminder = await Reminder.findById(reminder._id).lean();
    console.log('Lean reminder fields:', {
      channelId: leanReminder.channelId,
      overrideChannelId: leanReminder.overrideChannelId,
      overrideExpiresAt: leanReminder.overrideExpiresAt,
      originalChannelId: leanReminder.originalChannelId
    });

    // Calculate effective channel like scheduler does
    let effectiveChannelId = leanReminder.channelId;
    let hasActiveOverride = false;
    if (leanReminder.overrideChannelId && leanReminder.overrideExpiresAt) {
      if (new Date(leanReminder.overrideExpiresAt) > new Date()) {
        effectiveChannelId = leanReminder.overrideChannelId;
        hasActiveOverride = true;
      }
    }
    console.log('Calculated from lean:', {
      effectiveChannelId,
      hasActiveOverride
    });
    console.log('Match:', effectiveChannelId === overrideChannelId && hasActiveOverride === true ? '✅ YES' : '❌ NO');
    console.log('');

    // Clean up
    console.log('🧹 Cleaning up test data...');
    await Reminder.deleteMany({ userId: testUserId });
    console.log('✅ Cleanup complete\n');

    console.log('🎉 All tests passed!');
    process.exit(0);
  } catch (error) {
    console.error('❌ Test failed:', error);
    process.exit(1);
  }
}

testChannelOverride();
