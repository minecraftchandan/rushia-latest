const { sendLog, sendError } = require('../utils/logger');

function extractIdsFromEmbed(embed) {
  const ids = [];

  if (embed.fields && embed.fields.length > 0) {
    embed.fields.forEach((field) => {
      const valueMatch = field.value.match(/ID:\s*`(\d+)`/);
      if (valueMatch) ids.push(valueMatch[1]);
    });
  }

  if (embed.description) {
    const matches = embed.description.match(/ID:\s*`(\d+)`/g);
    if (matches) {
      matches.forEach(match => {
        const id = match.match(/\d+/)[0];
        if (!ids.includes(id)) ids.push(id);
      });
    }
  }

  return ids;
}

// New format: type 17 container with type 10 text blocks
function extractIdsFromComponents(components) {
  const ids = [];
  if (!components || !components.length) return ids;

  for (const row of components) {
    if (row.type === 17 && row.components) {
      for (const child of row.components) {
        if (child.type === 10 && child.content) {
          const matches = child.content.match(/ID:\s*`(\d+)`/g);
          if (matches) {
            matches.forEach(match => {
              const id = match.match(/\d+/)[0];
              if (!ids.includes(id)) ids.push(id);
            });
          }
        }
      }
    }
  }

  return ids;
}

function isTeamContainer(components) {
  if (!components || !components.length) return false;
  const container = components.find(c => c.type === 17 && c.components);
  if (!container) return false;

  const hasTeamHeader = container.components.some(
    c => c.type === 10 && c.content && /\*\*Team:/i.test(c.content)
  );
  const teamButtons = ['Set Active', 'Add Card', 'Remove Card', 'Delete Team'];
  const hasTeamButtons = container.components.some(
    c => c.type === 1 && c.components &&
      c.components.some(btn => teamButtons.includes(btn.label))
  );

  return hasTeamHeader && hasTeamButtons;
}

function hasExtractableIds(message) {
  if (message.embeds.length) {
    const ids = extractIdsFromEmbed(message.embeds[0]);
    if (ids.length) return true;
  }
  if (message.components.length) {
    if (isTeamContainer(message.components)) return true;
    const ids = extractIdsFromComponents(message.components);
    if (ids.length) return true;
  }
  return false;
}

const processingIds = new Set();

async function addIdReaction(message) {
  if (!message.components || !message.embeds) return;
  if (processingIds.has(message.id)) return;
  if (message.reactions?.cache?.has('🆔')) return;
  if (!hasExtractableIds(message)) return;
  try {
    await message.react('🆔');
  } catch (e) {}
}

async function handleIDExtractorReaction(reaction, user) {
  const message = reaction.message;
  if (processingIds.has(message.id)) return;
  processingIds.add(message.id);

  try {
    let ids = [];
    if (message.embeds.length) ids = extractIdsFromEmbed(message.embeds[0]);
    if (!ids.length && message.components.length) ids = extractIdsFromComponents(message.components);

    if (ids.length) await message.channel.send(ids.join(','));

    try {
      await reaction.users.remove(user);
      await reaction.users.remove(reaction.client.user);
    } catch (error) {
      sendError('Failed to remove reactions:', error);
    }
  } finally {
    setTimeout(() => processingIds.delete(message.id), 3000);
  }
}

module.exports = {
  handleIDExtractorReaction,
  extractIdsFromEmbed,
  addIdReaction
};
