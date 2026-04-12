const Series = require('../database/Series');
const { sendError } = require('../utils/logger');
const { SOFI_BOT_ID } = require('../config/constants');

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
    const TARGET_BOT_ID = SOFI_BOT_ID;
    
    console.log(`[SERIES] Message from: ${message.author.id} (${message.author.username})`);
    
    if (message.author.id !== TARGET_BOT_ID) return;
    if (!message.embeds?.length) {
      console.log('[SERIES] No embeds found');
      return;
    }

    const embed = message.embeds[0];
    console.log(`[SERIES] Embed description: ${embed.description?.substring(0, 100)}...`);
    
    // Check for SOFI series selection format
    const hasChooseDesc = embed.description?.includes('Choose a series to drop characters from:');
    
    if (!hasChooseDesc) {
      console.log('[SERIES] Not a series selection embed');
      return;
    }
    if (!embed.description) return;

    const lines = embed.description.split('\n');
    console.log(`[SERIES] Total lines: ${lines.length}`);
    
    // For SOFI format: `1` • Series Name
    const seriesLines = lines.filter(line => {
      const trimmed = line.trim();
      return /^`\d+`\s*•/.test(trimmed);
    });

    console.log(`[SERIES] Found ${seriesLines.length} series lines`);
    if (seriesLines.length === 0) return;

    // Fetch all series once (cached) and build in-memory list
    const allSeries = await getAllSeries();
    console.log(`[SERIES] Database has ${allSeries.length} series`);

    let replyText = '';
    for (let i = 0; i < seriesLines.length; i++) {
      const line = seriesLines[i];
      console.log(`[SERIES] Parsing line: ${line}`);
      
      // Extract number and series name from format: `1` • Series Name
      const match = line.match(/^`(\d+)`\s*•\s*(.+)$/);
      if (!match) {
        console.log(`[SERIES] Failed to match line: ${line}`);
        continue;
      }
      
      const originalNumber = match[1];
      const seriesName = match[2].trim();
      console.log(`[SERIES] Extracted: ${originalNumber} - ${seriesName}`);
      
      // Match series in database
      const seriesMatch = matchSeriesInList(seriesName, allSeries);
      const hearts = seriesMatch ? seriesMatch.hearts : '??';
      console.log(`[SERIES] Hearts for "${seriesName}": ${hearts}`);
      
      replyText += `\`${originalNumber}\`] • :heart: \`${hearts.padStart(3, ' ')}\` • ${seriesName}\n`;
    }

    if (replyText) {
      console.log(`[SERIES] Sending reply with ${seriesLines.length} series`);
      try {
        await message.reply(replyText.trim() + '\n-# Can be inaccurate, report using </suggestion:1446456675954593864>');
        console.log('[SERIES] Reply sent successfully');
      } catch (err) {
        console.error(`[SERIES] Failed to send reply: ${err.message}`);
        await sendError(`[seriesSystem] Failed to reply in channel ${message.channel.id}: ${err.message}`, {
          guildId: message.guildId,
          channelId: message.channelId
        });
      }
    }
  } catch (error) {
    console.error(`[SERIES] Error: ${error.message}`, error);
    await sendError(`Series processing error: ${error.message}`, { 
      guildId: message.guildId,
      channelId: message.channelId 
    });
  }
}

module.exports = { processSeriesMessage };
