const mongoose = require('mongoose');

const clashCountSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  clash_count: { type: Number, default: 0 },
  lastClashAt: { type: Date, default: Date.now }
}, { timestamps: false });

clashCountSchema.index({ userId: 1, guildId: 1 }, { unique: true });
clashCountSchema.index({ guildId: 1, clash_count: -1 });

module.exports = mongoose.model('ClashCount', clashCountSchema, 'clash_counts');
