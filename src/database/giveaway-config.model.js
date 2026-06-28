const mongoose = require('mongoose');

const taskConfigSchema = new mongoose.Schema({
  taskType: { 
    type: String, 
    required: true, 
    enum: ['drop', 'clash', 'daily_quests'] 
  },
  targetCount: { 
    type: Number, 
    required: true, 
    min: 1, 
    max: 100 
  },
  roleId: { 
    type: String, 
    required: true 
  },
  roleName: { 
    type: String, 
    required: true 
  },
  enabled: { 
    type: Boolean, 
    default: true 
  },
  createdBy: { 
    type: String, 
    required: true 
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  }
}, { _id: false });

const giveawayConfigSchema = new mongoose.Schema({
  guildId: { 
    type: String, 
    required: true, 
    unique: true,
    index: true 
  },
  guildName: { 
    type: String, 
    required: true 
  },
  tasks: {
    drop: { type: taskConfigSchema, default: null },
    clash: { type: taskConfigSchema, default: null },
    daily_quests: { type: taskConfigSchema, default: null }
  },
  totalParticipants: { 
    type: Number, 
    default: 0 
  },
  totalCompletions: { 
    type: Number, 
    default: 0 
  },
  lastUpdated: { 
    type: Date, 
    default: Date.now 
  }
}, { timestamps: true });

// Index for efficient queries
giveawayConfigSchema.index({ guildId: 1 });

module.exports = mongoose.model('GiveawayConfig', giveawayConfigSchema, 'giveaway_config');
