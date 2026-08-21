const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  PermissionFlagsBits
} = require('discord.js');
const { GuildRoles } = require('../database/raid-ping.model');
const { logError } = require('../utils/logger');

const RAID_ELEMENTS = ['light', 'dark', 'earth', 'fire', 'water', 'air', 'normal', 'grass', 'ice', 'electric'];

function canConfigure(interaction) {
  return interaction.user.id === process.env.BOT_OWNER_ID ||
    interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
}

function buildRaidConfigEmbed(settings) {
  const lines = RAID_ELEMENTS.map(element => {
    const roleId = settings?.roles?.[element];
    return `**${element}**: ${roleId ? `<@&${roleId}>` : 'Not configured'}`;
  });

  return new EmbedBuilder()
    .setTitle('Raid Role Configuration')
    .setDescription('Choose an element, then enter its Discord role ID.')
    .addFields({ name: 'Configured roles', value: lines.join('\n') })
    .setColor(0x5865f2)
    .setTimestamp();
}

function buildRaidConfigButtons(guildId) {
  const rows = [];
  for (let index = 0; index < RAID_ELEMENTS.length; index += 5) {
    const row = new ActionRowBuilder();
    RAID_ELEMENTS.slice(index, index + 5).forEach(element => {
      row.addComponents(new ButtonBuilder()
        .setCustomId(`raidconfig_open_${element}_${guildId}`)
        .setLabel(element)
        .setStyle(ButtonStyle.Secondary));
    });
    rows.push(row);
  }
  return rows;
}

async function loadSettings(guildId) {
  return GuildRoles.findOne({ guildId }).lean() || { guildId, roles: {} };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('raidconfig')
    .setDescription('Configure raid element role pings')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  async execute(interaction) {
    if (!interaction.guild) {
      return interaction.reply({ content: 'This command can only be used in a server.', ephemeral: true });
    }
    if (!canConfigure(interaction)) {
      return interaction.reply({ content: 'Administrator permission is required.', ephemeral: true });
    }

    const settings = await loadSettings(interaction.guild.id);
    await interaction.reply({
      embeds: [buildRaidConfigEmbed(settings)],
      components: buildRaidConfigButtons(interaction.guild.id),
      ephemeral: true
    });
  },

  async handleButton(interaction) {
    if (!interaction.customId.startsWith('raidconfig_open_')) return false;
    if (!canConfigure(interaction)) {
      await interaction.reply({ content: 'Administrator permission is required.', ephemeral: true });
      return true;
    }

    const [, , element, guildId] = interaction.customId.split('_');
    if (interaction.guild?.id !== guildId || !RAID_ELEMENTS.includes(element)) {
      await interaction.reply({ content: 'This configuration panel is no longer valid.', ephemeral: true });
      return true;
    }

    const modal = new ModalBuilder()
      .setCustomId(`raidconfig_submit_${element}_${guildId}`)
      .setTitle(`Configure ${element} role`)
      .addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('role_id')
          .setLabel('Discord role ID')
          .setPlaceholder('Example: 123456789012345678')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setMinLength(17)
          .setMaxLength(20)
      ));

    await interaction.showModal(modal);
    return true;
  },

  async handleModal(interaction) {
    if (!interaction.customId.startsWith('raidconfig_submit_')) return false;
    if (!canConfigure(interaction)) {
      await interaction.reply({ content: 'Administrator permission is required.', ephemeral: true });
      return true;
    }

    const [, , element, guildId] = interaction.customId.split('_');
    const roleId = interaction.fields.getTextInputValue('role_id').trim();
    if (interaction.guild?.id !== guildId || !RAID_ELEMENTS.includes(element)) {
      await interaction.reply({ content: 'This configuration panel is no longer valid.', ephemeral: true });
      return true;
    }
    if (!/^\d{17,20}$/.test(roleId)) {
      await interaction.reply({ content: 'Enter a valid Discord role ID (17-20 digits).', ephemeral: true });
      return true;
    }

    const role = await interaction.guild.roles.fetch(roleId).catch(() => null);
    if (!role) {
      await interaction.reply({ content: 'That role was not found in this server.', ephemeral: true });
      return true;
    }

    try {
      const settings = await GuildRoles.findOneAndUpdate(
        { guildId },
        { $set: { [`roles.${element}`]: role.id, updatedAt: new Date() }, $setOnInsert: { guildId } },
        { upsert: true, new: true }
      ).lean();

      await interaction.reply({
        embeds: [buildRaidConfigEmbed(settings)],
        components: buildRaidConfigButtons(guildId),
        ephemeral: true
      });
    } catch (error) {
      await logError('RAID_ROLE_CONFIG_SAVE_FAILED', error, { category: 'RAID_PING', guildId });
      await interaction.reply({ content: 'Failed to save that role configuration.', ephemeral: true });
    }
    return true;
  },

  RAID_ELEMENTS,
  buildRaidConfigEmbed,
  buildRaidConfigButtons
};
