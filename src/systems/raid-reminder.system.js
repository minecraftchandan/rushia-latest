const { parseRaidViewEmbed, parseRaidViewComponent } = require('../utils/embed.parser');
const Reminder = require('../database/reminder.model');
const { logInfo, logError } = require('../utils/logger');
const { createReminderSafe, checkExistingReminder } = require('../utils/reminder-duplicate.checker');

async function createRaidReminder(userId, guildId, channelId, fatigueMillis) {
  const remindAt = new Date(Date.now() + fatigueMillis);
  const result = await createReminderSafe({
    userId,
    guildId,
    channelId,
    remindAt,
    type: 'raid',
    reminderMessage: `<@${userId}>, your raid fatigue has worn off! use </raid attack:1472170030723764364> to attack the boss again.`
  });

  if (result.success) {
    await logInfo('REMINDER_CREATED', {
      category: 'REMINDER',
      action: 'CREATED',
      type: 'raid',
      userId,
      guildId,
      channelId,
      remindAt: remindAt.toISOString()
    });
  } else if (result.reason !== 'duplicate') {
    await logError('REMINDER_CREATE_FAILED', {
      category: 'REMINDER',
      action: 'CREATE_FAILED',
      type: 'raid',
      userId,
      error: result.error.message
    });
  }
}

async function processRaidMessage(message) {
  if (!message.guild) return false;

  let raidInfo = null;

  if (message.components && message.components.length > 0) {
    raidInfo = parseRaidViewComponent(message.components);
  }

  if (!raidInfo && message.embeds.length > 0) {
    raidInfo = parseRaidViewEmbed(message.embeds[0]);
  }

  if (!raidInfo) return false;

  for (const { userId, fatigueMillis } of raidInfo) {
    const existing = await checkExistingReminder(userId, 'raid');
    if (existing) continue;
    await createRaidReminder(userId, message.guild.id, message.channel.id, fatigueMillis);
  }

  return true;
}

module.exports = { processRaidMessage };
