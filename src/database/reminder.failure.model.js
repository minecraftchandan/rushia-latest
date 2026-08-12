const mongoose = require('mongoose');

const reminderFailureSchema = new mongoose.Schema({
  reminderId: { type: mongoose.Schema.Types.ObjectId, required: false },
  userId: { type: String },
  guildId: { type: String },
  channelId: { type: String },
  type: { type: String },
  reason: { type: String },
  timestamp: { type: Date, default: Date.now }
}, {
  collection: 'reminder_failures'
});

reminderFailureSchema.index({ timestamp: -1 });
reminderFailureSchema.index({ type: 1 });

module.exports = mongoose.model('ReminderFailure', reminderFailureSchema, 'reminder_failures');
