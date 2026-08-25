const { Events } = require('discord.js');
const { processExpeditionMessage } = require('../systems/reminders/expedition-reminder.system');
const { processRaidSpawnMessage } = require('../systems/reminders/raid-spawn-reminder.system');
const { processRaidWishlist } = require('../systems/raid/raid-wishlist.system');
const { addIdReaction } = require('../systems/cards/id-fetch.system');
const { processClashMessage } = require('../systems/leaderboard/clash-count.system');
const { processIconicMessage } = require('../systems/leaderboard/iconic-count.system');
const { processRaidMessage } = require('../systems/reminders/raid-reminder.system');
const { LUVI_BOT_ID } = require('../config/constants');
const { getSettings } = require('../utils/settings.manager');

module.exports = {
    name: Events.MessageUpdate,
    async execute(oldMessage, newMessage) {
        if (newMessage.author.id !== LUVI_BOT_ID) return;
        const settings = await getSettings(newMessage.guildId);
        if (!settings?.luviEnabled) return;

    await processRaidSpawnMessage(newMessage);
    await processRaidWishlist(newMessage);
    await processClashMessage(newMessage);
    if (!oldMessage.embeds?.length && newMessage.embeds?.length) {
        await processIconicMessage(newMessage);
    }
    await addIdReaction(newMessage);
    await processExpeditionMessage(newMessage);
    await processRaidMessage(newMessage);
    }
};
