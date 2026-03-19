const { EmbedBuilder } = require('discord.js');
const { getSettings, updateSettings } = require('./settingsManager');
const { BOT_OWNER_ID } = require('../config/constants');

/**
 * Parse delay string (e.g., "5s" -> 5000ms)
 */
function parseDelay(delayStr) {
  const match = delayStr.match(/^(\d+)([smh]?)$/i);
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2]?.toLowerCase() || 's';
  
  let ms;
  if (unit === 's') ms = value * 1000;
  else if (unit === 'm') ms = value * 60 * 1000;
  else if (unit === 'h') ms = value * 60 * 60 * 1000;
  else return null;
  
  // Max 59 seconds (59000ms)
  if (ms > 59000) return null;
  
  return ms;
}

/**
 * Convert ms to human readable format
 */
function formatDelay(ms) {
  if (!ms) return '0s';
  if (ms < 1000) return ms + 'ms';
  if (ms < 60000) return (ms / 1000) + 's';
  if (ms < 3600000) return (ms / 60000) + 'm';
  return (ms / 3600000) + 'h';
}

async function handleRoleDelay(message, args) {
  // Check permissions - bot owner or server admin only
  if (message.author.id !== BOT_OWNER_ID && !message.member?.permissions.has('ManageGuild')) {
    return message.reply('❌ Only bot owner or server admins can set role delays.');
  }

  if (!message.guild) {
    return message.reply('❌ This command can only be used in a server.');
  }

  // Format: @bot delay [roleid] [delay] or @bot delay [roleid] remove
  if (args.length < 2) {
    return message.reply('❌ Usage: `@bot delay <roleId> <delay>` or `@bot delay <roleId> remove`\nExample: `@bot delay 123456789 5s` (max 59s)');
  }

  const roleId = args[0];
  const delayInput = args.slice(1).join(' ').toLowerCase();

  // Validate role exists
  try {
    const role = await message.guild.roles.fetch(roleId);
    if (!role) {
      return message.reply(`❌ Role <@&${roleId}> not found in this server.`);
    }
  } catch (error) {
    return message.reply(`❌ Invalid role ID or role not found.`);
  }

  let settings = await getSettings(message.guild.id);
  if (!settings) {
    await message.reply('❌ No settings found for this guild.');
    return;
  }

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTitle('Role Ping Delay');

  // Handle removal
  if (delayInput === 'remove' || delayInput === 'delete') {
    if (settings.delays && settings.delays.has(roleId)) {
      settings.delays.delete(roleId);
      await updateSettings(message.guild.id, { delays: settings.delays });
      embed.setDescription(`✅ Removed delay for <@&${roleId}>`);
    } else {
      embed.setColor(0xff6600);
      embed.setDescription(`⚠️ No delay set for <@&${roleId}>`);
    }
    return message.reply({ embeds: [embed] });
  }

  // Parse delay
  const delayMs = parseDelay(delayInput);
  if (!delayMs) {
    return message.reply('❌ Invalid delay format. Use `5s`, `1m`, `1h` or `remove`. Max 59 seconds.');
  }

  // Update delays map
  if (!settings.delays) {
    settings.delays = new Map();
  }
  settings.delays.set(roleId, delayMs);

  await updateSettings(message.guild.id, { delays: settings.delays });

  embed.setDescription(`✅ Set delay to **${formatDelay(delayMs)}** for <@&${roleId}>`)
    .addFields(
      { name: 'Role ID', value: roleId, inline: true },
      { name: 'Delay', value: formatDelay(delayMs), inline: true }
    );

  return message.reply({ embeds: [embed] });
}

/**
 * Get delay for a specific role (in milliseconds)
 */
function getRoleDelay(settings, roleId) {
  if (!settings || !settings.delays) return 0;
  return settings.delays.get(roleId) || 0;
}

/**
 * View all configured role delays
 */
async function handleViewDelays(message) {
  // Check permissions - bot owner or server admin only
  if (message.author.id !== BOT_OWNER_ID && !message.member?.permissions.has('ManageGuild')) {
    return message.reply('❌ Only bot owner or server admins can view role delays.');
  }

  if (!message.guild) {
    return message.reply('❌ This command can only be used in a server.');
  }

  const { getSettings } = require('./settingsManager');
  let settings = await getSettings(message.guild.id);
  
  const embed = new EmbedBuilder()
    .setColor(0x0099ff)
    .setTitle('Role Ping Delays')
    .setDescription(message.guild.name);

  if (!settings || !settings.delays || settings.delays.size === 0) {
    embed.addFields(
      { name: 'No Delays', value: 'No role ping delays are currently configured.' }
    );
    return message.reply({ embeds: [embed] });
  }

  const delayList = [];
  for (const [roleId, delayMs] of settings.delays.entries()) {
    try {
      const role = await message.guild.roles.fetch(roleId);
      delayList.push(`<@&${roleId}> - **${formatDelay(delayMs)}**`);
    } catch (error) {
      delayList.push(`Unknown Role (${roleId}) - **${formatDelay(delayMs)}**`);
    }
  }

  embed.addFields(
    { 
      name: `Configured Delays (${delayList.length})`, 
      value: delayList.join('\n') 
    }
  );

  return message.reply({ embeds: [embed] });
}

module.exports = { handleRoleDelay, getRoleDelay, parseDelay, formatDelay, handleViewDelays };
