const { Events } = require('discord.js');
const { processBossMessage } = require('../systems/tierPingSystem');
const { processStaminaMessage } = require('../systems/staminaReminderSystem');
const { processExpeditionMessage } = require('../systems/expeditionReminderSystem');
const { processRaidMessage } = require('../systems/raidReminderSystem');
const { processRaidSpawnMessage } = require('../systems/raidSpawnReminderSystem');
const { processRaidWishlist } = require('../systems/raidWishlistSystem');
const { processDropMessage } = require('../systems/dropSystem');
const { processRarityDrop } = require('../systems/rarityDropSystem');
const { processDropCount } = require('../systems/dropCountSystem');
const { processInventoryMessage: processGeneratorMessage } = require('../systems/messageGeneratorSystem');
const { LUVI_BOT_ID } = require('../config/constants');

module.exports = {
    name: Events.MessageCreate,
    async execute(message) {
        const client = message.client;

        // Handle bot mentions for card search and logs
        if (!message.author.bot && message.mentions.has(client.user)) {
            const content = message.content.replace(`<@${client.user.id}>`, '').trim();
            
            // Wishlist add command: @Bot wa name or @Bot wa name1,name2,name3
            const waMatch = content.match(/^wa\s+(.+)$/i);
            if (waMatch) {
                const { handleWishlistAdd } = require('../systems/wishlistSystem');
                await handleWishlistAdd(message, waMatch[1]);
                return;
            }
            
            // Wishlist view command: @Bot wl or @Bot wl @user or @Bot wl userId
            const wlMatch = content.match(/^wl(?:\s+(?:<@!?(\d+)>|(\d+)))?$/i);
            if (wlMatch) {
                const { handleWishlistView } = require('../systems/wishlistSystem');
                const targetId = wlMatch[1] || wlMatch[2];
                const targetUser = targetId ? await client.users.fetch(targetId).catch(() => null) : null;
                await handleWishlistView(message, targetUser);
                return;
            }
            
            // Wishlist remove command: @Bot wr name or @Bot wr name1,name2,name3
            const wrMatch = content.match(/^wr\s+(.+)$/i);
            if (wrMatch) {
                const { handleWishlistRemove } = require('../systems/wishlistSystem');
                await handleWishlistRemove(message, wrMatch[1]);
                return;
            }
            
            if (content.match(/^help$/i)) {
                const { handleHelpCommand } = require('../commands/help');
                await handleHelpCommand(message);
                return;
            }
            
            if (content.match(/^logs$/i)) {
                const { handleLogsCommand } = require('../commands/logs');
                await handleLogsCommand(message);
                return;
            }
            
            if (content.match(/^perms$/i)) {
                const { handlePermsCheck } = require('../utils/permsChecker');
                await handlePermsCheck(message);
                return;
            }
            
            if (content.match(/^stats$/i)) {
                const { handleStatsCommand } = require('../systems/healthWebhookSystem');
                await handleStatsCommand(message);
                return;
            }
            
            if (content.match(/^rem(?:\s|$)/i)) {
                const { handleReminderView } = require('../utils/reminderViewer');
                const args = content.toLowerCase().replace(/^rem\s*/i, '').trim();
                const filter = args || null;
                await handleReminderView(message, filter);
                return;
            }
            
            if (content.match(/^nv(?:\s|$)/i)) {
                const { handleNotificationViewCommand } = require('../systems/userNotificationSystem');
                await handleNotificationViewCommand(message);
                return;
            }
            
            if (content.match(/^(?:servers|guilds)$/i)) {
                const { handleServerListCommand } = require('../systems/serverManagementSystem');
                await handleServerListCommand(message);
                return;
            }
            
            // Handle info command with server ID
            const infoMatch = content.match(/^(info|i|in|inf)\s+(\d+)$/i);
            if (infoMatch) {
                const { handleServerInfoCommand } = require('../systems/serverManagementSystem');
                await handleServerInfoCommand(message, infoMatch[2]);
                return;
            }
            
            if (content.match(/^(?:rlb|lb)$/i)) {
                const { handleRlbCommand } = require('../systems/rlbSystem');
                await handleRlbCommand(message);
                return;
            }
            
            // Test command: @bot test
            if (content.match(/^test$/i)) {
                const { handleTestCommand } = require('../utils/testSimulator');
                await handleTestCommand(message);
                return;
            }
            
            // Role delay command: @bot delay [roleId] [time] or @bot d [roleId] [time]
            const delayMatch = content.match(/^d(?:elay)?\s+(.+)$/i);
            if (delayMatch) {
                const { handleRoleDelay } = require('../utils/roleDelayManager');
                const args = delayMatch[1].split(/\s+/);
                await handleRoleDelay(message, args);
                return;
            }
            
            // View role delays: @bot delays or @bot viewdelays
            if (content.match(/^(?:delays|viewdelays)$/i)) {
                const { handleViewDelays } = require('../utils/roleDelayManager');
                await handleViewDelays(message);
                return;
            }
            
            const match = content.match(/^(f|find)\s+(.+)$/i);
            if (match) {
                const cardSearch = require('../systems/cardSearchSystem');
                await cardSearch.handleSearch(message, match[2]);
                return;
            }
        }
        
        // Handle prefix commands (r prefix without @Bot mention)
        if (!message.author.bot && message.content.toLowerCase().startsWith('r')) {
            const args = message.content.slice(1).trim().split(/\s+/);
            const command = args[0]?.toLowerCase();
            
            // Wishlist commands
            if (command === 'wa' && args[1]) {
                const { handleWishlistAdd } = require('../systems/wishlistSystem');
                await handleWishlistAdd(message, args.slice(1).join(' '));
                return;
            }
            
            if (command === 'wl') {
                const { handleWishlistView } = require('../systems/wishlistSystem');
                const targetId = args[1]?.replace(/[<@!>]/g, '');
                const targetUser = targetId ? await client.users.fetch(targetId).catch(() => null) : null;
                await handleWishlistView(message, targetUser);
                return;
            }
            
            if (command === 'wr' && args[1]) {
                const { handleWishlistRemove } = require('../systems/wishlistSystem');
                await handleWishlistRemove(message, args.slice(1).join(' '));
                return;
            }
            
            // Information commands
            if (command === 'help') {
                const { handleHelpCommand } = require('../commands/help');
                await handleHelpCommand(message);
                return;
            }
            
            if (command === 'logs') {
                const { handleLogsCommand } = require('../commands/logs');
                await handleLogsCommand(message);
                return;
            }
            
            if (command === 'perms') {
                const { handlePermsCheck } = require('../utils/permsChecker');
                await handlePermsCheck(message);
                return;
            }
            
            if (command === 'stats') {
                const { handleStatsCommand } = require('../systems/healthWebhookSystem');
                await handleStatsCommand(message);
                return;
            }
            
            if (command === 'rem') {
                const { handleReminderView } = require('../utils/reminderViewer');
                const filter = args[1] || null;
                await handleReminderView(message, filter);
                return;
            }
            
            if (command === 'nv') {
                const { handleNotificationViewCommand } = require('../systems/userNotificationSystem');
                await handleNotificationViewCommand(message);
                return;
            }
            
            // Server management
            if (command === 'servers' || command === 'guilds') {
                const { handleServerListCommand } = require('../systems/serverManagementSystem');
                await handleServerListCommand(message);
                return;
            }
            
            if ((command === 'info' || command === 'i' || command === 'in' || command === 'inf') && args[1]) {
                const { handleServerInfoCommand } = require('../systems/serverManagementSystem');
                await handleServerInfoCommand(message, args[1]);
                return;
            }
            
            // Leaderboard
            if (command === 'lb' || command === 'rlb') {
                const { handleRlbCommand } = require('../systems/rlbSystem');
                await handleRlbCommand(message);
                return;
            }
            
            // Test
            if (command === 'test') {
                const { handleTestCommand } = require('../utils/testSimulator');
                await handleTestCommand(message);
                return;
            }
            
            // Role delays
            if ((command === 'delay' || command === 'd') && args[1]) {
                const { handleRoleDelay } = require('../utils/roleDelayManager');
                await handleRoleDelay(message, args.slice(1));
                return;
            }
            
            if (command === 'delays' || command === 'viewdelays') {
                const { handleViewDelays } = require('../utils/roleDelayManager');
                await handleViewDelays(message);
                return;
            }
            
            // Card search
            if ((command === 'f' || command === 'find') && args[1]) {
                const cardSearch = require('../systems/cardSearchSystem');
                await cardSearch.handleSearch(message, args.slice(1).join(' '));
                return;
            }
        }
        
        // Handle card search number selection
        if (!message.author.bot && message.content.match(/^\d+$/)) {
            const { handleWishlistSelection } = require('../systems/wishlistSystem');
            const handled = await handleWishlistSelection(message, message.content);
            if (handled) return;
            
            const cardSearch = require('../systems/cardSearchSystem');
            const searchHandled = await cardSearch.handleSelection(message);
            if (searchHandled) return;
        }

        // Only process Luvi bot messages for game notifications
        if (message.author.id !== LUVI_BOT_ID) return;

        await processStaminaMessage(message);
        await processExpeditionMessage(message);
        await processRaidMessage(message);
        await processRaidSpawnMessage(message);
        await processRaidWishlist(message);
        await processDropMessage(message);
        await processRarityDrop(message);
        await processDropCount(message);
        await processBossMessage(message);
        await processGeneratorMessage(message);
    }
};
