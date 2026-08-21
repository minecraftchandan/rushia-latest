const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { sendLog, sendError } = require('../utils/logger');
const { getSettings, updateSettings } = require('../utils/settings.manager');
const { BOT_OWNER_ID } = require('../config/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('config')
    .setDescription('Configure bot settings with interactive toggles')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    // Check if user is bot owner or has admin permissions
    const isOwner = interaction.user.id === BOT_OWNER_ID;
    const hasAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

    if (!isOwner && !hasAdmin) {
      return await interaction.reply({ 
        content: '❌ You need Administrator permission to use this command.', 
        ephemeral: true 
      });
    }

    await interaction.deferReply({ ephemeral: true });

    try {
      const guildId = interaction.guild.id;
      const settings = await getSettings(guildId) || { guildId, luviEnabled: false };

      const embed = createConfigEmbed(settings);
      const components = createConfigButtons(settings, guildId);

      await interaction.editReply({ embeds: [embed], components });
    } catch (error) {
      sendError('Config command error:', error);
      await interaction.editReply('❌ An error occurred while loading configuration.');
    }
  }
};

function createConfigEmbed(settings) {
  const luviStatus = settings.luviEnabled ? '🟢 Enabled' : '🔴 Disabled';
  
  const embed = new EmbedBuilder()
    .setTitle('⚙️ Bot Configuration')
    .setDescription('Click the buttons below to toggle features on/off')
    .setColor(settings.luviEnabled ? 0x00ff00 : 0xff0000)
    .addFields(
      {
        name: '🤖 Luvi Bot Integration',
        value: `**Status:** ${luviStatus}\n**Description:** Enable/disable automatic detection of Luvi bot messages.\n\n**When Enabled:**\n✅ Boss spawn pings\n✅ Stamina reminders\n✅ Expedition reminders\n✅ Raid reminders\n✅ Drop tracking & leaderboard\n✅ Wishlist raid notifications\n✅ Inventory helper\n\n**Always Active:**\n🟢 POG alerts (hearts > 99)\n🟢 Series heart values\n\n**Default:** Disabled`,
        inline: false
      }
    )
    .setFooter({ text: 'Click buttons to toggle • Changes save automatically' })
    .setTimestamp();

  return embed;
}

function createConfigButtons(settings, guildId) {
  const luviButton = new ButtonBuilder()
    .setCustomId(`config_luvi_${guildId}`)
    .setLabel(settings.luviEnabled ? 'Luvi: Enabled' : 'Luvi: Disabled')
    .setEmoji(settings.luviEnabled ? '🟢' : '🔴')
    .setStyle(settings.luviEnabled ? ButtonStyle.Success : ButtonStyle.Danger);

  const row = new ActionRowBuilder().addComponents(luviButton);

  return [row];
}

async function handleConfigToggle(interaction) {
  if (!interaction.customId.startsWith('config_')) return false;

  const parts = interaction.customId.split('_');
  const feature = parts[1];
  const guildId = parts[2];

  if (interaction.guild.id !== guildId) {
    await interaction.reply({ content: '❌ This is not your server configuration!', ephemeral: true });
    return true;
  }

  // Check if user is bot owner or has admin permissions
  const isOwner = interaction.user.id === BOT_OWNER_ID;
  const hasAdmin = interaction.member.permissions.has(PermissionFlagsBits.Administrator);

  if (!isOwner && !hasAdmin) {
    await interaction.reply({ content: '❌ You need Administrator permission to change configuration.', ephemeral: true });
    return true;
  }

  await interaction.deferUpdate();

  try {
    const settings = await getSettings(guildId) || { guildId };

    if (feature === 'luvi') {
      const newValue = !settings.luviEnabled;
      await updateSettings(guildId, { luviEnabled: newValue });
      settings.luviEnabled = newValue;

      const embed = createConfigEmbed(settings);
      const components = createConfigButtons(settings, guildId);

      await interaction.editReply({ embeds: [embed], components });
    }

    return true;
  } catch (error) {
    sendError('Config toggle error:', error);
    await interaction.followUp({ content: '❌ Failed to update configuration.', ephemeral: true });
    return true;
  }
}

module.exports.handleConfigToggle = handleConfigToggle;
module.exports.createConfigEmbed = createConfigEmbed;
module.exports.createConfigButtons = createConfigButtons;

async function handleConfigCommand(message) {
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
    const settings = await getSettings(guildId) || { guildId, luviEnabled: false };

    const embed = createConfigEmbed(settings);
    const components = createConfigButtons(settings, guildId);

    await message.reply({ embeds: [embed], components });
  } catch (error) {
    sendError('Config command error:', error);
    await message.reply('❌ An error occurred while loading configuration.');
  }
}

module.exports.handleConfigCommand = handleConfigCommand;
