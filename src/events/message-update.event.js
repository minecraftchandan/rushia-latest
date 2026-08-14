const { Events } = require('discord.js');
const { processExpeditionMessage } = require('../systems/reminders/expedition-reminder.system');
const { processRaidSpawnMessage } = require('../systems/reminders/raid-spawn-reminder.system');
const { processRaidWishlist } = require('../systems/raid/raid-wishlist.system');
const { addIdReaction } = require('../systems/cards/id-fetch.system');
const { processClashMessage } = require('../systems/leaderboard/clash-count.system');
const { LUVI_BOT_ID } = require('../config/constants');

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (newMessage.author.id !== LUVI_BOT_ID) return;

        await processRaidSpawnMessage(newMessage);
        await processRaidWishlist(newMessage);
        await processClashMessage(newMessage);
        await addIdReaction(newMessage);
        await processExpeditionMessage(newMessage);
    }
};
