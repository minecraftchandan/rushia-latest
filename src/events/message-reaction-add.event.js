const { Events } = require('discord.js');
const { handleIDExtractorReaction } = require('../systems/cards/id-fetch.system');
const { handleInventoryReaction } = require('../systems/cards/card-inventory.system');
const { handleRaidPingReaction } = require('../systems/raid/raid-ping.system');
const { LUVI_BOT_ID } = require('../config/constants');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        if (user.bot) return;
        if (reaction.message.author?.id !== LUVI_BOT_ID) return;

        if (reaction.emoji.name === '🆔') {
            await handleIDExtractorReaction(reaction, user);
            return;
        }

        if (reaction.emoji.name === '✏️') {
            await handleInventoryReaction(reaction, user);
            return;
        }

        if (reaction.emoji.id === '1543246602074849280' || reaction.emoji.name === 'bell' || reaction.emoji.name === 'a:bell') {
            await handleRaidPingReaction(reaction, user);
        }
    }
};
