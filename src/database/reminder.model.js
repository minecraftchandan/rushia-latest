const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String },
  channelId: { type: String, required: true },
  remindAt: { type: Date, required: true },
  type: { type: String, required: true, enum: ['expedition', 'stamina', 'raid', 'raidSpawn', 'drop'] },
  reminderMessage: { type: String, required: true },
  cardId: { type: String },
  status: { type: String, enum: ['pending', 'claimed', 'sent'], default: 'pending' },
  sentAt: { type: Date },
  claimedAt: { type: Date },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  // Channel override fields
  overrideChannelId: { type: String },
  overrideExpiresAt: { type: Date },
  originalChannelId: { type: String }
}, {
  timestamps: false,
  collection: 'reminders'
});

// PRIMARY INDEX: Fast lookup for due reminders
reminderSchema.index({ remindAt: 1, status: 1 }, { name: 'idx_due_reminders' });

// COMPOUND INDEX: User + Type queries
reminderSchema.index({ userId: 1, type: 1, status: 1 }, { name: 'idx_user_type' });

// COMPOUND INDEX: Type + RemindAt
reminderSchema.index({ type: 1, remindAt: 1, status: 1 }, { name: 'idx_type_time' });

// TTL INDEX: Auto-delete sent reminders after 60 seconds
reminderSchema.index({ sentAt: 1 }, {
  expireAfterSeconds: 60,
  partialFilterExpression: { status: 'sent' },
  name: 'idx_ttl_sent'
});

// CLEANUP INDEX
reminderSchema.index({ createdAt: 1, status: 1 }, { name: 'idx_cleanup' });

// OVERRIDE EXPIRATION INDEX: Fast lookup for expired overrides
reminderSchema.index({ overrideExpiresAt: 1 }, {
  partialFilterExpression: { overrideExpiresAt: { $exists: true } },
  name: 'idx_override_expiration'
});

// UNIQUE INDEX: Prevent duplicate expedition reminders — pending and claimed
reminderSchema.index({ userId: 1, cardId: 1, type: 1 }, {
  unique: true,
  partialFilterExpression: { type: 'expedition', status: { $in: ['pending', 'claimed'] } },
  name: 'idx_unique_expedition'
});

// UNIQUE INDEX: Prevent duplicate non-expedition reminders — pending and claimed
reminderSchema.index({ userId: 1, type: 1 }, {
  unique: true,
  partialFilterExpression: {
    type: { $in: ['stamina', 'raid', 'raidSpawn', 'drop'] },
    status: { $in: ['pending', 'claimed'] }
  },
  name: 'idx_unique_type'
});

// Atomic upsert — only targets pending reminders
reminderSchema.statics.upsertReminder = async function(reminderData) {
  const { userId, type, cardId, channelId, guildId, ...updateData } = reminderData;

  const filter = cardId
    ? { userId, type, cardId, status: { $in: ['pending', 'claimed'] } }
    : { userId, type, status: { $in: ['pending', 'claimed'] } };

  return await this.findOneAndUpdate(
    filter,
    {
      $set: { ...updateData, channelId, guildId },
      $setOnInsert: { userId, type, cardId, status: 'pending', createdAt: new Date() }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

// Atomic claim — transitions pending → claimed, unique index still blocks new inserts
reminderSchema.statics.getDueReminders = async function(windowMs = 2000, limit = 100) {
  const now = new Date();
  const results = [];

  const candidates = await this.find({
    remindAt: { $lte: new Date(now.getTime() + windowMs) },
    status: 'pending'
  })
  .limit(limit)
  .lean()
  .exec();

  for (const reminder of candidates) {
    const claimed = await this.findOneAndUpdate(
      { _id: reminder._id, status: 'pending' },
      { $set: { status: 'claimed', claimedAt: new Date(), updatedAt: new Date() } },
      { new: false }
    );
    if (claimed) results.push(reminder);
  }

  return results;
};

// Mark as sent — transitions claimed → sent, TTL will clean up
reminderSchema.statics.markAsSent = async function(reminderIds) {
  return await this.updateMany(
    { _id: { $in: reminderIds }, status: 'claimed' },
    { $set: { status: 'sent', sentAt: new Date() } }
  );
};

// Revert claimed → pending on send failure so scheduler retries
reminderSchema.statics.revertClaimed = async function(reminderIds) {
  return await this.updateMany(
    { _id: { $in: reminderIds }, status: 'claimed' },
    { $set: { status: 'pending', sentAt: null, claimedAt: null, updatedAt: new Date() } }
  );
};

// Set channel override for user's raid reminders
reminderSchema.statics.setChannelOverride = async function(userId, overrideChannelId, expiresAt) {
  // Find all raid reminders without originalChannelId set and update them
  const remindersToUpdate = await this.find({
    userId,
    type: { $in: ['raid', 'raidSpawn'] },
    status: { $in: ['pending', 'claimed'] }
  }).exec();

  const updatePromises = remindersToUpdate.map(reminder => {
    const update = {
      overrideChannelId,
      overrideExpiresAt: expiresAt,
      updatedAt: new Date()
    };
    
    // Only set originalChannelId if it doesn't exist
    if (!reminder.originalChannelId) {
      update.originalChannelId = reminder.channelId;
    }
    
    return this.updateOne({ _id: reminder._id }, { $set: update });
  });

  await Promise.all(updatePromises);
  
  return { modifiedCount: remindersToUpdate.length };
};

// Clear expired overrides and restore original channels
reminderSchema.statics.clearExpiredOverrides = async function() {
  const now = new Date();
  const expiredReminders = await this.find({
    overrideExpiresAt: { $lte: now },
    status: { $in: ['pending', 'claimed'] }
  }).lean().exec();

  if (expiredReminders.length === 0) return [];

  await this.updateMany(
    { _id: { $in: expiredReminders.map(r => r._id) } },
    {
      $unset: { overrideChannelId: '', overrideExpiresAt: '', originalChannelId: '' },
      $set: { updatedAt: new Date() }
    }
  );

  // Return unique userIds for notification
  return [...new Set(expiredReminders.map(r => r.userId))];
};

// Get effective channel for reminder (considers override)
reminderSchema.methods.getEffectiveChannel = function() {
  if (this.overrideChannelId && this.overrideExpiresAt && this.overrideExpiresAt > new Date()) {
    return this.overrideChannelId;
  }
  return this.channelId;
};

// Check if reminder has active override
reminderSchema.methods.hasActiveOverride = function() {
  return !!(this.overrideChannelId && this.overrideExpiresAt && this.overrideExpiresAt > new Date());
};

module.exports = mongoose.model('Reminder', reminderSchema, 'reminders');
