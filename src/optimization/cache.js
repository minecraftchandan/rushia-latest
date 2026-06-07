const userSettingsCache = new Map();
const guildSettingsCache = new Map();
const MAX_CACHE_SIZE = 1000; // Prevent unlimited growth

class CacheManager {
  // User Settings
  static setUserSettings(userId, data) {
    userSettingsCache.delete(userId); // refresh insertion order
    if (userSettingsCache.size >= MAX_CACHE_SIZE) {
      userSettingsCache.delete(userSettingsCache.keys().next().value);
    }
    userSettingsCache.set(userId, data);
  }

  static getUserSettings(userId) {
    return userSettingsCache.get(userId);
  }

  static deleteUserSettings(userId) {
    return userSettingsCache.delete(userId);
  }

  static clearAllUserSettings() {
    const count = userSettingsCache.size;
    userSettingsCache.clear();
    return count;
  }

  // Guild Settings
  static setGuildSettings(guildId, data) {
    guildSettingsCache.delete(guildId); // refresh insertion order
    if (guildSettingsCache.size >= MAX_CACHE_SIZE) {
      guildSettingsCache.delete(guildSettingsCache.keys().next().value);
    }
    guildSettingsCache.set(guildId, data);
  }

  static getGuildSettings(guildId) {
    return guildSettingsCache.get(guildId);
  }

  static deleteGuildSettings(guildId) {
    return guildSettingsCache.delete(guildId);
  }

  static clearAllGuildSettings() {
    const count = guildSettingsCache.size;
    guildSettingsCache.clear();
    return count;
  }

  static clearAll() {
    userSettingsCache.clear();
    guildSettingsCache.clear();
  }

  static getStats() {
    return {
      users: userSettingsCache.size,
      guilds: guildSettingsCache.size,
      maxSize: MAX_CACHE_SIZE
    };
  }
}

module.exports = CacheManager;
