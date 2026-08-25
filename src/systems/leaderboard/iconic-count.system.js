const IconicCount = require('../../database/iconic-count.model');
const { LUVI_BOT_ID } = require('../../config/constants');
const { logInfo, logError } = require('../../utils/logger');
const { resolveRaidSpawnUserId } = require('../reminders/raid-spawn-reminder.system');

function logIconic(level, message, details = {}) {
  console[level](`[ICONIC_COUNT] ${message}`, details);
}

async function processIconicMessage(message) {
  const guildId = message?.guild?.id ?? message?.guildId;
  if (!guildId || !message?.author || message.author.id !== LUVI_BOT_ID) {
    logIconic('warn', 'SKIP_INVALID_SOURCE', { messageId: message?.id, guildId });
    return;
  }
  const messageId = message.id;
  if (!messageId) {
    logIconic('warn', 'SKIP_MISSING_MESSAGE_ID', { guildId });
    return;
  }
  const messageAgeMs = message.createdTimestamp ? Date.now() - message.createdTimestamp : 0;
  if (messageAgeMs > 30 * 24 * 60 * 60 * 1000) {
    logIconic('warn', 'SKIP_OLD_MESSAGE', { messageId, guildId, messageAgeMs });
    return;
  }
  if (!message.embeds?.length) {
    logIconic('info', 'SKIP_NO_EMBED', { messageId, guildId });
    return;
  }

  const embed = message.embeds[0];
  // Combine possible places the "iconic" marker could appear in the embed or message
  const parts = [];
  if (message.content) parts.push(message.content);
  if (embed.title) parts.push(embed.title);
  if (embed.description) parts.push(embed.description);
  if (embed.footer?.text) parts.push(embed.footer.text);
  if (embed.author?.name) parts.push(embed.author.name);
  if (embed.fields?.length) parts.push(embed.fields.map(f => `${f.name} ${f.value}`).join(' '));
  const description = parts.join(' ');
  // Match [ICONIC], the custom emoji form with id like <:LU_Iconic:12345>, or the word Iconic
  const hasIconicMarker = /(\[ICONIC\]|<:LU_Iconic:\d+>|Iconic)/i.test(description);
  if (!hasIconicMarker) {
    logIconic('info', 'SKIP_NOT_ICONIC', { messageId, guildId });
    return;
  }

  const userId = await resolveRaidSpawnUserId(message);
  if (!userId) {
    logIconic('warn', 'FAILED_USER_RESOLUTION', { messageId, guildId, channelId: message.channel?.id });
    return;
  }

  try {
    const updated = await IconicCount.findOneAndUpdate(
      { userId, guildId, processedMessageIds: { $ne: messageId } },
      {
        $inc: { iconic_count: 1 },
        $set: { lastIconicAt: new Date() },
        $addToSet: { processedMessageIds: messageId }
      },
      { upsert: true, new: true }
    );
    if (!updated) {
      logIconic('info', 'DUPLICATE_IGNORED', { messageId, userId, guildId });
      return;
    }

    logIconic('log', 'SUCCESS_INCREMENTED', {
      messageId,
      userId,
      guildId,
      channelId: message.channel?.id,
      iconicCount: updated.iconic_count
    });

    await logInfo('ICONIC_COUNT_INCREMENTED', {
      category: 'ICONIC_COUNT',
      action: 'INCREMENTED',
      userId,
      guildId,
      channelId: message.channel?.id,
      metadata: { messageId }
    }).catch(error => {
      logIconic('warn', 'DATABASE_LOG_FAILED', { messageId, userId, guildId, error: error.message });
    });
  } catch (error) {
    logIconic('error', 'FAILED_DATABASE_UPDATE', {
      messageId,
      userId,
      guildId,
      channelId: message.channel?.id,
      error: error.message
    });
    await logError('Iconic count error', error, {
      operation: 'ICONIC_COUNT',
      action: 'FAILED',
      userId,
      guildId,
      channelId: message.channel?.id,
      metadata: { category: 'ICONIC_COUNT', messageId },
      tags: ['iconic', 'error']
    });
  }
}

module.exports = { processIconicMessage };
