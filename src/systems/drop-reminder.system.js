const Reminder = require('../database/reminder.model');
const { logInfo, logError } = require('../utils/logger');
const { checkExistingReminder, createReminderSafe } = require('../utils/reminder-duplicate.checker');

const LUVI_ID = '1269481871021047891';

/**
 * Detects drop command usage and sets reminder
 */
async function detectAndSetDropReminder(message) {
  if (!message.guild || message.author.id !== LUVI_ID) return;
  if (Date.now() - message.createdTimestamp > 60000) return;
  if (!message.embeds.length) return;

  const embed = message.embeds[0];
  if (!embed.title || !embed.title.toLowerCase().includes('dropped')) return;

  // Extract userId from footer iconURL (Discord.js uses camelCase)
  const footer = embed.footer || embed.data?.footer;
  const iconUrl = footer?.iconURL || footer?.icon_url;
  const userId = iconUrl?.match(/avatars\/(\d+)\//)?.[1];
  if (!userId) return;

  const existingReminder = await checkExistingReminder(userId, 'drop');
  if (existingReminder) return;

  const oneHour = 60 * 60 * 1000;
  const remindAt = new Date(Date.now() + oneHour);

  const result = await createReminderSafe({
    userId,
    guildId: message.guild.id,
    channelId: message.channel.id,
    remindAt,
    type: 'drop',
    reminderMessage: `<@${userId}>, You can now use </drop:1472170029905874977> again!`
  });

  if (result.success) {
    await logInfo('REMINDER_CREATED', { 
      category: 'REMINDER',
      action: 'CREATED',
      type: 'drop',
      userId, 
      guildId: message.guild.id,
      channelId: message.channel.id,
      remindAt: remindAt.toISOString()
    });
  } else if (result.reason !== 'duplicate') {
    await logError('REMINDER_CREATE_FAILED', { 
      category: 'REMINDER',
      action: 'CREATE_FAILED',
      type: 'drop',
      userId,
      guildId: message.guild.id,
      guildName: message.guild.name,
      error: result.error.message
    });
  }
}

module.exports = { processDropMessage: detectAndSetDropReminder };
