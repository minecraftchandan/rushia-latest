const { parseRaidViewEmbed, parseRaidViewComponent, parseRaidAttackEmbed } = require('../utils/embed.parser');
const Reminder = require('../database/reminder.model');
const { sendLog, sendError } = require('../utils/logger');
const { createReminderSafe, checkExistingReminder } = require('../utils/reminder-duplicate.checker');

const FATIGUE_MILLIS = 10 * 60 * 1000;

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
    await sendLog('REMINDER_CREATED', {
      category: 'REMINDER',
      action: 'CREATED',
      type: 'raid',
      userId,
      guildId,
      channelId,
      remindAt: remindAt.toISOString()
    });
  } else if (result.reason !== 'duplicate') {
    await sendError('REMINDER_CREATE_FAILED', {
      category: 'REMINDER',
      action: 'CREATE_FAILED',
      type: 'raid',
      userId,
      error: result.error.message
    });
  }
}

async function processRaidMessage(message) {
  if (!message.guild) return;

  const handledUserIds = new Set();

  // Path 1: interaction metadata from /raid attack — most reliable, fixed 10 min
  const attackInfo = parseRaidAttackEmbed(message);
  if (attackInfo) {
    handledUserIds.add(attackInfo.userId);
    await createRaidReminder(attackInfo.userId, message.guild.id, message.channel.id, FATIGUE_MILLIS);
  }

  // Path 2: fatigue counter from raid view embed/component — skip users already handled above
  let raidInfo = null;

  if (message.components && message.components.length > 0) {
    raidInfo = parseRaidViewComponent(message.components);
  }

  if (!raidInfo && message.embeds.length > 0) {
    raidInfo = parseRaidViewEmbed(message.embeds[0]);
  }

  if (!raidInfo) return;

  for (const { userId, fatigueMillis } of raidInfo) {
    if (handledUserIds.has(userId)) continue;
    const existing = await checkExistingReminder(userId, 'raid');
    if (existing) continue;
    await createRaidReminder(userId, message.guild.id, message.channel.id, fatigueMillis);
  }
}

module.exports = { processRaidMessage };
