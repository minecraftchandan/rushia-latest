const { parseBossEmbed, parseBossComponent } = require('../utils/embed.parser');
const { getSettings } = require('../utils/settings.manager');
const { logInfo, logError } = require('../utils/logger');
const { getRoleDelay } = require('../utils/role-delay.manager');
const { PermissionsBitField } = require('discord.js');

async function processBossMessage(message) {
  if (!message.guild) return;

  let bossInfo = null;

  // Try parsing components first (new format)
  if (message.components && message.components.length > 0) {
    bossInfo = parseBossComponent(message.components);
  }

  // Fallback to embed parsing (old format)
  if (!bossInfo && message.embeds.length > 0) {
    const embed = message.embeds[0];
    bossInfo = parseBossEmbed(embed);
  }

  if (!bossInfo) return;

  await logInfo('Boss detected', { category: 'BOSS', metadata: { bossName: bossInfo.bossName, tier: bossInfo.tier } });

  const settings = await getSettings(message.guild.id);
  if (!settings) {
  await logInfo('No settings found', { category: 'BOSS', guildId: message.guild.id });
    return;
  }

  const roleConfig = settings.multiRoleEnabled 
    ? `Multi-role: T1=${settings.tier1RoleId || 'none'}, T2=${settings.tier2RoleId || 'none'}, T3=${settings.tier3RoleId || 'none'}, T4=${settings.tier4RoleId || 'none'}`
    : `Single role: ${settings.bossRoleId || 'none'}`;
  await logInfo('Role config', { category: 'BOSS', metadata: { config: roleConfig } });

  let roleId = null;
  
  // Check if multi-role system is enabled
  if (settings.multiRoleEnabled) {
    const tierMap = {
      'Tier 1': 'tier1RoleId',
      'Tier 2': 'tier2RoleId',
      'Tier 3': 'tier3RoleId',
      'Tier 4': 'tier4RoleId'
    };
    
    const roleField = tierMap[bossInfo.tier];
    if (roleField) {
      roleId = settings[roleField];
    }
  } else {
    roleId = settings.bossRoleId;
  }

  if (roleId) {
    try {
      const role = message.guild.roles.cache.get(roleId);
      if (!role) {
        await logError('Role not found', error, { guildId: message.guild.id, roleId, category: 'BOSS' });
        return;
      }

      const botMember = message.guild.members.me;
      const hasMentionPerm = message.channel.permissionsFor(botMember).has(PermissionsBitField.Flags.MentionEveryone);
      const botAboveRole = botMember.roles.highest.position > role.position;
      const roleIsMentionable = role.mentionable;

      if (!hasMentionPerm && !botAboveRole && !roleIsMentionable) {
        await logError('Missing permissions to ping role', error, { guildId: message.guild.id, channelId: message.channel.id, roleId, category: 'BOSS' });
        return;
      }

      const content = `<@&${roleId}> **${bossInfo.tier} Boss Spawned!**\nBoss: **${bossInfo.bossName}**`;
      
      // Check if there's a delay set for this role
      const delayMs = getRoleDelay(settings, roleId);
      
      if (delayMs > 0) {
        // Send after delay
        setTimeout(() => {
          message.channel.send({ content, allowedMentions: { roles: [roleId] } })
            .catch(err => {
              await logError('Failed to send delayed boss ping', err, { category: 'BOSS' });
            });
        }, delayMs);
        await logInfo('Boss ping sent (delayed)', { category: 'BOSS', metadata: { bossName: bossInfo.bossName, tier: bossInfo.tier, delay: delayMs, guildName: message.guild.name } });
      } else {
        // Send immediately
        await message.channel.send({ content, allowedMentions: { roles: [roleId] } });
        await logInfo('Boss ping sent', { category: 'BOSS', metadata: { bossName: bossInfo.bossName, tier: bossInfo.tier, guildName: message.guild.name } });
      }
    } catch (err) {
      await logError('Failed to send boss ping', err, { category: 'BOSS' });
    }
  }
}

module.exports = { processBossMessage };
