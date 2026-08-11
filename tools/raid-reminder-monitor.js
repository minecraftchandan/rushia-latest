#!/usr/bin/env node
require('dotenv').config();
const mongoose = require('mongoose');

const INTERVAL_MS = Number(process.env.MONITOR_INTERVAL_MS || 5000);
const STALE_MS = Number(process.env.MONITOR_STALE_MS || 60000);

let lastPollAt = new Date(Date.now() - INTERVAL_MS);

function nowLabel() {
  return new Date().toISOString();
}

function logLine(message) {
  console.log(`[${nowLabel()}] ${message}`);
}

async function connectToMongo() {
  if (!process.env.MONGODB_URI) {
    throw new Error('MONGODB_URI is not set. Please configure your environment first.');
  }

  await mongoose.connect(process.env.MONGODB_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    connectTimeoutMS: 10000,
    bufferCommands: false
  });

  logLine('✅ Connected to MongoDB for reminder monitoring');
}

async function getRecentEvents(Reminder, since) {
  const [created, claimed, sent] = await Promise.all([
    Reminder.find({
      type: 'raid',
      createdAt: { $gte: since }
    }).sort({ createdAt: 1 }).lean(),
    Reminder.find({
      type: 'raid',
      claimedAt: { $gte: since },
      status: 'claimed'
    }).sort({ claimedAt: 1 }).lean(),
    Reminder.find({
      type: 'raid',
      sentAt: { $gte: since },
      status: 'sent'
    }).sort({ sentAt: 1 }).lean()
  ]);

  return { created, claimed, sent };
}

async function getWarnings(Reminder) {
  const warnings = [];

  const overdue = await Reminder.find({
    type: 'raid',
    status: 'pending',
    remindAt: { $lt: new Date(Date.now() - STALE_MS) }
  }).sort({ remindAt: 1 }).lean();

  if (overdue.length > 0) {
    warnings.push(`⚠️ ${overdue.length} overdue pending raid reminder(s) are still waiting to be sent`);
  }

  const suspiciousSent = await Reminder.find({
    type: 'raid',
    status: 'sent',
    claimedAt: null
  }).lean();

  if (suspiciousSent.length > 0) {
    warnings.push(`⚠️ ${suspiciousSent.length} raid reminder(s) marked as sent without a claimed timestamp`);
  }

  return warnings;
}

async function printSnapshot(Reminder) {
  const now = new Date();
  const since = lastPollAt;
  const { created, claimed, sent } = await getRecentEvents(Reminder, since);
  const warnings = await getWarnings(Reminder);

  const counts = await Promise.all([
    Reminder.countDocuments({ type: 'raid', status: 'pending' }),
    Reminder.countDocuments({ type: 'raid', status: 'claimed' }),
    Reminder.countDocuments({ type: 'raid', status: 'sent' })
  ]);

  const [pendingCount, claimedCount, sentCount] = counts;

  logLine(`Status snapshot | pending=${pendingCount} claimed=${claimedCount} sent=${sentCount}`);

  for (const reminder of created) {
    logLine(`🆕 Created raid reminder user=${reminder.userId} channel=${reminder.channelId} remindAt=${new Date(reminder.remindAt).toISOString()}`);
  }

  for (const reminder of claimed) {
    logLine(`🔒 Claimed raid reminder user=${reminder.userId} reminderId=${reminder._id}`);
  }

  for (const reminder of sent) {
    logLine(`✅ Sent raid reminder user=${reminder.userId} reminderId=${reminder._id} channel=${reminder.channelId}`);
  }

  for (const warning of warnings) {
    logLine(warning);
  }

  if (created.length === 0 && claimed.length === 0 && sent.length === 0 && warnings.length === 0) {
    logLine('⏳ No new raid reminder activity since last check');
  }

  lastPollAt = now;
}

async function main() {
  try {
    await connectToMongo();
    const Reminder = require('../src/database/reminder.model');

    logLine('Monitoring raid reminder flow. Press Ctrl+C to stop.');

    setInterval(() => {
      printSnapshot(Reminder).catch((err) => {
        logLine(`❌ Monitor error: ${err.message}`);
      });
    }, INTERVAL_MS);

    await printSnapshot(Reminder);
  } catch (error) {
    console.error('❌ Failed to start raid reminder monitor:', error.message);
    process.exit(1);
  }
}

process.on('SIGINT', async () => {
  logLine('Stopping reminder monitor');
  await mongoose.disconnect();
  process.exit(0);
});

main();
