const { PermissionFlagsBits } = require('discord.js');
const { sendLog, sendError } = require('../utils/logger');
const PogGuild = require('../database/pog-guild.model');
const { BOT_OWNER_ID } = require('../config/constants');

// Text command handler for rsetpog
async function handleSetpogCommand(message, args) {
  if (!message.guild) {
    await message.reply('❌ This command can only be used in a server.');
    return;
  }

  // Check if user is bot owner or has admin permissions
  const isOwner = message.author.id === BOT_OWNER_ID;
  const hasAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);

  if (!isOwner && !hasAdmin) {
    await message.reply('❌ You need Administrator permission to use this command.');
    return;
  }

  try {
    const guildId = message.guild.id;

    // If no args provided, disable POG
    if (!args || args.length === 0) {
      await PogGuild.findOneAndUpdate(
        { guild_id: guildId },
        { targetChannelId: null },
        { upsert: true, new: true }
      );
      await message.reply('✅ POG alerts disabled. No channel will receive high-value drop notifications.');
      return;
    }

    // Get channel from mention or ID
    let targetChannel = null;
    const channelArg = args[0];

    // Try to extract channel ID from mention <#123456789>
    const channelMention = channelArg.match(/^<#(\d+)>$/);
    if (channelMention) {
      const channelId = channelMention[1];
      targetChannel = await message.guild.channels.fetch(channelId).catch(() => null);
    } else if (/^\d+$/.test(channelArg)) {
      // Direct channel ID
      targetChannel = await message.guild.channels.fetch(channelArg).catch(() => null);
    }

    if (!targetChannel) {
      await message.reply('❌ Invalid channel. Please provide a channel mention (#channel) or channel ID.');
      return;
    }

    // Verify it's a text channel
    if (!targetChannel.isTextBased()) {
      await message.reply('❌ Please select a text channel.');
      return;
    }

    // Check bot permissions
    const perms = targetChannel.permissionsFor(message.guild.members.me);
    if (!perms || !perms.has('SendMessages')) {
      await message.reply(`❌ I don't have permission to send messages in ${targetChannel}.`);
      return;
    }

    // Save to database
    await PogGuild.findOneAndUpdate(
      { guild_id: guildId },
      { targetChannelId: targetChannel.id },
      { upsert: true, new: true }
    );

    await message.reply(`✅ POG alerts will now be sent to ${targetChannel}!\n\n**What are POG alerts?**\nWhen SOFI drops cards with heart values over 99, I'll automatically forward them to this channel with a special alert.`);
  } catch (error) {
    sendError('Setpog command error:', error);
    await message.reply('❌ An error occurred while setting the POG channel.');
  }
}

module.exports.handleSetpogCommand = handleSetpogCommand;
