const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const Reminder = require('../database/reminder.model');
const { getUserSettings } = require('./user-settings.manager');
const { BOT_OWNER_ID } = require('../config/constants');

const typeNames = {
    expedition: 'Expedition',
    stamina: 'Stamina',
    raid: 'Raid',
    raidSpawn: 'Raid Spawn',
    drop: 'Drop'
};

const typeEmojis = {
    expedition: '🗺️',
    stamina: '⚡',
    raid: '⚔️',
    raidSpawn: '🔔',
    drop: '🎁'
};

async function fetchReminders() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    await Reminder.deleteMany({
        remindAt: { $lt: oneHourAgo },
        status: { $ne: 'sent' }
    });
    return Reminder.find({
        status: { $ne: 'sent' },
        remindAt: { $gte: new Date() }
    }).sort({ remindAt: 1 });
}

async function buildPayload(userId, page, filter, reminders) {
    let filtered = filter === 'all' ? reminders : reminders.filter(r => r.type === filter);

    const itemsPerPage = 5;
    const totalPages = Math.ceil(filtered.length / itemsPerPage) || 1;
    page = Math.min(page, totalPages - 1);
    const pageReminders = filtered.slice(page * itemsPerPage, (page + 1) * itemsPerPage);

    const embed = new EmbedBuilder()
        .setTitle(`📋 Active Reminders — ${filter === 'all' ? 'All Types' : `${typeEmojis[filter]} ${typeNames[filter]}`}`)
        .setColor(0x5865F2)
        .setFooter({ text: `Page ${page + 1}/${totalPages} • ${filtered.length} total` });

    if (pageReminders.length === 0) {
        embed.setDescription('No reminders in this category.');
    } else {
        const lines = await Promise.all(pageReminders.map(async r => {
            const time = Math.floor(r.remindAt.getTime() / 1000);
            const userSettings = await getUserSettings(r.userId);
            let dmEnabled = r.type === 'raid' ? true : userSettings?.[`${r.type}DM`] || false;
            return `${typeEmojis[r.type] || '🔔'} **${typeNames[r.type] || r.type}** | <@${r.userId}> — <t:${time}:R> | ${dmEnabled ? '✅ DM' : '❌ DM'}`;
        }));
        embed.setDescription(lines.join('\n'));
    }

    // Dropdown
    const dropdown = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(`rem_filter_${userId}_${page}`)
            .setPlaceholder('Filter by type...')
            .addOptions([
                { label: 'All Types', value: 'all', emoji: '📋', default: filter === 'all' },
                { label: 'Expedition', value: 'expedition', emoji: '🗺️', default: filter === 'expedition' },
                { label: 'Stamina', value: 'stamina', emoji: '⚡', default: filter === 'stamina' },
                { label: 'Raid', value: 'raid', emoji: '⚔️', default: filter === 'raid' },
                { label: 'Raid Spawn', value: 'raidSpawn', emoji: '🔔', default: filter === 'raidSpawn' },
                { label: 'Drop', value: 'drop', emoji: '🎁', default: filter === 'drop' },
            ])
    );

    // Pagination + Refresh
    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`rem_prev_${userId}_${page}_${filter}`)
            .setLabel('◀')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new ButtonBuilder()
            .setCustomId(`rem_next_${userId}_${page}_${filter}`)
            .setLabel('▶')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page >= totalPages - 1),
        new ButtonBuilder()
            .setCustomId(`rem_refresh_${userId}_${page}_${filter}`)
            .setLabel('🔄 Refresh')
            .setStyle(ButtonStyle.Primary)
    );

    return { embeds: [embed], components: [dropdown, buttons], allowedMentions: { parse: [] } };
}

async function handleReminderView(message) {
    if (message.author.id !== BOT_OWNER_ID) {
        return message.reply('❌ Only the bot owner can use this command.');
    }

    const reminders = await fetchReminders();
    if (reminders.length === 0) return message.reply('❌ No active reminders found.');

    const payload = await buildPayload(message.author.id, 0, 'all', reminders);
    await message.reply(payload);
}

async function handleReminderInteraction(interaction) {
    const customId = interaction.customId;
    if (!customId.startsWith('rem_')) return false;

    const parts = customId.split('_');
    const action = parts[1];
    const userId = parts[2];
    let page = parseInt(parts[3]) || 0;
    let filter = parts[4] || 'all';

    if (userId !== interaction.user.id) {
        await interaction.reply({ content: 'mat kr lala mat kr', ephemeral: true });
        return true;
    }

    // Dropdown select
    if (action === 'filter') {
        filter = interaction.values[0];
        page = 0;
    } else if (action === 'prev') {
        page = Math.max(0, page - 1);
    } else if (action === 'next') {
        page++;
    }
    // refresh just re-fetches with same page/filter

    const reminders = await fetchReminders();
    const payload = await buildPayload(userId, page, filter, reminders);
    await interaction.update(payload);
    return true;
}

module.exports = { handleReminderView, handleReminderInteraction };
