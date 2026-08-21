const mongoose = require('mongoose');
const { RAID_PING_COOLDOWN_SECONDS } = require('../config/constants');

const raidSchema = new mongoose.Schema({
  raidId: { type: String, required: true, unique: true, index: true },
  elements: { type: [String], required: true, default: [] },
  createdAt: { type: Date, default: Date.now },
}, { collection: 'raids', toJSON: { virtuals: true } });

raidSchema.index({ createdAt: 1 }, { expireAfterSeconds: RAID_PING_COOLDOWN_SECONDS });

const Raid = mongoose.model('Raid', raidSchema);

const guildRolesSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true, index: true },
  roles: {
    light: { type: String },
    dark: { type: String },
    ground: { type: String },
    fire: { type: String },
    water: { type: String },
    air: { type: String },
    neutral: { type: String },
    normal: { type: String },
    grass: { type: String },
    ice: { type: String },
    electric: { type: String }
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
}, { collection: 'guild_raid_roles' });

guildRolesSchema.statics.findForGuild = async function(guildId) {
  const current = await this.findOne({ guildId }).lean();
  if (current) return current;

  // The original model used Mongoose's default `guildroles` collection.
  return this.db.collection('guildroles').findOne({ guildId });
};

const GuildRoles = mongoose.model('GuildRoles', guildRolesSchema);

module.exports = { Raid, GuildRoles };