const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  MentionableSelectMenuBuilder,
  LabelBuilder,
  ModalBuilder,
  PermissionFlagsBits
} = require('discord.js');
const { GuildRoles } = require('../database/raid-ping.model');
const { BOT_OWNER_ID, RAID_ELEMENT_EMOJIS } = require('../config/constants');
const { logError } = require('../utils/logger');

const RAID_ELEMENTS = RAID_ELEMENT_EMOJIS.map(element => element.key);
const activeConfigMessages = new Map();

function canConfigure(interaction) {
  return interaction.user.id === BOT_OWNER_ID ||
    interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
}

function canConfigureMessage(message) {
  return message.author.id === BOT_OWNER_ID ||
    message.member?.permissions?.has(PermissionFlagsBits.Administrator);
}

function extractRoleId(value) {
  const input = String(value || '').trim();
  const mentionMatch = input.match(/^<@&(\d{17,20})>$/);
  if (mentionMatch) return mentionMatch[1];
  return /^\d{17,20}$/.test(input) ? input : null;
}

function findMentionableValue(components) {
  if (!Array.isArray(components)) return null;
  for (const component of components) {
    if (component?.type === 7 && Array.isArray(component.values) && component.values.length > 0) {
      return extractRoleId(component.values[0]);
    }
    const nested = findMentionableValue(component?.components || (component?.component ? [component.component] : []));
    if (nested) return nested;
  }
  return null;
}

function buildRaidConfigEmbed(settings) {
  const lines = RAID_ELEMENTS.map(element => {
    const roleId = settings?.roles?.[element] || (element === 'neutral' ? settings?.roles?.normal : null);
    return `${roleId ? '✅' : '❌'} **${element}**: ${roleId ? `<@&${roleId}>` : 'Not set'}`;
  });

  return new EmbedBuilder()
    .setTitle('Raid Role Configuration')
    .setDescription('Choose an element, then enter a role mention or role ID.')
    .addFields(
      { name: 'Element roles', value: lines.join('\n'), inline: false }
    )
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
        .setStyle(ButtonStyle.Primary));
    });
    rows.push(row);
  }
  return rows;
}

async function loadSettings(guildId) {
  return await GuildRoles.findForGuild(guildId) || { guildId, roles: {} };
}

module.exports = {
  async handleRaidConfigCommand(message) {
    if (!message.guild) {
      await message.reply('This command can only be used in a server.');
      return true;
    }
    if (!canConfigureMessage(message)) {
      await message.reply('Administrator permission is required.');
      return true;
    }

    const settings = await loadSettings(message.guild.id);
    await message.reply({
      embeds: [buildRaidConfigEmbed(settings)],
      components: buildRaidConfigButtons(message.guild.id)
    });
    return true;
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

    const roleSelect = new MentionableSelectMenuBuilder()
      .setCustomId('role_id')
      .setPlaceholder(`Select the ${element} role`)
      .setMinValues(1)
      .setMaxValues(1);

    const modal = new ModalBuilder()
      .setCustomId(`raidconfig_modal_${element}_${guildId}`)
      .setTitle(`Configure ${element} role`)
      .addLabelComponents(new LabelBuilder()
        .setLabel('Select the Discord role')
        .setDescription('Choose one role to ping for this element.')
        .setMentionableSelectMenuComponent(roleSelect));

    if (interaction.message) {
      activeConfigMessages.set(`${interaction.user.id}:${guildId}`, {
        channelId: interaction.channelId,
        messageId: interaction.message.id
      });
    }

    await interaction.showModal(modal);
    return true;
  },

  async handleRoleSelect(interaction) {
    if (!interaction.customId.startsWith('raidconfig_role_select_')) return false;
    if (!canConfigure(interaction)) {
      await interaction.reply({ content: 'Administrator permission is required.', ephemeral: true });
      return true;
    }

    const [, , , element, guildId] = interaction.customId.split('_');
    if (interaction.guild?.id !== guildId || !RAID_ELEMENTS.includes(element)) {
      await interaction.reply({ content: 'This role selector is no longer valid.', ephemeral: true });
      return true;
    }

    const roleId = interaction.values[0];
    const role = interaction.roles?.get(roleId) || await interaction.guild.roles.fetch(roleId).catch(() => null);
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

      await interaction.update({
        content: `Saved ${role} for **${element}**.`,
        embeds: [buildRaidConfigEmbed(settings)],
        components: buildRaidConfigButtons(guildId)
      });
    } catch (error) {
      await logError('RAID_ROLE_CONFIG_SAVE_FAILED', error, { category: 'RAID_PING', guildId });
      await interaction.reply({ content: 'Failed to save that role configuration.', ephemeral: true });
    }
    return true;
  },

  async handleModal(interaction) {
    if (!interaction.customId.startsWith('raidconfig_modal_') && !interaction.customId.startsWith('raidconfig_submit_')) return false;
    if (!canConfigure(interaction)) {
      await interaction.reply({ content: 'Administrator permission is required.', ephemeral: true });
      return true;
    }

    const [, , element, guildId] = interaction.customId.split('_');
    const roleId = interaction.customId.startsWith('raidconfig_modal_')
      ? findMentionableValue(interaction.components)
      : extractRoleId(interaction.fields.getTextInputValue('role_id'));
    if (interaction.guild?.id !== guildId || !RAID_ELEMENTS.includes(element)) {
      await interaction.reply({ content: 'This configuration panel is no longer valid.', ephemeral: true });
      return true;
    }
    if (!roleId) {
      await interaction.reply({ content: 'Select a role before submitting the modal.', ephemeral: true });
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

      const configMessage = activeConfigMessages.get(`${interaction.user.id}:${guildId}`);
      let editedOriginal = false;
      if (configMessage) {
        const channel = await interaction.client.channels.fetch(configMessage.channelId).catch(() => null);
        const originalMessage = await channel?.messages.fetch(configMessage.messageId).catch(() => null);
        if (originalMessage) {
          await originalMessage.edit({
            embeds: [buildRaidConfigEmbed(settings)],
            components: buildRaidConfigButtons(guildId)
          });
          editedOriginal = true;
        }
        activeConfigMessages.delete(`${interaction.user.id}:${guildId}`);
      }

      if (interaction.deferUpdate) {
        await interaction.deferUpdate();
      } else {
        await interaction.reply({ content: 'Role saved.', ephemeral: true });
      }
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
