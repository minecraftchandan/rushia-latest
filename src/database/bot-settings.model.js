const mongoose = require('mongoose');

const botSettingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  bossRoleId: { type: String },
  cardRoleId: { type: String },
  tier1RoleId: { type: String },
  tier2RoleId: { type: String },
  tier3RoleId: { type: String },
  tier4RoleId: { type: String },
  multiRoleEnabled: { type: Boolean, default: false, index: true },
  delays: { type: Map, of: Number, default: new Map() },
  luviEnabled: { type: Boolean, default: false, index: true },
  address: { type: String, default: null, index: true }
}, { timestamps: false });

module.exports = mongoose.model('BotSettings', botSettingsSchema, 'guilds');
