const RarityDrop = require('../database/rarity-drop.model');
const Drops = require('../database/drops.model');
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
    const dropTime = new Date();
    
    let result;
    let retries = 3;
    
    // Update rarity count
    while (retries > 0) {
      try {
        result = await RarityDrop.findOneAndUpdate(
          { userId, guildId: message.guild.id },
          {
            $inc: { [updateField]: 1 },
            $set: { droppedAt: dropTime }
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

    // Also update total drop count
    await Drops.findOneAndUpdate(
      { userId, guildId: message.guild.id },
      {
        $inc: { drop_count: 1 },
        $set: { droppedAt: dropTime }
      },
      { upsert: true }
    );

    await logInfo(`[RARITY] ${cardData.rarity} - ${cardData.cardName} by ${userId} in ${message.guild.name} (L:${result.legendary_count} E:${result.exotic_count})`, {
      operation: 'RARITY_DROP',
      action: 'DROPPED',
      userId,
      guildId: message.guild.id,
      channelId: message.channel.id,
      metadata: {
        category: 'RARITY_DROP',
        cardName: cardData.cardName,
        seriesName: cardData.seriesName,
        rarity: cardData.rarity,
        legendary_count: result.legendary_count,
        exotic_count: result.exotic_count,
        droppedAt: dropTime.toISOString(),
        guildName: message.guild.name
      },
      tags: ['rarity', 'drop', cardData.rarity.toLowerCase()]
    });
  } catch (error) {
    await logError('[RARITY ERROR] Failed to update tracker', error, {
      operation: 'RARITY_DROP',
      action: 'FAILED',
      userId,
      guildId: message.guild.id,
      channelId: message.channel.id,
      metadata: {
        category: 'RARITY_DROP',
        cardName: cardData.cardName,
        rarity: cardData.rarity
      },
      tags: ['rarity', 'drop', 'error']
    });
  }
}

module.exports = { processRarityDrop };
