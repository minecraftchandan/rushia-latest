const { EmbedBuilder } = require('discord.js');
const { sendLog, sendError } = require('../utils/logger');
const PogGuild = require('../database/pog-guild.model');
const { BOT_OWNER_ID } = require('../config/constants');

async function handleMinfoCommand(message) {
  // Check if user is bot owner
  if (message.author.id !== BOT_OWNER_ID) {
    await message.reply('🚫 This command is only available to the bot owner.');
    return;
  }

  const guildId = message.guildId;
  if (!guildId) {
    await message.reply('❌ This command can only be used in a server.');
    return;
  }

  try {
    const guild = message.guild;
    const guildData = await PogGuild.findOne({ guild_id: guildId });

    const embed = new EmbedBuilder()
      .setTitle('📊 Server POG Configuration')
      .setColor(0x5865F2)
      .addFields(
        { name: '🏰 Server Name', value: guild.name, inline: true },
        { name: '🆔 Server ID', value: guildId, inline: true },
        { name: '📺 POG Channel ID', value: guildData?.targetChannelId || 'Not set', inline: true },
        { name: '🔗 Channel Link', value: guildData?.targetChannelId ? `<#${guildData.targetChannelId}>` : 'Not set', inline: true }
      )
      .setThumbnail(guild.iconURL())
      .setFooter({ text: `Requested by ${message.author.tag}` })
      .setTimestamp();

    await message.reply({ embeds: [embed] });
  } catch (error) {
    sendError('Error in minfo command:', error);
    await message.reply('❌ An error occurred while fetching server information.');
  }
}

module.exports = { handleMinfoCommand };
