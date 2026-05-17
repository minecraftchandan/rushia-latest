const mongoose = require('mongoose');

const usernameCacheSchema = new mongoose.Schema({
  username: { type: String, required: true },
  userId: { type: String, required: true },
  updatedAt: { type: Date, default: Date.now }
}, { timestamps: false });

usernameCacheSchema.index({ username: 1 }, { unique: true });

module.exports = mongoose.model('UsernameCache', usernameCacheSchema, 'username_cache');
