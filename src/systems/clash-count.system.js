const ClashCount = require('../database/clash-count.model');
const UsernameCache = require('../database/username-cache.model');
const { sendError } = require('../utils/logger');

const LUVI_ID = '1269481871021047891';

function parseClashEmbed(message) {
  if (!message.embeds.length) return null;
  const embed = message.embeds[0];
  if (!embed.title?.includes('Clash Battle')) return null;

  const userId = message.interactionMetadata?.user?.id || message.interaction?.user?.id;
  if (userId) return { userId };

  const userField = embed.fields?.find(f => f.name?.endsWith("'s Card"));
  if (!userField) return null;
  const username = userField.name.replace(/'s Card$/, '').trim();
  return { username };
}

async function resolveUserId(message, username) {
  // Check persistent DB cache first
  const cached = await UsernameCache.findOne({ username }).lean();
  if (cached) return cached.userId;

  // Fallback: guild member lookup
  try {
    const members = await message.guild.members.fetch({ query: username, limit: 1 });
    const member = members.first();
    if (member && member.user.username === username) {
      // Store permanently
      await UsernameCache.findOneAndUpdate(
        { username },
        { userId: member.id, updatedAt: new Date() },
        { upsert: true }
      );
      return member.id;
    }
  } catch {}
  return null;
}

async function processClashMessage(message) {
  if (!message.guild || message.author.id !== LUVI_ID) return;
  if (Date.now() - message.createdTimestamp > 60000) return;

  const parsed = parseClashEmbed(message);
  if (!parsed) return;

  let userId = parsed.userId;

  if (!userId && parsed.username) {
    userId = await resolveUserId(message, parsed.username);
  }

  if (!userId) return;

  // If we got userId from interaction metadata, also cache the username if present
  if (parsed.userId && message.interactionMetadata?.user?.username) {
    const uname = message.interactionMetadata.user.username;
    UsernameCache.findOneAndUpdate(
      { username: uname },
      { userId: parsed.userId, updatedAt: new Date() },
      { upsert: true }
    ).catch(() => {});
  }

  try {
    await ClashCount.findOneAndUpdate(
      { userId, guildId: message.guild.id },
      { $inc: { clash_count: 1 }, $set: { lastClashAt: new Date() } },
      { upsert: true }
    );
  } catch (error) {
    sendError('Clash count error:', error.message);
  }
}

module.exports = { processClashMessage };
