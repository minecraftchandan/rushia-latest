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
    const result = await Drops.findOneAndUpdate(
      { userId, guildId: message.guild.id },
      {
        $inc: { drop_count: 1 },
        $set: { droppedAt: new Date() }
      },
      { upsert: true, new: true }
    );

    await logInfo(`[DROP] ${cardData.rarity} - ${cardData.cardName} by ${userId} in ${message.guild.name} (Total: ${result.drop_count})`, {
      category: 'DROP_COUNT',
      userId,
      guildId: message.guild.id,
      cardName: cardData.cardName,
      rarity: cardData.rarity,
      drop_count: result.drop_count
    });
  } catch (error) {
    await logError(`[DROP ERROR] Failed to update: ${error.message}`, error, {
      category: 'DROP_COUNT',
      userId,
      guildId: message.guild.id
    });
  }
}

module.exports = { processDropCount };
