const Reminder = require('../database/Reminder');
const mongoose = require('mongoose');
const { getUserSettings } = require('../utils/userSettingsManager');
const { sendLog, sendError } = require('../utils/logger');
const { checkExistingReminder, createReminderSafe } = require('../utils/reminderDuplicateChecker');

const LUVI_ID = '1269481871021047891';
const timeoutMap = new Map();
const wishlistPingCache = new Map();

let wishlistConn = null;
let WishlistModel = null;

const ELEMENT_EMOJIS = {
  normal: '<:LU_NeutralElement:1478643394585821217>',
  water: '<:LU_WaterElement:1478643391901470863>',
  ice: '<:LU_IceElement:1478643390211035237>',
  ground: '<:LU_GroundElement:1478643388155826299>',
  grass: '<:LU_GrassElement:1478643385681055805>',
  fire: '<:LU_FireElement:1478643383605006376>',
  electric: '<:LU_ElectricElement:1478643380689829929>',
  air: '<:LU_AirElement:1478643377523130420>',
  light: '<:LU_LightElement:1478643374805352449>',
  dark: '<:LU_DarkElement:1478643372485902426>'
};

async function getWishlistConnection() {
  if (!wishlistConn || wishlistConn.readyState !== 1) {
    wishlistConn = await mongoose.createConnection(process.env.WISHLIST_URI).asPromise();
    WishlistModel = wishlistConn.model('Wishlist', new mongoose.Schema({
      _id: String,
      wl: [{ n: String, e: String }]
    }, { _id: false }), 'wishlists');
  }
  return WishlistModel;
}

const ELEMENT_MAP = {
  'AirElement': 'air',
  'FireElement': 'fire',
  'WaterElement': 'water',
  'EarthElement': 'earth',
  'LightElement': 'light',
  'DarkElement': 'dark',
  'ElectricElement': 'electric',
  'IceElement': 'ice',
  'GrassElement': 'grass',
  'NormalElement': 'normal',
  'GroundElement': 'ground'
};

function parseRaidInfo(description) {
  const tierMatch = description.match(/Tier(\d)|T(\d)/i);
  const tier = tierMatch ? parseInt(tierMatch[1] || tierMatch[2]) : null;

  let element = null;
  for (const [key, value] of Object.entries(ELEMENT_MAP)) {
    if (description.includes(key)) {
      element = value;
      break;
    }
  }

  const nameMatch = description.match(/\*\*([^\[]+?)\s*\[/i);
  const raidName = nameMatch ? nameMatch[1].trim() : null;

  return { raidName, tier, element };
}

async function checkWishlistAndPing(message, raidName, element) {
  try {
    const cacheKey = `${message.channel.id}-${raidName}-${element}`;
    if (wishlistPingCache.has(cacheKey)) return;
    
    wishlistPingCache.set(cacheKey, true);
    setTimeout(() => wishlistPingCache.delete(cacheKey), 10000);

    const Wishlist = await getWishlistConnection();
    const usersWithWishlist = await Wishlist.find({
      'wl': { $elemMatch: { n: raidName, e: element } }
    }, { _id: 1 }).lean();

    if (usersWithWishlist.length > 0) {
      const mentions = usersWithWishlist.map(w => `<@${w._id}>`).join(' ');
      const emoji = ELEMENT_EMOJIS[element] || element;
      
      // Send channel mention (existing functionality)
      message.channel.send(`${mentions} Your wishlisted raid **${raidName}** ${emoji} has spawned!`).catch(() => {});
      
      // Send individual DMs to each user
      const spawnerUserId = message.interactionMetadata?.user?.id || message.interaction?.user?.id;
      const spawnerMention = spawnerUserId ? `<@${spawnerUserId}>` : 'someone';
      
      for (const user of usersWithWishlist) {
        try {
          const discordUser = await message.client.users.fetch(user._id);
          await discordUser.send(`Your wishlist raid **${raidName}** ${emoji} has spawned by ${spawnerMention}!`);
        } catch (dmError) {
          // Silently fail if DM can't be sent (user has DMs disabled, etc.)
        }
      }
    }
  } catch (error) {
    console.error('Wishlist error:', error.message);
  }
}

async function detectAndSetRaidSpawnReminder(message) {
  if (!message.guild || message.author.id !== LUVI_ID) return;
  
  if (Date.now() - message.createdTimestamp > 60000) return;
  if (!message.embeds.length) return;

  const embed = message.embeds[0];
  if (embed.title !== 'Raid Spawned!') return;

  const { raidName, tier, element } = parseRaidInfo(embed.description || '');

  if (raidName && element) {
    await checkWishlistAndPing(message, raidName, element);
  }

  const userId = message.interactionMetadata?.user?.id || message.interaction?.user?.id;
  if (!userId) return;

  const thirtyMinutes = 30 * 60 * 1000;
  const remindAt = new Date(Date.now() + thirtyMinutes);

  const existingReminder = await checkExistingReminder(userId, 'raidSpawn');
  if (existingReminder) return;

  const result = await createReminderSafe({
    userId,
    guildId: message.guild.id,
    channelId: message.channel.id,
    remindAt,
    type: 'raidSpawn',
    reminderMessage: `<@${userId}>, You can now use </raid spawn:1472170030723764364> to spawn a new raid boss!`
  });

  if (result.success) {
    await sendLog('REMINDER_CREATED', { 
      category: 'REMINDER',
      action: 'CREATED',
      type: 'raidSpawn',
      userId, 
      guildId: message.guild.id,
      channelId: message.channel.id,
      remindAt: remindAt.toISOString()
    });
  } else if (result.reason !== 'duplicate') {
    await sendError('REMINDER_CREATE_FAILED', { 
      category: 'REMINDER',
      action: 'CREATE_FAILED',
      type: 'raidSpawn',
      userId,
      error: result.error.message
    });
  }
}

module.exports = { processRaidSpawnMessage: detectAndSetRaidSpawnReminder, processRaidWishlist: detectAndSetRaidSpawnReminder };