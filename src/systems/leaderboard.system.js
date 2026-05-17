const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { sendLog, sendError } = require('../utils/logger');
const Drops = require('../database/drops.model');
const RarityDrop = require('../database/rarity-drop.model');
const ClashCount = require('../database/clash-count.model');

async function handleRlbCommand(message) {
  const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
  const isOwner = message.author.id === BOT_OWNER_ID;
  const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
  const canPaginate = isOwner || isAdmin;

  try {
    const guildId = message.guild.id;
    
    // Get all droppers in this server
    const allDroppers = await Drops.find({ guildId })
      .sort({ drop_count: -1 });

    if (allDroppers.length === 0) {
      return message.channel.send('📊 No drops tracked yet in this server.').catch(() => {});
    }

    // Show top 10 for regular users, paginated for admin/owner
    const page = 0;
    const perPage = 10;
    const topDroppers = allDroppers.slice(page * perPage, (page + 1) * perPage);
    const totalDrops = allDroppers.reduce((sum, user) => sum + user.drop_count, 0);

    // Build leaderboard embed
    const totalParticipants = allDroppers.length;
    
    const embed = new EmbedBuilder()
      .setAuthor({ 
        name: message.guild.name, 
        iconURL: message.guild.iconURL({ dynamic: true }) 
      })
      .setTitle('🎴 Drop Leaderboard')
      .setThumbnail('https://cdn.discordapp.com/attachments/1446564927983849593/1466067284530434181/image0.gif')
      .setColor(0x0099ff);

    let rankings = '`S.No` • `Drops` • `User`\n';
    const maxDrops = Math.max(...topDroppers.map(u => u.drop_count));
    const maxWidth = Math.max(maxDrops.toString().length, 5);
    for (let i = 0; i < topDroppers.length; i++) {
      const user = topDroppers[i];
      const rank = `${(page * perPage) + i + 1}]`.padEnd(4, ' ');
      const drops = user.drop_count.toString().padStart(maxWidth, ' ');
      rankings += `\`${rank}\` • \`${drops}\` • <@${user.userId}>\n`;
    }
    embed.addFields({ name: '\u200b', value: rankings });
    
    if (canPaginate) {
      const totalPages = Math.ceil(allDroppers.length / perPage);
      embed.setFooter({ text: `Page ${page + 1}/${totalPages} | Participants: ${totalParticipants} | Total Drops: ${totalDrops}` });
    } else {
      embed.setFooter({ text: `Participants: ${totalParticipants} | Total Drops: ${totalDrops}` });
    }

    // Add buttons
    const rarityButton = new ButtonBuilder()
      .setCustomId(`view_rarity_drops_${message.author.id}`)
      .setLabel('Rare Drops')
      .setStyle(ButtonStyle.Primary);

    const resetButton = new ButtonBuilder()
      .setCustomId(`reset_drops_${message.author.id}`)
      .setLabel('Reset')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔄')
      .setDisabled(!isOwner && !isAdmin);

    const clashButton = new ButtonBuilder()
      .setCustomId(`view_clash_lb_${message.author.id}`)
      .setLabel('Clash')
      .setStyle(ButtonStyle.Success);

    const components = [rarityButton, clashButton, resetButton];

    // Add pagination for admin/owner if more than 10 entries
    if (canPaginate && allDroppers.length > perPage) {
      const prevButton = new ButtonBuilder()
        .setCustomId(`rlb_prev_${message.author.id}_${page}`)
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0);
      
      const nextButton = new ButtonBuilder()
        .setCustomId(`rlb_next_${message.author.id}_${page}`)
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled((page + 1) * perPage >= allDroppers.length);
      
      components.push(prevButton, nextButton);
    }

    const row = new ActionRowBuilder().addComponents(components);

    const reply = await message.channel.send({ embeds: [embed], components: [row] }).catch(() => {});
    
    // Disable buttons after 5 minutes
    setTimeout(async () => {
      try {
        const disabledComponents = components.map(btn => ButtonBuilder.from(btn).setDisabled(true));
        const disabledRow = new ActionRowBuilder().addComponents(disabledComponents);
        await reply.edit({ components: [disabledRow] }).catch(() => {});
      } catch (error) {
        // Silent fail
      }
    }, 5 * 60 * 1000);

  } catch (error) {
    message.reply('❌ An error occurred while fetching the leaderboard.').catch(() => {});
  }
}

async function handleRarityButton(interaction) {
  try {
    const parts = interaction.customId.split('_');
    const allowedUserId = parts[3];
    const currentPage = parts[4] ? parseInt(parts[4]) : 0;
    
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({ content: 'Dont click 😭', ephemeral: true });
    }

    const guildId = interaction.guild.id;
    
    // Get top 10 rarity droppers in this server
    const topRarity = await RarityDrop.find({ guildId })
      .sort({ legendary_count: -1, exotic_count: -1 })
      .limit(10);

    if (topRarity.length === 0) {
      const embed = new EmbedBuilder()
        .setAuthor({ 
          name: interaction.guild.name, 
          iconURL: interaction.guild.iconURL({ dynamic: true }) 
        })
        .setTitle('💎 Rarity Drop Leaderboard')
        .setDescription('📊 No Exotic/Legendary drops tracked yet in this server.')
        .setColor(0xFFD700)
        .setTimestamp();

      const backButton = new ButtonBuilder()
        .setCustomId(`back_to_drops_${interaction.user.id}_${currentPage}`)
        .setLabel('Back')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('⬅️');

      const resetButton = new ButtonBuilder()
        .setCustomId(`reset_drops_${interaction.user.id}`)
        .setLabel('Reset')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔄')
        .setDisabled(true);

      const row = new ActionRowBuilder().addComponents(backButton, resetButton);

      return interaction.update({ embeds: [embed], components: [row] });
    }

    // Build rarity embed
    const allRarity = await RarityDrop.find({ guildId });
    const totalLegendary = allRarity.reduce((sum, user) => sum + user.legendary_count, 0);
    const totalExotic = allRarity.reduce((sum, user) => sum + user.exotic_count, 0);

    const embed = new EmbedBuilder()
      .setAuthor({ 
        name: interaction.guild.name, 
        iconURL: interaction.guild.iconURL({ dynamic: true }) 
      })
      .setTitle('💎 Rarity Drop Leaderboard')
      .setColor(0xFFD700)
      .setTimestamp();

    let rankings = '`S.No` • <:exotic:1465638346670735410> • <:legendary:1465638343797903600> • `User`\n';
    const maxExotic = Math.max(...topRarity.map(u => u.exotic_count));
    const maxLegendary = Math.max(...topRarity.map(u => u.legendary_count));
    const exoticWidth = Math.max(maxExotic.toString().length, 3);
    const legendaryWidth = Math.max(maxLegendary.toString().length, 3);
    for (let i = 0; i < topRarity.length; i++) {
      const user = topRarity[i];
      const rank = `${i + 1}]`.padEnd(4, ' ');
      const exotic = user.exotic_count.toString().padStart(exoticWidth, ' ');
      const legendary = user.legendary_count.toString().padStart(legendaryWidth, ' ');
      rankings += `\`${rank}\` • \`${exotic}\` • \`${legendary}\` • <@${user.userId}>\n`;
    }
    embed.addFields({ name: '\u200b', value: rankings });
    embed.setFooter({ text: `Total: ${totalExotic} Exotic | ${totalLegendary} Legendary` });

    // Add back button with page info
    const backButton = new ButtonBuilder()
      .setCustomId(`back_to_drops_${interaction.user.id}_${currentPage}`)
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⬅️');

    const row = new ActionRowBuilder().addComponents(backButton);

    await interaction.update({ embeds: [embed], components: [row] });

  } catch (error) {
    await interaction.update({ content: '❌ An error occurred while fetching rarity drops.', embeds: [], components: [] });
  }
}

async function handleBackButton(interaction) {
  try {
    const parts = interaction.customId.split('_');
    const allowedUserId = parts[3];
    const currentPage = parts[4] ? parseInt(parts[4]) : 0;
    
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({ content: 'Dont click 😭', ephemeral: true });
    }

    const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
    const isOwner = interaction.user.id === BOT_OWNER_ID;
    const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);
    const canPaginate = isOwner || isAdmin;

    const guildId = interaction.guild.id;
    const allDroppers = await Drops.find({ guildId }).sort({ drop_count: -1 });
    const perPage = 10;
    const page = currentPage || 0;
    const topDroppers = allDroppers.slice(page * perPage, (page + 1) * perPage);
    const totalDrops = allDroppers.reduce((sum, user) => sum + user.drop_count, 0);

    const embed = new EmbedBuilder()
      .setAuthor({ 
        name: interaction.guild.name, 
        iconURL: interaction.guild.iconURL({ dynamic: true }) 
      })
      .setTitle('🎴 Drop Leaderboard')
      .setThumbnail('https://cdn.discordapp.com/attachments/1446564927983849593/1466067284530434181/image0.gif')
      .setColor(0x0099ff);

    let rankings = '`S.No` • `Drops` • `User`\n';
    const maxDrops = Math.max(...topDroppers.map(u => u.drop_count));
    const maxWidth = Math.max(maxDrops.toString().length, 5);
    for (let i = 0; i < topDroppers.length; i++) {
      const user = topDroppers[i];
      const rank = `${(page * perPage) + i + 1}]`.padEnd(4, ' ');
      const drops = user.drop_count.toString().padStart(maxWidth, ' ');
      rankings += `\`${rank}\` • \`${drops}\` • <@${user.userId}>\n`;
    }
    embed.addFields({ name: '\u200b', value: rankings });
    
    if (canPaginate) {
      const totalPages = Math.ceil(allDroppers.length / perPage);
      embed.setFooter({ text: `Page ${page + 1}/${totalPages} | Participants: ${allDroppers.length} | Total Drops: ${totalDrops}` });
    } else {
      embed.setFooter({ text: `Participants: ${allDroppers.length} | Total Drops: ${totalDrops}` });
    }

    const rarityButton = new ButtonBuilder()
      .setCustomId(`view_rarity_drops_${interaction.user.id}_${page}`)
      .setLabel('Rare Drops')
      .setStyle(ButtonStyle.Primary);

    const resetButton = new ButtonBuilder()
      .setCustomId(`reset_drops_${interaction.user.id}`)
      .setLabel('Reset')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🔄')
      .setDisabled(!isOwner && !isAdmin);

    const components = [rarityButton, resetButton];

    if (canPaginate && allDroppers.length > perPage) {
      const prevButton = new ButtonBuilder()
        .setCustomId(`rlb_prev_${interaction.user.id}_${page}`)
        .setLabel('◀')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0);
      
      const nextButton = new ButtonBuilder()
        .setCustomId(`rlb_next_${interaction.user.id}_${page}`)
        .setLabel('▶')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled((page + 1) * perPage >= allDroppers.length);
      
      components.push(prevButton, nextButton);
    }

    const row = new ActionRowBuilder().addComponents(components);
    await interaction.update({ embeds: [embed], components: [row] });

  } catch (error) {
    sendError('Back button error:', error);
  }
}

async function handleResetButton(interaction) {
  try {
    const allowedUserId = interaction.customId.split('_')[2];
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({ content: 'Dont click 😭', ephemeral: true });
    }

    const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
    if (interaction.user.id !== BOT_OWNER_ID && !interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return interaction.reply({ content: '❌ Only the bot owner or server administrators can reset the leaderboard.', ephemeral: true });
    }

    const select = new StringSelectMenuBuilder()
      .setCustomId(`reset_type_select_${interaction.user.id}`)
      .setPlaceholder('Choose what to reset...')
      .addOptions(
        { label: 'Drop', description: 'Reset all drop counts', value: 'drop' },
        { label: 'Rarity Drop', description: 'Reset all exotic/legendary counts', value: 'rarity' },
        { label: 'Clash', description: 'Reset all clash counts', value: 'clash' }
      );

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.reply({
      content: '🔄 **Select what to reset:**',
      components: [row],
      ephemeral: true
    });

  } catch (error) {
    await interaction.reply({ content: '❌ An error occurred while resetting.', ephemeral: true });
  }
}

async function handleResetTypeSelect(interaction) {
  try {
    const parts = interaction.customId.split('_');
    const allowedUserId = parts[3];
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({ content: 'Dont click 😭', ephemeral: true });
    }

    const type = interaction.values[0];
    const labels = { drop: 'Drop', rarity: 'Rarity Drop', clash: 'Clash' };

    const yesButton = new ButtonBuilder()
      .setCustomId(`confirm_reset_${interaction.guild.id}_${type}`)
      .setLabel('Yes, Reset')
      .setStyle(ButtonStyle.Danger);

    const noButton = new ButtonBuilder()
      .setCustomId('cancel_reset')
      .setLabel('Cancel')
      .setStyle(ButtonStyle.Secondary);

    const row = new ActionRowBuilder().addComponents(yesButton, noButton);

    await interaction.update({
      content: `⚠️ Are you sure you want to reset **${labels[type]}** data for this server? This cannot be undone.`,
      components: [row]
    });

  } catch (error) {
    await interaction.update({ content: '❌ An error occurred.', components: [] });
  }
}

async function handleConfirmReset(interaction) {
  try {
    const parts = interaction.customId.split('_');
    const guildId = parts[2];
    const type = parts[3];

    const typeMap = {
      drop: { model: Drops, label: 'Drop' },
      rarity: { model: RarityDrop, label: 'Rarity Drop' },
      clash: { model: ClashCount, label: 'Clash' }
    };

    if (type && typeMap[type]) {
      await typeMap[type].model.deleteMany({ guildId });
      await interaction.update({ content: `✅ **${typeMap[type].label}** leaderboard has been reset for this server.`, components: [] });
    } else {
      await Drops.deleteMany({ guildId });
      await RarityDrop.deleteMany({ guildId });
      await ClashCount.deleteMany({ guildId });
      await interaction.update({ content: '✅ All leaderboards have been reset for this server.', components: [] });
    }

  } catch (error) {
    await interaction.update({ content: '❌ An error occurred while resetting.', components: [] });
  }
}

async function handleCancelReset(interaction) {
  await interaction.update({ content: '❌ Reset cancelled.', components: [] });
}

async function handleClashButton(interaction) {
  try {
    const allowedUserId = interaction.customId.split('_')[3];
    if (interaction.user.id !== allowedUserId) {
      return interaction.reply({ content: 'Dont click 😭', ephemeral: true });
    }
    const guildId = interaction.guild.id;
    const topClash = await ClashCount.find({ guildId }).sort({ clash_count: -1 }).limit(10);
    const allClash = await ClashCount.find({ guildId });
    const totalClashes = allClash.reduce((sum, u) => sum + u.clash_count, 0);
    const embed = new EmbedBuilder()
      .setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) })
      .setTitle('⚔️ Clash Leaderboard')
      .setColor(0xe67e22);
    if (!topClash.length) {
      embed.setDescription('📊 No clashes tracked yet in this server.');
    } else {
      const maxWidth = Math.max(...topClash.map(u => u.clash_count.toString().length), 5);
      let rankings = '`S.No` • `Clashes` • `User`\n';
      for (let i = 0; i < topClash.length; i++) {
        const u = topClash[i];
        const rank = (i + 1) + ']';
        rankings += '`' + rank.padEnd(4, ' ') + '` • `' + u.clash_count.toString().padStart(maxWidth, ' ') + '` • <@' + u.userId + '>\n';
      }
      embed.addFields({ name: '\u200b', value: rankings });
      embed.setFooter({ text: 'Participants: ' + allClash.length + ' | Total Clashes: ' + totalClashes });
    }
    const back = new ButtonBuilder()
      .setCustomId('back_to_drops_' + interaction.user.id + '_0')
      .setLabel('Back')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji('⬅️');
    await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(back)] });
  } catch (error) {
    sendError('Clash lb error:', error);
    await interaction.update({ content: '❌ An error occurred.', embeds: [], components: [] });
  }
}

module.exports = { handleRlbCommand, handleRarityButton, handleClashButton, handleBackButton, handleResetButton, handleResetTypeSelect, handleConfirmReset, handleCancelReset };


async function handleRlbPagination(interaction) {
  if (!interaction.customId.startsWith('rlb_')) return false;

  const parts = interaction.customId.split('_');
  const action = parts[1];
  const userId = parts[2];
  const currentPage = parseInt(parts[3]);

  if (interaction.user.id !== userId) {
    await interaction.reply({ content: 'Dont click 😭', ephemeral: true });
    return true;
  }

  const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
  const isOwner = interaction.user.id === BOT_OWNER_ID;
  const isAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

  if (!isOwner && !isAdmin) {
    await interaction.reply({ content: '❌ Only admins can paginate.', ephemeral: true });
    return true;
  }

  const guildId = interaction.guild.id;
  const allDroppers = await Drops.find({ guildId }).sort({ drop_count: -1 });
  
  const perPage = 10;
  const totalPages = Math.ceil(allDroppers.length / perPage);
  let newPage = currentPage;

  if (action === 'next') newPage = Math.min(currentPage + 1, totalPages - 1);
  if (action === 'prev') newPage = Math.max(currentPage - 1, 0);

  const topDroppers = allDroppers.slice(newPage * perPage, (newPage + 1) * perPage);
  const totalDrops = allDroppers.reduce((sum, user) => sum + user.drop_count, 0);

  const embed = new EmbedBuilder()
    .setAuthor({ 
      name: interaction.guild.name, 
      iconURL: interaction.guild.iconURL({ dynamic: true }) 
    })
    .setTitle('🎴 Drop Leaderboard')
    .setThumbnail('https://cdn.discordapp.com/attachments/1446564927983849593/1466067284530434181/image0.gif')
    .setColor(0x0099ff);

  let rankings = '`S.No` • `Drops` • `User`\n';
  const maxDrops = Math.max(...topDroppers.map(u => u.drop_count));
  const maxWidth = Math.max(maxDrops.toString().length, 5);
  for (let i = 0; i < topDroppers.length; i++) {
    const user = topDroppers[i];
    const rank = `${(newPage * perPage) + i + 1}]`.padEnd(4, ' ');
    const drops = user.drop_count.toString().padStart(maxWidth, ' ');
    rankings += `\`${rank}\` • \`${drops}\` • <@${user.userId}>\n`;
  }
  embed.addFields({ name: '\u200b', value: rankings });
  embed.setFooter({ text: `Page ${newPage + 1}/${totalPages} | Participants: ${allDroppers.length} | Total Drops: ${totalDrops}` });

  const rarityButton = new ButtonBuilder()
    .setCustomId(`view_rarity_drops_${userId}`)
    .setLabel('Rare Drops')
    .setStyle(ButtonStyle.Primary);

  const resetButton = new ButtonBuilder()
    .setCustomId(`reset_drops_${userId}`)
    .setLabel('Reset')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🔄')
    .setDisabled(!isOwner && !isAdmin);

  const prevButton = new ButtonBuilder()
    .setCustomId(`rlb_prev_${userId}_${newPage}`)
    .setLabel('◀')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(newPage === 0);

  const nextButton = new ButtonBuilder()
    .setCustomId(`rlb_next_${userId}_${newPage}`)
    .setLabel('▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled((newPage + 1) * perPage >= allDroppers.length);

  const row = new ActionRowBuilder().addComponents(rarityButton, resetButton, prevButton, nextButton);

  await interaction.update({ embeds: [embed], components: [row] });
  return true;
}

module.exports.handleRlbPagination = handleRlbPagination;
