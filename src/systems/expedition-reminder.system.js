const { parseExpeditionEmbed, parseExpeditionComponent } = require('../utils/embed.parser');
const { logInfo, logError } = require('../utils/logger');
const { createReminderSafe } = require('../utils/reminder-duplicate.checker');

async function processExpeditionMessage(message) {
  if (!message.guild) return;

  let expeditionInfo = null;
  let userId = message.interaction?.user?.id;

  // Try parsing components first
  if (message.components && message.components.length > 0) {
    expeditionInfo = parseExpeditionComponent(message.components);
    
    // For component format, try to get userId from username if no interaction
    if (!userId && expeditionInfo?.username) {
      try {
        const members = await message.guild.members.fetch({ query: expeditionInfo.username, limit: 1 });
        const member = members.first();
        if (member) {
          userId = member.id;
        }
      } catch (err) {
        // Silent fail
      }
    }
  }

  // Fallback to embed parsing (old format)
  if (!expeditionInfo && message.embeds.length > 0) {
    const embed = message.embeds[0];
    expeditionInfo = parseExpeditionEmbed(embed);
    
    // For embed format, try to get userId from username
    if (!userId && expeditionInfo?.username) {
      try {
        const members = await message.guild.members.fetch({ query: expeditionInfo.username, limit: 1 });
        const member = members.first();
        if (member) userId = member.id;
      } catch (err) {
        // Silent fail
      }
    }
  }

  if (!expeditionInfo) return;

  if (!userId && expeditionInfo?.username) {
    try {
      const members = await message.guild.members.fetch({ query: expeditionInfo.username, limit: 1 });
      const member = members.first();
      if (member) userId = member.id;
    } catch (err) {
      // Silent fail
    }
  }

  if (!userId) return;

  // Group cards by time (within 5 second window)
  const timeGroups = {};
  for (const card of expeditionInfo.cards) {
    const remindAt = new Date(message.createdTimestamp + card.remainingMillis);
    const timeKey = Math.floor(remindAt.getTime() / 5000); // 5 second buckets
    
    if (!timeGroups[timeKey]) {
      timeGroups[timeKey] = {
        remindAt,
        cards: []
      };
    }
    timeGroups[timeKey].cards.push(card);
  }

  // Create one reminder per time group
  for (const timeKey in timeGroups) {
    const group = timeGroups[timeKey];
    const cardNames = group.cards.map(c => c.cardName).join(', ');
    
    const result = await createReminderSafe({
      userId,
      guildId: message.guild.id,
      cardId: group.cards[0].cardId,
      channelId: message.channel.id,
      remindAt: group.remindAt,
      type: 'expedition',
      reminderMessage: `<@${userId}>, your </expeditions:1472170030337626153> cards are ready to be claimed!\n-# \`Cards: ${cardNames}\`, use </expeditions:1472170030337626153> to resend them`
    });

    if (result.success) {
      await logInfo('REMINDER_CREATED', { 
        category: 'REMINDER',
        action: 'CREATED',
        type: 'expedition',
        userId, 
        guildId: message.guild.id,
        channelId: message.channel.id,
        cardCount: group.cards.length,
        remindAt: group.remindAt.toISOString()
      });
    } else if (result.reason !== 'duplicate') {
      await logError('REMINDER_CREATE_FAILED', { 
        category: 'REMINDER',
        action: 'CREATE_FAILED',
        type: 'expedition',
        userId,
        error: result.error.message
      });
    }
  }
}

module.exports = { processExpeditionMessage };
