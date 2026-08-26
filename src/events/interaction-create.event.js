const { Events } = require('discord.js');
const { sendLog, sendError } = require('../utils/logger');
const RateLimiter = require('../optimization/rate.limiter');
const { handlePagination } = require('../systems/cards/card-search.system');


module.exports = {
    name: Events.InteractionCreate,
    async execute(interaction) {
        if (interaction.isCommand()) {
            const command = interaction.client.commands.get(interaction.commandName);
            if (!command) return;

            // Rate limiting check
            if (RateLimiter.isRateLimited(interaction.user.id)) {
                return interaction.reply({ 
                    content: 'You are being rate limited. Please slow down!', 
                    flags: 1 << 6 
                });
            }

            // Log command usage
            await sendLog(`[COMMAND] ${interaction.commandName} used by ${interaction.user.tag} (${interaction.user.id})`, {
                commandName: interaction.commandName,
                userId: interaction.user.id,
                username: interaction.user.tag,
                guildId: interaction.guild?.id,
                guildName: interaction.guild?.name,
                channelId: interaction.channel?.id
            });

            try {
                await command.execute(interaction);
            } catch (error) {
                sendError(`Error executing command ${interaction.commandName}:`, error);
                await sendError(`[COMMAND ERROR] ${interaction.commandName} failed for user ${interaction.user.id}: ${error.message}`, {
                    commandName: interaction.commandName,
                    userId: interaction.user.id,
                    error: error.message,
                    guildId: interaction.guild?.id
                });
                
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({ content: 'There was an error executing this command!', flags: 1 << 6 });
                } else {
                    await interaction.reply({ content: 'There was an error executing this command!', flags: 1 << 6 });
                }
            }
        } else if (interaction.isStringSelectMenu()) {
            try {
                const { handleGawkInteraction } = require('../commands/gawk');
                if (await handleGawkInteraction(interaction)) return;

                const { handleLbSelect, handleResetTypeSelect } = require('../systems/leaderboard/leaderboard.system');
                if (await handleLbSelect(interaction)) return;
                if (interaction.customId.startsWith('reset_type_select_')) {
                    await handleResetTypeSelect(interaction);
                    return;
                }

                const { handleReminderInteraction } = require('../utils/reminder.viewer');
                if (await handleReminderInteraction(interaction)) return;
                const { handleHelpCategory } = require('../commands/help');
                if (await handleHelpCategory(interaction)) return;
            } catch (error) {
                sendError('Error handling string select menu:', error);
            }
        } else if (interaction.isMentionableSelectMenu()) {
            try {
                const raidConfig = require('../commands/raidconfig');
                if (await raidConfig.handleRoleSelect(interaction)) return;
            } catch (error) {
                sendError('Error handling raid role select:', error);
            }
        } else if (interaction.isModalSubmit()) {
           try {
               const raidConfig = require('../commands/raidconfig');
               if (await raidConfig.handleModal(interaction)) return;

               const { handleGawkInteraction } = require('../commands/gawk');
               if (await handleGawkInteraction(interaction)) return;
           } catch (error) {
               sendError('Error handling modal submit:', error);
           }
        } else if (interaction.isButton()) {
            try {
                const { handleRaidSummonButton } = require('../systems/raid/raid-ping.system');
                if (await handleRaidSummonButton(interaction)) return;

                const raidConfig = require('../commands/raidconfig');
                if (await raidConfig.handleButton(interaction)) return;

                const { handleGawkInteraction } = require('../commands/gawk');
                if (await handleGawkInteraction(interaction)) return;
                
                // Config toggle handler
                const { handleConfigToggle } = require('../commands/config');
                if (await handleConfigToggle(interaction)) return;
                
                // Server management system handlers
                const { handleServerViewButton, handlePageButton, handleRefreshButton } = require('../systems/admin/server-management.system');
                if (interaction.customId.startsWith('server_view_')) {
                    await handleServerViewButton(interaction);
                    return;
                }
                if (interaction.customId.startsWith('server_page_')) {
                    await handlePageButton(interaction);
                    return;
                }
                if (interaction.customId.startsWith('refresh_servers_')) {
                    await handleRefreshButton(interaction);
                    return;
                }
                
                const { handleLbPagination, handleResetButton, handleConfirmReset, handleCancelReset } = require('../systems/leaderboard/leaderboard.system');
                if (await handleLbPagination(interaction)) return;
                if (interaction.customId.startsWith('reset_drops_')) {
                    await handleResetButton(interaction);
                    return;
                }
                if (interaction.customId.startsWith('confirm_reset_')) {
                    await handleConfirmReset(interaction);
                    return;
                }
                if (interaction.customId === 'cancel_reset') {
                    await handleCancelReset(interaction);
                    return;
                }
                
                const { handleReminderInteraction } = require('../utils/reminder.viewer');
                if (await handleReminderInteraction(interaction)) return;
                if (await handlePagination(interaction)) return;
                
                // Wishlist pagination handler
                const { handleWishlistPagination } = require('../systems/cards/wishlist.system');
                if (interaction.customId.startsWith('wishlist_next_') || interaction.customId.startsWith('wishlist_prev_')) {
                    await handleWishlistPagination(interaction);
                    return;
                }
            } catch (error) {
                sendError('Error handling button:', error);
            }

        }
    }
};
