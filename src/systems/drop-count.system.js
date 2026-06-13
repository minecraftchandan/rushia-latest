const Drops = require('../database/drops.model');
const { parseCardEmbed } = require('../utils/embed.parser');
const { logInfo, logError } = require('../utils/logger');

const LUVI_ID = '1269481871021047891';

/**
 * Tracks all card drops (any rarity) per user per server
 */
async function processDropCount(message) {
  if (!message.guild || message.author.id !== LUVI_ID) return;
  if (Date.now() - message.createdTimestamp > 60000) return;
  if (!message.embeds.length) return;

  const embed = message.embeds[0];
  const cardData = parseCardEmbed(embed);
  
  if (!cardData) return;
  
  // Get user ID from footer iconURL
  const footer = embed.footer || embed.data?.footer;
  const iconUrl = footer?.iconURL || footer?.icon_url;
  const userId = iconUrl?.match(/avatars\/(\d+)\//)?.[1];
  if (!userId) return;

  try {
    const dropTime = new Date();
    const result = await Drops.findOneAndUpdate(
      { userId, guildId: message.guild.id },
      {
        $inc: { drop_count: 1 },
        $set: { droppedAt: dropTime }
      },
      { upsert: true, new: true }
    );

    await logInfo(`[DROP] ${cardData.rarity} - ${cardData.cardName} by ${userId} in ${message.guild.name} (Total: ${result.drop_count})`, {
      operation: 'DROP_COUNT',
      action: 'DROPPED',
      userId,
      guildId: message.guild.id,
      channelId: message.channel.id,
      metadata: {
        category: 'DROP_COUNT',
        cardName: cardData.cardName,
        rarity: cardData.rarity,
        drop_count: result.drop_count,
        droppedAt: dropTime.toISOString(),
        guildName: message.guild.name
      },
      tags: ['drop', 'card', cardData.rarity.toLowerCase()]
    });
  } catch (error) {
    await logError(`[DROP ERROR] Failed to update: ${error.message}`, error, {
      operation: 'DROP_COUNT',
      action: 'FAILED',
      userId,
      guildId: message.guild.id,
      channelId: message.channel.id,
      metadata: {
        category: 'DROP_COUNT'
      },
      tags: ['drop', 'error']
    });
  }
}

module.exports = { processDropCount };
