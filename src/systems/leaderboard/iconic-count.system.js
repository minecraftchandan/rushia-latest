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
