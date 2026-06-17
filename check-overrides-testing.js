require('dotenv').config();
const mongoose = require('mongoose');

async function checkOverridesInTesting() {
  try {
    console.log('🔗 Connecting to database...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Connected\n');

    // Query the testing collection directly
    const db = mongoose.connection.db;
    const testingCollection = db.collection('testing');

    const remindersWithOverride = await testingCollection.find({
      overrideChannelId: { $exists: true, $ne: null }
    }).toArray();

    console.log('📊 Total reminders with override fields in "testing" collection:', remindersWithOverride.length);
    console.log('');

    if (remindersWithOverride.length === 0) {
      console.log('❌ No reminders found with channel overrides in the "testing" collection.');
      console.log('');
      console.log('This means:');
      console.log('  - You haven\'t used @bot here yet with the dev bot');
      console.log('  - OR the override already expired and was cleaned up');
      console.log('');
      console.log('✅ Next steps:');
      console.log('  1. Restart your dev bot (to use testing collection)');
      console.log('  2. Attack a raid');
      console.log('  3. Type @bot here');
      console.log('  4. Run this script again');
      await mongoose.disconnect();
      process.exit(0);
    }

    console.log('✅ Found reminders with overrides!\n');

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
      console.log('🎉 You have ACTIVE channel overrides in testing collection!');
      console.log('   Your raid reminders will be sent to the override channel.');
    }

    if (expiredCount > 0) {
      console.log('🧹 Expired overrides will be cleaned up automatically by the scheduler.');
    }

    await mongoose.disconnect();
    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error);
    process.exit(1);
  }
}

checkOverridesInTesting();
