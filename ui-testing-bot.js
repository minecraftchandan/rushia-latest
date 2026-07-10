const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const {
  Client,
  GatewayIntentBits,
  Events,
  REST,
  Routes,
  SlashCommandBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  UserSelectMenuBuilder,
  RoleSelectMenuBuilder,
  MentionableSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  EmbedBuilder
} = require('discord.js');

const TOKEN = process.env.BOT_TOKEN;
const CLIENT_ID = process.env.CLIENT_ID;
const GUILD_ID = process.env.GUILD_ID;

if (!TOKEN || !CLIENT_ID) {
  console.error('Missing BOT_TOKEN or CLIENT_ID in environment variables.');
  process.exit(1);
}

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

const uiCommand = new SlashCommandBuilder()
  .setName('ui-demo')
  .setDescription('Launch the standalone Discord UI component demo');

const commands = [uiCommand.toJSON()];

async function registerCommands() {
  const rest = new REST({ version: '10' }).setToken(TOKEN);

  try {
    if (GUILD_ID) {
      console.log(`Registering guild command for ${GUILD_ID}...`);
      await rest.put(Routes.applicationGuildCommands(CLIENT_ID, GUILD_ID), { body: commands });
      console.log('Guild command registered successfully.');
    } else {
      console.log('Registering global command...');
      await rest.put(Routes.applicationCommands(CLIENT_ID), { body: commands });
      console.log('Global command registered successfully.');
    }
  } catch (error) {
    console.error('Command registration failed:', error);
    process.exit(1);
  }
}

function createDemoEmbed() {
  return new EmbedBuilder()
    .setTitle('🧩 Discord UI Component Demo')
    .setDescription('This demo shows buttons, select menus, modals, and modern Discord UI interaction patterns.')
    .setColor(0x5865F2)
    .addFields(
      { name: 'Buttons', value: 'Open a test modal or open a mentionable select.', inline: true },
      { name: 'Select Menus', value: 'String, user, role, and channel selects are available below.', inline: true }
    )
    .setFooter({ text: 'Use the components below to explore Discord UI behavior.' });
}

function createActionRows() {
  const buttonRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('ui_demo_modal')
      .setLabel('Open Modal')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('ui_demo_mentionable')
      .setLabel('Mentionable Select')
      .setStyle(ButtonStyle.Secondary)
  );

  const stringSelectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId('ui_demo_string_select')
      .setPlaceholder('Pick a demo option...')
      .addOptions([
        { label: 'Show simple embed', description: 'Send a demo embed response', value: 'string_embed', emoji: '📝' },
        { label: 'Show a warning', description: 'Send a warning-style response', value: 'string_warning', emoji: '⚠️' },
        { label: 'Show a confirmation', description: 'Send a success-style response', value: 'string_success', emoji: '✅' }
      ])
  );

  const userSelectRow = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId('ui_demo_user_select')
      .setPlaceholder('Select one or more users')
      .setMinValues(1)
      .setMaxValues(3)
  );

  const roleSelectRow = new ActionRowBuilder().addComponents(
    new RoleSelectMenuBuilder()
      .setCustomId('ui_demo_role_select')
      .setPlaceholder('Select a role')
      .setMinValues(1)
      .setMaxValues(2)
  );

  const channelSelectRow = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder()
      .setCustomId('ui_demo_channel_select')
      .setPlaceholder('Select a channel')
      .setMinValues(1)
      .setMaxValues(1)
  );

  return [buttonRow, stringSelectRow, userSelectRow, roleSelectRow, channelSelectRow];
}

client.once(Events.ClientReady, () => {
  console.log(`✅ UI demo bot ready as ${client.user.tag}`);
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    if (interaction.isChatInputCommand() && interaction.commandName === 'ui-demo') {
      await interaction.reply({ embeds: [createDemoEmbed()], components: createActionRows(), ephemeral: true });
      return;
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'ui_demo_string_select') {
        const selected = interaction.values[0];
        const responses = {
          string_embed: {
            title: '📘 Embed Demo',
            description: 'This is a response from the string select menu.',
            color: 0x0099ff
          },
          string_warning: {
            title: '⚠️ Warning Demo',
            description: 'This option demonstrates a warning style embed.',
            color: 0xffcc00
          },
          string_success: {
            title: '✅ Success Demo',
            description: 'This option demonstrates a success style embed.',
            color: 0x57f287
          }
        };

        const payload = responses[selected] || responses.string_embed;
        await interaction.update({
          embeds: [new EmbedBuilder().setTitle(payload.title).setDescription(payload.description).setColor(payload.color)],
          components: createActionRows()
        });
        return;
      }
    }

    if (interaction.isUserSelectMenu() && interaction.customId === 'ui_demo_user_select') {
      const userMentions = interaction.users.map((user) => `<@${user.id}>`).join(', ');
      await interaction.reply({ content: `Selected users: ${userMentions}`, ephemeral: true });
      return;
    }

    if (interaction.isRoleSelectMenu() && interaction.customId === 'ui_demo_role_select') {
      const roleMentions = interaction.roles.map((role) => `<@&${role.id}>`).join(', ');
      await interaction.reply({ content: `Selected roles: ${roleMentions}`, ephemeral: true });
      return;
    }

    if (interaction.isChannelSelectMenu() && interaction.customId === 'ui_demo_channel_select') {
      const channelMentions = interaction.channels.map((channel) => `<#${channel.id}>`).join(', ');
      await interaction.reply({ content: `Selected channel: ${channelMentions}`, ephemeral: true });
      return;
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'ui_demo_modal') {
        const modal = new ModalBuilder()
          .setCustomId('ui_demo_modal_submit')
          .setTitle('UI Component Modal Test');

        const singleLine = new TextInputBuilder()
          .setCustomId('ui_demo_input_short')
          .setLabel('Short input')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Type a short value');

        const paragraph = new TextInputBuilder()
          .setCustomId('ui_demo_input_paragraph')
          .setLabel('Paragraph input')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(false)
          .setPlaceholder('Type a longer description');

        modal.addComponents(new ActionRowBuilder().addComponents(singleLine));
        modal.addComponents(new ActionRowBuilder().addComponents(paragraph));

        await interaction.showModal(modal);
        return;
      }

      if (interaction.customId === 'ui_demo_mentionable') {
        const mentionableRow = new ActionRowBuilder().addComponents(
          new MentionableSelectMenuBuilder()
            .setCustomId('ui_demo_mentionable_select')
            .setPlaceholder('Select users or roles')
            .setMinValues(1)
            .setMaxValues(3)
        );

        await interaction.reply({
          content: 'Select one or more mentionable items below:',
          components: [mentionableRow],
          ephemeral: true
        });
        return;
      }
    }

    if (interaction.isMentionableSelectMenu() && interaction.customId === 'ui_demo_mentionable_select') {
      const selected = interaction.values.map((id) => `
<@${id}>`).join(', ');
      await interaction.reply({ content: `Selected mentionables: ${selected}`, ephemeral: true });
      return;
    }

    if (interaction.isModalSubmit() && interaction.customId === 'ui_demo_modal_submit') {
      const shortValue = interaction.fields.getTextInputValue('ui_demo_input_short');
      const paragraphValue = interaction.fields.getTextInputValue('ui_demo_input_paragraph');
      const selectedRoleIds = interaction.fields.getRoleSelectMenuValues('ui_demo_modal_role_select');
      const selectedChannelIds = interaction.fields.getChannelSelectMenuValues('ui_demo_modal_channel_select');

      const roleMentions = selectedRoleIds.map((id) => `<@&${id}>`).join(', ') || 'None selected';
      const channelMentions = selectedChannelIds.map((id) => `<#${id}>`).join(', ') || 'None selected';

      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('📝 Modal Results')
            .setColor(0x57f287)
            .addFields(
              { name: 'Short Input', value: shortValue || 'No value provided', inline: false },
              { name: 'Paragraph Input', value: paragraphValue || 'No value provided', inline: false },
              { name: 'Selected Roles', value: roleMentions, inline: false },
              { name: 'Selected Channels', value: channelMentions, inline: false }
            )
        ],
        ephemeral: true
      });
      return;
    }
  } catch (err) {
    console.error('Interaction handler error:', err);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: 'An error occurred while processing this UI interaction.', ephemeral: true });
    }
  }
});

(async () => {
  await registerCommands();
  await client.login(TOKEN);
})();
