const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const IconicCount = require('../../database/iconic-count.model');
const { BOT_OWNER_ID } = require('../../config/constants');

async function handleRilbCommand(message) {
  if (!message.guild) return;

  const guildId = message.guild.id;
  const allIconics = await IconicCount.find({ guildId }).sort({ iconic_count: -1 });
  if (allIconics.length === 0) {
    return message.channel.send('📊 No iconic raid stats tracked yet in this server.').catch(() => {});
  }

  const perPage = 10;
  const page = 0;
  const totalPages = Math.ceil(allIconics.length / perPage);
  const userIconicCount = allIconics.find(u => u.userId === message.author.id)?.iconic_count ?? 0;

  const embed = new EmbedBuilder()
    .setAuthor({ name: message.guild.name, iconURL: message.guild.iconURL({ dynamic: true }) })
    .setTitle('<:LU_Iconic:1390507592370880572> Iconic Leaderboard')
    .setColor(0xf1c40f);

  const slice = allIconics.slice(page * perPage, (page + 1) * perPage);
  const totalIconics = allIconics.reduce((sum, u) => sum + u.iconic_count, 0);
  const maxWidth = Math.max(...slice.map(u => u.iconic_count.toString().length), 5);

  let rankings = '`S.No` • `Iconics` • `User`\n';
  for (let i = 0; i < slice.length; i++) {
    const user = slice[i];
    const rank = `${page * perPage + i + 1}]`.padEnd(4, ' ');
    rankings += `\`${rank}\` • \`${user.iconic_count.toString().padStart(maxWidth, ' ')}\` • <@${user.userId}>\n`;
  }

  embed.addFields({ name: '\u200b', value: rankings });
  embed.setFooter({ text: `Page ${page + 1}/${totalPages} | Participants: ${allIconics.length} | Total Iconics: ${totalIconics} | Your Iconics: ${userIconicCount}` });

  const isOwner = message.author.id === BOT_OWNER_ID;
  const isAdmin = message.member?.permissions?.has(PermissionFlagsBits.Administrator);

  const resetButton = new ButtonBuilder()
    .setCustomId(`reset_drops_${message.author.id}`)
    .setLabel('Reset')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🔄')
    .setDisabled(!isOwner && !isAdmin);

  const prevButton = new ButtonBuilder()
    .setCustomId(`rilb_prev_${message.author.id}_${page}`)
    .setLabel('◀')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(true);

  const nextButton = new ButtonBuilder()
    .setCustomId(`rilb_next_${message.author.id}_${page}`)
    .setLabel('▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled((page + 1) * perPage >= allIconics.length);

  const row = new ActionRowBuilder().addComponents(resetButton, prevButton, nextButton);
  const reply = await message.channel.send({ embeds: [embed], components: [row] }).catch(() => null);

  if (reply) {
    setTimeout(async () => {
      try {
        const disabledButtons = [resetButton, prevButton, nextButton].map(btn => ButtonBuilder.from(btn).setDisabled(true));
        await reply.edit({ components: [new ActionRowBuilder().addComponents(disabledButtons)] }).catch(() => {});
      } catch {}
    }, 5 * 60 * 1000);
  }
}

async function handleRilbPagination(interaction) {
  if (!interaction.customId.startsWith('rilb_')) return false;

  const parts = interaction.customId.split('_');
  const action = parts[1];
  const userId = parts[2];
  const currentPage = parseInt(parts[3] || '0', 10);

  if (interaction.user.id !== userId) {
    await interaction.reply({ content: 'Dont click 😭', ephemeral: true });
    return true;
  }

  const guildId = interaction.guild.id;
  const allIconics = await IconicCount.find({ guildId }).sort({ iconic_count: -1 });
  const perPage = 10;
  const totalPages = Math.ceil(allIconics.length / perPage) || 1;

  let newPage = currentPage;
  if (action === 'next') newPage = Math.min(currentPage + 1, totalPages - 1);
  if (action === 'prev') newPage = Math.max(currentPage - 1, 0);

  const userIconicCount = allIconics.find(u => u.userId === interaction.user.id)?.iconic_count ?? 0;
  const slice = allIconics.slice(newPage * perPage, (newPage + 1) * perPage);
  const totalIconics = allIconics.reduce((sum, u) => sum + u.iconic_count, 0);
  const maxWidth = Math.max(...slice.map(u => u.iconic_count.toString().length), 5);

  const embed = new EmbedBuilder()
    .setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL({ dynamic: true }) })
    .setTitle('<:LU_Iconic:1390507592370880572> Iconic Leaderboard')
    .setColor(0xf1c40f);

  let rankings = '`S.No` • `Iconics` • `User`\n';
  for (let i = 0; i < slice.length; i++) {
    const user = slice[i];
    const rank = `${newPage * perPage + i + 1}]`.padEnd(4, ' ');
    rankings += `\`${rank}\` • \`${user.iconic_count.toString().padStart(maxWidth, ' ')}\` • <@${user.userId}>\n`;
  }

  embed.addFields({ name: '\u200b', value: rankings });
  embed.setFooter({ text: `Page ${newPage + 1}/${totalPages} | Participants: ${allIconics.length} | Total Iconics: ${totalIconics} | Your Iconics: ${userIconicCount}` });

  const isOwner = interaction.user.id === BOT_OWNER_ID;
  const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

  const resetButton = new ButtonBuilder()
    .setCustomId(`reset_drops_${interaction.user.id}`)
    .setLabel('Reset')
    .setStyle(ButtonStyle.Danger)
    .setEmoji('🔄')
    .setDisabled(!isOwner && !isAdmin);

  const prevButton = new ButtonBuilder()
    .setCustomId(`rilb_prev_${interaction.user.id}_${newPage}`)
    .setLabel('◀')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled(newPage === 0);

  const nextButton = new ButtonBuilder()
    .setCustomId(`rilb_next_${interaction.user.id}_${newPage}`)
    .setLabel('▶')
    .setStyle(ButtonStyle.Secondary)
    .setDisabled((newPage + 1) * perPage >= allIconics.length);

  await interaction.update({ embeds: [embed], components: [new ActionRowBuilder().addComponents(resetButton, prevButton, nextButton)] });
  return true;
}

module.exports = { handleRilbCommand, handleRilbPagination };
