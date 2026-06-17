const mongoose = require('mongoose');

const channelOverrideSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
  guildId: { type: String, required: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now }
}, {
  timestamps: false,
  collection: 'channel_overrides'
});

// Index for finding user's override
channelOverrideSchema.index({ userId: 1 }, { name: 'idx_user' });

// Index for cleanup of expired overrides
channelOverrideSchema.index({ expiresAt: 1 }, { name: 'idx_expiration' });

// Get active override for a user
channelOverrideSchema.statics.getActiveOverride = async function(userId) {
  const override = await this.findOne({
    userId,
    expiresAt: { $gt: new Date() }
  }).lean();
  
  return override;
};

// Set or update override for a user
channelOverrideSchema.statics.setOverride = async function(userId, channelId, guildId, expiresAt) {
  return await this.findOneAndUpdate(
    { userId },
    {
      $set: {
        channelId,
        guildId,
        expiresAt,
        createdAt: new Date()
      }
    },
    { upsert: true, new: true }
  );
};

// Remove override for a user
channelOverrideSchema.statics.removeOverride = async function(userId) {
  return await this.deleteOne({ userId });
};

// Get all expired overrides
channelOverrideSchema.statics.getExpiredOverrides = async function() {
  return await this.find({
    expiresAt: { $lte: new Date() }
  }).lean();
};

// Clean up expired overrides
channelOverrideSchema.statics.cleanupExpired = async function() {
  const expired = await this.getExpiredOverrides();
  if (expired.length > 0) {
    await this.deleteMany({
      _id: { $in: expired.map(o => o._id) }
    });
  }
  return expired.map(o => o.userId);
};

module.exports = mongoose.model('ChannelOverride', channelOverrideSchema);
