const ClashCount = require('../database/clash-count.model');
const { logError } = require('../utils/logger');

const LUVI_ID = '1269481871021047891';

// Matches: @username, your clash battle has ended! You defeated/were defeated
const CLASH_REGEX = /^<@!?(\d+)>,? your clash battle has ended!/i;

async function processClashMessage(message) {
  if (!message.guild || message.author.id !== LUVI_ID) return;
  if (Date.now() - message.createdTimestamp > 60000) return;

  const match = message.content.match(CLASH_REGEX);
  if (!match) return;

  const userId = match[1];

  try {
    await ClashCount.findOneAndUpdate(
      { userId, guildId: message.guild.id },
      { $inc: { clash_count: 1 }, $set: { lastClashAt: new Date() } },
      { upsert: true }
    );
  } catch (error) {
    logError('Clash count error:', error);
  }
}

module.exports = { processClashMessage };
