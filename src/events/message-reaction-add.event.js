const { Events } = require('discord.js');
const { handleIDExtractorReaction } = require('../systems/cards/id-fetch.system');
const { LUVI_BOT_ID } = require('../config/constants');

module.exports = {
    name: Events.MessageReactionAdd,
    async execute(reaction, user) {
        if (user.bot) return;
        if (reaction.emoji.name !== '🆔') return;
        if (reaction.message.author?.id !== LUVI_BOT_ID) return;

        await handleIDExtractorReaction(reaction, user);
    }
};
