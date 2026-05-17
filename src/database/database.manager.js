const mongoose = require('mongoose');

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
      const { sendError } = require('../utils/logger');
      await sendError(`MongoDB connection failed: ${error.message}`);
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
      
      // Initialize POG models separately (they use their own connection)
      try {
        const PogGuild = require('./pog-guild.model');
        const Series = require('./series.model');
        
        // Sync indexes (will update existing indexes if needed)
        await PogGuild.syncIndexes();
        await Series.syncIndexes();
        
        sendLog('✅ POG database indexes created');
      } catch (pogError) {
        sendError('⚠️ POG database indexes failed:', pogError.message);
        // Don't throw - POG features are optional
      }
    } catch (error) {
      const { sendError } = require('../utils/logger');
      await sendError(`Failed to create indexes: ${error.message}`);
    }
  }

  static async cleanup() {
    const Reminder = require('./reminder.model');
    
    try {
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      await Reminder.deleteMany({ 
        createdAt: { $lt: sevenDaysAgo },
        sent: false
      });
    } catch (error) {
      const { sendError } = require('../utils/logger');
      await sendError(`Cleanup failed: ${error.message}`);
    }
  }

  static async getStats() {
    try {
      const Reminder = require('./reminder.model');
      const BotSettings = require('./bot-settings.model');
      const UserNotificationSettings = require('./user-notification-settings.model');

      const [reminderCount, guildCount, userCount] = await Promise.all([
        Reminder.countDocuments({ sent: false }),
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
      const { sendError } = require('../utils/logger');
      await sendError(`Disconnect failed: ${error.message}`);
    }
  }
}

mongoose.connection.on('error', (err) => {
  const { sendError } = require('../utils/logger');
  sendError(`MongoDB connection error: ${err.message}`).catch(() => {});
});

process.on('SIGINT', async () => {
  await DatabaseManager.disconnect();
  process.exit(0);
});

module.exports = DatabaseManager;
