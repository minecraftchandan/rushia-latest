const mongoose = require('mongoose');

const giveawaySchema = new mongoose.Schema({
  guildId: { type: String, required: true, index: true },
  userId: { type: String, required: true, index: true },
  username: { type: String, required: true },
  taskType: { type: String, required: true, enum: ['drop', 'clash', 'daily_quests'], index: true },
  currentCount: { type: Number, default: 0 },
  targetCount: { type: Number, required: true },
  roleId: { type: String, required: true },
  completed: { type: Boolean, default: false, index: true },
  completedAt: { type: Date },
  lastTrackedAt: { type: Date }
}, { timestamps: true });

// Compound indexes for efficient queries
giveawaySchema.index({ guildId: 1, userId: 1, taskType: 1 }, { unique: true });
giveawaySchema.index({ guildId: 1, completed: 1 });
giveawaySchema.index({ guildId: 1, taskType: 1, completed: 1 });

module.exports = mongoose.model('Giveaway', giveawaySchema, 'giveaway');
