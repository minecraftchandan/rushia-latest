const { Events } = require('discord.js');
const { processExpeditionMessage } = require('../systems/expedition-reminder.system');
const { processRaidMessage } = require('../systems/raid-reminder.system');
const { processRaidSpawnMessage } = require('../systems/raid-spawn-reminder.system');
const { processRaidWishlist } = require('../systems/raid-wishlist.system');
const { addIdReaction } = require('../systems/id-fetch.system');
const { processClashMessage } = require('../systems/clash-count.system');
const { LUVI_BOT_ID } = require('../config/constants');

// Track message IDs already processed by MessageCreate to avoid double reminder creation
const processedOnCreate = new Map();
const PROCESSED_TTL = 30000; // 30 seconds is more than enough for any edit to arrive

function markProcessed(messageId) {
    processedOnCreate.set(messageId, Date.now());
    setTimeout(() => processedOnCreate.delete(messageId), PROCESSED_TTL);
}

function wasProcessedOnCreate(messageId) {
    return processedOnCreate.has(messageId);
}

module.exports = {
    name: Events.MessageUpdate,
    markProcessed,
    async execute(oldMessage, newMessage) {
        if (newMessage.author.id !== LUVI_BOT_ID) return;

        await processRaidSpawnMessage(newMessage);
        await processRaidWishlist(newMessage);
        await processClashMessage(newMessage);
        await addIdReaction(newMessage);

        // Skip reminder creation if MessageCreate already handled this message
        if (wasProcessedOnCreate(newMessage.id)) return;

        await processExpeditionMessage(newMessage);
        await processRaidMessage(newMessage);
    }
};
