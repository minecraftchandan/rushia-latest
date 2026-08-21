const { AttachmentBuilder } = require('discord.js');

function buildMessageStructure(message) {
  return {
    id: message.id,
    channelId: message.channelId,
    guildId: message.guildId,
    author: message.author?.toJSON?.() || null,
    content: message.content,
    embeds: message.embeds.map(embed => embed.toJSON()),
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

function formatEmbedForDiscord(embed, index) {
  const lines = [`Embed ${index + 1}`];
  const data = embed.toJSON();

  if (data.title) lines.push(`Title: ${data.title}`);
  if (data.url) lines.push(`URL: ${data.url}`);
  if (data.description) lines.push(`Description: ${data.description}`);
  if (data.color !== undefined) lines.push(`Color: ${data.color}`);
  if (data.timestamp) lines.push(`Timestamp: ${data.timestamp}`);

  if (data.author) {
    lines.push(`Author: ${data.author.name || ''}${data.author.url ? ` (${data.author.url})` : ''}`);
  }

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
  return lines.join('\n');
}

function formatMessageForDiscord(message) {
  const sections = [];
  if (message.content) sections.push(`Message content:\n${message.content}`);
  message.embeds.forEach((embed, index) => sections.push(formatEmbedForDiscord(embed, index)));

  if (message.components.length > 0) {
    sections.push(`Components JSON:\n${JSON.stringify(message.components.map(component => component.toJSON()), null, 2)}`);
  }

  return sections.join('\n\n') || '(Message has no content, embeds, or components)';
}

async function handleEmbedInspectCommand(message, content) {
  const match = String(content || '').trim().match(/^(\d{17,20})$/);
  if (!match) return false;

  if (message.author.id !== process.env.BOT_OWNER_ID) {
    await message.reply('Only the bot owner can inspect message embeds.');
    return true;
  }

  const target = await message.channel.messages.fetch(match[1]).catch(() => null);
  if (!target) {
    await message.reply('I could not fetch that message from this channel. Check the message ID and channel.');
    return true;
  }

  const structure = buildMessageStructure(target);
  const discordFormat = formatMessageForDiscord(target);
  const jsonFile = new AttachmentBuilder(Buffer.from(JSON.stringify(structure, null, 2), 'utf8'), {
    name: `message-${target.id}.json`
  });
  const textFile = new AttachmentBuilder(Buffer.from(discordFormat, 'utf8'), {
    name: `message-${target.id}-discord-format.txt`
  });

  await message.reply({
    content: `Fetched message ${target.id}: ${target.embeds.length} embed(s), ${target.components.length} component row(s).`,
    files: [jsonFile, textFile]
  });
  return true;
}

module.exports = {
  buildMessageStructure,
  formatMessageForDiscord,
  handleEmbedInspectCommand
};
