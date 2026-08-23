const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits, StringSelectMenuBuilder } = require('discord.js');
const { logError } = require('../../utils/logger');
const Drops = require('../../database/drops.model');
const RarityDrop = require('../../database/rarity-drop.model');
const ClashCount = require('../../database/clash-count.model');
const IconicCount = require('../../database/iconic-count.model');
const { BOT_OWNER_ID } = require('../../config/constants');

const PER_PAGE = 10;

// ─── Hub ─────────────────────────────────────────────────────────────────────

async function buildHubEmbed(guild) {
  const guildId = guild.id;
  const [drops, rarity, clash, iconic] = await Promise.all([
    Drops.find({ guildId }),
    RarityDrop.find({ guildId }),
    ClashCount.find({ guildId }),
    IconicCount.find({ guildId }),
  ]);

  const totalDrops  = drops.reduce((s, u) => s + u.drop_count, 0);
  const totalExotic = rarity.reduce((s, u) => s + u.exotic_count, 0);
  const totalLeg    = rarity.reduce((s, u) => s + u.legendary_count, 0);
  const totalClash  = clash.reduce((s, u) => s + u.clash_count, 0);
  const totalIconic = iconic.reduce((s, u) => s + u.iconic_count, 0);

  return new EmbedBuilder()
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
    .setTitle('📊 Server Leaderboards')
    .setColor(0x5865f2)
    .addFields(
      { name: '🎴 Drops',      value: `**${totalDrops}** total drops by **${drops.length}** players`,   inline: false },
      { name: '💎 Rare Drops', value: `**${totalExotic}** exotic · **${totalLeg}** legendary`,           inline: false },
      { name: '⚔️ Clashes',   value: `**${totalClash}** total clashes by **${clash.length}** players`,  inline: false },
      { name: '<:iconic:1541026862506053732> Iconics', value: `**${totalIconic}** total iconics by **${iconic.length}** players`, inline: false },
    )
    .setFooter({ text: 'Select a leaderboard below' });
}

function buildHubComponents(userId) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`lb_select_${userId}`)
    .setPlaceholder('Choose a leaderboard…')
    .addOptions(
      { label: 'Drops',      value: 'drop',   emoji: '🎴' },
      { label: 'Rare Drops', value: 'rarity', emoji: '💎' },
      { label: 'Clashes',    value: 'clash',  emoji: '⚔️' },
      { label: 'Iconics',    value: 'iconic', emoji: '🏆' },
    );
  return new ActionRowBuilder().addComponents(select);
}

async function handleRlbCommand(message) {
  if (!message.guild) return;
  const embed = await buildHubEmbed(message.guild);
  const row   = buildHubComponents(message.author.id);
  const reply = await message.channel.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (reply) setTimeout(() => disableAll(reply), 5 * 60 * 1000);
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function paginationButtons(prefix, userId, page, total) {
  return [
    new ButtonBuilder().setCustomId(`${prefix}_prev_${userId}_${page}`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
    new ButtonBuilder().setCustomId(`${prefix}_next_${userId}_${page}`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled((page + 1) * PER_PAGE >= total),
  ];
}

function resetButton(userId, isOwner, isAdmin) {
  return new ButtonBuilder()
    .setCustomId(`reset_drops_${userId}`)
    .setLabel('Reset').setStyle(ButtonStyle.Danger).setEmoji('🔄')
    .setDisabled(!isOwner && !isAdmin);
}

function buildDirectRow(userId, isOwner, isAdmin, prefix, total, page) {
  return new ActionRowBuilder().addComponents(
    resetButton(userId, isOwner, isAdmin),
    ...paginationButtons(prefix, userId, page, total),
  );
}

async function disableAll(reply) {
  try {
    const msg = await reply.fetch().catch(() => null);
    if (!msg) return;
    const disabled = msg.components.map(row => {
      const newRow = new ActionRowBuilder();
      newRow.addComponents(row.components.map(c => {
        if (c.type === 3) return StringSelectMenuBuilder.from(c).setDisabled(true);
        return ButtonBuilder.from(c).setDisabled(true);
      }));
      return newRow;
    });
    await reply.edit({ components: disabled }).catch(() => {});
  } catch {}
}

// ─── Drop leaderboard ─────────────────────────────────────────────────────────

function buildDropEmbed(guild, allDroppers, page, viewerId) {
  const slice      = allDroppers.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalDrops = allDroppers.reduce((s, u) => s + u.drop_count, 0);
  const totalPages = Math.ceil(allDroppers.length / PER_PAGE) || 1;
  const yours      = allDroppers.find(u => u.userId === viewerId)?.drop_count ?? 0;

  const embed = new EmbedBuilder()
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
    .setTitle('🎴 Drop Leaderboard')
    .setColor(0x0099ff);

  if (!slice.length) {
    embed.setDescription('📊 No drops tracked yet in this server.');
  } else {
    const maxW = Math.max(...slice.map(u => u.drop_count.toString().length), 5);
    let r = '`S.No` • `Drops` • `User`\n';
    slice.forEach((u, i) => {
      r += `\`${`${page * PER_PAGE + i + 1}]`.padEnd(4)}\` • \`${u.drop_count.toString().padStart(maxW)}\` • <@${u.userId}>\n`;
    });
    embed.addFields({ name: '\u200b', value: r });
    embed.setFooter({ text: `Page ${page + 1}/${totalPages} | Participants: ${allDroppers.length} | Total: ${totalDrops} | Yours: ${yours}` });
  }
  return embed;
}

// ─── Rarity leaderboard ───────────────────────────────────────────────────────

function buildRarityEmbed(guild, slice, allRarity, page, viewerId) {
  const totalExotic = allRarity.reduce((s, u) => s + u.exotic_count, 0);
  const totalLeg    = allRarity.reduce((s, u) => s + u.legendary_count, 0);
  const totalPages  = Math.ceil(allRarity.length / PER_PAGE) || 1;

  const embed = new EmbedBuilder()
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
    .setTitle('💎 Rare Drop Leaderboard')
    .setColor(0xffd700);

  if (!slice.length) {
    embed.setDescription('📊 No exotic/legendary drops tracked yet in this server.');
  } else {
    const maxE = Math.max(...slice.map(u => u.exotic_count.toString().length), 3);
    const maxL = Math.max(...slice.map(u => u.legendary_count.toString().length), 3);
    let r = '`S.No` • <:exotic:1465638346670735410> • <:legendary:1465638343797903600> • `User`\n';
    slice.forEach((u, i) => {
      r += `\`${`${page * PER_PAGE + i + 1}]`.padEnd(4)}\` • \`${u.exotic_count.toString().padStart(maxE)}\` • \`${u.legendary_count.toString().padStart(maxL)}\` • <@${u.userId}>\n`;
    });
    embed.addFields({ name: '\u200b', value: r });
    embed.setFooter({ text: `Page ${page + 1}/${totalPages} | Total: ${totalExotic} Exotic · ${totalLeg} Legendary` });
  }
  return embed;
}

// ─── Clash leaderboard ────────────────────────────────────────────────────────

function buildClashEmbed(guild, allClash, page, viewerId) {
  const slice      = allClash.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalClash = allClash.reduce((s, u) => s + u.clash_count, 0);
  const totalPages = Math.ceil(allClash.length / PER_PAGE) || 1;
  const yours      = allClash.find(u => u.userId === viewerId)?.clash_count ?? 0;

  const embed = new EmbedBuilder()
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
    .setTitle('⚔️ Clash Leaderboard')
    .setColor(0xe67e22);

  if (!slice.length) {
    embed.setDescription('📊 No clashes tracked yet in this server.');
  } else {
    const maxW = Math.max(...slice.map(u => u.clash_count.toString().length), 5);
    let r = '`S.No` • `Clashes` • `User`\n';
    slice.forEach((u, i) => {
      r += `\`${`${page * PER_PAGE + i + 1}]`.padEnd(4)}\` • \`${u.clash_count.toString().padStart(maxW)}\` • <@${u.userId}>\n`;
    });
    embed.addFields({ name: '\u200b', value: r });
    embed.setFooter({ text: `Page ${page + 1}/${totalPages} | Participants: ${allClash.length} | Total: ${totalClash} | Yours: ${yours}` });
  }
  return embed;
}

// ─── Iconic leaderboard ───────────────────────────────────────────────────────

function buildIconicEmbed(guild, allIconics, page, viewerId) {
  const slice       = allIconics.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const totalIconic = allIconics.reduce((s, u) => s + u.iconic_count, 0);
  const totalPages  = Math.ceil(allIconics.length / PER_PAGE) || 1;
  const yours       = allIconics.find(u => u.userId === viewerId)?.iconic_count ?? 0;

  const embed = new EmbedBuilder()
    .setAuthor({ name: guild.name, iconURL: guild.iconURL({ dynamic: true }) })
    .setTitle('<:iconic:1541026862506053732> Iconic Leaderboard')
    .setColor(0xf1c40f);

  if (!slice.length) {
    embed.setDescription('📊 No iconics tracked yet in this server.');
  } else {
    const maxW = Math.max(...slice.map(u => u.iconic_count.toString().length), 5);
    let r = '`S.No` • `Iconics` • `User`\n';
    slice.forEach((u, i) => {
      r += `\`${`${page * PER_PAGE + i + 1}]`.padEnd(4)}\` • \`${u.iconic_count.toString().padStart(maxW)}\` • <@${u.userId}>\n`;
    });
    embed.addFields({ name: '\u200b', value: r });
    embed.setFooter({ text: `Page ${page + 1}/${totalPages} | Participants: ${allIconics.length} | Total: ${totalIconic} | Yours: ${yours}` });
  }
  return embed;
}

// ─── Hub show functions (keep dropdown) ──────────────────────────────────────

async function showDropLb(target, userId, page, isOwner, isAdmin) {
  const allDroppers = await Drops.find({ guildId: target.guild.id }).sort({ drop_count: -1 });
  const embed       = buildDropEmbed(target.guild, allDroppers, page, userId);
  const selectRow   = buildHubComponents(userId);
  const btnRow      = new ActionRowBuilder().addComponents(resetButton(userId, isOwner, isAdmin), ...paginationButtons('hub_dlb', userId, page, allDroppers.length));
  return { embed, components: [selectRow, btnRow] };
}

async function showRarityLb(target, userId, page, isOwner, isAdmin) {
  const allRarity = await RarityDrop.find({ guildId: target.guild.id }).sort({ legendary_count: -1, exotic_count: -1 });
  const slice     = allRarity.slice(page * PER_PAGE, (page + 1) * PER_PAGE);
  const embed     = buildRarityEmbed(target.guild, slice, allRarity, page, userId);
  const selectRow = buildHubComponents(userId);
  const btnRow    = new ActionRowBuilder().addComponents(resetButton(userId, isOwner, isAdmin), ...paginationButtons('hub_rrlb', userId, page, allRarity.length));
  return { embed, components: [selectRow, btnRow] };
}

async function showClashLb(target, userId, page, isOwner, isAdmin) {
  const allClash  = await ClashCount.find({ guildId: target.guild.id }).sort({ clash_count: -1 });
  const embed     = buildClashEmbed(target.guild, allClash, page, userId);
  const selectRow = buildHubComponents(userId);
  const btnRow    = new ActionRowBuilder().addComponents(resetButton(userId, isOwner, isAdmin), ...paginationButtons('hub_rclb', userId, page, allClash.length));
  return { embed, components: [selectRow, btnRow] };
}

async function showIconicLb(target, userId, page, isOwner, isAdmin) {
  const allIconics = await IconicCount.find({ guildId: target.guild.id }).sort({ iconic_count: -1 });
  const embed      = buildIconicEmbed(target.guild, allIconics, page, userId);
  const selectRow  = buildHubComponents(userId);
  const btnRow     = new ActionRowBuilder().addComponents(resetButton(userId, isOwner, isAdmin), ...paginationButtons('hub_rilb', userId, page, allIconics.length));
  return { embed, components: [selectRow, btnRow] };
}

// ─── Direct commands ──────────────────────────────────────────────────────────

async function handleRdlbCommand(message) {
  if (!message.guild) return;
  const isOwner     = message.author.id === BOT_OWNER_ID;
  const isAdmin     = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
  const allDroppers = await Drops.find({ guildId: message.guild.id }).sort({ drop_count: -1 });
  const embed       = buildDropEmbed(message.guild, allDroppers, 0, message.author.id);
  const row         = buildDirectRow(message.author.id, isOwner, isAdmin, 'dlb', allDroppers.length, 0);
  const reply       = await message.channel.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (reply) setTimeout(() => disableAll(reply), 5 * 60 * 1000);
}

async function handleRrlbCommand(message) {
  if (!message.guild) return;
  const isOwner   = message.author.id === BOT_OWNER_ID;
  const isAdmin   = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
  const allRarity = await RarityDrop.find({ guildId: message.guild.id }).sort({ legendary_count: -1, exotic_count: -1 });
  const embed     = buildRarityEmbed(message.guild, allRarity.slice(0, PER_PAGE), allRarity, 0, message.author.id);
  const row       = buildDirectRow(message.author.id, isOwner, isAdmin, 'rrlb', allRarity.length, 0);
  const reply     = await message.channel.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (reply) setTimeout(() => disableAll(reply), 5 * 60 * 1000);
}

async function handleRclbCommand(message) {
  if (!message.guild) return;
  const isOwner  = message.author.id === BOT_OWNER_ID;
  const isAdmin  = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
  const allClash = await ClashCount.find({ guildId: message.guild.id }).sort({ clash_count: -1 });
  const embed    = buildClashEmbed(message.guild, allClash, 0, message.author.id);
  const row      = buildDirectRow(message.author.id, isOwner, isAdmin, 'rclb', allClash.length, 0);
  const reply    = await message.channel.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (reply) setTimeout(() => disableAll(reply), 5 * 60 * 1000);
}

async function handleRilbCommand(message) {
  if (!message.guild) return;
  const isOwner    = message.author.id === BOT_OWNER_ID;
  const isAdmin    = message.member?.permissions?.has(PermissionFlagsBits.Administrator);
  const allIconics = await IconicCount.find({ guildId: message.guild.id }).sort({ iconic_count: -1 });
  const embed      = buildIconicEmbed(message.guild, allIconics, 0, message.author.id);
  const row        = buildDirectRow(message.author.id, isOwner, isAdmin, 'rilb', allIconics.length, 0);
  const reply      = await message.channel.send({ embeds: [embed], components: [row] }).catch(() => null);
  if (reply) setTimeout(() => disableAll(reply), 5 * 60 * 1000);
}

// ─── Interaction handlers ─────────────────────────────────────────────────────

async function handleLbSelect(interaction) {
  if (!interaction.customId.startsWith('lb_select_')) return false;
  const userId = interaction.customId.split('_')[2];
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: 'Dont click 😭', ephemeral: true });
    return true;
  }
  const type    = interaction.values[0];
  const isOwner = interaction.user.id === BOT_OWNER_ID;
  const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
  let result;
  if (type === 'drop')   result = await showDropLb(interaction, userId, 0, isOwner, isAdmin);
  if (type === 'rarity') result = await showRarityLb(interaction, userId, 0, isOwner, isAdmin);
  if (type === 'clash')  result = await showClashLb(interaction, userId, 0, isOwner, isAdmin);
  if (type === 'iconic') result = await showIconicLb(interaction, userId, 0, isOwner, isAdmin);
  await interaction.update({ embeds: [result.embed], components: result.components });
  return true;
}

async function handleLbPagination(interaction) {
  const match = interaction.customId.match(/^(hub_dlb|hub_rrlb|hub_rclb|hub_rilb|dlb|rrlb|rclb|rilb)_(prev|next)_(\d+)_(\d+)$/);
  if (!match) return false;
  const [, prefix, action, userId, currentPageStr] = match;
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: 'Dont click 😭', ephemeral: true });
    return true;
  }
  const isOwner     = interaction.user.id === BOT_OWNER_ID;
  const isAdmin     = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
  const currentPage = parseInt(currentPageStr, 10);
  const guildId     = interaction.guild.id;
  const isHub       = prefix.startsWith('hub_');
  const base        = isHub ? prefix.slice(4) : prefix;

  let allData;
  if (base === 'dlb')  allData = await Drops.find({ guildId }).sort({ drop_count: -1 });
  if (base === 'rrlb') allData = await RarityDrop.find({ guildId }).sort({ legendary_count: -1, exotic_count: -1 });
  if (base === 'rclb') allData = await ClashCount.find({ guildId }).sort({ clash_count: -1 });
  if (base === 'rilb') allData = await IconicCount.find({ guildId }).sort({ iconic_count: -1 });

  const total      = allData.length;
  const totalPages = Math.ceil(total / PER_PAGE) || 1;
  let newPage      = currentPage;
  if (action === 'next') newPage = Math.min(currentPage + 1, totalPages - 1);
  if (action === 'prev') newPage = Math.max(currentPage - 1, 0);

  let embed;
  if (base === 'dlb')  embed = buildDropEmbed(interaction.guild, allData, newPage, userId);
  if (base === 'rrlb') embed = buildRarityEmbed(interaction.guild, allData.slice(newPage * PER_PAGE, (newPage + 1) * PER_PAGE), allData, newPage, userId);
  if (base === 'rclb') embed = buildClashEmbed(interaction.guild, allData, newPage, userId);
  if (base === 'rilb') embed = buildIconicEmbed(interaction.guild, allData, newPage, userId);

  let components;
  if (isHub) {
    components = [
      buildHubComponents(userId),
      new ActionRowBuilder().addComponents(resetButton(userId, isOwner, isAdmin), ...paginationButtons(prefix, userId, newPage, total)),
    ];
  } else {
    components = [buildDirectRow(userId, isOwner, isAdmin, prefix, total, newPage)];
  }

  await interaction.update({ embeds: [embed], components });
  return true;
}

// ─── Reset handlers ───────────────────────────────────────────────────────────

async function handleResetButton(interaction) {
  const isOwner = interaction.user.id === BOT_OWNER_ID;
  const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
  if (!isOwner && !isAdmin) {
    return interaction.reply({ content: '❌ Only the bot owner or server administrators can reset the leaderboard.', ephemeral: true });
  }
  const select = new StringSelectMenuBuilder()
    .setCustomId(`reset_type_select_${interaction.user.id}`)
    .setPlaceholder('Choose what to reset…')
    .addOptions(
      { label: 'Drops',      description: 'Reset all drop counts',             value: 'drop'   },
      { label: 'Rare Drops', description: 'Reset all exotic/legendary counts', value: 'rarity' },
      { label: 'Clashes',    description: 'Reset all clash counts',            value: 'clash'  },
      { label: 'Iconics',    description: 'Reset all iconic counts',           value: 'iconic' },
    );
  await interaction.reply({ content: '🔄 **Select what to reset:**', components: [new ActionRowBuilder().addComponents(select)], ephemeral: true });
}

async function handleResetTypeSelect(interaction) {
  const isOwner = interaction.user.id === BOT_OWNER_ID;
  const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
  if (!isOwner && !isAdmin) {
    return interaction.reply({ content: '❌ Only the bot owner or server administrators can reset the leaderboard.', ephemeral: true });
  }
  const type   = interaction.values[0];
  const labels = { drop: 'Drops', rarity: 'Rare Drops', clash: 'Clashes', iconic: 'Iconics' };
  const yes    = new ButtonBuilder().setCustomId(`confirm_reset_${interaction.guild.id}_${type}`).setLabel('Yes, Reset').setStyle(ButtonStyle.Danger);
  const no     = new ButtonBuilder().setCustomId('cancel_reset').setLabel('Cancel').setStyle(ButtonStyle.Secondary);
  await interaction.update({ content: `⚠️ Reset **${labels[type]}** for this server? This cannot be undone.`, components: [new ActionRowBuilder().addComponents(yes, no)] });
}

async function handleConfirmReset(interaction) {
  const isOwner = interaction.user.id === BOT_OWNER_ID;
  const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
  if (!isOwner && !isAdmin) {
    return interaction.reply({ content: '❌ Only the bot owner or server administrators can reset the leaderboard.', ephemeral: true });
  }
  const parts   = interaction.customId.split('_');
  const guildId = parts[2];
  const type    = parts[3];
  const map     = { drop: Drops, rarity: RarityDrop, clash: ClashCount, iconic: IconicCount };
  const labels  = { drop: 'Drops', rarity: 'Rare Drops', clash: 'Clashes', iconic: 'Iconics' };
  if (map[type]) {
    await map[type].deleteMany({ guildId });
    await interaction.update({ content: `✅ **${labels[type]}** leaderboard reset.`, components: [] });
  }
}

async function handleCancelReset(interaction) {
  await interaction.update({ content: '❌ Reset cancelled.', components: [] });
}

async function handleAdminRCommand(message) {
  // Admin-only manual add/remove points: Usage examples
  // radd @user d 10    -> add 10 drops
  // radd @user drop 1  -> add 1 drop
  // rdel @user r 5     -> remove 5 rarity points
  // aliases: d|drop, r|rare|rarity, c|clash, i|iconic
  try {
    if (!message.guild) return;
    const isOwner = message.author.id === BOT_OWNER_ID;
    const isAdmin = message.member.permissions.has(PermissionFlagsBits.Administrator);
    if (!isOwner && !isAdmin) return message.channel.send('❌ Only server administrators or the bot owner can use this command.').catch(() => {});

    // Prefer the mention-stripped commandContent when present (mention form), otherwise fall back to raw message.content
    const raw = (message.commandContent && message.commandContent.trim().length) ? message.commandContent.trim() : message.content.trim();
    const parts = raw.split(/\s+/);
    // Accept both prefixed and full commands: radd/rdel OR add/del (when using single-letter 'r' prefix)
    const cmd = parts[0].toLowerCase();
    if (!['radd','rdel','add','del'].includes(cmd)) return;

    if (parts.length < 3) return message.channel.send('Usage: radd @user <d|drop|r|rare|rarity|ex|leg|c|clash|i|iconic> <amount>').catch(() => {});

    // parse mention / id
    const mention = parts[1];
    const userIdMatch = mention.match(/^<@!?(\d+)>$/) || mention.match(/^(\d+)$/);
    if (!userIdMatch) return message.channel.send('Please mention a user or provide a user id.').catch(() => {});
    const targetUserId = userIdMatch[1];

    let typeAlias = (parts[2] || '').toLowerCase();
    let amount = 1;
    let rarityField = null; // for RarityDrop: 'exotic_count' or 'legendary_count'

    // handle rarities with subtypes: examples
    // radd @user r ex 1   -> parts[2]='r', parts[3]='ex', parts[4]='1'
    // radd @user ex 1     -> parts[2]='ex', parts[3]='1'
    if (['ex','exotic','leg','legendary'].includes(typeAlias)) {
      // direct subtype given
      rarityField = (['ex','exotic'].includes(typeAlias)) ? 'exotic_count' : 'legendary_count';
      amount = parts[3] ? parseInt(parts[3], 10) : 1;
    } else if (['r','rare','rarity'].includes(typeAlias)) {
      const sub = (parts[3] || '').toLowerCase();
      if (['ex','exotic'].includes(sub)) {
        rarityField = 'exotic_count';
        amount = parts[4] ? parseInt(parts[4], 10) : 1;
      } else if (['leg','legendary'].includes(sub)) {
        rarityField = 'legendary_count';
        amount = parts[4] ? parseInt(parts[4], 10) : 1;
      } else {
        // default to exotic if no subtype given, amount in parts[3]
        rarityField = 'exotic_count';
        amount = parts[3] ? parseInt(parts[3], 10) : 1;
      }
    } else {
      // non-rarity types: amount is parts[3]
      amount = parts[3] ? parseInt(parts[3], 10) : 1;
    }

    if (isNaN(amount) || amount === 0) return message.channel.send('Please provide a non-zero integer amount.').catch(() => {});

    // resolve leaderboard and model
    let model = null;
    let label = null;
    if (['d','drop'].includes(typeAlias)) { model = Drops; label = 'Drop'; }
    else if (['r','rare','rarity','ex','exotic','leg','legendary'].includes(typeAlias)) { model = RarityDrop; label = 'Rarity Drop'; }
    else if (['c','clash'].includes(typeAlias)) { model = ClashCount; label = 'Clash'; }
    else if (['i','iconic'].includes(typeAlias)) { model = IconicCount; label = 'Iconic'; }
    else return message.channel.send('Unknown leaderboard type. Use d/r/c/i and for rarity use ex|leg or r ex|r leg.').catch(() => {});

    const guildId = message.guild.id;
    // upsert the target user's record
    const existing = await model.findOne({ guildId, userId: targetUserId });
    const isAdd = ['radd','add'].includes(cmd);

    if (isAdd) {
      if (existing) {
        // increment appropriate field
        if (model === RarityDrop) {
          if (!rarityField) rarityField = 'exotic_count';
          existing[rarityField] = (existing[rarityField] || 0) + amount;
        } else if (model === ClashCount) {
          existing.clash_count = (existing.clash_count || 0) + amount;
        } else if (model === IconicCount) {
          existing.iconic_count = (existing.iconic_count || 0) + amount;
        } else {
          existing.drop_count = (existing.drop_count || 0) + amount;
        }
        await existing.save();
      } else {
        const doc = { guildId, userId: targetUserId };
        if (model === RarityDrop) doc[rarityField || 'exotic_count'] = amount; else if (model === ClashCount) doc.clash_count = amount; else if (model === IconicCount) doc.iconic_count = amount; else doc.drop_count = amount;
        await model.create(doc);
      }
      return message.channel.send(`✅ ${Math.abs(amount)} ${label} point(s) added to <@${targetUserId}>`).catch(() => {});
    } else {
      // remove
      if (!existing) return message.channel.send('User has no record in this leaderboard.').catch(() => {});
      if (model === RarityDrop) {
        if (!rarityField) rarityField = 'exotic_count';
        existing[rarityField] = Math.max(0, (existing[rarityField] || 0) - Math.abs(amount));
      } else if (model === ClashCount) existing.clash_count = Math.max(0, (existing.clash_count || 0) - Math.abs(amount));
      else if (model === IconicCount) existing.iconic_count = Math.max(0, (existing.iconic_count || 0) - Math.abs(amount));
      else existing.drop_count = Math.max(0, (existing.drop_count || 0) - Math.abs(amount));
      await existing.save();
      return message.channel.send(`✅ ${Math.abs(amount)} ${label} point(s) removed from <@${targetUserId}>`).catch(() => {});
    }
  } catch (err) {
    await logError('Admin R command error', err);
    return message.channel.send('❌ An error occurred while processing the command.').catch(() => {});
  }
}

module.exports = {
  handleRlbCommand,
  handleRdlbCommand,
  handleRrlbCommand,
  handleRclbCommand,
  handleRilbCommand,
  handleLbSelect,
  handleLbPagination,
  handleResetButton,
  handleResetTypeSelect,
  handleConfirmReset,
  handleCancelReset,
  handleAdminRCommand,
};
