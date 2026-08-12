const Reminder = require('../database/reminder.model');
const ReminderFailure = require('../database/reminder.failure.model');
const { logInfo, logWarn } = require('../utils/logger');

async function buildBreakdownByType(matchField, since) {
  const pipeline = [
    { $match: { [matchField]: { $gte: since } } },
    { $group: { _id: '$type', count: { $sum: 1 } } }
  ];
  try {
    const res = await Reminder.aggregate(pipeline).exec();
    const out = {};
    (res || []).forEach(r => { out[r._id || 'unknown'] = r.count; });
    return out;
  } catch (err) {
    return {};
  }
}

async function startHourlyStats(client) {
  const ownerId = process.env.BOT_OWNER_ID;
  if (!ownerId) {
    logWarn('Hourly stats reporter not started: BOT_OWNER_ID not configured');
    return;
  }

  async function sendStats() {
    try {
      const now = new Date();
      const since = new Date(now.getTime() - 60 * 60 * 1000);

      const createdCount = await Reminder.countDocuments({ createdAt: { $gte: since } });
      const sentCount = await Reminder.countDocuments({ sentAt: { $gte: since } });
      const failureDocs = await ReminderFailure.find({ timestamp: { $gte: since } }).lean();
      const failedCount = failureDocs.length;

      const createdByType = await buildBreakdownByType('createdAt', since);
      const sentByType = await buildBreakdownByType('sentAt', since);

      // Failures breakdown by type and reason
      const failuresByType = {};
      const reasons = {};
      (failureDocs || []).forEach(f => {
        const t = f.type || 'unknown';
        failuresByType[t] = (failuresByType[t] || 0) + 1;
        const r = f.reason || 'unknown';
        reasons[r] = (reasons[r] || 0) + 1;
      });

      let content = `Hourly Reminder Stats (last 60 minutes)\n`;
      content += `- Created: ${createdCount}\n`;
      content += `- Sent: ${sentCount}\n`;
      content += `- Failed: ${failedCount}\n\n`;

      content += `Created by type:\n`;
      for (const k of Object.keys(createdByType)) {
        content += `• ${k}: ${createdByType[k]}\n`;
      }
      content += `\nSent by type:\n`;
      for (const k of Object.keys(sentByType)) {
        content += `• ${k}: ${sentByType[k]}\n`;
      }

      if (failedCount > 0) {
        content += `\nFailures by type:\n`;
        for (const k of Object.keys(failuresByType)) {
          content += `• ${k}: ${failuresByType[k]}\n`;
        }
        content += `\nFailure reasons:\n`;
        for (const r of Object.keys(reasons)) {
          content += `• ${r}: ${reasons[r]}\n`;
        }
      }

      try {
        const owner = await client.users.fetch(ownerId);
        if (owner) {
          await owner.send(content);
        }
      } catch (err) {
        await logWarn('Failed to DM owner hourly stats', { error: err && err.message });
      }

      await logInfo('HOURLY_REMINDER_STATS_SENT', { category: 'SYSTEM', metadata: { createdCount, sentCount, failedCount } });
    } catch (err) {
      await logWarn('Failed to generate hourly reminder stats', { error: err && err.message });
    }
  }

  // run immediately then every hour
  setImmediate(() => sendStats().catch(() => {}));
  setInterval(() => sendStats().catch(() => {}), 60 * 60 * 1000);

  return Promise.resolve();
}

module.exports = { startHourlyStats };
