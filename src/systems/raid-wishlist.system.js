const mongoose = require('mongoose');
const { getUserSettings } = require('../utils/user-settings.manager');
const { logInfo, logError } = require('../utils/logger');

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

    // Build a name->element map for per-user display
    const nameElementMap = {};
    raidNames.forEach((name, i) => { nameElementMap[name] = elements[i] || elements[0]; });

    for (const user of usersWithWishlist) {
      // Only match names where element also matches the user's wishlist entry
      const matchedNames = raidNames.filter(n => {
        const spawnedElement = nameElementMap[n];
        return user.wl.some(w => w.n === n && (!spawnedElement || w.e === spawnedElement));
      });
      if (!matchedNames.length) continue;

      const displayName = matchedNames.join(' & ');
      const elementEmoji = matchedNames.map(n => ELEMENT_EMOJIS[nameElementMap[n]] || '').join('');
      const mention = `<@${user._id}>`;

      const userSettings = await getUserSettings(user._id);
      const sendDM = userSettings?.raidSpawnDM === true;

      if (sendDM) {
        try {
          const discordUser = await message.client.users.fetch(user._id);
          await discordUser.send(`Your wishlist raid **${displayName}** ${elementEmoji} has spawned by ${spawnerMention}!`);
        } catch {}
      } else {
        message.channel.send(`${mention} Your wishlisted raid **${displayName}** ${elementEmoji} has spawned!`).catch(() => {});
      }
    }
  } catch (error) {
    sendError('Wishlist error:', error.message);
  }
}

async function processRaidWishlist(message) {
  if (!message.guild || message.author.id !== LUVI_ID) return;
  if (Date.now() - message.createdTimestamp > 60000) return;
  if (!message.embeds.length) return;

  const embed = message.embeds[0];
  if (!embed.title?.includes('Raid Spawned')) return;

  const { raids } = parseRaidInfo(embed.description || '');

  if (!raids.length) return;
  const raidNames = raids.filter(r => r.name).map(r => r.name);
  const elements = raids.filter(r => r.element).map(r => r.element);
  if (raidNames.length) await checkWishlistAndPing(message, raidNames, elements);
}

module.exports = { processRaidWishlist };