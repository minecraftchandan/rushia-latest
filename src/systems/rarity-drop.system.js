const RarityDrop = require('../database/rarity-drop.model');
const { parseCardEmbed } = require('../utils/embed.parser');
const { logInfo, logError } = require('../utils/logger');

const LUVI_ID = '1269481871021047891';

/**
 * Detects Exotic/Legendary card drops and updates user tracker
 */
async function processRarityDrop(message) {
  if (!message.guild || message.author.id !== LUVI_ID) return;
  if (Date.now() - message.createdTimestamp > 60000) return;
  if (!message.embeds.length) return;

  const embed = message.embeds[0];
  const cardData = parseCardEmbed(embed);
  
  if (!cardData) return;
  
  // Only track Exotic and Legendary drops
  if (cardData.rarity !== 'Exotic' && cardData.rarity !== 'Legendary') return;
  
  // Get user ID from footer iconURL
  const footer = embed.footer || embed.data?.footer;
  const iconUrl = footer?.iconURL || footer?.icon_url;
  const userId = iconUrl?.match(/avatars\/(\d+)\//)?.[1];
  if (!userId) return;

  try {
    const updateField = cardData.rarity === 'Legendary' ? 'legendary_count' : 'exotic_count';
    
    let result;
    let retries = 3;
    
    while (retries > 0) {
      try {
        result = await RarityDrop.findOneAndUpdate(
          { userId, guildId: message.guild.id },
          {
            $inc: { [updateField]: 1 },
            $set: { droppedAt: new Date() }
          },
          { upsert: true, new: true }
        );
        break;
      } catch (err) {
        if (err.code === 11000 && retries > 1) {
          retries--;
          await new Promise(resolve => setTimeout(resolve, 100));
          continue;
        }
        throw err;
      }
    }

    sendLog(`[RARITY] ${cardData.rarity} - ${cardData.cardName} by ${userId} in ${message.guild.name} (L:${result.legendary_count} E:${result.exotic_count})`);

    await sendLog(`[RARITY DROP] ${cardData.rarity} - ${cardData.cardName} by ${userId} in ${message.guild.name} (L:${result.legendary_count} E:${result.exotic_count})`, {
      category: 'RARITY_DROP',
      userId,
      guildId: message.guild.id,
      cardName: cardData.cardName,
      seriesName: cardData.seriesName,
      rarity: cardData.rarity,
      legendary_count: result.legendary_count,
      exotic_count: result.exotic_count
    });
  } catch (error) {
    sendError('[RARITY ERROR]', error.message);
    await sendError(`[RARITY DROP] Failed to update tracker: ${error.message}`, {
      category: 'RARITY_DROP',
      userId,
      guildId: message.guild.id,
      cardName: cardData.cardName,
      rarity: cardData.rarity,
      error: error.stack
    });
  }
}

module.exports = { processRarityDrop };
