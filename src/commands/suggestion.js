const { SlashCommandBuilder, EmbedBuilder } = require('discord.js');
const { sendLog, sendError } = require('../utils/logger');
const { BOT_OWNER_ID } = require('../config/constants');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('suggestion')
    .setDescription('Send a suggestion to the bot owner')
    .addStringOption(option =>
      option.setName('suggestion')
        .setDescription('Your suggestion for the bot')
        .setRequired(true)
        .setMaxLength(1000)
    ),

  async execute(interaction) {
    const suggestion = interaction.options.getString('suggestion');
    const user = interaction.user;
    const guild = interaction.guild;

    // Create suggestion embed
    const suggestionEmbed = new EmbedBuilder()
      .setTitle('💡 New Suggestion')
      .setDescription(suggestion)
      .addFields(
        { name: 'From', value: `${user.tag} (${user.id})`, inline: true },
        { name: 'Server', value: guild ? `${guild.name} (${guild.id})` : 'DM', inline: true },
        { name: 'Channel', value: interaction.channel ? `<#${interaction.channel.id}>` : 'DM', inline: true }
      )
      .setColor(0x00ff00)
      .setTimestamp()
      .setThumbnail(user.displayAvatarURL());

    try {
      // Get bot owner
      const owner = await interaction.client.users.fetch(BOT_OWNER_ID);
      
      // Send DM to owner
      await owner.send({
        content: `<@${BOT_OWNER_ID}> New suggestion from <@${user.id}>`,
        embeds: [suggestionEmbed]
      });

      // Confirm to user
      await interaction.reply({
        content: '✅ Your suggestion has been sent to the bot owner!',
        ephemeral: true
      });

    } catch (error) {
      sendError('Failed to send suggestion:', error);
      await interaction.reply({
        content: '❌ Failed to send suggestion. Please try again later.',
        ephemeral: true
      });
    }
  },
};