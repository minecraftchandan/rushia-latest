const IconicCount = require('../../database/iconic-count.model');
const { LUVI_BOT_ID } = require('../../config/constants');
const { logError } = require('../../utils/logger');
const { resolveRaidSpawnUserId } = require('../reminders/raid-spawn-reminder.system');

async function processIconicMessage(message) {
  const guildId = message?.guild?.id ?? message?.guildId;
  if (!guildId || !message?.author || message.author.id !== LUVI_BOT_ID) return;
  const messageAgeMs = message.createdTimestamp ? Date.now() - message.createdTimestamp : 0;
  if (messageAgeMs > 30 * 24 * 60 * 60 * 1000) return;
  if (!message.embeds?.length) return;

  const embed = message.embeds[0];
  const description = embed.description || message.content || '';
  const hasIconicMarker = /\[ICONIC\]|<:LU_Iconic:|Iconic/i.test(description);
  if (!hasIconicMarker) return;

  const userId = await resolveRaidSpawnUserId(message);
  if (!userId) return;

  try {
    await IconicCount.findOneAndUpdate(
      { userId, guildId },
      { $inc: { iconic_count: 1 }, $set: { lastIconicAt: new Date() } },
      { upsert: true, new: true }
    );
  } catch (error) {
    await logError('Iconic count error', error, {
      operation: 'ICONIC_COUNT',
      action: 'FAILED',
      userId,
      guildId,
      channelId: message.channel?.id,
      metadata: { category: 'ICONIC_COUNT' },
      tags: ['iconic', 'error']
    });
  }
}

module.exports = { processIconicMessage };
