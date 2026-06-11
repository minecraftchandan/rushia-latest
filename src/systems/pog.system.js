const { EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const PogGuild = require('../database/pog-guild.model');
const { logInfo, logError } = require('../utils/logger');

// Parse both plain numbers and compact notation (e.g. '1.1k', '1234')
function parseFlexibleNumber(str) {
  if (!str) return 0;
  str = str.toLowerCase().replace(/,/g, '');
  
  const match = str.match(/^(\d+(?:\.\d+)?)([km])?$/);
  if (match) {
    let num = parseFloat(match[1]);
    let suffix = match[2];
    if (suffix === 'k') return Math.round(num * 1000);
    if (suffix === 'm') return Math.round(num * 1000000);
    return Math.round(num);
  }
  
  const plainMatch = str.match(/(\d+)/);
  if (plainMatch) return parseInt(plainMatch[1]);
  return 0;
}

// Format large numbers as '1k', '1.1k', etc.
function formatNumber(num) {
  if (num < 1000) return num.toString();
  if (num < 100000) {
    return (num / 1000).toFixed(num % 1000 === 0 ? 0 : 1) + 'k';
  }
  if (num === 100000) return '100k';
  return num.toString();
}

async function processPogMessage(message) {
  try {
    const TARGET_BOT_ID = '853629533855809596'; // Luvi bot ID
    
    if (message.author.id !== TARGET_BOT_ID) return;
    if (!message.components?.length) return;

    // Extract heart values from button labels
    const heartValues = [];
    for (const row of message.components) {
      for (const component of row.components) {
        const label = component.label || '';
        const numberMatch = label.match(/(\d+(?:\.\d+)?[kKmM]?)/);
        if (numberMatch) {
          heartValues.push(parseFlexibleNumber(numberMatch[1]));
        }
      }
    }

    if (!message.attachments.size || heartValues.length === 0) return;

    const guildId = message.guildId;
    if (!guildId) return;

    const guildData = await PogGuild.findOne({ guild_id: guildId });
    if (!guildData?.targetChannelId) return;

    const maxValue = Math.max(...heartValues);
    
    // Trigger POG if any heart value > 99
    if (maxValue > 99) {
      await sendLog(`POG triggered! Max value: ${maxValue}`, { 
        guildId, 
        channelId: message.channelId,
        values: heartValues 
      });
      await handlePog(message, guildData.targetChannelId, heartValues);
    }
  } catch (error) {
    await sendError(`POG processing error: ${error.message}`, { 
      guildId: message.guildId,
      channelId: message.channelId 
    });
  }
}

async function handlePog(message, targetChannelId, heartValues) {
  try {
    const mentionedUser = message.mentions.users.first();
    const heartsDisplay = heartValues.map(value => `❤️ \`${formatNumber(value)}\``).join(' ｜');

    // Notify original channel
    if (message.channel.isTextBased()) {
      await message.channel.send(
        `${mentionedUser ? `<@${mentionedUser.id}>` : ''} 🎉 Check it out in <#${targetChannelId}>`
      ).catch(() => {});
    }

    const imageUrl = message.attachments.first()?.url;

    const embed = new EmbedBuilder()
      .setTitle('<a:AnimeGirljumping:1365978464435441675> 𝑷𝑶𝑮𝑮𝑬𝑹𝑺 <a:brown_jump:1365979505977458708>')
      .setDescription(`${mentionedUser ? `<@${mentionedUser.id}>` : 'Someone'} triggered a POG!\n\n**${heartsDisplay}**`)
      .setColor(0x87CEEB)
      .setImage(imageUrl)
      .setFooter({ text: `Dropped by: ${mentionedUser?.tag || 'Unknown#0000'}` });

    const button = new ButtonBuilder()
      .setLabel('Jump to Message')
      .setStyle(ButtonStyle.Link)
      .setURL(message.url);

    const row = new ActionRowBuilder().addComponents(button);

    const targetChannel = await message.client.channels.fetch(targetChannelId).catch(() => null);
    if (!targetChannel) {
      throw new Error(`Target channel ${targetChannelId} not found`);
    }

    // Check permissions
    const perms = targetChannel.permissionsFor(message.client.user);
    if (!perms || !perms.has('SendMessages')) {
      const warning = `⚠️ Missing permission to send messages in <#${targetChannelId}>`;
      await sendError(warning, { guildId: message.guildId, channelId: targetChannelId });
      
      if (message.channel.isTextBased()) {
        await message.channel.send(warning).catch(() => {});
      }
      return;
    }

    if (targetChannel.isTextBased()) {
      await targetChannel.send({ embeds: [embed], components: [row] });
      await sendLog('POG alert sent successfully', { 
        guildId: message.guildId, 
        targetChannelId 
      });
    }
  } catch (error) {
    await sendError(`POG handler error: ${error.message}`, { 
      guildId: message.guildId,
      targetChannelId 
    });
  }
}

module.exports = { processPogMessage };
