const Series = require('../database/Series');
const { sendError } = require('../utils/logger');

// In-memory cache for series data
let seriesCache = null;
let cacheTimestamp = 0;
const CACHE_TTL = 60 * 1000; // 1 minute

async function getAllSeries() {
  if (!seriesCache || (Date.now() - cacheTimestamp) > CACHE_TTL) {
    seriesCache = await Series.find({});
    cacheTimestamp = Date.now();
  }
  return seriesCache;
}

// Generic helper that matches a display name against a list of series documents
function matchSeriesInList(displayName, list) {
  const cleanDisplay = displayName.replace(/\.+$/, '').trim();

  // Exact match first
  let match = list.find(s => s.series === displayName);
  if (match) return match;

  // Partial match using regex on cleaned name
  const regex = new RegExp(`^${cleanDisplay.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
  match = list.find(s => regex.test(s.series));
  if (match) return match;

  // Reverse match with trimmed names
  match = list.find(s => {
    const seriesName = s.series.replace(/\.+$/, '').trim();
    return seriesName.startsWith(cleanDisplay) || cleanDisplay.startsWith(seriesName);
  });
  return match || null;
}

async function processSeriesMessage(message) {
  try {
    const TARGET_BOT_ID = '853629533855809596'; // Luvi bot ID
    
    if (message.author.id !== TARGET_BOT_ID) return;
    if (!message.embeds?.length) return;

    const embed = message.embeds[0];
    
    // Check for SOFI series selection format
    const hasChooseDesc = embed.description?.includes('Choose a series to drop characters from:');
    
    if (!hasChooseDesc) return;
    if (!embed.description) return;

    const lines = embed.description.split('\n');
    
    // For SOFI format: `1` • Series Name
    const seriesLines = lines.filter(line => {
      const trimmed = line.trim();
      return /^`\d+`\s*•/.test(trimmed);
    });

    if (seriesLines.length === 0) return;

    // Fetch all series once (cached) and build in-memory list
    const allSeries = await getAllSeries();

    let replyText = '';
    for (let i = 0; i < seriesLines.length; i++) {
      const line = seriesLines[i];
      
      // Extract number and series name from format: `1` • Series Name
      const match = line.match(/^`(\d+)`\s*•\s*(.+)$/);
      if (!match) continue;
      
      const originalNumber = match[1];
      const seriesName = match[2].trim();
      
      // Match series in database
      const seriesMatch = matchSeriesInList(seriesName, allSeries);
      const hearts = seriesMatch ? seriesMatch.hearts : '??';
      
      replyText += `\`${originalNumber}\`] • :heart: \`${hearts.padStart(3, ' ')}\` • ${seriesName}\n`;
    }

    if (replyText) {
      try {
        await message.reply(replyText.trim() + '\n-# Can be inaccurate, please use /suggestion');
      } catch (err) {
        await sendError(`[seriesSystem] Failed to reply in channel ${message.channel.id}: ${err.message}`, {
          guildId: message.guildId,
          channelId: message.channelId
        });
      }
    }
  } catch (error) {
    await sendError(`Series processing error: ${error.message}`, { 
      guildId: message.guildId,
      channelId: message.channelId 
    });
  }
}

module.exports = { processSeriesMessage };
