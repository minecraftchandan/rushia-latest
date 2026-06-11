const mongoose = require('mongoose');
const { logError } = require('../utils/logger');

class DatabaseManager {
  static async connect() {
    try {
      await mongoose.connect(process.env.MONGODB_URI, {
        maxPoolSize: 20,
        minPoolSize: 5,
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        connectTimeoutMS: 10000,
        heartbeatFrequencyMS: 10000,
        retryWrites: true,
        retryReads: true,
        w: 'majority',
        readPreference: 'primaryPreferred',
        bufferCommands: false,
        autoIndex: false
      });
    } catch (error) {
      await logError('MongoDB connection failed', error);
      throw error;
    }
  }

  static async createIndexes() {
    try {
      const Reminder = require('./reminder.model');
      const BotSettings = require('./bot-settings.model');
      const UserNotificationSettings = require('./user-notification-settings.model');
      const Drops = require('./drops.model');
      const RarityDrop = require('./rarity-drop.model');
      const ClashCount = require('./clash-count.model');
      const UsernameCache = require('./username-cache.model');

      await Promise.all([
        Reminder.createIndexes(),
        BotSettings.createIndexes(),
        UserNotificationSettings.createIndexes(),
        Drops.createIndexes(),
        RarityDrop.createIndexes(),
        ClashCount.createIndexes(),
        UsernameCache.createIndexes()
      ]);
      
      try {
        const PogGuild = require('./pog-guild.model');
        const Series = require('./series.model');
        await PogGuild.syncIndexes();
        await Series.syncIndexes();
      } catch (pogError) {
        await logError('POG database indexes failed', pogError);
      }
    } catch (error) {
      await logError('Failed to create indexes', error);
    }
  }

  static async cleanup() {
    const Reminder = require('./reminder.model');
    
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await Reminder.deleteMany({ 
        createdAt: { $lt: sevenDaysAgo },
        status: 'pending'
      });
    } catch (error) {
      await logError('Cleanup failed', error);
    }
  }

  static async getStats() {
    try {
      const Reminder = require('./reminder.model');
      const BotSettings = require('./bot-settings.model');
      const UserNotificationSettings = require('./user-notification-settings.model');

      const [reminderCount, guildCount, userCount] = await Promise.all([
        Reminder.countDocuments({ status: 'pending' }),
        BotSettings.countDocuments(),
        UserNotificationSettings.countDocuments()
      ]);

      return {
        activeReminders: reminderCount,
        guilds: guildCount,
        users: userCount,
        poolSize: mongoose.connection.client.s.options.maxPoolSize
      };
    } catch (error) {
      return null;
    }
  }

  static async disconnect() {
    try {
      await mongoose.disconnect();
    } catch (error) {
      await logError('Disconnect failed', error);
    }
  }
}

mongoose.connection.on('error', (err) => {
  logError('MongoDB connection error', err).catch(() => {});
});

process.on('SIGINT', async () => {
  await DatabaseManager.disconnect();
  process.exit(0);
});

module.exports = DatabaseManager;
