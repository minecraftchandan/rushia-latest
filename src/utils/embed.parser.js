const { sendLog, sendError } = require('../utils/logger');

function parseBossComponent(components) {
  if (!components || components.length === 0) return null;

  const container = components.find(c => c.type === 17);
  if (!container || !container.components) return null;

  let bossName = null;
  let tier = null;

  const nameComponent = container.components.find(c => c.type === 10 && c.id === 2);
  if (nameComponent && nameComponent.content) {
    bossName = nameComponent.content.replace(/\*\*/g, '').trim();
  }

  const tierComponent = container.components.find(c => c.type === 10 && c.content && c.content.includes('__**Tier**__'));
  if (tierComponent) {
    const tierMatch = tierComponent.content.match(/<:LU_Tier(\d+):\d+>/);
    if (tierMatch) {
      tier = `Tier ${tierMatch[1]}`;
    }
  }

  return (bossName && tier) ? { bossName, tier } : null;
}

function parseBossEmbed(embed) {
  if (!embed || !embed.title) return null;

  const monsterEmojiMatch = embed.title.match(/<:LU_Monster:\d+>/);
  if (!monsterEmojiMatch) return null;

  const bossNameMatch = embed.title.match(/<:LU_Monster:\d+>\s*(.+)/);
  const bossName = bossNameMatch ? bossNameMatch[1].trim() : null;

  let tier = null;
  if (embed.fields && embed.fields.length > 0) {
    for (const field of embed.fields) {
      const tierMatch = field.value.match(/<:LU_Tier(\d+):\d+>/);
      if (tierMatch) {
        tier = `Tier ${tierMatch[1]}`;
        break;
      }
    }
  }

  return (bossName && tier) ? { bossName, tier } : null;
}

function parseCardEmbed(embed) {
  if (!embed) return null;

  const description = embed.description || '';
  const rarityMap = {
    C: 'Common',
    UC: 'Uncommon',
    R: 'Rare',
    E: 'Exotic',
    L: 'Legendary'
  };

  const rarityMatch = description.match(/:LU_([A-Z]{1,2}):/);
  let rarity = null;
  if (rarityMatch) {
    const code = rarityMatch[1];
    rarity = rarityMap[code] || 'Unknown';
  }

  const nameMatch = description.match(/\*\*(.+?)\*\*/);
  const cardName = nameMatch ? nameMatch[1] : null;

  const seriesMatch = description.match(/Series:\s*([^\n]+)/);
  const seriesName = seriesMatch ? seriesMatch[1].trim() : null;

  if (!cardName || !seriesName || !rarity) return null;

  return { cardName, seriesName, rarity };
}

function parseExpeditionComponent(components) {
  if (!components || components.length === 0) return null;

  const container = components.find(c => c.type === 17);
  if (!container || !container.components) return null;

  const titleComponent = container.components.find(c =>
    c.type === 10 && c.content && c.content.includes("'s Expeditions")
  );

  if (!titleComponent) return null;

  const usernameMatch = titleComponent.content.match(/^(.+)'s Expeditions$/);
  if (!usernameMatch) return null;
  const username = usernameMatch[1];

  const cards = [];
  const mediaComponents = container.components.filter(c => c.type === 9 && c.components);

  for (const mediaComp of mediaComponents) {
    const textComp = mediaComp.components.find(c => c.type === 10);
    if (!textComp || !textComp.content) continue;

    const content = textComp.content;
    const cardMatch = content.match(/<:LU_[A-Z]:\d+> (.+?)(?:\s*\||\n)/);
    const idMatch = content.match(/ID: (\d+)/);
    const timeMatch = content.match(/⏳ (?:(\d+)h\s*)?(?:(\d+)m)?(?:\s*(\d+)s)? remaining/);

    if (!timeMatch) {
      sendLog(`[EXPEDITION] Time not matched in: ${content.substring(0, 100)}`);
    }

    if (cardMatch && idMatch && timeMatch) {
      const cardName = cardMatch[1].trim();
      const cardId = idMatch[1];
      const hours = parseInt(timeMatch[1] || 0, 10);
      const minutes = parseInt(timeMatch[2] || 0, 10);
      const seconds = parseInt(timeMatch[3] || 0, 10);

      let remainingMillis = (hours * 60 * 60 * 1000) + (minutes * 60 * 1000) + (seconds * 1000);

      if (!timeMatch[3] && (timeMatch[1] || timeMatch[2])) {
        remainingMillis += 59 * 1000;
      }

      if (remainingMillis > 0) cards.push({ cardId, cardName, remainingMillis });
    }
  }

  return cards.length > 0 ? { username, cards } : null;
}

function parseExpeditionEmbed(embed) {
  if (!embed || !embed.title || !embed.title.endsWith('s Expeditions')) return null;

  const usernameMatch = embed.title.match(/^(?:\S+\s)?(.+)'s Expeditions$/);
  if (!usernameMatch) return null;
  const username = usernameMatch[1];

  const cards = [];
  if (embed.fields) {
    for (const field of embed.fields) {
      const cardNameMatch = field.name.match(/>\s*([^|]+)/);
      const cardName = cardNameMatch ? cardNameMatch[1].trim() : 'Unknown Card';

      const cardIdMatch = field.value.match(/ID: (\d+)/);
      const timeMatch = field.value.match(/(?:⏳|\u23f3|⌛) \*\*(\d+h)?\s*(\d+m)?\s*(\d+s)? remaining\*\*/);

      if (cardIdMatch && timeMatch) {
        const cardId = cardIdMatch[1];
        let remainingMillis = 0;

        if (timeMatch[1]) remainingMillis += parseInt(timeMatch[1], 10) * 60 * 60 * 1000;
        if (timeMatch[2]) remainingMillis += parseInt(timeMatch[2], 10) * 60 * 1000;
        if (timeMatch[3]) remainingMillis += parseInt(timeMatch[3], 10) * 1000;
        else if (timeMatch[1] || timeMatch[2]) remainingMillis += 59 * 1000;

        if (remainingMillis > 0) cards.push({ cardId, cardName, remainingMillis });
      }
    }
  }

  return cards.length > 0 ? { username, cards } : null;
}

function parseRaidViewEmbed(embed) {
  if (!embed) return null;

  const partyMembersField = embed.fields?.find(f => f.name.includes('Party Members'));
  if (!partyMembersField) return null;

  const fatiguedUsers = [];
  const lines = partyMembersField.value.split('\n');

  for (const line of lines) {
    if (line.includes('Fatigued')) {
      const userIdMatch = line.match(/<@(\d+)>/);
      const timeContentMatch = line.match(/Fatigued \((.*)\)/);

      if (userIdMatch && timeContentMatch) {
        const userId = userIdMatch[1];
        const timeContent = timeContentMatch[1];

        let fatigueMillis = 0;
        const minutesMatch = timeContent.match(/(\d+)m/);
        const secondsMatch = timeContent.match(/(\d+)s/);

        if (minutesMatch) fatigueMillis += parseInt(minutesMatch[1], 10) * 60 * 1000;
        if (secondsMatch) fatigueMillis += parseInt(secondsMatch[1], 10) * 1000;

        if (fatigueMillis > 0) fatiguedUsers.push({ userId, fatigueMillis });
      }
    }
  }

  return fatiguedUsers.length > 0 ? fatiguedUsers : null;
}

function parseRaidSpawnEmbed(embed) {
  if (!embed) return null;

  let foundYouSpawned = false;

  try {
    if (embed.title?.includes('You spawned')) foundYouSpawned = true;
  } catch (e) {}

  try {
    if (embed.description?.includes('You spawned')) foundYouSpawned = true;
  } catch (e) {}

  try {
    if (embed.fields) {
      for (const field of embed.fields) {
        if (field.name?.includes('You spawned') || field.value?.includes('You spawned')) {
          foundYouSpawned = true;
          break;
        }
      }
    }
  } catch (e) {}

  if (!foundYouSpawned) return null;

  const footer = embed.footer?.text || '';
  const raidIdMatch = footer.match(/Raid ID:\s*(\d+)/);
  if (!raidIdMatch) return null;

  return { raidSpawned: true, raidId: raidIdMatch[1] };
}

function parseRaidAttackEmbed(message) {
  const userId = message.interactionMetadata?.user?.id || message.interaction?.user?.id;
  if (!userId) return null;

  const embed = message.embeds?.[0];
  if (!embed) return null;

  const text = `${embed.title || ''} ${embed.description || ''}`;
  if (!text.includes('Fatigued') && !text.includes('fatigued')) return null;

  return { userId, fatigueMillis: 10 * 60 * 1000 };
}

function parseRaidViewComponent(components) {
  if (!components || components.length === 0) return null;

  const fatiguedUsers = [];

  const container = components.find(c => c.type === 17);
  if (!container || !container.components) return null;

  const partyMembersComponent = container.components.find(c =>
    c.type === 10 && c.content && c.content.includes('__Party Members__')
  );

  if (!partyMembersComponent) return null;

  const lines = partyMembersComponent.content.split('\n');

  for (const line of lines) {
    if (line.includes('Fatigued')) {
      const userIdMatch = line.match(/<@(\d+)>/);
      const timeContentMatch = line.match(/Fatigued \((.*)\)/);

      if (userIdMatch && timeContentMatch) {
        const userId = userIdMatch[1];
        const timeContent = timeContentMatch[1];

        let fatigueMillis = 0;
        const minutesMatch = timeContent.match(/(\d+)m/);
        const secondsMatch = timeContent.match(/(\d+)s/);

        if (minutesMatch) fatigueMillis += parseInt(minutesMatch[1], 10) * 60 * 1000;
        if (secondsMatch) fatigueMillis += parseInt(secondsMatch[1], 10) * 1000;

        if (fatigueMillis > 0) fatiguedUsers.push({ userId, fatigueMillis });
      }
    }
  }

  return fatiguedUsers.length > 0 ? fatiguedUsers : null;
}

module.exports = {
  parseBossEmbed,
  parseBossComponent,
  parseCardEmbed,
  parseExpeditionEmbed,
  parseExpeditionComponent,
  parseRaidViewEmbed,
  parseRaidViewComponent,
  parseRaidAttackEmbed,
  parseRaidSpawnEmbed,
};
