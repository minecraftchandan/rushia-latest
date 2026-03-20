const mongoose = require('mongoose');
const { EmbedBuilder } = require('discord.js');
const path = require('path');
const fs = require('fs');
const { searchCards } = require('./improvedSearch');

let cardsCache = null;
let wishlistConn = null;
let Wishlist = null;
const wishlistCache = new Map();
const CACHE_TTL = 5 * 60 * 1000;

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

function getCards() {
  if (!cardsCache) {
    const cardsPath = path.join(__dirname, '..', 'cards.json');
    cardsCache = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
  }
  return cardsCache;
}

const pendingConfirmations = new Map();

function findSimilarCards(name, allCards) {
  return searchCards(name, allCards, 100); // Return up to 100 matches for pagination
}

async function initWishlistConnection() {
  if (wishlistConn && wishlistConn.readyState === 1) return { conn: wishlistConn, Wishlist };
  
  wishlistConn = await mongoose.createConnection(process.env.WISHLIST_URI).asPromise();
  Wishlist = wishlistConn.model('Wishlist', new mongoose.Schema({
    _id: String,
    wl: [{ n: String, e: String }],
    cardCount: { type: Number, default: 0 },
    updatedAt: { type: Date, default: Date.now }
  }, { collection: 'wishlists' }), 'wishlists');
  return { conn: wishlistConn, Wishlist };
}

function getCachedWishlist(userId) {
  const cached = wishlistCache.get(userId);
  if (cached && Date.now() - cached.time < CACHE_TTL) {
    return cached.data;
  }
  return null;
}

function setCachedWishlist(userId, data) {
  wishlistCache.set(userId, { data, time: Date.now() });
}

function invalidateCache(userId) {
  wishlistCache.delete(userId);
}

async function handleWishlistAdd(message, cardNames) {
  try {
    const allCards = getCards();
    const { Wishlist: WishlistModel } = await initWishlistConnection();
    
    let userWishlist = await WishlistModel.findById(message.author.id);
    if (!userWishlist) {
      userWishlist = new WishlistModel({ _id: message.author.id, wl: [], cardCount: 0 });
    }
    
    if (userWishlist.wl.length >= 10) {
      await message.reply('❌ Wishlist full - max 10 cards allowed.');
      return;
    }
    
    // Split by comma and process each name
    const namesToAdd = cardNames.split(',').map(n => n.trim()).filter(n => n);
    
    if (namesToAdd.length === 0) {
      await message.reply('❌ Please provide card name(s) to add.');
      return;
    }
    
    // Check if adding all cards would exceed limit
    if (userWishlist.wl.length + namesToAdd.length > 10) {
      await message.reply(`❌ Cannot add ${namesToAdd.length} cards - would exceed 10 card limit. You have ${userWishlist.wl.length}/10 cards.`);
      return;
    }
    
    const results = [];
    const multipleMatches = [];
    
    for (const name of namesToAdd) {
      const matches = findSimilarCards(name, allCards);
      
      if (matches.length === 0) {
        results.push({ name, status: 'not_found' });
      } else if (matches.length === 1) {
        const card = matches[0];
        const exists = userWishlist.wl.some(c => c.n === card.name && c.e === card.element.toLowerCase());
        if (exists) {
          results.push({ name, status: 'exists', card });
        } else {
          userWishlist.wl.push({ n: card.name, e: card.element.toLowerCase() });
          results.push({ name, status: 'added', card });
        }
      } else {
        multipleMatches.push({ name, matches: matches.slice(0, 10) });
      }
    }
    
    // Save if any cards were added
    if (results.some(r => r.status === 'added')) {
      userWishlist.cardCount = userWishlist.wl.length;
      userWishlist.updatedAt = new Date();
      await userWishlist.save();
      invalidateCache(message.author.id);
    }
    
    // Build response message
    let response = '';
    
    const added = results.filter(r => r.status === 'added');
    const notFound = results.filter(r => r.status === 'not_found');
    const exists = results.filter(r => r.status === 'exists');
    
    if (added.length > 0) {
      response += '✅ **Added to wishlist:**\n';
      added.forEach(r => {
        const emoji = ELEMENT_EMOJIS[r.card.element.toLowerCase()] || r.card.element;
        response += `• ${r.card.name} ${emoji} [${r.card.series}]\n`;
      });
      response += '\n';
    }
    
    if (exists.length > 0) {
      response += '⚠️ **Already in wishlist:**\n';
      exists.forEach(r => {
        const emoji = ELEMENT_EMOJIS[r.card.element.toLowerCase()] || r.card.element;
        response += `• ${r.card.name} ${emoji}\n`;
      });
      response += '\n';
    }
    
    if (notFound.length > 0) {
      response += '❌ **No card found:**\n';
      notFound.forEach(r => response += `• ${r.name}\n`);
      response += '\n';
    }
    
    if (multipleMatches.length > 0) {
      if (multipleMatches.length === 1 && namesToAdd.length === 1) {
        // Single query with multiple matches - show selection interface
        const matches = findSimilarCards(multipleMatches[0].name, allCards);
        const displayLimit = 10;
        const totalMatches = matches.length;
        const displayMatches = matches.slice(0, displayLimit);
        const hasMore = totalMatches > displayLimit;
        
        const embed = new EmbedBuilder()
          .setColor(0xffaa00)
          .setTitle('Multiple cards found')
          .setDescription(`Found ${totalMatches} card${totalMatches > 1 ? 's' : ''} (showing 1-${Math.min(displayLimit, totalMatches)}). Reply with the number to select:\n\n` +
            displayMatches.map((c, i) => {
              const emoji = ELEMENT_EMOJIS[c.element.toLowerCase()] || c.element;
              return `**${i + 1}.** \`${c.name}\` ${emoji} - ${c.series} (${c.role})`;
            }).join('\n'))
          .setFooter({ text: `Page 1/${Math.ceil(totalMatches / displayLimit)} • Reply with 1-${displayMatches.length} or "cancel"` });
        
        const components = [];
        if (hasMore) {
          const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
          const row = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`wishlist_next_${message.author.id}`)
                .setLabel('Next →')
                .setStyle(ButtonStyle.Primary)
                .setDisabled(false)
            );
          components.push(row);
        }
        
        await message.reply({ embeds: [embed], components });
        
        pendingConfirmations.set(message.author.id, {
          matches: matches,
          displayMatches: displayMatches,
          wishlist: userWishlist,
          page: 0,
          totalPages: Math.ceil(totalMatches / displayLimit),
          displayLimit: displayLimit,
          timestamp: Date.now()
        });
        
        setTimeout(() => pendingConfirmations.delete(message.author.id), 120000);
        return;
      } else {
        // Multiple queries with multiple matches - just report them
        response += '🔍 **Multiple matches found (be more specific):**\n';
        multipleMatches.forEach(m => {
          response += `• "${m.name}" - ${m.matches.length} matches\n`;
        });
      }
    }
    
    if (response) {
      await message.reply(response.trim());
    }
    
  } catch (error) {
    console.error('Wishlist add error:', error);
    await message.reply('❌ Error adding to wishlist.');
  }
}

async function handleWishlistView(message, targetUser = null) {
  let loadingMsg = null;
  try {
    const userId = targetUser?.id || message.author.id;
    const isOwner = message.author.id === process.env.BOT_OWNER_ID;
    
    if (targetUser && !isOwner) {
      await message.reply('❌ Only the bot owner can view other users\' wishlists.');
      return;
    }
    
    let wishlist = getCachedWishlist(userId);
    
    if (!wishlist) {
      loadingMsg = await message.reply('<a:loading:1471139633894133812>');
    }
    
    if (!wishlist) {
      const { Wishlist: WishlistModel } = await initWishlistConnection();
      wishlist = await WishlistModel.findById(userId).lean();
      if (wishlist) setCachedWishlist(userId, wishlist);
    }
    
    if (!wishlist || !wishlist.wl || wishlist.wl.length === 0) {
      const emptyMsg = `${targetUser ? `<@${userId}>` : 'You'} have no cards in wishlist.`;
      if (loadingMsg) {
        await loadingMsg.edit(emptyMsg);
      } else {
        await message.reply(emptyMsg);
      }
      return;
    }
    
    const totalCards = wishlist.cardCount || wishlist.wl.length;
    const maxLength = Math.max(...wishlist.wl.map(c => c.n.length));
    
    const cardLines = wishlist.wl.map(card => {
      const emoji = ELEMENT_EMOJIS[card.e] || card.e;
      const paddedName = card.n.padEnd(maxLength, ' ');
      return `${emoji} \`${paddedName}\``;
    });
    
    const embed = new EmbedBuilder()
      .setColor(0x0099ff)
      .setTitle(`${targetUser ? `${targetUser.username}'s` : `${message.author.username}'s`} Wishlist`)
      .setDescription(cardLines.join('\n'))
      .setFooter({ text: `${totalCards}/10 cards` });
    
    if (loadingMsg) {
      await loadingMsg.edit({ content: '', embeds: [embed] });
    } else {
      await message.reply({ embeds: [embed] });
    }
    
  } catch (error) {
    console.error('Wishlist view error:', error);
    const errorMsg = `❌ Error viewing wishlist: ${error.message}`;
    if (loadingMsg) {
      await loadingMsg.edit(errorMsg).catch(() => {});
    } else {
      await message.reply(errorMsg);
    }
  }
}

async function handleWishlistSelection(message, selection) {
  const pending = pendingConfirmations.get(message.author.id);
  if (!pending) return false;
  
  if (selection.toLowerCase() === 'cancel') {
    pendingConfirmations.delete(message.author.id);
    await message.reply('❌ Cancelled.');
    return true;
  }
  
  const num = parseInt(selection);
  if (isNaN(num) || num < 1 || num > (pending.displayMatches || pending.matches).length) {
    return false;
  }
  
  try {
    if (pending.action === 'remove') {
      // Handle remove action
      const cardToRemove = (pending.displayMatches || pending.matches)[num - 1];
      pending.wishlist.wl = pending.wishlist.wl.filter(c => c.n !== cardToRemove.n);
      pending.wishlist.cardCount = pending.wishlist.wl.length;
      pending.wishlist.updatedAt = new Date();
      await pending.wishlist.save();
      invalidateCache(message.author.id);
      
      const emoji = ELEMENT_EMOJIS[cardToRemove.e] || cardToRemove.e;
      await message.reply(`✅ Removed **${cardToRemove.n}** ${emoji} from your wishlist!`);
    } else {
      // Handle add action
      const card = (pending.displayMatches || pending.matches)[num - 1];
      const exists = pending.wishlist.wl.some(c => c.n === card.name && c.e === card.element.toLowerCase());
      
      if (exists) {
        await message.reply(`❌ **${card.name}** ${ELEMENT_EMOJIS[card.element.toLowerCase()] || card.element} is already in your wishlist.`);
      } else {
        pending.wishlist.wl.push({ n: card.name, e: card.element.toLowerCase() });
        pending.wishlist.cardCount = pending.wishlist.wl.length;
        pending.wishlist.updatedAt = new Date();
        await pending.wishlist.save();
        invalidateCache(message.author.id);
        
        await message.reply(`✅ Added **${card.name}** ${ELEMENT_EMOJIS[card.element.toLowerCase()] || card.element} [${card.series}] to your wishlist!`);
      }
    }
    
    pendingConfirmations.delete(message.author.id);
    return true;
  } catch (error) {
    console.error('Selection error:', error);
    await message.reply('❌ Error processing selection.');
    pendingConfirmations.delete(message.author.id);
    return true;
  }
}

async function handleWishlistPagination(interaction) {
  const userId = interaction.customId.split('_')[2];
  if (interaction.user.id !== userId) {
    await interaction.reply({ content: '❌ This is not your selection menu.', ephemeral: true });
    return;
  }
  
  const pending = pendingConfirmations.get(interaction.user.id);
  if (!pending || !pending.matches) {
    await interaction.reply({ content: '❌ Selection expired.', ephemeral: true });
    return;
  }
  
  const displayLimit = pending.displayLimit || 10;
  const isNext = interaction.customId.includes('_next_');
  const isPrev = interaction.customId.includes('_prev_');
  
  if (isNext) {
    pending.page++;
  } else if (isPrev) {
    pending.page--;
  }
  
  // Ensure page is within bounds
  pending.page = Math.max(0, Math.min(pending.page, pending.totalPages - 1));
  
  const startIndex = pending.page * displayLimit;
  const endIndex = Math.min(startIndex + displayLimit, pending.matches.length);
  pending.displayMatches = pending.matches.slice(startIndex, endIndex);
  
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  
  const embed = new EmbedBuilder()
    .setColor(0xffaa00)
    .setTitle('Multiple cards found')
    .setDescription(`Found ${pending.matches.length} cards (showing ${startIndex + 1}-${endIndex}). Reply with the number to select:\n\n` +
      pending.displayMatches.map((c, i) => {
        const emoji = ELEMENT_EMOJIS[c.element.toLowerCase()] || c.element;
        return `**${i + 1}.** \`${c.name}\` ${emoji} - ${c.series} (${c.role})`;
      }).join('\n'))
    .setFooter({ text: `Page ${pending.page + 1}/${pending.totalPages} • Reply with 1-${pending.displayMatches.length} or "cancel"` });
  
  const components = [];
  const row = new ActionRowBuilder();
  
  // Always show both buttons, but disable when at boundaries
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`wishlist_prev_${interaction.user.id}`)
      .setLabel('← Previous')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(pending.page === 0)
  );
  
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`wishlist_next_${interaction.user.id}`)
      .setLabel('Next →')
      .setStyle(ButtonStyle.Primary)
      .setDisabled(endIndex >= pending.matches.length)
  );
  
  components.push(row);
  
  await interaction.update({ embeds: [embed], components });
}

async function handleWishlistRemove(message, cardNames) {
  try {
    const allCards = getCards();
    const { Wishlist: WishlistModel } = await initWishlistConnection();
    
    const userWishlist = await WishlistModel.findById(message.author.id);
    if (!userWishlist || userWishlist.wl.length === 0) {
      await message.reply('❌ Your wishlist is empty.');
      return;
    }
    
    const namesToRemove = cardNames.split(',').map(n => n.trim()).filter(n => n);
    
    if (namesToRemove.length !== 1) {
      await message.reply('❌ Please remove one card at a time for better accuracy.');
      return;
    }
    
    const name = namesToRemove[0];
    
    // Find matches in user's wishlist using improved search
    const wishlistCards = userWishlist.wl.map(wlCard => {
      // Find the full card data for better matching
      const fullCard = allCards.find(c => c.name === wlCard.n && c.element.toLowerCase() === wlCard.e);
      return fullCard || { name: wlCard.n, element: wlCard.e, series: 'Unknown' };
    });
    
    const matchedCards = findSimilarCards(name, wishlistCards);
    const wishlistMatches = matchedCards.map(card => {
      return userWishlist.wl.find(wlCard => wlCard.n === card.name && wlCard.e === card.element.toLowerCase());
    }).filter(Boolean);
    
    if (wishlistMatches.length === 0) {
      await message.reply('❌ No card found');
      return;
    }
    
    if (wishlistMatches.length === 1) {
      const cardToRemove = wishlistMatches[0];
      userWishlist.wl = userWishlist.wl.filter(c => c.n !== cardToRemove.n);
      userWishlist.cardCount = userWishlist.wl.length;
      userWishlist.updatedAt = new Date();
      await userWishlist.save();
      invalidateCache(message.author.id);
      
      const emoji = ELEMENT_EMOJIS[cardToRemove.e] || cardToRemove.e;
      await message.reply(`✅ Removed **${cardToRemove.n}** ${emoji} from your wishlist!`);
      return;
    }
    
    // Multiple matches - show options
    const displayLimit = 10;
    const totalMatches = wishlistMatches.length;
    const displayMatches = wishlistMatches.slice(0, displayLimit);
    const hasMore = totalMatches > displayLimit;
    
    const embed = new EmbedBuilder()
      .setColor(0xff6b6b)
      .setTitle('Multiple cards found in your wishlist')
      .setDescription(`Found ${totalMatches} cards (showing 1-${Math.min(displayLimit, totalMatches)}). Reply with the number to remove:\n\n` +
        displayMatches.map((c, i) => {
          const emoji = ELEMENT_EMOJIS[c.e] || c.e;
          return `**${i + 1}.** \`${c.n}\` ${emoji}`;
        }).join('\n'))
      .setFooter({ text: `Page 1/${Math.ceil(totalMatches / displayLimit)} • Reply with 1-${displayMatches.length} or "cancel"` });
    
    const components = [];
    if (hasMore) {
      const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
      const row = new ActionRowBuilder()
        .addComponents(
          new ButtonBuilder()
            .setCustomId(`wishlist_next_${message.author.id}`)
            .setLabel('Next →')
            .setStyle(ButtonStyle.Primary)
            .setDisabled(false)
        );
      components.push(row);
    }
    
    await message.reply({ embeds: [embed], components });
    
    pendingConfirmations.set(message.author.id, {
      matches: wishlistMatches,
      displayMatches: displayMatches,
      wishlist: userWishlist,
      action: 'remove',
      page: 0,
      totalPages: Math.ceil(totalMatches / displayLimit),
      displayLimit: displayLimit,
      timestamp: Date.now()
    });
    
    setTimeout(() => pendingConfirmations.delete(message.author.id), 120000);
    
  } catch (error) {
    console.error('Wishlist remove error:', error);
    await message.reply('❌ Error removing from wishlist.');
  }
}

module.exports = { handleWishlistAdd, handleWishlistView, handleWishlistSelection, handleWishlistRemove, handleWishlistPagination };
