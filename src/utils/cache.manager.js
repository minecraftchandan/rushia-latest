const { EmbedBuilder } = require('discord.js');
const { sendLog, sendError } = require('../utils/logger');

// Import cache systems
const settingsManager = require('../utils/settings.manager');
const userSettingsManager = require('../utils/user-settings.manager');
const { refreshAllCaches } = require('../tasks/cache-refresh.scheduler');

// Cache references
const cacheStats = {
  lastCleared: {
    global: null,
    guilds: new Map(),
    users: new Map(),
    series: null
  },
  lastRefreshed: {
    global: null,
    guilds: new Map()
  }
};

// Refresh settings cache for a guild
async function refreshGuildSettingsCache(guildId) {
  const BotSettings = require('../database/bot-settings.model');
  const settings = await BotSettings.findOne({ guildId });
  if (settings) {
    const CacheManager = require('../optimization/cache');
    CacheManager.setGuildSettings(guildId, settings);
  }
  cacheStats.lastRefreshed.guilds.set(guildId, new Date());
  return 1;
}

// Refresh all caches globally
async function refreshAllCachesManual() {
  await refreshAllCaches();
  cacheStats.lastRefreshed.global = new Date();
  return true;
}

// Clear wishlist cache (from wishlistSystem.js)
function clearWishlistCache(userId = null) {
  const { wishlistCache } = require('../systems/wishlist.system');
  if (userId) {
    wishlistCache.delete(userId);
    return 1;
  } else {
    const count = wishlistCache.size;
    wishlistCache.clear();
    return count;
  }
}

// Clear series cache (from seriesSystem.js)
function clearSeriesCache() {
  // Access the module and reset its cache
  delete require.cache[require.resolve('../systems/seriesSystem')];
  const seriesSystem = require('../systems/series.system');
  // The cache will be rebuilt on next access
  return true;
}

// Clear settings cache for a guild
function clearGuildSettingsCache(guildId = null) {
  if (guildId) {
    settingsManager.clearCache(guildId);
    return 1;
  } else {
    const count = settingsManager.clearAllCache();
    return count;
  }
}

// Clear user settings cache
function clearUserSettingsCache(userId = null) {
  if (userId) {
    userSettingsManager.clearCache(userId);
    return 1;
  } else {
    const count = userSettingsManager.clearAllCache();
    return count;
  }
}

// Clear all caches globally
function clearAllCaches() {
  const stats = {
    wishlist: 0,
    settings: 0,
    userSettings: 0,
    series: false
  };

  try {
    stats.wishlist = clearWishlistCache();
  } catch (e) {
    sendError('Error clearing wishlist cache:', e.message);
  }

  try {
    stats.settings = clearGuildSettingsCache();
  } catch (e) {
    sendError('Error clearing settings cache:', e.message);
  }

  try {
    stats.userSettings = clearUserSettingsCache();
  } catch (e) {
    sendError('Error clearing user settings cache:', e.message);
  }

  try {
    stats.series = clearSeriesCache();
  } catch (e) {
    sendError('Error clearing series cache:', e.message);
  }

  cacheStats.lastCleared.global = new Date();
  return stats;
}

// Clear server-specific caches
function clearServerCache(guildId) {
  const stats = {
    settings: 0,
    userSettings: 0
  };

  try {
    stats.settings = clearGuildSettingsCache(guildId);
  } catch (e) {
    sendError('Error clearing guild settings cache:', e.message);
  }

  // Note: User settings are global, but we can track per-guild users
  // For now, we'll just note that user settings are global
  
  cacheStats.lastCleared.guilds.set(guildId, new Date());
  return stats;
}

// Clear user-specific caches
function clearUserCache(userId) {
  const stats = {
    wishlist: 0,
    userSettings: 0
  };

  try {
    stats.wishlist = clearWishlistCache(userId);
  } catch (e) {
    sendError('Error clearing wishlist cache:', e.message);
  }

  try {
    stats.userSettings = clearUserSettingsCache(userId);
  } catch (e) {
    sendError('Error clearing user settings cache:', e.message);
  }

  cacheStats.lastCleared.users.set(userId, new Date());
  return stats;
}

async function handleCacheCommand(message) {
  const BOT_OWNER_ID = process.env.BOT_OWNER_ID;

  // Check if user is bot owner
  if (message.author.id !== BOT_OWNER_ID) {
    await message.reply('🚫 This command is only available to the bot owner.');
    return;
  }

  const content = message.content.replace(`<@${message.client.user.id}>`, '').trim();
  const args = content.split(/\s+/);
  
  // Remove 'rcache' or 'cache' prefix
  const command = args[0]?.toLowerCase();
  const subCommand = args[1]?.toLowerCase();
  const target = args[2];

  const embed = new EmbedBuilder()
    .setColor(0x00ff00)
    .setTimestamp()
    .setFooter({ text: `Requested by ${message.author.tag}` });

  try {
    // rcache or rcache all - Refresh everything
    if (!subCommand || subCommand === 'all') {
      await refreshAllCachesManual();
      
      embed.setTitle('🔄 Global Cache Refreshed')
        .setDescription('All caches have been refreshed from database!')
        .addFields(
          { name: '⚙️ Settings Cache', value: '✅ Reloaded', inline: true },
          { name: '👤 User Settings Cache', value: '✅ Reloaded', inline: true },
          { name: '⏰ Next Auto-Refresh', value: 'In 5 minutes', inline: true }
        );
      
      await message.reply({ embeds: [embed] });
      return;
    }

    // rcache server - Refresh current server cache
    if (subCommand === 'server' || subCommand === 'guild') {
      const guildId = message.guildId;
      if (!guildId) {
        await message.reply('❌ This command must be used in a server.');
        return;
      }

      await refreshGuildSettingsCache(guildId);
      
      embed.setTitle('🔄 Server Cache Refreshed')
        .setDescription(`Cache refreshed for **${message.guild.name}**`)
        .addFields(
          { name: '🏰 Server ID', value: guildId, inline: true },
          { name: '⚙️ Settings Cache', value: '✅ Reloaded from DB', inline: true }
        );
      
      await message.reply({ embeds: [embed] });
      return;
    }

    // rcache user @user or rcache user userId - Clear user cache
    if (subCommand === 'user') {
      let userId = target;
      
      // Extract user ID from mention
      if (target?.startsWith('<@') && target.endsWith('>')) {
        userId = target.replace(/[<@!>]/g, '');
      }
      
      // Check if mentioned user exists
      const mentionedUser = message.mentions.users.first();
      if (mentionedUser) {
        userId = mentionedUser.id;
      }

      if (!userId) {
        await message.reply('❌ Please specify a user: `rcache user @user` or `rcache user <userId>`');
        return;
      }

      const stats = clearUserCache(userId);
      const user = await message.client.users.fetch(userId).catch(() => null);
      
      embed.setTitle('🔄 User Cache Cleared')
        .setDescription(`Cache cleared for ${user ? user.tag : `User ID: ${userId}`}`)
        .addFields(
          { name: '👤 User ID', value: userId, inline: true },
          { name: '💝 Wishlist Cache', value: `${stats.wishlist} entry cleared`, inline: true },
          { name: '⚙️ User Settings Cache', value: `${stats.userSettings} entry cleared`, inline: true }
        );
      
      await message.reply({ embeds: [embed] });
      return;
    }

    // rcache series - Clear series cache only
    if (subCommand === 'series') {
      const success = clearSeriesCache();
      
      embed.setTitle('🔄 Series Cache Cleared')
        .setDescription(success ? '✅ Series cache cleared successfully!' : '❌ Failed to clear series cache')
        .addFields(
          { name: '📊 Status', value: success ? 'Cache will rebuild on next access' : 'Error occurred', inline: true }
        );
      
      await message.reply({ embeds: [embed] });
      return;
    }

    // rcache stats - Show cache statistics
    if (subCommand === 'stats') {
      embed.setTitle('📊 Cache Statistics')
        .setDescription('Current cache status and refresh times');

      if (cacheStats.lastRefreshed.global) {
        embed.addFields({
          name: '🌍 Global Cache Refresh',
          value: `Last refreshed: <t:${Math.floor(cacheStats.lastRefreshed.global.getTime() / 1000)}:R>`,
          inline: false
        });
      }

      const recentGuilds = Array.from(cacheStats.lastRefreshed.guilds.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);

      if (recentGuilds.length > 0) {
        const guildList = recentGuilds.map(([guildId, time]) => {
          const guild = message.client.guilds.cache.get(guildId);
          return `${guild?.name || guildId}: <t:${Math.floor(time.getTime() / 1000)}:R>`;
        }).join('\n');

        embed.addFields({
          name: '🏰 Recent Server Cache Refreshes',
          value: guildList,
          inline: false
        });
      }

      embed.addFields({
        name: '⏰ Auto-Refresh',
        value: 'Every 5 minutes',
        inline: true
      });

      await message.reply({ embeds: [embed] });
      return;
    }

    // Invalid subcommand - show help
    embed.setTitle('❓ Cache Command Help')
      .setColor(0x0099ff)
      .setDescription('Available cache management commands:')
      .addFields(
        { name: '`rcache` or `rcache all`', value: 'Refresh all caches from database', inline: false },
        { name: '`rcache server`', value: 'Refresh current server cache', inline: false },
        { name: '`rcache user @user`', value: 'Clear specific user cache', inline: false },
        { name: '`rcache series`', value: 'Clear series cache only', inline: false },
        { name: '`rcache stats`', value: 'Show cache statistics', inline: false }
      );

    await message.reply({ embeds: [embed] });

  } catch (error) {
    sendError('Error in cache command:', error);
    await message.reply('❌ An error occurred while managing cache.');
  }
}

module.exports = { 
  clearAllCaches,
  clearServerCache,
  clearUserCache,
  clearSeriesCache,
  refreshGuildSettingsCache,
  refreshAllCachesManual
};
