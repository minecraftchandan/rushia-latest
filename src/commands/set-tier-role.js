const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const { sendLog, sendError } = require('../utils/logger');
const { getSettings, updateSettings } = require('../utils/settings.manager');
const { refreshGuildCache } = require('../utils/cache-refresh');
const { BOT_OWNER_ID } = require('../config/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('set-boss-role')
    .setDescription('Set or remove the role to ping for all boss spawns')
    .addRoleOption(option =>
      option
        .setName('role')
        .setDescription('Role to ping (leave empty to remove the role)')
        .setRequired(false)),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'This command can only be used in a server.', flags: 1 << 6 });
    }

    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles) &&
      interaction.user.id !== BOT_OWNER_ID
    ) {
      return interaction.reply({ content: 'You do not have permission to use this command.', flags: 1 << 6 });
    }

    const role = interaction.options.getRole('role');

    if (role && role.guild.id !== interaction.guild.id) {
      return interaction.reply({ content: '❌ The role must be from this server.', flags: 1 << 6 });
    }

    try {
      const settings = getSettings(interaction.guild.id) || { guildId: interaction.guild.id };

      const newSettings = {
        bossRoleId: role ? role.id : undefined
      };

      await updateSettings(interaction.guild.id, newSettings);
      
      // Refresh cache after updating settings
      await refreshGuildCache(interaction.guild.id);

      if (role) {
        await interaction.reply({ content: `✅ Role ${role} set for all boss spawns successfully!`, flags: 1 << 6 });
      } else {
        await interaction.reply({ content: `✅ Boss role has been removed.`, flags: 1 << 6});
      }
    } catch (error) {
      sendError(`[ERROR] Failed to set tier role: ${error.message}`, error);
      await interaction.reply({ content: '❌ An error occurred while trying to set the tier role.', flags: 1 << 6 });
    }
  }
};
