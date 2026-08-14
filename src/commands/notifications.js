const { SlashCommandBuilder } = require('discord.js');
const { handleNotificationView, handleNotificationSet } = require('../systems/reminders/user-notification.system');
const { REMINDER_TYPES } = require('../config/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('notifications')
    .setDescription('Manage your notification settings.')
    .addSubcommand(subcommand =>
      subcommand
        .setName('view')
        .setDescription('View your current notification settings.')
    )
    .addSubcommand(subcommand =>
      subcommand
        .setName('set')
        .setDescription('Enable or disable a notification type.')
        .addStringOption(option =>
          option.setName('type')
            .setDescription('The notification type to configure.')
            .setRequired(true)
            .addChoices(
              { name: 'Expedition', value: 'expedition' },
              { name: 'Stamina', value: 'stamina' },
              { name: 'Raid', value: 'raid' },
              { name: 'Raid Spawn Reminder', value: 'raidSpawnReminder' },
              { name: 'Drop', value: 'drop' }
            ))
        .addBooleanOption(option =>
          option.setName('enabled')
            .setDescription('Whether to enable or disable this notification.')
            .setRequired(true))
    ),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'view') {
      await handleNotificationView(interaction);
    } else if (subcommand === 'set') {
      await handleNotificationSet(interaction);
    }
  },
};
