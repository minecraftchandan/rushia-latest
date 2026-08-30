const { Events } = require('discord.js');
const { processBossMessage } = require('../systems/boss/tier-ping.system');
const { processStaminaMessage } = require('../systems/reminders/stamina-reminder.system');
const { processRaidSpawnMessage, processUserSpawnCommand } = require('../systems/reminders/raid-spawn-reminder.system');
const { processRaidWishlist } = require('../systems/raid/raid-wishlist.system');
const { processDropMessage } = require('../systems/reminders/drop-reminder.system');
const { processRarityDrop } = require('../systems/leaderboard/rarity-drop.system');
const { processDropCount } = require('../systems/leaderboard/drop-count.system');
const { processClashMessage } = require('../systems/leaderboard/clash-count.system');
const { processIconicMessage } = require('../systems/leaderboard/iconic-count.system');
const { processPogMessage } = require('../systems/boss/pog.system');
const { processSeriesMessage } = require('../systems/cards/series.system');
const { BOT_OWNER_ID, LUVI_BOT_ID, SOFI_BOT_ID } = require('../config/constants');
const { addIdReaction } = require('../systems/cards/id-fetch.system');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const client = message.client;

        if (!message.author.bot && message.mentions.users.has(LUVI_BOT_ID)) {
            const { trackRaidTrigger } = require('../systems/raid/raid-ping.system');
            trackRaidTrigger(message);
        }

        if (!message.author.bot) await processUserSpawnCommand(message);

        // Handle bot mentions for card search and logs
        if (!message.author.bot && message.mentions.has(client.user)) {
            const mentionRegex = new RegExp(`^<@!?${client.user.id}>\\s*`, 'i');
            const content = message.content.replace(mentionRegex, '').trim();
            message.commandContent = content;

            if (content.match(/^raidconfig$/i)) {
                const { handleRaidConfigCommand } = require('../commands/raidconfig');
                await handleRaidConfigCommand(message);
                return;
            }

            // Wishlist add command: @Bot wa name or @Bot wa name1,name2,name3
            const waMatch = content.match(/^wa\s+(.+)$/i);
            if (waMatch) {
                const { handleWishlistAdd } = require('../systems/cards/wishlist.system');
                await handleWishlistAdd(message, waMatch[1]);
                return;
            }
            
            // Wishlist view command: @Bot wl or @Bot wl @user or @Bot wl userId
            const wlMatch = content.match(/^wl(?:\s+(?:<@!?(\d+)>|(\d+)))?$/i);
            if (wlMatch) {
                const { handleWishlistView } = require('../systems/cards/wishlist.system');
                const targetId = wlMatch[1] || wlMatch[2];
                const targetUser = targetId ? await client.users.fetch(targetId).catch(() => null) : null;
                await handleWishlistView(message, targetUser);
                return;
            }
            
            // Wishlist remove command: @Bot wr name or @Bot wr name1,name2,name3
            const wrMatch = content.match(/^wr\s+(.+)$/i);
            if (wrMatch) {
                const { handleWishlistRemove } = require('../systems/cards/wishlist.system');
                await handleWishlistRemove(message, wrMatch[1]);
                return;
            }
            
            if (content.match(/^(?:help|rhelp)$/i)) {
                const { handleHelpCommand } = require('../commands/help');
                await handleHelpCommand(message);
                return;
            }
            
            if (content.match(/^here$/i)) {
                const { handleHereCommand } = require('../systems/raid/channel-override.system');
                await handleHereCommand(message);
                return;
            }
            
            if (content.match(/^unhere$/i)) {
                const { handleUnhereCommand } = require('../systems/raid/channel-override.system');
                await handleUnhereCommand(message);
                return;
            }
            
            if (content.match(/^logs$/i)) {
                const { handleLogsCommand } = require('../commands/logs');
                await handleLogsCommand(message);
                return;
            }
            
            if (content.match(/^perms$/i)) {
                const { handlePermsCheck } = require('../utils/permissions.checker');
                await handlePermsCheck(message);
                return;
            }
            

            if (content.match(/^rem(?:\s|$)/i)) {
                const { handleReminderView } = require('../utils/reminder.viewer');
                const args = content.toLowerCase().replace(/^rem\s*/i, '').trim();
                const filter = args || null;
                await handleReminderView(message, filter);
                return;
            }
            
            if (content.match(/^nv(?:\s|$)/i)) {
                const { handleNotificationViewCommand } = require('../systems/reminders/user-notification.system');
                await handleNotificationViewCommand(message);
                return;
            }
            
            if (content.match(/^(?:servers|guilds)$/i)) {
                const { handleServerListCommand } = require('../systems/admin/server-management.system');
                await handleServerListCommand(message);
                return;
            }
            
            if (content.match(/^minfo$/i)) {
                const { handleMinfoCommand } = require('../commands/server-info');
                await handleMinfoCommand(message);
                return;
            }
            
            if (content.match(/^stats$/i)) {
                const { handleRstatsCommand } = require('../commands/bot-stats');
                await handleRstatsCommand(message);
                return;
            }
            
            if (content.match(/^(?:config|rconfig)$/i)) {
                const { handleConfigCommand } = require('../commands/config');
                await handleConfigCommand(message);
                return;
            }

            const iconicMatch = content.match(/^(?:ict|rict)(?:\s+(.+))?$/i);
            if (iconicMatch) {
                const { handleIconicCountCommand } = require('../commands/iconic-count');
                await handleIconicCountCommand(message, iconicMatch[1] ? iconicMatch[1].trim().split(/\s+/) : []);
                return;
            }
            
            // Setpog command: @bot setpog #channel or @bot setpog channelId
            const setpogMatch = content.match(/^setpog(?:\s+(.+))?$/i);
            if (setpogMatch) {
                const { handleSetpogCommand } = require('../commands/set-pog');
                const args = setpogMatch[1] ? setpogMatch[1].trim().split(/\s+/) : [];
                await handleSetpogCommand(message, args);
                return;
            }
            
            // Handle info command with server ID
            const infoMatch = content.match(/^(info|i|in|inf)\s+(\d+)$/i);
            if (infoMatch) {
                const { handleServerInfoCommand } = require('../systems/admin/server-management.system');
                await handleServerInfoCommand(message, infoMatch[2]);
                return;
            }
            
            if (content.match(/^(?:rlb|lb)$/i)) {
                const { handleRlbCommand } = require('../systems/leaderboard/leaderboard.system');
                await handleRlbCommand(message);
                return;
            }

            if (content.match(/^(?:rdlb|dlb)$/i)) {
                const { handleRdlbCommand } = require('../systems/leaderboard/leaderboard.system');
                await handleRdlbCommand(message);
                return;
            }

            if (content.match(/^(?:rrlb|rlb2)$/i)) {
                const { handleRrlbCommand } = require('../systems/leaderboard/leaderboard.system');
                await handleRrlbCommand(message);
                return;
            }

            if (content.match(/^(?:rclb|clb)$/i)) {
                const { handleRclbCommand } = require('../systems/leaderboard/leaderboard.system');
                await handleRclbCommand(message);
                return;
            }

            if (content.match(/^(?:rilb|ilb)$/i)) {
                const { handleRilbCommand } = require('../systems/leaderboard/leaderboard.system');
                await handleRilbCommand(message);
                return;
            }

            // Admin manual leaderboard adjustments: @Bot radd|rdel ...
            if (content.match(/^(?:radd|rdel)\b/i)) {
                const { handleAdminRCommand } = require('../systems/leaderboard/leaderboard.system');
                await handleAdminRCommand(message);
                return;
            }
            
            // Gawk command: @bot gawk set|view
            const gawkMatch = content.match(/^gawk\s+(set|view)$/i);
            if (gawkMatch) {
                const { handleGawkCommand } = require('../commands/gawk');
                await handleGawkCommand(message);
                return;
            }

            if (/^gawk\b/i.test(content) && message.author.id === BOT_OWNER_ID) {
                await message.reply(`Debug: parsed content is \`${content}\``);
                return;
            }
            
            // Role delay command: @bot delay [roleId] [time] or @bot d [roleId] [time]
            const delayMatch = content.match(/^d(?:elay)?\s+(.+)$/i);
            if (delayMatch) {
                const { handleRoleDelay } = require('../utils/role-delay.manager');
                const args = delayMatch[1].split(/\s+/);
                await handleRoleDelay(message, args);
                return;
            }

            // Admin manual leaderboard adjustments (mention form): @Bot radd|rdel ...
            // already handled above in mention block
            
            // View role delays: @bot delays or @bot viewdelays
            if (content.match(/^(?:delays|viewdelays)$/i)) {
                const { handleViewDelays } = require('../utils/role-delay.manager');
                await handleViewDelays(message);
                return;
            }
            
            const match = content.match(/^(f|find)\s+(.+)$/i);
            if (match) {
                const cardSearch = require('../systems/cards/card-search.system');
                await cardSearch.handleSearch(message, match[2]);
                return;
            }
        }
        
        if (!message.author.bot && /^rhelp(?:\s|$)/i.test(message.content)) {
            const { handleHelpCommand } = require('../commands/help');
            await handleHelpCommand(message);
            return;
        }

        // Handle prefix commands (r prefix without @Bot mention)
        if (!message.author.bot && message.content.toLowerCase().startsWith('r')) {
            const args = message.content.slice(1).trim().split(/\s+/);
            const command = args[0]?.toLowerCase();
            
            // Wishlist commands
            if (command === 'wa' && args[1]) {
                const { handleWishlistAdd } = require('../systems/cards/wishlist.system');
                await handleWishlistAdd(message, args.slice(1).join(' '));
                return;
            }
            
            if (command === 'wl') {
                const { handleWishlistView } = require('../systems/cards/wishlist.system');
                const targetId = args[1]?.replace(/[<@!>]/g, '');
                const targetUser = targetId ? await client.users.fetch(targetId).catch(() => null) : null;
                await handleWishlistView(message, targetUser);
                return;
            }
            
            if (command === 'wr' && args[1]) {
                const { handleWishlistRemove } = require('../systems/cards/wishlist.system');
                await handleWishlistRemove(message, args.slice(1).join(' '));
                return;
            }
            
            // Information commands
            if (command === 'help' || command === 'rhelp') {
                const { handleHelpCommand } = require('../commands/help');
                await handleHelpCommand(message);
                return;
            }
            
            if (command === 'here') {
                const { handleHereCommand } = require('../systems/raid/channel-override.system');
                await handleHereCommand(message);
                return;
            }
            
            if (command === 'unhere') {
                const { handleUnhereCommand } = require('../systems/raid/channel-override.system');
                await handleUnhereCommand(message);
                return;
            }
            
            if (command === 'logs') {
                const { handleLogsCommand } = require('../commands/logs');
                await handleLogsCommand(message);
                return;
            }
            
            if (command === 'perms') {
                const { handlePermsCheck } = require('../utils/permissions.checker');
                await handlePermsCheck(message);
                return;
            }
            

            if (command === 'rem') {
                const { handleReminderView } = require('../utils/reminder.viewer');
                const filter = args[1] || null;
                await handleReminderView(message, filter);
                return;
            }
            
            if (command === 'nv') {
                const { handleNotificationViewCommand } = require('../systems/reminders/user-notification.system');
                await handleNotificationViewCommand(message);
                return;
            }
            
            // Server management
            if (command === 'servers' || command === 'guilds') {
                const { handleServerListCommand } = require('../systems/admin/server-management.system');
                await handleServerListCommand(message);
                return;
            }
            
            if (command === 'minfo') {
                const { handleMinfoCommand } = require('../commands/server-info');
                await handleMinfoCommand(message);
                return;
            }
            
            if (command === 'stats') {
                const { handleRstatsCommand } = require('../commands/bot-stats');
                await handleRstatsCommand(message);
                return;
            }
            
            if (command === 'config') {
                const { handleConfigCommand } = require('../commands/config');
                await handleConfigCommand(message);
                return;
            }

            if (command === 'ict' || command === 'rict') {
                const { handleIconicCountCommand } = require('../commands/iconic-count');
                await handleIconicCountCommand(message, args.slice(1));
                return;
            }

            if (command === 'setpog') {
                const { handleSetpogCommand } = require('../commands/set-pog');
                await handleSetpogCommand(message, args.slice(1));
                return;
            }
            
            if ((command === 'info' || command === 'i' || command === 'in' || command === 'inf') && args[1]) {
                const { handleServerInfoCommand } = require('../systems/admin/server-management.system');
                await handleServerInfoCommand(message, args[1]);
                return;
            }
            
            // Leaderboard
            if (command === 'lb' || command === 'rlb') {
                const { handleRlbCommand } = require('../systems/leaderboard/leaderboard.system');
                await handleRlbCommand(message);
                return;
            }

            // Admin manual leaderboard adjustments (prefix form): radd -> command 'add' when using single-letter prefix
            if (command === 'add' || command === 'del') {
                const { handleAdminRCommand } = require('../systems/leaderboard/leaderboard.system');
                await handleAdminRCommand(message);
                return;
            }

            if (command === 'dlb' || command === 'rdlb') {
                const { handleRdlbCommand } = require('../systems/leaderboard/leaderboard.system');
                await handleRdlbCommand(message);
                return;
            }

            if (command === 'rrlb') {
                const { handleRrlbCommand } = require('../systems/leaderboard/leaderboard.system');
                await handleRrlbCommand(message);
                return;
            }

            if (command === 'clb' || command === 'rclb') {
                const { handleRclbCommand } = require('../systems/leaderboard/leaderboard.system');
                await handleRclbCommand(message);
                return;
            }

            if (command === 'ilb' || command === 'rilb') {
                const { handleRilbCommand } = require('../systems/leaderboard/leaderboard.system');
                await handleRilbCommand(message);
                return;
            }
            
            // Role delays
            if ((command === 'delay' || command === 'd') && args[1]) {
                const { handleRoleDelay } = require('../utils/role-delay.manager');
                await handleRoleDelay(message, args.slice(1));
                return;
            }
            
            if (command === 'delays' || command === 'viewdelays') {
                const { handleViewDelays } = require('../utils/role-delay.manager');
                await handleViewDelays(message);
                return;
            }
            
            // Card search
            if ((command === 'f' || command === 'find') && args[1]) {
                const cardSearch = require('../systems/cards/card-search.system');
                await cardSearch.handleSearch(message, args.slice(1).join(' '));
                return;
            }
        }
        
        // Handle card search number selection
        if (!message.author.bot && message.content.match(/^\d+$/)) {
            const { handleWishlistSelection } = require('../systems/cards/wishlist.system');
            const handled = await handleWishlistSelection(message, message.content);
            if (handled) return;
            
            const cardSearch = require('../systems/cards/card-search.system');
            const searchHandled = await cardSearch.handleSelection(message);
            if (searchHandled) return;
        }

        // Route bot messages to the appropriate system
        if (message.author.id === SOFI_BOT_ID) {
            await processPogMessage(message);
            await processSeriesMessage(message);
            return;
        }

        if (message.author.id !== LUVI_BOT_ID) return;

        const { getSettings } = require('../utils/settings.manager');
        const settings = await getSettings(message.guildId);

        if (!settings?.luviEnabled) return;

        // Helper to run handlers safely so one failure doesn't stop others
        async function safeRun(name, fn) {
            try {
                await fn(message);
            } catch (err) {
                const { logError } = require('../utils/logger');
                // Log the error with context but continue processing
                await logError(`Handler failed: ${name}`, err, {
                    category: 'HANDLER_ERROR',
                    handler: name,
                    guildId: message.guildId,
                    channelId: message.channel?.id
                });
            }
        }

        // Execute Luvi-related handlers; order preserved but each is isolated
        await safeRun('processStaminaMessage', processStaminaMessage);
        await safeRun('processRaidSpawnMessage', processRaidSpawnMessage);
        await safeRun('processRaidWishlist', processRaidWishlist);
        await safeRun('processDropMessage', processDropMessage);
        await safeRun('processRarityDrop', processRarityDrop);
        await safeRun('processDropCount', processDropCount);
        await safeRun('processClashMessage', processClashMessage);
        await safeRun('processIconicMessage', processIconicMessage);
        await safeRun('processBossMessage', processBossMessage);
        await safeRun('addIdReaction', addIdReaction);
        
        // Track giveaway tasks
        const { processGiveawayTracking } = require('../systems/giveaway/giveaway-tracker.system');
        await safeRun('processGiveawayTracking', processGiveawayTracking);
    }
};
