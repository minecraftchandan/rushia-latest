const { Events } = require('discord.js');
const { sendLog, sendError } = require('../../utils/logger');
const { LUVI_BOT_ID } = require('../../config/constants');
const { buildRarityMessage } = require('../../utils/card-rarity.parser');

const watchers = new Map();
const MAX_MESSAGE_LENGTH = 2000;

async function reactWithRetry(message, emoji, maxRetries) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await message.react(emoji);
            return;
        } catch (error) {
            if (attempt < maxRetries) {
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
}

async function processInventoryEmbed(message) {
    const embed = message.embeds[0];
    if (!embed.title) return;
    if (embed.title.includes('<:LU_Inventory:') && embed.title.includes("'s Inventory")) {
        await reactWithRetry(message, '✏️', 3);
    }
}

async function processInventoryMessage(message) {
    if (message.author.id !== LUVI_BOT_ID) return;
    if (!message.embeds.length) {
        setTimeout(async () => {
            try {
                const fetchedMessage = await message.channel.messages.fetch(message.id);
                if (fetchedMessage.embeds.length > 0) {
                    await processInventoryEmbed(fetchedMessage);
                }
            } catch (error) {
                sendError('Error fetching message after delay:', error);
            }
        }, 2000);
        return;
    }
    await processInventoryEmbed(message);
}

function extractCardsWithIds(embed) {
    const cards = {};
    const RARITY_MAP = { 'M': 'Mythical', 'L': 'Legendary', 'E': 'Exotic', 'R': 'Rare', 'UC': 'Uncommon', 'C': 'Common' };
    const GRADE_MAP = { 'SPlusTier': 'S+', 'STier': 'S', 'ATier': 'A', 'BTier': 'B', 'CTier': 'C', 'DTier': 'D' };
    
    if (!embed.fields) return cards;

    embed.fields.forEach(field => {
        const nameMatch = field.name.match(/<:LU_([MLEURC]+):[^>]+>\s*([^|]+?)(?:\s*\|(.+))?$/);
        const idMatch = field.value.match(/ID:\s*`(\d+)`/);
        
        if (nameMatch && idMatch) {
            const cardId = idMatch[1];
            const rarity = RARITY_MAP[nameMatch[1]];
            let cardName = nameMatch[2].trim().replace(/🔒/g, '').replace(/\s+/g, ' ').trim();
            const iconicPart = nameMatch[3];
            
            let grade = '';
            const gradeMatch = field.value.match(/:LU_(SPlusTier|STier|ATier|BTier|CTier|DTier):/);
            if (gradeMatch) {
                grade = GRADE_MAP[gradeMatch[1]];
            }
            
            if (iconicPart && iconicPart.includes('Iconic')) {
                cardName = `✨ ${cardName}`;
            }
            
            if (rarity) {
                if (!cards[rarity]) cards[rarity] = [];
                cards[rarity].push({ name: cardName, grade, id: cardId });
            }
        }
    });
    return cards;
}

function startPaginationWatcher(userId, inventoryMessage, cardListMessage) {
    if (watchers.has(userId)) {
        clearInterval(watchers.get(userId).interval);
    }

    let allCards = {};
    let seenIds = new Set();
    let lastPage = 1;
    let isActive = true;
    const startTime = Date.now();
    const maxDuration = 180000;
    
    const interval = setInterval(async () => {
        if (!isActive) return;

        if (Date.now() - startTime > maxDuration) {
            clearInterval(interval);
            isActive = false;
            watchers.delete(userId);
            try {
                await cardListMessage.reply({ content: '✅ Scraping completed. No more updates.', flags: 64 });
            } catch (error) {
                sendError('Error sending ephemeral message:', error);
            }
            return;
        }

        try {
            const fetchedInventory = await inventoryMessage.channel.messages.fetch(inventoryMessage.id);
            if (!fetchedInventory.embeds[0]) return;

            const embed = fetchedInventory.embeds[0];
            const pageMatch = embed.description?.match(/Page (\d+)\/(\d+)/);
            if (!pageMatch) {
                clearInterval(interval);
                isActive = false;
                watchers.delete(userId);
                return;
            }

            const currentPage = parseInt(pageMatch[1]);
            const totalPages = parseInt(pageMatch[2]);

            const pageCards = extractCardsWithIds(embed);
            Object.entries(pageCards).forEach(([rarity, cards]) => {
                if (!allCards[rarity]) allCards[rarity] = [];
                cards.forEach(card => {
                    if (!seenIds.has(card.id)) {
                        seenIds.add(card.id);
                        allCards[rarity].push(card);
                    }
                });
            });

            if (currentPage !== lastPage) {
                const message = buildRarityMessage(allCards);
                if (message.length > MAX_MESSAGE_LENGTH) {
                    clearInterval(interval);
                    isActive = false;
                    watchers.delete(userId);
                    try {
                        await cardListMessage.reply({ content: '⚠️ Message limit reached. Scraping stopped.', flags: 64 });
                    } catch (error) {
                        sendError('Error sending ephemeral message:', error);
                    }
                    return;
                }
                await cardListMessage.edit({ content: message });
                lastPage = currentPage;
            }

            if (currentPage >= totalPages) {
                clearInterval(interval);
                isActive = false;
                watchers.delete(userId);
                try {
                    await cardListMessage.reply({ content: '✅ All pages scraped. No more updates.', flags: 64 });
                } catch (error) {
                    sendError('Error sending ephemeral message:', error);
                }
            }
        } catch (error) {
            if (error.code === 10008) {
                clearInterval(interval);
                isActive = false;
                watchers.delete(userId);
                return;
            }
            sendError('Error in pagination watcher:', error);
            clearInterval(interval);
            isActive = false;
            watchers.delete(userId);
        }
    }, 500);

    watchers.set(userId, { interval, allCards });
}

async function handleCardInventorySystem(client) {
    client.on(Events.MessageCreate, async (message) => {
        await processInventoryMessage(message);
    });
}

module.exports = { handleCardInventorySystem, startPaginationWatcher };
