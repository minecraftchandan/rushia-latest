const settingsManager = require('../utils/settings.manager');
const userSettingsManager = require('../utils/user-settings.manager');
const { sendLog, sendError } = require('../utils/logger');

const REFRESH_INTERVAL = 5 * 60 * 1000; // 5 minutes
let client = null;

function setClient(discordClient) {
  client = discordClient;
}

async function refreshAllCaches() {
  try {
    // Only refresh guilds the bot is actually in
    if (client) {
      const BotSettings = require('../database/bot-settings.model');
      const CacheManager = require('../optimization/cache');
      
      const activeGuildIds = Array.from(client.guilds.cache.keys());
      const settings = await BotSettings.find({ guildId: { $in: activeGuildIds } });
      
      // Clear old cache and load only active guilds
      CacheManager.clearAllGuildSettings();
      settings.forEach(s => CacheManager.setGuildSettings(s.guildId, s));
      
      await sendLog('AUTO_CACHE_REFRESH', { 
        category: 'SYSTEM',
        action: 'CACHE_REFRESHED',
        guildsRefreshed: settings.length
      });
    } else {
      // Fallback to old method if client not set
      await settingsManager.initializeSettings();
    }
    
    // User settings are cache-aside (loaded on demand) — no bulk reload needed.
  } catch (error) {
    sendError('Cache refresh error:', error);
  }
}

function startCacheRefreshScheduler() {
  setInterval(refreshAllCaches, REFRESH_INTERVAL);
  sendLog('CACHE_SCHEDULER_STARTED', {
    category: 'SYSTEM',
    interval: `${REFRESH_INTERVAL / 1000}s`
  });
}

module.exports = { startCacheRefreshScheduler, refreshAllCaches, setClient };
