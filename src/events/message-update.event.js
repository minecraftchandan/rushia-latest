const { Events } = require('discord.js');
const { processExpeditionMessage } = require('../systems/expedition-reminder.system');
const { processRaidMessage } = require('../systems/raid-reminder.system');
const { processRaidSpawnMessage } = require('../systems/raid-spawn-reminder.system');
const { processRaidWishlist } = require('../systems/raid-wishlist.system');
const { addIdReaction } = require('../systems/id-fetch.system');
const { processClashMessage } = require('../systems/clash-count.system');
const { LUVI_BOT_ID } = require('../config/constants');

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (newMessage.author.id !== LUVI_BOT_ID) return;
        
        await processRaidSpawnMessage(newMessage);
        await processRaidWishlist(newMessage);
        await processExpeditionMessage(newMessage);
        await processRaidMessage(newMessage);
        await addIdReaction(newMessage);
        await processClashMessage(newMessage);
    }
};
