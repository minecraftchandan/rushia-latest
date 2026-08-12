#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not set in environment');
    process.exit(2);
  }

  try {
    await mongoose.connect(uri, { bufferCommands: false, autoIndex: false });
  } catch (err) {
    console.error('Failed to connect to MongoDB:', err.message);
    process.exit(2);
  }

  const Reminder = require('../src/database/reminder.model');
  const Failure = require('../src/database/reminder.failure.model');

  try {
    const totalPending = await Reminder.countDocuments({ status: 'pending' });
    const pendingRaid = await Reminder.countDocuments({ status: 'pending', type: 'raid' });
    const pendingOther = await Reminder.aggregate([ { $match: { status: 'pending' } }, { $group: { _id: '$type', count: { $sum: 1 } } } ]);

    const sentLastHour = await Reminder.countDocuments({ sentAt: { $gte: new Date(Date.now() - 60*60*1000) } });
    const createdLastHour = await Reminder.countDocuments({ createdAt: { $gte: new Date(Date.now() - 60*60*1000) } });

    const failuresLastHour = await Failure.find({ timestamp: { $gte: new Date(Date.now() - 60*60*1000) } }).lean();

    console.log('Reminders:');
    console.log('  totalPending:', totalPending);
    console.log('  pendingRaid:', pendingRaid);
    console.log('  pendingByType:', pendingOther);
    console.log('  sentLastHour:', sentLastHour);
    console.log('  createdLastHour:', createdLastHour);
    console.log('\nFailures (last hour):', failuresLastHour.length);
    failuresLastHour.slice(0,50).forEach(f => console.log(` - ${f.type || 'unknown'} @ ${f.timestamp}: ${f.reason}`));
  } catch (err) {
    console.error('Query failed:', err.message);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

run();
