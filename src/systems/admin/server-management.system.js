const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { sendLog, sendError } = require('../../utils/logger');
const { BOT_OWNER_ID } = require('../../config/constants');

async function handleServerInfoCommand(message, serverId) {
  try {
    if (message.author.id !== BOT_OWNER_ID) {
      return message.reply('This command is restricted to the bot owner only.');
    }

    const client = message.client;
    const guild = client.guilds.cache.get(serverId);
    
    if (!guild) {
      return message.reply('Server not found or bot is not connected to this server.');
    }

    // Generate invite link
    let inviteLink = 'No invite available';
    try {
      const channels = guild.channels.cache.filter(c => c.type === 0);
      const defaultChannel = channels.find(c => c.permissionsFor(guild.members.me).has('CreateInstantInvite'));
      
      if (defaultChannel) {
        const invite = await defaultChannel.createInvite({
          maxAge: 3600,
          maxUses: 1,
          unique: true,
          reason: 'Bot owner server access'
        });
        inviteLink = invite.url;
      }
    } catch (error) {
      sendError('Failed to create invite:', error);
    }

    const embed = new EmbedBuilder()
      .setTitle('Server Information')
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .setColor(0x5865F2)
      .addFields(
        { name: 'Server Name', value: guild.name, inline: false },
        { name: 'Invite Link', value: inviteLink, inline: false }
      )
      .setTimestamp();

    await message.reply({ embeds: [embed] });

  } catch (error) {
    sendError('Error in server info command:', error);
    await message.reply('An error occurred while fetching server information.');
  }
}

async function handleServerListCommand(messageOrInteraction, page = 0) {
  try {
    const isMessage = messageOrInteraction.author !== undefined;
    const isDeferred = messageOrInteraction.deferred;
    const client = messageOrInteraction.client;
    const user = isMessage ? messageOrInteraction.author : messageOrInteraction.user;
    
    // Check if user is bot owner
    if (user.id !== BOT_OWNER_ID) {
      const content = 'This command is restricted to the bot owner only.';
      if (isMessage) {
        return messageOrInteraction.reply(content);
      } else {
        return messageOrInteraction.reply({ content, ephemeral: true });
      }
    }
    
    // Force fetch all guilds to ensure accurate count
    await client.guilds.fetch();
    const guilds = client.guilds.cache;
    
    if (guilds.size === 0) {
      const content = 'Bot is not connected to any servers.';
      if (isMessage) {
        return messageOrInteraction.reply(content);
      } else {
        return messageOrInteraction.reply({ content, ephemeral: true });
      }
    }

    // Sort guilds by member count (descending)
    const sortedGuilds = Array.from(guilds.values())
      .sort((a, b) => b.memberCount - a.memberCount);

    // Pagination settings
    const serversPerPage = 8;
    const totalPages = Math.ceil(sortedGuilds.length / serversPerPage);
    const currentPage = Math.max(0, Math.min(page, totalPages - 1));
    const startIndex = currentPage * serversPerPage;
    const endIndex = Math.min(startIndex + serversPerPage, sortedGuilds.length);
    const pageGuilds = sortedGuilds.slice(startIndex, endIndex);

    const embed = new EmbedBuilder()
      .setTitle('Server Management Dashboard')
      .setDescription(`Connected to ${guilds.size} servers | Page ${currentPage + 1}/${totalPages}`)
      .setColor(0x2F3136)
      .setTimestamp();

    // Create simple server list with names and IDs
    let serverList = '';
    for (let i = 0; i < pageGuilds.length; i++) {
      const guild = pageGuilds[i];
      const globalIndex = startIndex + i + 1;
      
      serverList += `**${globalIndex}.** ${guild.name}\n\`${guild.id}\`\n\n`;
    }
    
    embed.addFields({
      name: 'Servers',
      value: serverList || 'No servers found',
      inline: false
    });

    // Remove View buttons - just show navigation
    const buttonRows = [];

    // Create navigation buttons
    const navRow = new ActionRowBuilder();
    
    // Previous page button
    if (currentPage > 0) {
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`server_page_${currentPage - 1}_${user.id}`)
          .setLabel('◀')
          .setStyle(ButtonStyle.Secondary)
      );
    }
    
    // Refresh button
    navRow.addComponents(
      new ButtonBuilder()
        .setCustomId(`refresh_servers_${user.id}`)
        .setLabel('Refresh')
        .setStyle(ButtonStyle.Secondary)
    );
    
    // Next page button
    if (currentPage < totalPages - 1) {
      navRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`server_page_${currentPage + 1}_${user.id}`)
          .setLabel('▶')
          .setStyle(ButtonStyle.Secondary)
      );
    }
    buttonRows.push(navRow);
    
    const allComponents = buttonRows;

    const replyOptions = {
      embeds: [embed],
      components: allComponents
    };
    
    if (isMessage) {
      await messageOrInteraction.reply(replyOptions);
    } else if (isDeferred) {
      await messageOrInteraction.editReply(replyOptions);
    } else {
      replyOptions.ephemeral = true;
      await messageOrInteraction.reply(replyOptions);
    }

  } catch (error) {
    sendError('Error in server list command:', error);
    const content = 'An error occurred while fetching server information.';
    const isMessage = messageOrInteraction.author !== undefined;
    const isDeferred = messageOrInteraction.deferred;
    
    if (isMessage) {
      await messageOrInteraction.reply(content);
    } else if (isDeferred) {
      await messageOrInteraction.editReply({ content });
    } else {
      await messageOrInteraction.reply({ content, ephemeral: true });
    }
  }
}

async function handleServerViewButton(interaction) {
  try {
    const [, , guildId, allowedUserId] = interaction.customId.split('_');
    
    // Check if user is authorized
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({
        content: 'mat kr lala mat kr',
        ephemeral: true
      });
    }

    const guild = interaction.client.guilds.cache.get(guildId);
    
    if (!guild) {
      return interaction.reply({
        content: 'Server not found or bot is no longer connected to this server.',
        ephemeral: true
      });
    }

    // Generate invite link
    let inviteLink = 'No invite available';
    try {
      const channels = guild.channels.cache.filter(c => c.type === 0);
      const defaultChannel = channels.find(c => c.permissionsFor(guild.members.me).has('CreateInstantInvite'));
      
      if (defaultChannel) {
        const invite = await defaultChannel.createInvite({
          maxAge: 3600,
          maxUses: 1,
          unique: true,
          reason: 'Bot owner server access'
        });
        inviteLink = invite.url;
      }
    } catch (error) {
      sendError('Failed to create invite:', error);
    }

    const embed = new EmbedBuilder()
      .setTitle('Server Invite Link')
      .setDescription(`**${guild.name}**`)
      .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
      .setColor(0x5865F2)
      .addFields(
        { name: 'Invite Link', value: inviteLink, inline: false },
        { name: 'Server Info', value: `Members: ${guild.memberCount.toLocaleString()}\nID: \`${guild.id}\``, inline: false }
      )
      .setTimestamp();

    await interaction.reply({
      embeds: [embed],
      ephemeral: true
    });

  } catch (error) {
    sendError('Error in server view:', error);
    await interaction.reply({
      content: 'An error occurred while fetching server details.',
      ephemeral: true
    });
  }
}

async function handlePageButton(interaction) {
  const [, , pageNum, allowedUserId] = interaction.customId.split('_');
  
  if (interaction.user.id !== allowedUserId) {
    return interaction.reply({
      content: 'mat kr lala mat kr',
      ephemeral: true
    });
  }

  const page = parseInt(pageNum, 10);
  await interaction.deferUpdate();
  await handleServerListCommand(interaction, page);
}

async function handleRefreshButton(interaction) {
  const allowedUserId = interaction.customId.split('_')[2];
  
  if (interaction.user.id !== allowedUserId) {
    return interaction.reply({
      content: 'mat kr lala mat kr',
      ephemeral: true
    });
  }

  await interaction.deferUpdate();
  await handleServerListCommand(interaction);
}

async function handleStatsButton(interaction) {
  try {
    const allowedUserId = interaction.customId.split('_')[2];
    
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({
        content: 'mat kr lala mat kr',
        ephemeral: true
      });
    }

    const client = interaction.client;
    const guilds = client.guilds.cache;
    
    const totalMembers = guilds.reduce((sum, guild) => sum + guild.memberCount, 0);
    const totalChannels = guilds.reduce((sum, guild) => sum + guild.channels.cache.size, 0);
    const totalRoles = guilds.reduce((sum, guild) => sum + guild.roles.cache.size, 0);
    
    const largestGuild = guilds.reduce((largest, guild) => 
      guild.memberCount > largest.memberCount ? guild : largest
    );

    const embed = new EmbedBuilder()
      .setTitle('Bot Statistics')
      .setColor(0x00FF00)
      .addFields(
        { name: 'Total Servers', value: guilds.size.toLocaleString(), inline: true },
        { name: 'Total Members', value: totalMembers.toLocaleString(), inline: true },
        { name: 'Total Channels', value: totalChannels.toLocaleString(), inline: true },
        { name: 'Total Roles', value: totalRoles.toLocaleString(), inline: true },
        { name: 'Average Members/Server', value: Math.round(totalMembers / guilds.size).toLocaleString(), inline: true },
        { name: 'Largest Server', value: `${largestGuild.name}\n${largestGuild.memberCount.toLocaleString()} members`, inline: true }
      )
      .setTimestamp();

    const backButton = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`back_to_servers_${interaction.user.id}`)
          .setLabel('Back to Server List')
          .setStyle(ButtonStyle.Secondary)
      );

    await interaction.reply({
      embeds: [embed],
      components: [backButton],
      ephemeral: true
    });

  } catch (error) {
    sendError('Error in stats view:', error);
    await interaction.reply({
      content: 'An error occurred while fetching statistics.',
      ephemeral: true
    });
  }
}

async function handleBackButton(interaction) {
  const allowedUserId = interaction.customId.split('_')[3];
  
  if (interaction.user.id !== allowedUserId) {
    return interaction.reply({
      content: 'mat kr lala mat kr',
      ephemeral: true
    });
  }

  await handleServerListCommand(interaction);
}

module.exports = {
  handleServerListCommand,
  handleServerInfoCommand,
  handleServerViewButton,
  handlePageButton,
  handleRefreshButton,
  handleStatsButton,
  handleBackButton
};