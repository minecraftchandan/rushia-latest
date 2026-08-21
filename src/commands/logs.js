const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const { sendLog, sendError } = require('../utils/logger');
const mongoose = require('mongoose');
const { BOT_OWNER_ID } = require('../config/constants');

// Define Log schema if not already defined
let Log;
try {
  Log = mongoose.model('Log');
} catch {
  const logSchema = new mongoose.Schema({
    level: { type: String, required: true, enum: ['INFO', 'ERROR', 'WARN', 'DEBUG'] },
    message: { type: String, required: true },
    timestamp: { type: Date, default: Date.now },
    guildId: { type: String },
    userId: { type: String },
    channelId: { type: String },
    metadata: { type: Object }
  });
  Log = mongoose.model('Log', logSchema, 'logs');
}

// Store active log sessions
const logSessions = new Map();

async function handleLogsCommand(message) {
  // Check if user is bot owner
  if (message.author.id !== BOT_OWNER_ID) {
    return message.reply('Only the bot owner can view logs.');
  }

  const level = 'ALL';
  
  try {

    const query = {};
    const totalLogs = await Log.countDocuments(query);
    
    if (totalLogs === 0) {
      return message.reply('No logs found.');
    }

    const page = 0;
    const logsPerPage = 10;
    
    const logs = await Log.find(query)
      .sort({ timestamp: -1 })
      .skip(page * logsPerPage)
      .limit(logsPerPage);

    const sessionId = `${message.author.id}_${Date.now()}`;
    logSessions.set(sessionId, { level, page, totalLogs, logsPerPage });

    const embed = createLogEmbed(logs, page, totalLogs, logsPerPage, level);
    const components = createLogComponents(sessionId, page, totalLogs, logsPerPage, level);

    await message.reply({ embeds: [embed], components });

    // Auto-cleanup session after 15 minutes
    setTimeout(() => logSessions.delete(sessionId), 15 * 60 * 1000);
  } catch (error) {
    sendError('Error fetching logs:', error);
    await message.reply('Failed to fetch logs.');
  }
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName('logs')
    .setDescription('View bot logs with pagination and filtering')
    .addStringOption(option =>
      option.setName('level')
        .setDescription('Filter by log level')
        .addChoices(
          { name: 'All', value: 'ALL' },
          { name: 'Info', value: 'INFO' },
          { name: 'Error', value: 'ERROR' },
          { name: 'Warning', value: 'WARN' },
          { name: 'Debug', value: 'DEBUG' }
        )),

  async execute(interaction) {
    // Check if user is bot owner
    if (interaction.user.id !== BOT_OWNER_ID) {
      return interaction.reply({ content: 'Only the bot owner can view logs.', ephemeral: true });
    }

    await interaction.deferReply({ ephemeral: true });

    const level = interaction.options.getString('level') || 'ALL';
    
    try {

      const query = level === 'ALL' ? {} : { level };
      const totalLogs = await Log.countDocuments(query);
      
      if (totalLogs === 0) {
        return interaction.editReply({ content: 'No logs found.', ephemeral: true });
      }

      const page = 0;
      const logsPerPage = 10;
      
      const logs = await Log.find(query)
        .sort({ timestamp: -1 })
        .skip(page * logsPerPage)
        .limit(logsPerPage);

      const sessionId = `${interaction.user.id}_${Date.now()}`;
      logSessions.set(sessionId, { level, page, totalLogs, logsPerPage });

      const embed = createLogEmbed(logs, page, totalLogs, logsPerPage, level);
      const components = createLogComponents(sessionId, page, totalLogs, logsPerPage, level);

      await interaction.editReply({ embeds: [embed], components, ephemeral: true });

      // Auto-cleanup session after 15 minutes
      setTimeout(() => logSessions.delete(sessionId), 15 * 60 * 1000);
    } catch (error) {
      sendError('Error fetching logs:', error);
      await interaction.editReply({ content: 'Failed to fetch logs.', ephemeral: true });
    }
  }
};

function createLogEmbed(logs, page, totalLogs, logsPerPage, level) {
  const embed = new EmbedBuilder()
    .setTitle(`📋 Bot Logs ${level !== 'ALL' ? `- ${level}` : ''}`)
    .setColor(getLevelColor(level))
    .setFooter({ text: `Page ${page + 1}/${Math.ceil(totalLogs / logsPerPage)} • Total: ${totalLogs} logs` })
    .setTimestamp();

  if (logs.length === 0) {
    embed.setDescription('No logs found.');
    return embed;
  }

  logs.forEach((log, index) => {
    const emoji = getLevelEmoji(log.level);
    const timestamp = `<t:${Math.floor(log.timestamp.getTime() / 1000)}:R>`;
    const message = log.message.length > 100 ? log.message.substring(0, 97) + '...' : log.message;
    
    embed.addFields({
      name: `${emoji} ${log.level} - ${timestamp}`,
      value: `\`\`\`${message}\`\`\``,
      inline: false
    });
  });

  return embed;
}

function createLogComponents(sessionId, page, totalLogs, logsPerPage, currentLevel) {
  const totalPages = Math.ceil(totalLogs / logsPerPage);
  
  const buttons = new ActionRowBuilder()
    .addComponents(
      new ButtonBuilder()
        .setCustomId(`logs_first_${sessionId}`)
        .setLabel('⏮️ First')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`logs_prev_${sessionId}`)
        .setLabel('◀️ Previous')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page === 0),
      new ButtonBuilder()
        .setCustomId(`logs_next_${sessionId}`)
        .setLabel('Next ▶️')
        .setStyle(ButtonStyle.Primary)
        .setDisabled(page >= totalPages - 1),
      new ButtonBuilder()
        .setCustomId(`logs_last_${sessionId}`)
        .setLabel('Last ⏭️')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page >= totalPages - 1)
    );

  const filter = new ActionRowBuilder()
    .addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`logs_filter_${sessionId}`)
        .setPlaceholder('Filter by log level')
        .addOptions([
          { label: 'All Logs', value: 'ALL', emoji: '📋', default: currentLevel === 'ALL' },
          { label: 'Info', value: 'INFO', emoji: 'ℹ️', default: currentLevel === 'INFO' },
          { label: 'Error', value: 'ERROR', emoji: '❌', default: currentLevel === 'ERROR' },
          { label: 'Warning', value: 'WARN', emoji: '⚠️', default: currentLevel === 'WARN' },
          { label: 'Debug', value: 'DEBUG', emoji: '🐛', default: currentLevel === 'DEBUG' }
        ])
    );

  return [buttons, filter];
}

function getLevelColor(level) {
  switch (level) {
    case 'ERROR': return 0xff0000;
    case 'WARN': return 0xffaa00;
    case 'DEBUG': return 0x00aaff;
    case 'INFO': return 0x00ff00;
    default: return 0x0099ff;
  }
}

function getLevelEmoji(level) {
  switch (level) {
    case 'ERROR': return '❌';
    case 'WARN': return '⚠️';
    case 'DEBUG': return '🐛';
    case 'INFO': return 'ℹ️';
    default: return '📋';
  }
}

// Export handlers for button interactions
async function handleLogNavigation(interaction) {
  if (!interaction.customId.startsWith('logs_') || interaction.customId.startsWith('logs_filter_')) return false;

  const parts = interaction.customId.split('_');
  const action = parts[1];
  const sessionId = parts.slice(2).join('_');
  
  // Validate user owns this session
  const sessionUserId = sessionId.split('_')[0];
  if (interaction.user.id !== sessionUserId) {
    await interaction.reply({ content: 'This is not your log session!', ephemeral: true });
    return true;
  }

  const session = logSessions.get(sessionId);
  if (!session) {
    await interaction.reply({ content: 'Session expired. Please run @bot logs again.', ephemeral: true });
    return true;
  }

  await interaction.deferUpdate();

  let newPage = session.page;
  const totalPages = Math.ceil(session.totalLogs / session.logsPerPage);

  switch (action) {
    case 'first': newPage = 0; break;
    case 'prev': newPage = Math.max(0, session.page - 1); break;
    case 'next': newPage = Math.min(totalPages - 1, session.page + 1); break;
    case 'last': newPage = totalPages - 1; break;
  }

  session.page = newPage;

  try {
    const query = session.level === 'ALL' ? {} : { level: session.level };
    const logs = await Log.find(query)
      .sort({ timestamp: -1 })
      .skip(newPage * session.logsPerPage)
      .limit(session.logsPerPage);

    const embed = createLogEmbed(logs, newPage, session.totalLogs, session.logsPerPage, session.level);
    const components = createLogComponents(sessionId, newPage, session.totalLogs, session.logsPerPage, session.level);

    await interaction.editReply({ embeds: [embed], components });
  } catch (error) {
    sendError('Error navigating logs:', error);
    await interaction.followUp({ content: 'Failed to navigate logs.', ephemeral: true });
  }

  return true;
}

async function handleLogFilter(interaction) {
  if (!interaction.customId.startsWith('logs_filter_')) return false;

  const sessionId = interaction.customId.split('_').slice(2).join('_');
  
  // Validate user owns this session
  const sessionUserId = sessionId.split('_')[0];
  if (interaction.user.id !== sessionUserId) {
    await interaction.reply({ content: 'This is not your log session!', ephemeral: true });
    return true;
  }
  
  const session = logSessions.get(sessionId);
  if (!session) {
    await interaction.reply({ content: 'Session expired. Please run @bot logs again.', ephemeral: true });
    return true;
  }

  await interaction.deferUpdate();

  const newLevel = interaction.values[0];
  session.level = newLevel;
  session.page = 0;

  try {
    const query = newLevel === 'ALL' ? {} : { level: newLevel };
    const totalLogs = await Log.countDocuments(query);
    session.totalLogs = totalLogs;

    const logs = await Log.find(query)
      .sort({ timestamp: -1 })
      .limit(session.logsPerPage);

    const embed = createLogEmbed(logs, 0, totalLogs, session.logsPerPage, newLevel);
    const components = createLogComponents(sessionId, 0, totalLogs, session.logsPerPage, newLevel);

    await interaction.editReply({ embeds: [embed], components });
  } catch (error) {
    sendError('Error filtering logs:', error);
    await interaction.followUp({ content: 'Failed to filter logs.', ephemeral: true });
  }

  return true;
}

module.exports.handleLogNavigation = handleLogNavigation;
module.exports.handleLogFilter = handleLogFilter;
module.exports.handleLogsCommand = handleLogsCommand;
