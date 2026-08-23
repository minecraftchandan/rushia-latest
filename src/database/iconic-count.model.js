const mongoose = require('mongoose');

const iconicCountSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  iconic_count: { type: Number, default: 0 },
  lastIconicAt: { type: Date, default: Date.now }
}, { timestamps: false });

iconicCountSchema.index({ userId: 1, guildId: 1 }, { unique: true });
iconicCountSchema.index({ guildId: 1, iconic_count: -1 });

module.exports = mongoose.model('IconicCount', iconicCountSchema, 'iconic_counts');
