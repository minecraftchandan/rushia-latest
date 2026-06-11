const Series = require('../database/series.model');
const { logInfo, logError } = require('../utils/logger');
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
    
    await logInfo('[SERIES] Message from: ${message.author.id} (${message.author.username})', { operation: 'SERIES_PROCESS' });
    
    if (message.author.id !== TARGET_BOT_ID) return;
    if (!message.embeds?.length) {
      await logInfo('[SERIES] No embeds found', { operation: 'SERIES_PROCESS' });
      return;
    }

    const embed = message.embeds[0];
    await logInfo(`[SERIES] Embed description: ${embed.description?.substring(0, 100)}...`, { operation: 'SERIES_PROCESS' });
    
    // Check for SOFI series selection format
    const hasChooseDesc = embed.description?.includes('Choose a series to drop characters from:');
    
    if (!hasChooseDesc) {
      await logInfo('[SERIES] Not a series selection embed', { operation: 'SERIES_PROCESS' });
      return;
    }
    if (!embed.description) return;

    const lines = embed.description.split('\n');
    await logInfo(`[SERIES] Total lines: ${lines.length}`, { operation: 'SERIES_PROCESS' });
    
    // For SOFI format: `1` • Series Name
    const seriesLines = lines.filter(line => {
      const trimmed = line.trim();
      return /^`\d+`\s*•/.test(trimmed);
    });

    await logInfo(`[SERIES] Found ${seriesLines.length} series lines`, { operation: 'SERIES_PROCESS' });
    if (seriesLines.length === 0) return;

    // Fetch all series once (cached) and build in-memory list
    const allSeries = await getAllSeries();
    await logInfo(`[SERIES] Database has ${allSeries.length} series`, { operation: 'SERIES_PROCESS' });

    let replyText = '';
    for (let i = 0; i < seriesLines.length; i++) {
      const line = seriesLines[i];
      await logInfo(`[SERIES] Parsing line: ${line}`, { operation: 'SERIES_PROCESS' });
      
      // Extract number and series name from format: `1` • Series Name
      const match = line.match(/^`(\d+)`\s*•\s*(.+)$/);
      if (!match) {
        await logInfo(`[SERIES] Failed to match line: ${line}`, { operation: 'SERIES_PROCESS' });
        continue;
      }
      
      const originalNumber = match[1];
      const seriesName = match[2].trim();
      await logInfo(`[SERIES] Extracted: ${originalNumber} - ${seriesName}`, { operation: 'SERIES_PROCESS' });
      
      // Match series in database
      const seriesMatch = matchSeriesInList(seriesName, allSeries);
      const hearts = seriesMatch ? seriesMatch.hearts : '??';
      await logInfo(`[SERIES] Hearts for "${seriesName}": ${hearts}`, { operation: 'SERIES_PROCESS' });
      
      replyText += `\`${originalNumber}\`] • :heart: \`${hearts.padStart(3, ' ')}\` • ${seriesName}\n`;
    }

    if (replyText) {
      await logInfo(`[SERIES] Sending reply with ${seriesLines.length} series`, { operation: 'SERIES_PROCESS' });
      try {
        await message.reply(replyText.trim() + '\n-# Can be inaccurate, report using </suggestion:1446456675954593864>');
        await logInfo('[SERIES] Reply sent successfully', { operation: 'SERIES_PROCESS', action: 'SENT' });
      } catch (err) {
        await logError(`[SERIES] Failed to send reply: ${err.message}`, err, {
          operation: 'SERIES_PROCESS',
          action: 'FAILED',
          guildId: message.guildId,
          channelId: message.channelId
        });
      }
    }
  } catch (error) {
    await logError(`[SERIES] Error: ${error.message}`, error, { 
      operation: 'SERIES_PROCESS',
      guildId: message.guildId,
      channelId: message.channelId 
    });
  }
}

module.exports = { processSeriesMessage };
