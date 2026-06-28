const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const { sendLog, sendError } = require('../utils/logger');
const giveawaySystem = require('../systems/giveaway.system');

/**
 * Check if user has permission to use gawk commands
 * Must be either bot owner or server admin
 */
function hasGawkPermission(user, guild) {
  const BOT_OWNER_ID = process.env.BOT_OWNER_ID;
  
  // Bot owner always has permission
  if (user.id === BOT_OWNER_ID) {
    return true;
  }
  
  // Check if user has admin permissions in guild
  if (guild && guild.members) {
    const member = guild.members.cache.get(user.id);
    if (member && member.permissions.has(PermissionFlagsBits.Administrator)) {
      return true;
    }
  }
  
  return false;
}

function getTaskName(taskType) {
  const taskNames = {
    drop: 'Card Drop',
    clash: 'Clash Battle',
    daily_quests: 'Daily Quests'
  };

  return taskNames[taskType] || taskType;
}

function getTaskEmoji(taskType) {
  const taskEmojis = {
    drop: '🎴',
    clash: '⚔️',
    daily_quests: '📋'
  };

  return taskEmojis[taskType] || '🎁';
}

function summarizeTaskConfig(config) {
  const tasks = Object.entries(config?.tasks || {})
    .filter(([, task]) => task)
    .map(([taskType, task]) => ({
      taskType,
      targetCount: task.targetCount,
      roleName: task.roleName,
      enabled: task.enabled,
      createdBy: task.createdBy
    }));

  return {
    hasConfig: tasks.length > 0,
    tasks
  };
}

function buildGawkViewEmbed(config, guild) {
  const summary = summarizeTaskConfig(config);
  const embed = new EmbedBuilder()
    .setTitle('🎁 Giveaway Config Status')
    .setColor(summary.hasConfig ? 0x00FF00 : 0xFEE75C)
    .setTimestamp();

  if (summary.hasConfig) {
    embed.setDescription(`A giveaway configuration is currently active for ${guild?.name || 'this server'}.`);
    summary.tasks.forEach((task) => {
      embed.addFields({
        name: `${getTaskEmoji(task.taskType)} ${getTaskName(task.taskType)}`,
        value: `Target Count: ${task.targetCount}\nRole: ${task.roleName}\nStatus: ${task.enabled ? 'Enabled' : 'Disabled'}`,
        inline: false
      });
    });
  } else {
    embed.setDescription(`No giveaway config has been set up for ${guild?.name || 'this server'} yet.`);
  }

  embed.setFooter({
    text: summary.hasConfig ? 'Use the delete button to remove this config.' : 'Use gawk set to create a config.'
  });

  return embed;
}

async function handleGawkCommand(message) {
  // Check if user is bot owner or server admin
  if (!hasGawkPermission(message.author, message.guild)) {
    await message.reply('🚫 This command is only available to server admins and the bot owner.');
    return;
  }

  const rawContent = message.commandContent || message.content;
  const args = rawContent.trim().split(/\s+/);
  const subcommand = args[1]?.toLowerCase();

  if (!subcommand || !['set', 'view'].includes(subcommand)) {
    await message.reply('❌ Usage: `@bot gawk set` or `@bot gawk view`');
    return;
  }

  if (subcommand === 'view') {
    await handleViewGawkCommand(message);
    return;
  }

  try {
    const embed = new EmbedBuilder()
      .setTitle('🎁 Giveaway Task Setup')
      .setDescription('Select a task type from the dropdown below to set up a giveaway task.')
      .setColor(0x5865F2)
      .setFooter({ text: 'Select a task type to continue' })
      .setTimestamp();

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('gawk_task_select')
      .setPlaceholder('Select task type...')
      .addOptions([
        {
          label: 'Card Drop',
          description: 'Track card drop completions',
          value: 'drop',
          emoji: '🎴'
        },
        {
          label: 'Clash Battle',
          description: 'Track clash battle wins',
          value: 'clash',
          emoji: '⚔️'
        },
        {
          label: 'Daily Quests',
          description: 'Track daily quest completions',
          value: 'daily_quests',
          emoji: '📋'
        }
      ]);

    const row = new ActionRowBuilder().addComponents(selectMenu);

    await message.reply({ embeds: [embed], components: [row] });
    sendLog(`Gawk setup initiated by ${message.author.tag}`);
  } catch (error) {
    sendError('Error in gawk command:', error);
    await message.reply('❌ An error occurred while setting up the giveaway.');
  }
}

async function handleViewGawkCommand(message) {
  try {
    const config = await giveawaySystem.getServerConfig(message.guild.id);
    const summary = summarizeTaskConfig(config);
    const embed = buildGawkViewEmbed(config, message.guild);

    const deleteButton = new ButtonBuilder()
      .setCustomId('gawk_view_delete')
      .setLabel('Delete Config')
      .setStyle(ButtonStyle.Danger)
      .setEmoji('🗑️')
      .setDisabled(!summary.hasConfig);

    const row = new ActionRowBuilder().addComponents(deleteButton);

    await message.reply({ embeds: [embed], components: [row] });
    sendLog(`Gawk view requested by ${message.author.tag}`);
  } catch (error) {
    sendError('Error viewing gawk config:', error);
    await message.reply('❌ An error occurred while loading the giveaway config.');
  }
}

async function handleGawkInteraction(interaction) {
  try {
    // Check permissions for all gawk interactions
    if (!hasGawkPermission(interaction.user, interaction.guild)) {
      await interaction.reply({ 
        content: '🚫 You must be a server admin or bot owner to use this command.', 
        ephemeral: true 
      });
      return true;
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'gawk_task_select') {
      await handleTaskSelect(interaction);
      return true;
    } else if (interaction.isButton() && interaction.customId === 'gawk_set_count') {
      await handleSetCountButton(interaction);
      return true;
    } else if (interaction.isButton() && interaction.customId === 'gawk_set_role') {
      await handleSetRoleButton(interaction);
      return true;
    } else if (interaction.isButton() && interaction.customId === 'gawk_view_delete') {
      await handleDeleteConfigButton(interaction);
      return true;
    } else if (interaction.isModalSubmit() && interaction.customId === 'gawk_count_modal') {
      await handleCountModal(interaction);
      return true;
    } else if (interaction.isModalSubmit() && interaction.customId === 'gawk_role_modal') {
      await handleRoleModal(interaction);
      return true;
    }
    return false;
  } catch (error) {
    sendError('Error handling gawk interaction:', error);
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
    }
    return false;
  }
}

async function handleTaskSelect(interaction) {
  const taskType = interaction.values[0];
  const isDailyQuests = taskType === 'daily_quests';

  const embed = new EmbedBuilder()
    .setTitle(`🎁 ${getTaskName(taskType)} Task`)
    .setDescription(`You selected **${getTaskName(taskType)}**.\n\n${isDailyQuests ? 'Daily Quests is a one-time completion task, so no count is required.' : 'Click the button below to set the target count (1-100).'} `)
    .setColor(0x5865F2)
    .setFooter({ text: isDailyQuests ? 'Click button to set role ID' : 'Click button to set count' })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId(isDailyQuests ? 'gawk_set_role' : 'gawk_set_count')
    .setLabel(isDailyQuests ? 'Set Role ID' : 'Set Count')
    .setStyle(isDailyQuests ? ButtonStyle.Success : ButtonStyle.Primary)
    .setEmoji(isDailyQuests ? '👑' : '🔢');

  const row = new ActionRowBuilder().addComponents(button);

  await interaction.update({
    embeds: [embed],
    components: [row]
  });

  interaction.message.taskType = taskType;
  if (isDailyQuests) {
    interaction.message.targetCount = 1;
  }
}

async function handleSetCountButton(interaction) {
  const taskType = interaction.message.taskType;

  if (!taskType) {
    await interaction.reply({ content: '❌ Task type not found. Please start over.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId('gawk_count_modal')
    .setTitle('Set Task Count');

  const countInput = new TextInputBuilder()
    .setCustomId('task_count')
    .setLabel('How many times must this task be done?')
    .setPlaceholder('Enter a number between 1 and 100')
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(3)
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(countInput);
  modal.addComponents(row);

  await interaction.showModal(modal);

  interaction.message.taskType = taskType;
}

async function handleSetRoleButton(interaction) {
  const taskType = interaction.message.taskType;
  const targetCount = interaction.message.targetCount;

  if (!taskType || !targetCount) {
    await interaction.reply({ content: '❌ Configuration not found. Please start over.', ephemeral: true });
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId('gawk_role_modal')
    .setTitle('Set Role ID');

  const roleInput = new TextInputBuilder()
    .setCustomId('role_id')
    .setLabel('Enter the Role ID to assign')
    .setPlaceholder('Right-click role > Copy ID (Developer Mode required)')
    .setStyle(TextInputStyle.Short)
    .setMinLength(17)
    .setMaxLength(20)
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(roleInput);
  modal.addComponents(row);

  await interaction.showModal(modal);

  interaction.message.taskType = taskType;
  interaction.message.targetCount = targetCount;
}

async function handleCountModal(interaction) {
  const count = parseInt(interaction.fields.getTextInputValue('task_count'));
  const taskType = interaction.message.taskType;

  if (isNaN(count) || count < 1 || count > 100) {
    await interaction.reply({ content: '❌ Invalid count. Please enter a number between 1 and 100.', ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🎁 ${getTaskName(taskType)} Task Configuration`)
    .setDescription(`**Task Type:** ${getTaskName(taskType)}\n**Target Count:** ${count}\n\nNow enter the Role ID that will be assigned upon completion.`)
    .setColor(0x5865F2)
    .setFooter({ text: 'Click button to set role ID' })
    .setTimestamp();

  const button = new ButtonBuilder()
    .setCustomId('gawk_set_role')
    .setLabel('Set Role ID')
    .setStyle(ButtonStyle.Success)
    .setEmoji('👑');

  const row = new ActionRowBuilder().addComponents(button);

  await interaction.update({ embeds: [embed], components: [row] });

  interaction.message.taskType = taskType;
  interaction.message.targetCount = count;
}

async function handleRoleModal(interaction) {
  const roleId = interaction.fields.getTextInputValue('role_id').trim();
  const taskType = interaction.message.taskType;
  const targetCount = interaction.message.targetCount;

  const role = interaction.guild.roles.cache.get(roleId);
  if (!role) {
    await interaction.reply({ content: '❌ Invalid Role ID. Please make sure the role exists.', ephemeral: true });
    return;
  }

  const result = await giveawaySystem.setTaskConfig(
    interaction.guild.id,
    interaction.guild.name,
    taskType,
    targetCount,
    roleId,
    role.name,
    interaction.user.id
  );

  if (!result.success) {
    await interaction.reply({ content: `❌ ${result.message}`, ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle('✅ Giveaway Task Created Successfully!')
    .setDescription(`**Task Type:** ${getTaskName(taskType)}\n**Target Count:** ${targetCount}\n**Role:** ${role.name} (${roleId})\n\nUsers who complete this task ${targetCount} times will automatically receive the ${role.name} role and a DM notification.\n\n**Status:** Active and tracking started!`)
    .setColor(0x00FF00)
    .addFields(
      { name: '📊 Server', value: interaction.guild.name, inline: true },
      { name: '👤 Created By', value: interaction.user.tag, inline: true },
      { name: '⏰ Created At', value: `<t:${Math.floor(Date.now() / 1000)}:R>`, inline: true }
    )
    .setFooter({ text: 'Giveaway task is now active and tracking all users' })
    .setTimestamp();

  await interaction.update({ embeds: [embed], components: [] });

  sendLog(`Giveaway task created in ${interaction.guild.name}: ${taskType} - ${targetCount} times - Role: ${role.name} by ${interaction.user.tag}`);
}

async function handleDeleteConfigButton(interaction) {
  // Check if user is bot owner or server admin
  if (!hasGawkPermission(interaction.user, interaction.guild)) {
    await interaction.reply({ 
      content: '🚫 Only server admins and the bot owner can delete the giveaway config.', 
      ephemeral: true 
    });
    return;
  }

  const result = await giveawaySystem.deleteServerConfig(interaction.guild.id, interaction.guild.name, interaction.client);

  const embed = new EmbedBuilder()
    .setTitle(result.success ? '🗑️ Giveaway Config Removed' : '⚠️ Failed to Remove Giveaway Config')
    .setDescription(
      result.success
        ? `The giveaway config has been removed for ${interaction.guild.name}. ${result.rolesRemoved > 0 ? `Removed role assignments from ${result.rolesRemoved} member entries.` : 'No role assignments were found to remove.'}`
        : 'The giveaway config could not be removed. Please try again.'
    )
    .setColor(result.success ? 0xED4245 : 0xFEE75C)
    .setTimestamp();

  await interaction.update({ embeds: [embed], components: [] });
  sendLog(`Giveaway config deleted in ${interaction.guild.name} by ${interaction.user.tag}`);
}

module.exports = { handleGawkCommand, handleGawkInteraction, buildGawkViewEmbed, getTaskName, summarizeTaskConfig };
