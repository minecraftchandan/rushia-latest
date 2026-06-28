const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { logInfo, logError } = require('../utils/logger');
const fs = require('fs');
const path = require('path');

// Load cards data
const cardsPath = path.join(__dirname, '..', '..', 'data', 'cards.json');
let cards = [];
try {
  cards = JSON.parse(fs.readFileSync(cardsPath, 'utf8'));
} catch (error) {
  logError('Failed to load cards.json:', error);
}

// Store search results for user selection
const userSearches = new Map();
const paginationStates = new Map();
const searchTimeouts = new Map();

const SEARCH_TIMEOUT = 30000; // 30 seconds

function searchCards(query) {
  const terms = query.toLowerCase().split(' ');
  const results = [];
  
  for (const card of cards) {
    let matches = true;
    
    for (const term of terms) {
      const searchText = `${card.name} ${card.series} ${card.element} ${card.role}`.toLowerCase();
      if (!searchText.includes(term)) {
        matches = false;
        break;
      }
    }
    
    if (matches) results.push(card);
  }
  
  return results;
}

function createCardEmbed(card) {
  const cardName = card.is_iconic ? `✨ ${card.name}` : card.name;
  const embed = new EmbedBuilder()
    .setTitle(cardName)
    .setColor(0x00ff00)
    .addFields(
      { name: 'Series', value: card.series, inline: true },
      { name: 'Element', value: card.element, inline: true },
      { name: 'Role', value: card.role, inline: true }
    )
    .setImage(card.image_url)
    .setFooter({ text: '✨ = Iconic' });
  
  return embed;
}

function createResultsEmbed(results, userId, page = 0) {
  const itemsPerPage = 10;
  const totalPages = Math.ceil(results.length / itemsPerPage);
  const start = page * itemsPerPage;
  const end = start + itemsPerPage;
  const pageResults = results.slice(start, end);
  
  const embed = new EmbedBuilder()
    .setTitle(`Found ${results.length} results`)
    .setDescription(`Page ${page + 1}/${totalPages} - Reply with the number to select:\n⏱️ This search will expire in 30 seconds`)
    .setColor(0xffff00)
    .setFooter({ text: '✨ = Iconic' });
  
  for (let i = 0; i < pageResults.length; i++) {
    const card = pageResults[i];
    const cardName = card.is_iconic ? `✨ ${card.name}` : card.name;
    const actualIndex = start + i + 1;
    embed.addFields({
      name: `${actualIndex}. ${cardName}`,
      value: `${card.series} | ${card.element} ${card.role}`,
      inline: false
    });
  }
  
  userSearches.set(userId, results);
  paginationStates.set(userId, { page, totalPages });
  
  // Clear any existing timeout
  if (searchTimeouts.has(userId)) {
    clearTimeout(searchTimeouts.get(userId));
  }
  
  // Set new timeout
  const timeout = setTimeout(() => {
    userSearches.delete(userId);
    paginationStates.delete(userId);
    searchTimeouts.delete(userId);
  }, SEARCH_TIMEOUT);
  
  searchTimeouts.set(userId, timeout);
  
  return embed;
}

function createPaginationButtons(userId, page, totalPages) {
  const row = new ActionRowBuilder();
  
  if (page > 0) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`prev_${userId}`)
        .setLabel('← Previous')
        .setStyle(ButtonStyle.Primary)
    );
  }
  
  row.addComponents(
    new ButtonBuilder()
      .setCustomId(`page_info_${userId}`)
      .setLabel(`${page + 1}/${totalPages}`)
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true)
  );
  
  if (page < totalPages - 1) {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`next_${userId}`)
        .setLabel('Next →')
        .setStyle(ButtonStyle.Primary)
    );
  }
  
  return row;
}

module.exports = {
  // Handle card search from mentions
  handleSearch: async (message, query) => {
    // Check if query contains commas (multiple searches)
    if (query.includes(',')) {
      const queries = query.split(',').map(q => q.trim()).filter(q => q.length > 0);
      
      const loadingEmbed = new EmbedBuilder()
        .setTitle('🔍 Searching Multiple Cards...')
        .setDescription(`\`\`\`\n▓▓▓░░░░░░░ Searching ${queries.length} cards...\n\`\`\``)
        .setColor(0x808080);
      
      const loadingMsg = await message.reply({ embeds: [loadingEmbed] });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const allResults = [];
      for (const q of queries) {
        const results = searchCards(q);
        if (results.length > 0) {
          allResults.push({ query: q, card: results[0] });
        } else {
          allResults.push({ query: q, card: null });
        }
      }
      
      const embed = new EmbedBuilder()
        .setTitle(`📋 Search Results (${allResults.length} queries)`)
        .setColor(0x00ff00)
        .setFooter({ text: '✨ = Iconic' });
      
      for (const result of allResults) {
        if (result.card) {
          const cardName = result.card.is_iconic ? `✨ ${result.card.name}` : result.card.name;
          embed.addFields({
            name: `✅ ${result.query}`,
            value: `**${cardName}**\n${result.card.series} | ${result.card.element} ${result.card.role}`,
            inline: false
          });
        } else {
          embed.addFields({
            name: `❌ ${result.query}`,
            value: 'No card found',
            inline: false
          });
        }
      }
      
      await loadingMsg.edit({ embeds: [embed] });
      return;
    }
    
    // Single search (original behavior)
    const loadingEmbed = new EmbedBuilder()
      .setTitle('🔍 Searching...')
      .setDescription('```\n▓▓▓░░░░░░░ Searching cards...\n```')
      .setColor(0x808080);
    
    const loadingMsg = await message.reply({ embeds: [loadingEmbed] });
    await new Promise(resolve => setTimeout(resolve, 500));
    
    const results = searchCards(query);
    
    if (results.length === 0) {
      const noResultsEmbed = new EmbedBuilder()
        .setTitle('❌ No Results')
        .setDescription('No cards found matching your search.')
        .setColor(0xff0000)
        .setFooter({ text: '✨ = Iconic' });
      await loadingMsg.edit({ embeds: [noResultsEmbed] });
      return;
    }
    
    if (results.length === 1) {
      const embed = createCardEmbed(results[0]);
      await loadingMsg.edit({ embeds: [embed] });
    } else {
      const embed = createResultsEmbed(results, message.author.id, 0);
      const buttons = createPaginationButtons(message.author.id, 0, Math.ceil(results.length / 10));
      const reply = await loadingMsg.edit({ embeds: [embed], components: [buttons] });
      
      // Disable buttons after 30 seconds
      setTimeout(async () => {
        const expiredEmbed = new EmbedBuilder()
          .setTitle('⏱️ Search Expired')
          .setDescription(`This search has expired after 30 seconds. Use \`@${message.client.user.username} f <name>\` to search again.`)
          .setColor(0x808080)
          .setFooter({ text: '✨ = Iconic' });
        
        await reply.edit({ embeds: [expiredEmbed], components: [] }).catch(() => {});
      }, SEARCH_TIMEOUT);
    }
  },
  
  // Handle number selection
  handleSelection: async (message) => {
    const userId = message.author.id;
    const selection = parseInt(message.content);
    
    if (!userSearches.has(userId)) return false;
    
    const results = userSearches.get(userId);
    
    if (selection >= 1 && selection <= results.length) {
      const loadingEmbed = new EmbedBuilder()
        .setTitle('⚡ Loading Card...')
        .setDescription('```\n░░░▓▓▓▓▓░░ Loading card details...\n```')
        .setColor(0x808080);
      
      const loadingMsg = await message.reply({ embeds: [loadingEmbed] });
      await new Promise(resolve => setTimeout(resolve, 300));
      
      const card = results[selection - 1];
      const embed = createCardEmbed(card);
      await loadingMsg.edit({ embeds: [embed], components: [] });
      
      // Clean up
      userSearches.delete(userId);
      paginationStates.delete(userId);
      if (searchTimeouts.has(userId)) {
        clearTimeout(searchTimeouts.get(userId));
        searchTimeouts.delete(userId);
      }
      
      return true;
    } else {
      const errorEmbed = new EmbedBuilder()
        .setTitle('❌ Invalid Selection')
        .setDescription('Please choose a valid number.')
        .setColor(0xff0000)
        .setFooter({ text: '✨ = Iconic' });
      await message.reply({ embeds: [errorEmbed] });
      return true;
    }
  },
  
  // Handle pagination buttons
  handlePagination: async (interaction) => {
    const userId = interaction.user.id;
    const customId = interaction.customId;
    
    if (!customId.includes(userId)) return false;
    
    const results = userSearches.get(userId);
    const state = paginationStates.get(userId);
    
    if (!results || !state) return false;
    
    let newPage = state.page;
    if (customId.startsWith('next_')) newPage++;
    else if (customId.startsWith('prev_')) newPage--;
    else return false;
    
    const embed = createResultsEmbed(results, userId, newPage);
    const buttons = createPaginationButtons(userId, newPage, state.totalPages);
    
    await interaction.update({ embeds: [embed], components: [buttons] });
    return true;
  }
};
