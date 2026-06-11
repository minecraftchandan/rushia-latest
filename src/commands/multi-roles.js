const { SlashCommandBuilder, PermissionsBitField } = require('discord.js');
const BotSettings = require('../database/bot-settings.model');
const { refreshGuildCache } = require('../utils/cache-refresh');
const { BOT_OWNER_ID } = require('../config/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('multi-roles')
    .setDescription('Enable or disable multi-role system for boss tiers')
    .addSubcommand(subcommand =>
      subcommand
        .setName('enable')
        .setDescription('Enable multi-role system (separate roles for each tier)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('disable')
        .setDescription('Disable multi-role system (use single role for all bosses)'))
    .addSubcommand(subcommand =>
      subcommand
        .setName('set-boss')
        .setDescription('Set role for a specific boss tier')
        .addStringOption(option =>
          option.setName('tier')
            .setDescription('Boss tier')
            .setRequired(true)
            .addChoices(
              { name: 'Tier 1', value: 'tier1' },
              { name: 'Tier 2', value: 'tier2' },
              { name: 'Tier 3', value: 'tier3' },
              { name: 'Tier 4', value: 'tier4' }
            ))
        .addRoleOption(option =>
          option.setName('role')
            .setDescription('Role to ping for this tier')
            .setRequired(false))),

  async execute(interaction) {
    if (!interaction.inGuild()) {
      return interaction.reply({ content: 'This command can only be used in a server.', flags: 1 << 6 });
    }

    if (
      !interaction.member.permissions.has(PermissionsBitField.Flags.ManageRoles) &&
      interaction.user.id !== BOT_OWNER_ID
    ) {
      return interaction.reply({ content: '❌ You do not have permission to use this command.', flags: 1 << 6 });
    }

    const subcommand = interaction.options.getSubcommand();
    const guildId = interaction.guild.id;

    let settings = await BotSettings.findOne({ guildId });
    if (!settings) {
      settings = new BotSettings({ guildId });
    }

    if (subcommand === 'enable') {
      settings.multiRoleEnabled = true;
      await settings.save();
      
      // Refresh cache after updating settings
      await refreshGuildCache(guildId);
      
      return interaction.reply({
        content: '✅ Multi-role system enabled! Use `/multi-roles set-boss` to configure roles for each tier.',
        ephemeral: true
      });
    }

    if (subcommand === 'disable') {
      settings.multiRoleEnabled = false;
      await settings.save();
      
      // Refresh cache after updating settings
      await refreshGuildCache(guildId);
      
      return interaction.reply({
        content: '✅ Multi-role system disabled! Bot will use single role set via `/set-boss-role`.',
        ephemeral: true
      });
    }

    if (subcommand === 'set-boss') {
      if (!settings.multiRoleEnabled) {
        return interaction.reply({
          content: '❌ Multi-role system is not enabled! Use `/multi-roles enable` first.',
          ephemeral: true
        });
      }

      const tier = interaction.options.getString('tier');
      const role = interaction.options.getRole('role');
      
      const fieldName = `${tier}RoleId`;
      settings[fieldName] = role ? role.id : null;
      await settings.save();

      // Refresh cache after updating settings
      await refreshGuildCache(guildId);

      if (role) {
        return interaction.reply({
          content: `✅ ${tier.toUpperCase()} boss role set to ${role}`,
          ephemeral: true
        });
      } else {
        return interaction.reply({
          content: `✅ ${tier.toUpperCase()} boss role removed`,
          ephemeral: true
        });
      }
    }
  },
};
