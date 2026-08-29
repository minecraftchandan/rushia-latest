module.exports = {
  LUVI_BOT_ID: '1269481871021047891',
  SOFI_BOT_ID: '853629533855809596',
  BOT_OWNER_ID: process.env.BOT_OWNER_ID,
  
  STAMINA: {
    MAX: 50,
    REGEN_RATE: 2, // minutes per stamina point
    PERCENTAGES: [25, 50, 100]
  },
  
  CACHE: {
    MESSAGE_TTL: 300, // 5 minutes
    USER_TTL: 3600,   // 1 hour
    GUILD_TTL: 1800   // 30 minutes
  },
  
  SCHEDULER: {
    CHECK_INTERVAL: 1000, // 1 second
    BATCH_SIZE: 50
  },
  
  COLORS: {
    SUCCESS: 0x00ff00,
    ERROR: 0xff0000,
    INFO: 0x0099ff,
    WARNING: 0xffaa00
  },
  
  TIERS: ['t1', 't2', 't3', 't4'],

  RAID_PING_COOLDOWN_SECONDS: 5 * 60,

  RAID_ELEMENT_EMOJIS: [
    { key: 'light', emojiName: 'LU_LightElement', aliases: ['light'] },
    { key: 'dark', emojiName: 'LU_DarkElement', aliases: ['dark'] },
    { key: 'ground', emojiName: 'LU_GroundElement', aliases: ['ground'] },
    { key: 'fire', emojiName: 'LU_FireElement', aliases: ['fire'] },
    { key: 'water', emojiName: 'LU_WaterElement', aliases: ['water'] },
    { key: 'air', emojiName: 'LU_AirElement', aliases: ['air'] },
    { key: 'neutral', emojiName: 'LU_NeutralElement', aliases: ['neutral', 'normal'] },
    { key: 'grass', emojiName: 'LU_GrassElement', aliases: ['grass'] },
    { key: 'ice', emojiName: 'LU_IceElement', aliases: ['ice'] },
    { key: 'electric', emojiName: 'LU_ElectricElement', aliases: ['electric'] }
  ],
  
  REMINDER_TYPES: ['expedition', 'stamina', 'raid', 'raidSpawn', 'drop'],
  
  PERMISSIONS: {
    ADMIN_COMMANDS: ['ManageRoles'],
    USER_COMMANDS: []
  }
};