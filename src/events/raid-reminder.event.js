const { Events } = require('discord.js');
const { processRaidMessage } = require('../systems/raid-reminder.system');
const { LUVI_BOT_ID } = require('../config/constants');
const { getSettings } = require('../utils/settings.manager');

async function handleRaidReminder(message) {
    if (message.author.id !== LUVI_BOT_ID) return;
    if (!message.guild) return;

    // Only process messages that contain raid party/fatigue content
    const hasRaidEmbed = message.embeds?.some(e =>
        e.fields?.some(f => f.name?.includes('Party Members'))
    );
    const hasRaidComponent = message.components?.some(c =>
        c.type === 17 && c.components?.some(ch =>
            ch.type === 10 && ch.content?.includes('__Party Members__')
        )
    );
    if (!hasRaidEmbed && !hasRaidComponent) return;

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
    }
];
