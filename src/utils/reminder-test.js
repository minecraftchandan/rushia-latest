const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const Reminder = require('../database/reminder.model');
const { sendLog, sendError } = require('./logger');
const { BOT_OWNER_ID } = require('../config/constants');

const REMINDER_TYPES = [
  { value: 'expedition', label: '📦 Expedition', emoji: '📦' },
  { value: 'stamina', label: '⚡ Stamina', emoji: '⚡' },
  { value: 'raid', label: '⚔️ Raid Fatigue', emoji: '⚔️' },
  { value: 'raidSpawn', label: '🎯 Raid Spawn', emoji: '🎯' },
  { value: 'drop', label: '💧 Drop', emoji: '💧' }
];

function createSimulatedMessage(reminderType, userId, duration) {
  const simMessages = {
    expedition: {
      embeds: [{
        title: `${userId}'s Expeditions`,
        description: 'Test expedition',
        fields: [{ name: '🎴 Test Card', value: `ID: ${Date.now()}\n⏳ 5s remaining` }]
      }],
      interaction: { user: { id: userId } }
    },
    stamina: {
      content: `${userId} you don't have enough stamina!`,
      mentions: { users: new Map([[userId, { id: userId }]]) }
    },
    raid: {
      embeds: [{
        title: 'Raid View',
        fields: [{ name: 'Party Members', value: `<@${userId}> Fatigued (5m 30s)` }]
      }]
    },
    raidSpawn: {
      embeds: [{
        title: 'Raid Spawned!',
        description: `You spawned **Test Raid [T4]**`
      }],
      interactionMetadata: { user: { id: userId } }
    },
    drop: {
      embeds: [{
        title: 'Items Dropped!',
        footer: { iconURL: `https://cdn.discordapp.com/avatars/${userId}/test.png` }
      }]
    }
  };

  return simMessages[reminderType];
}

async function handleReminderTestCommand(message) {
  if (message.author.id !== BOT_OWNER_ID) {
    return message.reply('❌ Only bot owner can use this.');
  }

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('rtest_select_type')
    .setPlaceholder('Select reminder type to test...')
    .addOptions(REMINDER_TYPES.map(r => ({
      label: r.label,
      value: r.value,
      emoji: r.emoji
    })));

  const row = new ActionRowBuilder().addComponents(selectMenu);

  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle('🧪 Reminder Test Module')
    .setDescription('Test FULL PIPELINE: Detection → Creation → Sending')
    .addFields(
      { name: 'Available Types', value: REMINDER_TYPES.map(r => `${r.emoji} ${r.label}`).join('\n'), inline: false },
      { name: 'Process', value: '1️⃣ Set duration\n2️⃣ System DETECTS simulated embed\n3️⃣ Reminder CREATED via detection system\n4️⃣ Fires and SENDS when due', inline: false }
    );

  await message.reply({ embeds: [embed], components: [row] });
}

async function handleReminderTypeSelect(interaction) {
  const reminderType = interaction.values[0];

  const modal = new ModalBuilder()
    .setCustomId(`rtest_duration_${reminderType}`)
    .setTitle(`Duration for ${reminderType}`);

  const durationInput = new TextInputBuilder()
    .setCustomId('duration_seconds')
    .setLabel('Duration in seconds')
    .setStyle(TextInputStyle.Short)
    .setPlaceholder('e.g., 10')
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(durationInput);
  modal.addComponents(row);

  await interaction.showModal(modal);
}

async function handleReminderDurationModal(interaction) {
  const customId = interaction.customId;
  const reminderType = customId.replace('rtest_duration_', '');
  const durationSeconds = parseInt(interaction.fields.getTextInputValue('duration_seconds'));

  if (isNaN(durationSeconds) || durationSeconds <= 0) {
    return interaction.reply({ content: '❌ Invalid duration. Must be positive.', ephemeral: true });
  }

  await interaction.deferReply({ ephemeral: true });

  try {
    const userId = interaction.user.id;
    const guildId = interaction.guild.id;
    const channelId = interaction.channel.id;
    const remindAt = new Date(Date.now() + durationSeconds * 1000);

    const simMessage = createSimulatedMessage(reminderType, userId, durationSeconds);

    const mockMessage = {
      guild: { id: guildId },
      author: { id: '1269481871021047891', bot: true },
      channel: { id: channelId },
      createdTimestamp: Date.now(),
      embeds: simMessage.embeds || [],
      content: simMessage.content || '',
      mentions: simMessage.mentions || { users: new Map() },
      interaction: simMessage.interaction,
      interactionMetadata: simMessage.interactionMetadata
    };

    if (reminderType === 'expedition') {
      const { processExpeditionMessage } = require('../systems/expedition-reminder.system');
      await processExpeditionMessage(mockMessage);
    } else if (reminderType === 'stamina') {
      const { processStaminaMessage } = require('../systems/stamina-reminder.system');
      await processStaminaMessage(mockMessage);
    } else if (reminderType === 'raid') {
      const { processRaidMessage } = require('../systems/raid-reminder.system');
      await processRaidMessage(mockMessage);
    } else if (reminderType === 'raidSpawn') {
      const { processRaidSpawnMessage } = require('../systems/raid-spawn-reminder.system');
      await processRaidSpawnMessage(mockMessage);
    } else if (reminderType === 'drop') {
      const { processDropMessage } = require('../systems/drop-reminder.system');
      await processDropMessage(mockMessage);
    }

    const created = await Reminder.findOne({ userId, type: reminderType, status: 'pending' }).lean();

    if (!created) {
      throw new Error(`Detection system failed to create ${reminderType} reminder`);
    }

    await sendLog('REMINDER_TEST_CREATED', {
      category: 'REMINDER_TEST',
      type: reminderType,
      userId,
      guildId,
      duration: durationSeconds,
      remindAt: remindAt.toISOString(),
      createdViaDetection: true
    });

    const embed = new EmbedBuilder()
      .setColor(0x00aa00)
      .setTitle('✅ Reminder Detected & Created')
      .addFields(
        { name: 'Type', value: reminderType, inline: true },
        { name: 'Duration', value: `${durationSeconds}s`, inline: true },
        { name: 'Detection Status', value: '✅ System detected embed', inline: false },
        { name: 'Creation Status', value: '✅ Reminder created in DB', inline: false },
        { name: 'Will fire at', value: `<t:${Math.floor(remindAt.getTime() / 1000)}:F>`, inline: false },
        { name: 'Then', value: '✅ Scheduler will send message', inline: false },
        { name: 'Reminder ID', value: `\`${created._id}\``, inline: false }
      )
      .setTimestamp();

    await interaction.editReply({ embeds: [embed] });
  } catch (error) {
    await sendError('REMINDER_TEST_FAILED', { 
      category: 'REMINDER_TEST', 
      error: error.message
    });
    await interaction.editReply({ content: `❌ Error: ${error.message}`, ephemeral: true });
  }
}

module.exports = {
  handleReminderTestCommand,
  handleReminderTypeSelect,
  handleReminderDurationModal
};
