#!/usr/bin/env node
require('dotenv').config();
const DatabaseManager = require('../src/database/database.manager');
const { logInfo, logWarn, logError } = require('../src/utils/logger');

async function run() {
  try {
    await DatabaseManager.connect();
  } catch (err) {
    console.error('MongoDB connect failed:', err && err.message);
    process.exit(2);
  }

  const Reminder = require('../src/database/reminder.model');
  const Failure = require('../src/database/reminder.failure.model');
  const UserSettings = require('../src/database/user-notification-settings.model');
  const ChannelOverride = require('../src/database/channel-override.model');

  try {
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    const twoMinutesAgo = new Date(now.getTime() - 2 * 60 * 1000);

    const totalPending = await Reminder.countDocuments({ status: 'pending' });
    const pendingByTypeAgg = await Reminder.aggregate([
      { $match: { status: 'pending' } },
      { $group: { _id: '$type', count: { $sum: 1 } } }
    ]).exec();
    const pendingByType = {};
    pendingByTypeAgg.forEach(r => pendingByType[r._id || 'unknown'] = r.count);

    const createdLastHour = await Reminder.countDocuments({ createdAt: { $gte: oneHourAgo } });
    const createdRaidLastHour = await Reminder.countDocuments({ createdAt: { $gte: oneHourAgo }, type: 'raid' });

    const sentLastHour = await Reminder.countDocuments({ sentAt: { $gte: oneHourAgo } });
    const sentRaidLastHour = await Reminder.countDocuments({ sentAt: { $gte: oneHourAgo }, type: 'raid' });

    const failedLastHour = await Failure.find({ timestamp: { $gte: oneHourAgo } }).lean();
    const failuresByType = {};
    const failuresByReason = {};
    failedLastHour.forEach(f => {
      const t = f.type || 'unknown';
      const r = f.reason || 'unknown';
      failuresByType[t] = (failuresByType[t] || 0) + 1;
      failuresByReason[r] = (failuresByReason[r] || 0) + 1;
    });

    const stuckClaimed = await Reminder.countDocuments({ status: 'claimed', claimedAt: { $lt: twoMinutesAgo } });

    const usersWithRaidDisabled = await UserSettings.countDocuments({ raid: false });

    const activeOverrides = await ChannelOverride.find({ expiresAt: { $gt: now } }).lean();

    const payload = {
      timestamp: now.toISOString(),
      totalPending,
      pendingByType,
      createdLastHour,
      createdRaidLastHour,
      sentLastHour,
      sentRaidLastHour,
      failedLastHour: failedLastHour.length,
      failuresByType,
      failuresByReason,
      stuckClaimed,
      usersWithRaidDisabled,
      activeOverridesCount: activeOverrides.length
    };

    console.log('Reminder diagnostics:');
    console.log(JSON.stringify(payload, null, 2));

    // Persist a diagnostic entry to the logs DB (use SCHEDULER_EVENT so saveToDb permits it)
    await logInfo('REMINDER_DIAGNOSTIC', { category: 'SCHEDULER_EVENT', metadata: payload });

    if (failedLastHour.length > 0) {
      console.warn('Recent failures exist; check `reminder_failures` for details.');
    }

  } catch (err) {
    console.error('Diagnostics failed:', err && err.message);
    await logError('REMINDER_DIAGNOSTIC_FAILED', err, { category: 'SCHEDULER_EVENT' });
  } finally {
    process.exit(0);
  }
}

run();
