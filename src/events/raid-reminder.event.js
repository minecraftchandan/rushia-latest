const { Events } = require('discord.js');
const { processRaidMessage } = require('../systems/raid-reminder.system');
const { LUVI_BOT_ID } = require('../config/constants');
const { getSettings } = require('../utils/settings.manager');

async function handleRaidReminder(message) {
    if (message.author.id !== LUVI_BOT_ID) return;
    if (!message.guild) return;
    if (!message.embeds || message.embeds.length === 0) return;

    const settings = await getSettings(message.guildId);
    if (!settings?.luviEnabled) return;

    await processRaidMessage(message);
}

module.exports = [
    {
        name: Events.MessageCreate,
        async execute(message) {
            await handleRaidReminder(message);
        }
    },
    {
        name: Events.MessageUpdate,
        async execute(oldMessage, newMessage) {
            await handleRaidReminder(newMessage);
        }
    }
];
