const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { logInfo, logError } = require('../utils/logger');
const BotSettings = require('../database/bot-settings.model');
const { BOT_OWNER_ID, COLORS } = require('../config/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('view-settings')
    .setDescription('View current boss tier ping roles'),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'This command can only be used in a server.', flags: 1 << 6 });
    }

    const member = interaction.member;

    const hasPermission =
      member.permissions.has(PermissionsBitField.Flags.ManageRoles) ||
      interaction.user.id === BOT_OWNER_ID;

    if (!hasPermission) {
      return interaction.reply({
        content: '❌ You do not have permission to use this command.',
        flags: 1 << 6,
      });
    }

    try {
      const guildId = interaction.guild.id;
      const settings = await BotSettings.findOne({ guildId });

      if (!settings) {
        return interaction.reply({
          content: '⚠️ No settings found for this server.',
         flags: 1 << 6,
        });
      }

      const multiRoleStatus = settings.multiRoleEnabled ? '✅ Enabled' : '❌ Disabled';
      
      let description = `**Multi-Role System:** ${multiRoleStatus}\n\n`;
      
      if (settings.multiRoleEnabled) {
        // Show tier-specific roles
        description += '**Boss Roles:**\n';
        description += `• Tier 1: ${settings.tier1RoleId ? `<@&${settings.tier1RoleId}>` : '❌ Not set'}\n`;
        description += `• Tier 2: ${settings.tier2RoleId ? `<@&${settings.tier2RoleId}>` : '❌ Not set'}\n`;
        description += `• Tier 3: ${settings.tier3RoleId ? `<@&${settings.tier3RoleId}>` : '❌ Not set'}\n`;
        description += `• Tier 4: ${settings.tier4RoleId ? `<@&${settings.tier4RoleId}>` : '❌ Not set'}`;
      } else {
        // Show single roles
        const bossRole = settings.bossRoleId ? `<@&${settings.bossRoleId}>` : '❌ Not set';
        
        description += `**Boss Role (All Tiers):** ${bossRole}`;
      }

      const embed = {
        color: COLORS.INFO,
        title: '📊 Current Role Settings',
        description,
        footer: { text: 'Use /multi-roles or /set-boss-role to update settings' }
      };

      await interaction.reply({ embeds: [embed], flags: 1 << 6 });
    } catch (error) {
      await logError('Failed to view settings', error);
      await interaction.reply({ content: '❌ An error occurred while trying to view settings.', flags: 1 << 6 });
    }
  },
};
