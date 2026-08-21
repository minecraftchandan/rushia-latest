const mongoose = require('mongoose');

const raidSchema = new mongoose.Schema({
  raidId: { type: String, required: true, unique: true, index: true },
  elements: { type: [String], required: true, default: [] },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'raids', toJSON: { virtuals: true } });

raidSchema.index({ createdAt: 1 }, { expireAfterSeconds: 3600 });

const Raid = mongoose.model('Raid', raidSchema);

const guildRolesSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  roles: {
    light: { type: String },
    dark: { type: String },
    earth: { type: String },
    fire: { type: String },
    water: { type: String },
    air: { type: String },
    normal: { type: String },
    grass: { type: String },
    ice: { type: String },
    electric: { type: String }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'guild_raid_roles' });

const GuildRoles = mongoose.model('GuildRoles', guildRolesSchema);

module.exports = { Raid, GuildRoles };