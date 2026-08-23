const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { BOT_OWNER_ID, LUVI_BOT_ID, RAID_ELEMENT_EMOJIS, RAID_PING_COOLDOWN_SECONDS } = require('../../config/constants');

const pendingRaidTriggers = new Map();
const RAID_TRIGGER_TTL_MS = 10 * 1000;
const announcedRaidMessages = new Map();
const ANNOUNCEMENT_DEDUPE_MS = 35 * 1000;
const pendingRaidFetches = new Set();

function trackRaidTrigger(message) {
  if (message.author?.bot || !message.guild || !message.mentions?.users?.has(LUVI_BOT_ID)) return false;
  if (!/\braid(?:\s+view)?\b/i.test(message.content || '')) return false;

  pendingRaidTriggers.set(message.channel.id, {
    userId: message.author.id,
    expiresAt: Date.now() + RAID_TRIGGER_TTL_MS
  });
  return true;
}

function extractRaidId(message) {
  for (const embed of message.embeds || []) {
    const match = (embed.footer?.text || '').match(/\bID:\s*(\d+)/i);
    if (match) return match[1];
  }
  return null;
}

function extractPartyLeaderId(message) {
  for (const embed of message.embeds || []) {
    const partyField = (embed.fields || []).find(field => /party members/i.test(field.name || ''));
    const leaderMatch = partyField?.value?.match(/<@!?(\d+)>[^\n]*Party Leader/i);
    if (leaderMatch) return leaderMatch[1];
  }
  return null;
}

function extractTriggerUserId(message) {
  // Prefer explicit interaction metadata if present (slash commands)
  const interactionUserId = message.interactionMetadata?.user?.id ||
    message.interactionMetadata?.userId ||
    message.interaction?.user?.id ||
    message.interaction?.userId;
  if (interactionUserId) return interactionUserId;

  // Fallback to a recently tracked mention-based trigger (e.g., @Luvi raid view)
  const pending = pendingRaidTriggers.get(message.channel?.id);
  if (pending) {
    if (pending.expiresAt < Date.now()) {
      pendingRaidTriggers.delete(message.channel.id);
    } else {
      pendingRaidTriggers.delete(message.channel.id);
      return pending.userId;
    }
  }

  // Final fallback: if neither interaction nor a pending trigger exists, try to
  // infer the trigger from the embed's party leader. This helps when the
  // originating bot posts the embed without preserving interaction metadata
  // (some webhook-style responses).
  const inferredLeader = extractPartyLeaderId(message);
  if (inferredLeader) {
    return inferredLeader;
  }

  return null;
}

function extractLeaderId(message) {
  return extractPartyLeaderId(message) || extractTriggerUserId(message);
}

function extractElements(embed) {
  if (!embed) return [];

  const fields = embed.fields || [];
  const elementsField = fields.find(field => /elements/i.test(`${field.name || ''} ${field.value || ''}`));
  const text = [embed.title, embed.description, elementsField?.value, elementsField?.name]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  const emojiNames = new Set(
    [...text.matchAll(/<:([^:>]+):\d+>/g)].map(match => match[1])
  );

  return RAID_ELEMENT_EMOJIS
    .filter(element => emojiNames.has(element.emojiName) ||
      element.aliases.some(alias => new RegExp(`\\b${alias}\\b`, 'i').test(text)))
    .map(element => element.key);
}

function isRaidEmbed(message) {
  return message.embeds?.some(embed => {
    const hasPartyMembers = (embed.fields || []).some(field => /party members/i.test(field.name || ''));
    const hasElements = (embed.fields || []).some(field => /elements/i.test(`${field.name || ''} ${field.value || ''}`));
    const hasRaidId = /\bID:\s*\d+/i.test(embed.footer?.text || '');
    const isWaitingToStart = /waiting for the raid leader to begin the raid/i.test(embed.description || '');
    return hasPartyMembers && hasElements && hasRaidId && isWaitingToStart;
  });
}

async function handleRaidPingMessage(message) {
  if (!message.guild || message.author?.id !== LUVI_BOT_ID) return false;
  if (!message.embeds?.length) {
    if (pendingRaidFetches.has(message.id)) return false;
    pendingRaidFetches.add(message.id);

    setTimeout(async () => {
      try {
        const fetchedMessage = await message.channel.messages.fetch(message.id);
        if (!fetchedMessage.embeds?.length) return;
        await handleRaidPingMessage(fetchedMessage);
      } catch (error) {
        console.error('[RAID_PING] DEFERRED_FETCH_FAILED', { messageId: message.id, error: error.message });
      } finally {
        pendingRaidFetches.delete(message.id);
      }
    }, 2000);
    return false;
  }
  if (!isRaidEmbed(message)) {
    return false;
  }

  const { GuildRoles } = require('../../database/raid-ping.model');
  const guildRoles = await GuildRoles.findForGuild(message.guild.id);
  if (!guildRoles) {
    return false;
  }
  const triggerUserId = extractTriggerUserId(message);
  const leaderId = extractPartyLeaderId(message) || triggerUserId;
  const raidId = extractRaidId(message);
  const raidElements = message.embeds.flatMap(extractElements);
  if (!triggerUserId) {
    return false;
  }
  if (!leaderId || triggerUserId !== leaderId) {
    return false;
  }

  if (!raidId || raidElements.length === 0) {
    return false;
  }

  const announcedAt = announcedRaidMessages.get(message.id);
  if (announcedAt && Date.now() - announcedAt < ANNOUNCEMENT_DEDUPE_MS) {
    return false;
  }

  const roles = raidElements
    .map(element => ({
      element,
      roleId: guildRoles.roles?.[element] || (element === 'neutral' ? guildRoles.roles?.normal : null)
    }))
    .filter(item => item.roleId);
  if (roles.length === 0) {
    return false;
  }

  const roleMentions = roles.map(item => `<@&${item.roleId}>`);
  const elementRoleLines = roleMentions.join('\n');
  const announcement = new EmbedBuilder()
    .setTitle('Raid elements found')
    .addFields(
      { name: 'Elements found', value: elementRoleLines },
      { name: '\u200b', value: 'Tap below to summon help.' }
    )
    .setColor(0x3498db)
    .setFooter({ text: `Raid ID: ${raidId}` });
  const summonButton = new ButtonBuilder()
    .setCustomId(`raid_summon_${raidId}_${message.id}`)
    .setLabel('Summon')
    .setStyle(ButtonStyle.Primary);

  announcedRaidMessages.set(message.id, Date.now());
  let announcementMessage;
  try {
    announcementMessage = await message.channel.send({
      content: `<@${leaderId}>`,
      embeds: [announcement],
      components: [new ActionRowBuilder().addComponents(summonButton)],
      allowedMentions: { users: [leaderId], roles: [] }
    });

    setTimeout(() => {
      announcedRaidMessages.delete(message.id);
      announcementMessage.delete().catch(() => {});
    }, 30 * 1000);
  } catch (error) {
    announcedRaidMessages.delete(message.id);
    throw error;
  }
  return true;
}

async function validateAndPingRoles(raidElements, guildRoles, channel) {
  const missingRoles = [];
  const roleMentions = [];

  for (const element of raidElements) {
    const roleId = guildRoles?.roles?.[element] || (element === 'neutral' ? guildRoles?.roles?.normal : null);
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

async function handleRaidPingReaction(reaction, user) {
  const message = reaction.message;
  if (user.bot || reaction.emoji.name !== '🔔' || !message.guild || message.author?.id !== LUVI_BOT_ID) return false;

  const { GuildRoles } = require('../../database/raid-ping.model');
  const guildRoles = await GuildRoles.findForGuild(message.guild.id);
  if (!guildRoles || !isRaidEmbed(message)) return false;

  const raidElements = message.embeds.flatMap(extractElements);
  if (raidElements.length === 0) return false;

  const raidId = extractRaidId(message);
  if (!raidId) return false;

  const { Raid } = require('../../database/raid-ping.model');
  try {
    await Raid.create({ raidId, elements: raidElements });
  } catch (error) {
    if (error?.code === 11000) {
      const existingRaid = await Raid.findOne({ raidId }).lean();
      const expiresAt = existingRaid
        ? new Date(new Date(existingRaid.createdAt).getTime() + RAID_PING_COOLDOWN_SECONDS * 1000)
        : new Date(Date.now() + RAID_PING_COOLDOWN_SECONDS * 1000);
      const remainingSeconds = Math.max(0, Math.ceil((expiresAt.getTime() - Date.now()) / 1000));
      const remainingMinutes = Math.ceil(remainingSeconds / 60);
      await message.channel.send({
        content: `<@${user.id}> This raid was already pinged. You can ping it again <t:${Math.floor(expiresAt.getTime() / 1000)}:R> (about ${remainingMinutes} minute${remainingMinutes === 1 ? '' : 's'} remaining).`,
        allowedMentions: { users: [user.id] }
      });
      return true;
    }
    throw error;
  }

  let result;
  try {
    result = await validateAndPingRoles(raidElements, guildRoles, message.channel);
  } catch (error) {
    await Raid.deleteOne({ raidId }).catch(() => {});
    throw error;
  }
  if (result.sent.length === 0) {
    await Raid.deleteOne({ raidId }).catch(() => {});
    return false;
  }

  return true;
}

async function handleRaidSummonButton(interaction) {
  if (!interaction.customId.startsWith('raid_summon_')) return false;

  const [, , raidId, sourceMessageId] = interaction.customId.split('_');
  const sourceMessage = await interaction.channel.messages.fetch(sourceMessageId).catch(() => null);
  if (!sourceMessage || sourceMessage.author?.id !== LUVI_BOT_ID || !isRaidEmbed(sourceMessage)) {
    await interaction.reply({ content: 'The original raid message could not be verified.', ephemeral: true });
    return true;
  }

  const { GuildRoles, Raid } = require('../../database/raid-ping.model');
  const guildRoles = await GuildRoles.findForGuild(interaction.guild.id);
  const leaderId = extractLeaderId(sourceMessage);
  if (!leaderId || interaction.user.id !== leaderId) {
    await interaction.reply({ content: `Only the raid leader (<@${leaderId || 'unknown'}>) can summon these roles.`, ephemeral: true });
    return true;
  }

  const raidElements = sourceMessage.embeds.flatMap(extractElements);
  const roles = raidElements.map(element =>
    guildRoles?.roles?.[element] || (element === 'neutral' ? guildRoles?.roles?.normal : null)
  ).filter(Boolean);
  if (roles.length === 0) {
    await interaction.reply({ content: 'No element roles are configured for this raid.', ephemeral: true });
    return true;
  }

  try {
    await Raid.create({ raidId, elements: raidElements });
  } catch (error) {
    if (error?.code === 11000) {
      const existingRaid = await Raid.findOne({ raidId }).lean();
      const expiresAt = existingRaid
        ? new Date(new Date(existingRaid.createdAt).getTime() + RAID_PING_COOLDOWN_SECONDS * 1000)
        : new Date(Date.now() + RAID_PING_COOLDOWN_SECONDS * 1000);
      const minutes = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 60000));
      await interaction.reply({ content: `This raid was already summoned. You can summon it again <t:${Math.floor(expiresAt.getTime() / 1000)}:R> (about ${minutes} minute${minutes === 1 ? '' : 's'} remaining).`, ephemeral: true });
      return true;
    }
    throw error;
  }

  await interaction.reply({
    content: `<@${leaderId}> summoned ${roles.map(roleId => `<@&${roleId}>`).join(' ')}`,
    allowedMentions: { users: [leaderId], roles }
  });
  return true;
}

module.exports = {
  extractElements,
  validateAndPingRoles,
  handleRaidPingMessage,
  handleRaidPingReaction,
  handleRaidSummonButton,
  isRaidEmbed,
  extractRaidId,
  extractLeaderId,
  extractPartyLeaderId,
  extractTriggerUserId,
  trackRaidTrigger
};