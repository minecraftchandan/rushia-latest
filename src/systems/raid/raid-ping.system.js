function extractElements(embed) {
  if (!embed) return [];

  const text = [embed.title, embed.description, ...(embed.fields || []).flatMap(field => [field.name, field.value])]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const elements = ['light', 'dark', 'earth', 'fire', 'water', 'air', 'normal', 'grass', 'ice', 'electric'];
  return [...new Set(elements.filter(element => new RegExp(`\\b${element}\\b`, 'i').test(text)))];
}

async function validateAndPingRoles(raidElements, guildRoles, channel) {
  const missingRoles = [];
  const roleMentions = [];

  for (const element of raidElements) {
    const roleId = guildRoles?.roles?.[element];
    if (!roleId) {
      missingRoles.push(element);
      continue;
    }

    try {
      const role = await channel.guild.roles.fetch(roleId);
      if (!role) {
        missingRoles.push(element);
        continue;
      }
      roleMentions.push(`<@&${role.id}>`);
    } catch (error) {
      missingRoles.push(element);
    }
  }

  if (roleMentions.length > 0) {
    await channel.send({ content: roleMentions.join(' '), allowedMentions: { roles: roleMentions.map(mention => mention.slice(3, -1)) } });
  }

  return { sent: roleMentions, missing: missingRoles };
}

async function handleRaidPingMessage(message) {
  if (!message.guild || message.author?.bot !== true || !message.embeds?.length) return false;

  const raidElements = message.embeds.flatMap(extractElements);
  if (raidElements.length === 0) return false;

  const { GuildRoles } = require('../../database/raid-ping.model');
  const guildRoles = await GuildRoles.findOne({ guildId: message.guild.id }).lean();
  if (!guildRoles) return false;

  const result = await validateAndPingRoles(raidElements, guildRoles, message.channel);
  if (result.sent.length === 0) return false;

  const { logInfo } = require('../../utils/logger');
  await logInfo('RAID_ROLE_PING_SENT', {
    category: 'RAID_PING',
    guildId: message.guild.id,
    channelId: message.channel.id,
    metadata: { elements: raidElements, rolesSent: result.sent, missing: result.missing, sourceMessageId: message.id }
  });
  return true;
}

module.exports = {
  extractElements,
  validateAndPingRoles,
  handleRaidPingMessage
};