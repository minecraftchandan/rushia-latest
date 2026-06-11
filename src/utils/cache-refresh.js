const BotSettings = require('../database/bot-settings.model');
const UserNotificationSettings = require('../database/user-notification-settings.model');
const CacheManager = require('../optimization/cache');
const { sendLog, sendError } = require('./logger');

async function refreshGuildCache(guildId) {
  try {
    const settings = await BotSettings.findOne({ guildId });
    if (settings) {
      CacheManager.setGuildSettings(guildId, settings);
    } else {
      CacheManager.deleteGuildSettings(guildId);
    }
    await sendLog('GUILD_CACHE_REFRESHED', { category: 'SYSTEM', guildId });
    return true;
  } catch (error) {
    await sendError('GUILD_CACHE_REFRESH_FAILED', { category: 'SYSTEM', guildId, error: error.message });
    return false;
  }
}

async function refreshUserCache(userId) {
  try {
    const settings = await UserNotificationSettings.findOne({ userId });
    if (settings) {
      CacheManager.setUserSettings(userId, settings);
    } else {
      CacheManager.deleteUserSettings(userId);
    }
    await sendLog('USER_CACHE_REFRESHED', { category: 'SYSTEM', userId });
    return true;
  } catch (error) {
    await sendError('USER_CACHE_REFRESH_FAILED', { category: 'SYSTEM', userId, error: error.message });
    return false;
  }
}

module.exports = { refreshGuildCache, refreshUserCache };
