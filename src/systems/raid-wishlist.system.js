const Reminder = require('../database/reminder.model');
const mongoose = require('mongoose');
const { getUserSettings } = require('../utils/user-settings.manager');
const { sendLog, sendError } = require('../utils/logger');
const { checkExistingReminder, createReminderSafe } = require('../utils/reminder-duplicate.checker');

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
    }), 'wishlists');
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

  const elementMatches = [...description.matchAll(/:LU_(\w+Element):/g)]
    .map(m => ELEMENT_MAP[m[1]])
    .filter(Boolean);

  const nameMatch = description.match(/\*\*([^\[]+?)\s*\[/i);
  const rawName = nameMatch ? nameMatch[1].trim() : null;
  const raidNames = rawName ? rawName.split(/\s*&\s*/).map(n => n.trim()).filter(Boolean) : [];

  const raids = raidNames.map((name, i) => ({ name, element: elementMatches[i] || elementMatches[0] || null }));

  return { raidName: raidNames[0] || null, raidNames, raids, tier, element: elementMatches[0] || null };
}

async function checkWishlistAndPing(message, raidNames, elements) {
  try {
    const cacheKey = `${message.channel.id}-${raidNames.join('&')}`;
    if (wishlistPingCache.has(cacheKey)) return;
    wishlistPingCache.set(cacheKey, true);
    setTimeout(() => wishlistPingCache.delete(cacheKey), 10000);

    const Wishlist = await getWishlistConnection();
    const usersWithWishlist = await Wishlist.find({
      'wl.n': { $in: raidNames }
    }, { _id: 1, wl: 1 }).lean();

    if (!usersWithWishlist.length) return;

    const spawnerUserId = message.interactionMetadata?.user?.id || message.interaction?.user?.id;
    const spawnerMention = spawnerUserId ? `<@${spawnerUserId}>` : 'someone';
    const elementEmoji = elements.map(e => ELEMENT_EMOJIS[e] || e).join('');
    const displayName = raidNames.join(' & ');

    const mentions = usersWithWishlist.map(w => `<@${w._id}>`).join(' ');
    message.channel.send(`${mentions} Your wishlisted raid **${displayName}** ${elementEmoji} has spawned!`).catch(() => {});

    for (const user of usersWithWishlist) {
      try {
        const discordUser = await message.client.users.fetch(user._id);
        await discordUser.send(`Your wishlist raid **${displayName}** ${elementEmoji} has spawned by ${spawnerMention}!`);
      } catch {}
    }
  } catch (error) {
    sendError('Wishlist error:', error.message);
  }
}

async function detectAndSetRaidSpawnReminder(message) {
  if (!message.guild || message.author.id !== LUVI_ID) return;
  
  if (Date.now() - message.createdTimestamp > 60000) return;
  if (!message.embeds.length) return;

  const embed = message.embeds[0];
  if (!embed.title?.includes('Raid Spawned')) return;

  const { raidName, raidNames, raids, tier, element } = parseRaidInfo(embed.description || '');

  if (raids.length) {
    const raidNames = raids.filter(r => r.name).map(r => r.name);
    const elements = raids.filter(r => r.element).map(r => r.element);
    if (raidNames.length) await checkWishlistAndPing(message, raidNames, elements);
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