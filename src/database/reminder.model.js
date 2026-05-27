const mongoose = require('mongoose');

const reminderSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  guildId: { type: String, index: true },
  channelId: { type: String, required: true },
  remindAt: { type: Date, required: true, index: true },
  type: { type: String, required: true, enum: ['expedition', 'stamina', 'raid', 'raidSpawn', 'drop'], index: true },
  reminderMessage: { type: String, required: true },
  cardId: { type: String, sparse: true },
  sent: { type: Boolean, default: false, index: true },
  sentAt: { type: Date },
  createdAt: { type: Date, default: Date.now, index: true }
}, { 
  timestamps: false,
  collection: 'reminders'
});

// PRIMARY INDEX: Fast lookup for due reminders (most critical query)
reminderSchema.index({ remindAt: 1, sent: 1 }, { name: 'idx_due_reminders' });

// COMPOUND INDEX: User + Type queries (for viewing user's reminders)
reminderSchema.index({ userId: 1, type: 1, sent: 1 }, { name: 'idx_user_type' });

// COMPOUND INDEX: Type + RemindAt (for type-specific queries)
reminderSchema.index({ type: 1, remindAt: 1, sent: 1 }, { name: 'idx_type_time' });

// TTL INDEX: Auto-delete sent reminders after 1 minute
reminderSchema.index({ sentAt: 1 }, { 
  expireAfterSeconds: 60, 
  partialFilterExpression: { sent: true },
  name: 'idx_ttl_sent'
});

// UNIQUE INDEX: Prevent duplicate expedition reminders (userId + cardId + type)
reminderSchema.index({ userId: 1, cardId: 1, type: 1 }, { 
  unique: true,
  partialFilterExpression: { type: 'expedition', sent: false },
  name: 'idx_unique_expedition'
});

// UNIQUE INDEX: Prevent duplicate non-expedition reminders (userId + type)
reminderSchema.index({ userId: 1, type: 1 }, { 
  unique: true,
  partialFilterExpression: { 
    type: { $in: ['stamina', 'raid', 'raidSpawn', 'drop'] }, 
    sent: false 
  },
  name: 'idx_unique_type'
});

// CLEANUP INDEX: For manual cleanup queries
reminderSchema.index({ createdAt: 1, sent: 1 }, { name: 'idx_cleanup' });

// Static method for atomic upsert (prevents race conditions)
reminderSchema.statics.upsertReminder = async function(reminderData) {
  const { userId, type, cardId, channelId, guildId, ...updateData } = reminderData;
  
  const filter = cardId 
    ? { userId, type, cardId, sent: false }
    : { userId, type, sent: false };
  
  return await this.findOneAndUpdate(
    filter,
    { 
      $set: updateData,
      $setOnInsert: { userId, type, cardId, channelId, guildId, createdAt: new Date() }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

// Static method for bulk marking as sent (atomic operation)
reminderSchema.statics.markAsSent = async function(reminderIds) {
  return await this.updateMany(
    { _id: { $in: reminderIds }, sent: false },
    { $set: { sent: true, sentAt: new Date() } }
  );
};

// Static method for getting due reminders (atomic claim - prevents double processing)
reminderSchema.statics.getDueReminders = async function(windowMs = 2000, limit = 100) {
  const now = new Date();
  const results = [];
  
  // Atomically claim each reminder by setting sent=true in the same operation
  const candidates = await this.find({
    remindAt: { $lte: new Date(now.getTime() + windowMs) },
    sent: false
  })
  .limit(limit)
  .lean()
  .exec();

  for (const reminder of candidates) {
    // Atomic claim: only succeeds if sent is still false
    const claimed = await this.findOneAndUpdate(
      { _id: reminder._id, sent: false },
      { $set: { sent: true, sentAt: new Date() } },
      { new: false }
    );
    if (claimed) results.push(reminder);
  }

  return results;
};

module.exports = mongoose.model('Reminder', reminderSchema);
