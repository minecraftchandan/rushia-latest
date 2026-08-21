#!/usr/bin/env node
require('dotenv').config();

const { Client, GatewayIntentBits, Events, AttachmentBuilder } = require('discord.js');

function serializeDiscordValue(value, seen = new WeakSet()) {
  if (value === null || value === undefined || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return value;
  }
  if (typeof value.toJSON === 'function') {
    try {
      return serializeDiscordValue(value.toJSON(), seen);
    } catch (error) {}
  }
  if (typeof value !== 'object' || seen.has(value)) return '[Circular]';
  seen.add(value);
  if (Array.isArray(value)) return value.map(item => serializeDiscordValue(item, seen));
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, serializeDiscordValue(item, seen)]));
}

function getDetectedRaidData(embeds) {
  const text = embeds.flatMap(embed => {
    const data = embed.toJSON();
    return [data.title, data.description, data.footer?.text, ...(data.fields || []).flatMap(field => [field.name, field.value])];
  }).filter(Boolean).join('\n');
  const partyMemberText = embeds.flatMap(embed => embed.fields || [])
    .filter(field => field.name?.includes('Party Members'))
    .map(field => field.value)
    .join('\n');
  const elementsLine = text.match(/Elements:\s*(.+)/i)?.[1] || null;

  return {
    raidId: text.match(/\bID:\s*(\d+)/i)?.[1] || null,
    elementsText: elementsLine,
    elementEmojis: [...text.matchAll(/<:([^:>]+):([0-9]+)>/g)].map(match => ({ name: match[1], id: match[2] })),
    mentionedUserIds: [...new Set([...text.matchAll(/<@!?(\d+)>/g)].map(match => match[1]))],
    partyMemberUserIds: [...new Set([...partyMemberText.matchAll(/<@!?(\d+)>/g)].map(match => match[1]))]
  };
}

function buildMessageStructure(message) {
  return {
    id: message.id,
    channelId: message.channelId,
    guildId: message.guildId,
    author: message.author?.toJSON?.() || null,
    content: message.content,
    embeds: message.embeds.map(embed => embed.toJSON()),
    interactionMetadata: serializeDiscordValue(message.interactionMetadata),
    interaction: serializeDiscordValue(message.interaction),
    detectedRaid: getDetectedRaidData(message.embeds),
    components: message.components.map(component => component.toJSON()),
    attachments: [...message.attachments.values()].map(attachment => ({
      id: attachment.id,
      name: attachment.name,
      contentType: attachment.contentType,
      size: attachment.size,
      url: attachment.url
    })),
    createdTimestamp: message.createdTimestamp,
    url: message.url
  };
}

function formatMessageForDiscord(message) {
  const sections = [];
  const detectedRaid = getDetectedRaidData(message.embeds);
  if (message.interactionMetadata || message.interaction) {
    sections.push(`Interaction metadata:\n${JSON.stringify({
      interactionMetadata: serializeDiscordValue(message.interactionMetadata),
      interaction: serializeDiscordValue(message.interaction)
    }, null, 2)}`);
  } else {
    sections.push('Interaction metadata: not present on this fetched message');
  }
  sections.push(`Detected raid data:\n${JSON.stringify(detectedRaid, null, 2)}`);
  if (message.content) sections.push(`Message content:\n${message.content}`);

  message.embeds.forEach((embed, index) => {
    const data = embed.toJSON();
    const lines = [`Embed ${index + 1}`];
    if (data.title) lines.push(`Title: ${data.title}`);
    if (data.url) lines.push(`URL: ${data.url}`);
    if (data.description) lines.push(`Description: ${data.description}`);
    if (data.color !== undefined) lines.push(`Color: ${data.color}`);
    if (data.timestamp) lines.push(`Timestamp: ${data.timestamp}`);
    if (data.author) lines.push(`Author: ${data.author.name || ''}${data.author.url ? ` (${data.author.url})` : ''}`);
    if (Array.isArray(data.fields) && data.fields.length > 0) {
      lines.push('Fields:');
      data.fields.forEach((field, fieldIndex) => {
        lines.push(`  ${fieldIndex + 1}. name=${JSON.stringify(field.name)} inline=${Boolean(field.inline)}`);
        lines.push(`     value=${JSON.stringify(field.value)}`);
      });
    }
    if (data.thumbnail?.url) lines.push(`Thumbnail: ${data.thumbnail.url}`);
    if (data.image?.url) lines.push(`Image: ${data.image.url}`);
    if (data.footer) lines.push(`Footer: ${data.footer.text || ''}`);
    sections.push(lines.join('\n'));
  });

  if (message.components.length > 0) {
    sections.push(`Components JSON:\n${JSON.stringify(message.components.map(component => component.toJSON()), null, 2)}`);
  }
  return sections.join('\n\n') || '(Message has no content, embeds, or components)';
}

async function inspectMessage(message, content) {
  const match = String(content || '').trim().match(/^(\d{17,20})$/);
  if (!match) return;

  if (message.author.id !== process.env.BOT_OWNER_ID) {
    await message.reply('Only the bot owner can inspect message embeds.');
    return;
  }

  const target = await message.channel.messages.fetch(match[1]).catch(() => null);
  if (!target) {
    await message.reply('I could not fetch that message from this channel. Check the message ID and channel.');
    return;
  }

  const jsonFile = new AttachmentBuilder(
    Buffer.from(JSON.stringify(buildMessageStructure(target), null, 2), 'utf8'),
    { name: `message-${target.id}.json` }
  );
  const textFile = new AttachmentBuilder(
    Buffer.from(formatMessageForDiscord(target), 'utf8'),
    { name: `message-${target.id}-discord-format.txt` }
  );

  await message.reply({
    content: `Fetched message ${target.id}: ${target.embeds.length} embed(s), ${target.components.length} component row(s).`,
    files: [jsonFile, textFile]
  });
}

const token = process.env.BOT_TOKEN;
if (!token) {
  console.error('BOT_TOKEN is not configured.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once(Events.ClientReady, readyClient => {
  console.log(`Embed inspector bot logged in as ${readyClient.user.tag}`);
  console.log('Use: @InspectorBot <message-id>');
});

client.on(Events.MessageCreate, async message => {
  if (message.author.bot || !client.user || !message.mentions.has(client.user)) return;

  const mentionRegex = new RegExp(`^<@!?${client.user.id}>\\s*`, 'i');
  const content = message.content.replace(mentionRegex, '').trim();

  try {
    await inspectMessage(message, content);
  } catch (error) {
    console.error(`Embed inspection failed: ${error.message}`);
    await message.reply('Embed inspection failed. Check the inspector bot logs.').catch(() => {});
  }
});

client.login(token).catch(error => {
  console.error(`Embed inspector bot login failed: ${error.message}`);
  process.exit(1);
});
