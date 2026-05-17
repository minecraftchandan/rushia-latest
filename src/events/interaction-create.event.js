const { Events } = require('discord.js');
const Reminder = require('../database/reminder.model');
const { sendLog, sendError } = require('../utils/logger');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const RateLimiter = require('../optimization/rate.limiter');
const {
  handleNameSelect,
  handleAddName,
  handleRemoveName,
  handleNextSection,
  handleSelectField,
  handleSelectFieldValue,
  handleFinishGenerator
} = require('../systems/message-generator.system');
const { handlePagination } = require('../systems/card-search.system');


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
                const { handleReminderInteraction } = require('../utils/reminder.viewer');
                if (await handleReminderInteraction(interaction)) return;
                const { handleHelpCategory } = require('../commands/help');
                if (await handleHelpCategory(interaction)) return;
                if (await handleNameSelect(interaction)) return;
                if (await handleSelectField(interaction)) return;
                if (await handleSelectFieldValue(interaction)) return;

                if (interaction.customId.startsWith('reset_type_select_')) {
                    const { handleResetTypeSelect } = require('../systems/leaderboard.system');
                    await handleResetTypeSelect(interaction);
                    return;
                }
                
                // Test simulator select menu handler
                if (interaction.customId === 'test_select') {
                    const TEST_OPTIONS = {
                      'raid-wishlist-ping': { label: '🎯 Raid Wishlist Ping', fn: require('../utils/test.simulator').testRaidWishlistPing },
                      'boss-tier-ping': { label: '👹 Boss Tier Ping', fn: require('../utils/test.simulator').testBossTierPing },
                      'card-search': { label: '🔍 Card Search', fn: require('../utils/test.simulator').testCardSearch },
                      'wishlist-view': { label: '📋 Wishlist View', fn: require('../utils/test.simulator').testWishlistView },
                      'database-connection': { label: '🗄️ Database Connection', fn: require('../utils/test.simulator').testDatabaseConnection },
                      'cache-performance': { label: '⚡ Cache Performance', fn: require('../utils/test.simulator').testCachePerformance }
                    };
                    
                    const testKey = interaction.values[0];
                    const test = TEST_OPTIONS[testKey];
                    const { EmbedBuilder } = require('discord.js');
                    const { createResultEmbed } = require('../utils/test.simulator');
                    
                    if (!test) {
                      return interaction.reply({ content: '❌ Test not found.', ephemeral: true });
                    }
                    
                    await interaction.deferReply({ ephemeral: true });
                    
                    const runningEmbed = new EmbedBuilder()
                      .setColor(0x0099ff)
                      .setTitle(`🔄 ${test.label}`)
                      .setDescription('Running test (2 iterations in progress)...')
                      .addFields({ name: 'Status', value: '⏳ Please wait...', inline: false });
                    
                    await interaction.editReply({ embeds: [runningEmbed], ephemeral: true });
                    
                    try {
                      sendLog(`[TEST] Starting: ${test.label}`);
                      const startTime = Date.now();
                      
                      // For raid wishlist ping, pass the user ID and send a ping message
                      let result;
                      if (testKey === 'raid-wishlist-ping') {
                        // Send ping message first to test if it reaches the user
                        await interaction.channel.send(`${interaction.user} 📍 **Testing Raid Wishlist Ping** - Simulating raid detection and ping system...`).catch(() => {});
                        
                        // Run the test with user's actual wishlist
                        result = await test.fn(interaction.user.id);
                        
                        // Send another ping message to show test completed
                        await interaction.channel.send(`${interaction.user} ✅ **Raid Wishlist Test Complete** - Check results below.`).catch(() => {});
                      } else {
                        result = await test.fn();
                      }
                      
                      const totalTime = Date.now() - startTime;
                      
                      const resultEmbed = createResultEmbed(result);
                      resultEmbed.addFields({ name: '⏱️ Test Execution Time', value: `${totalTime}ms`, inline: true });
                      resultEmbed.setTimestamp();
                      
                      return interaction.editReply({ embeds: [resultEmbed], ephemeral: true });
                    } catch (error) {
                      sendError(`[TEST ERROR] ${test.label}:`, error);
                      const errorEmbed = new EmbedBuilder()
                        .setColor(0xaa0000)
                        .setTitle(`❌ ${test.label} Failed`)
                        .addFields({ name: 'Error', value: `\`\`\`${error.message}\`\`\`` })
                        .setTimestamp();
                      
                      return interaction.editReply({ embeds: [errorEmbed], ephemeral: true });
                    }
                }
            } catch (error) {
                sendError('Error handling string select menu:', error);
            }
        } else if (interaction.isButton()) {
            try {
                // Config toggle handler
                const { handleConfigToggle } = require('../commands/config');
                if (await handleConfigToggle(interaction)) return;
                
                // Server management system handlers
                const { handleServerViewButton, handlePageButton, handleRefreshButton } = require('../systems/server-management.system');
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
                
                const { handleRarityButton, handleClashButton, handleBackButton, handleResetButton, handleResetTypeSelect, handleConfirmReset, handleCancelReset, handleRlbPagination } = require('../systems/leaderboard.system');
                if (interaction.customId.startsWith('rlb_')) {
                    await handleRlbPagination(interaction);
                    return;
                }
                if (interaction.customId.startsWith('view_clash_lb_')) {
                    await handleClashButton(interaction);
                    return;
                }
                if (interaction.customId.startsWith('view_rarity_drops_')) {
                    await handleRarityButton(interaction);
                    return;
                }
                if (interaction.customId.startsWith('back_to_drops_')) {
                    await handleBackButton(interaction);
                    return;
                }
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
                if (await handleAddName(interaction)) return;
                if (await handleRemoveName(interaction)) return;
                if (await handleNextSection(interaction)) return;
                if (await handleFinishGenerator(interaction)) return;
                if (await handlePagination(interaction)) return;
                
                // Wishlist pagination handler
                const { handleWishlistPagination } = require('../systems/wishlist.system');
                if (interaction.customId.startsWith('wishlist_next_') || interaction.customId.startsWith('wishlist_prev_')) {
                    await handleWishlistPagination(interaction);
                    return;
                }
            } catch (error) {
                sendError('Error handling button:', error);
            }

            const { customId, user, channel, message } = interaction;

            if (customId.startsWith('stamina_')) {
                const mentionedUserIdMatch = message.content.match(/<@(\d+)>/);
                const mentionedUserId = mentionedUserIdMatch ? mentionedUserIdMatch[1] : null;

                if (mentionedUserId && user.id !== mentionedUserId) {
                    return interaction.reply({ content: "You can't interact with this button.", flags: 1 << 6 });
                }

                await interaction.deferReply({ flags: 1 << 6 });

                const percentage = parseInt(customId.split('_')[1], 10);
                const maxStamina = 50;
                const staminaToRegen = (maxStamina * percentage) / 100;
                const minutesToRegen = staminaToRegen * 2;
                const remindAt = new Date(Date.now() + minutesToRegen * 60 * 1000);

                try {
                    const existingReminder = await Reminder.findOne({ userId: user.id, type: 'stamina' });
                    let confirmationMessage = `You will be reminded when your stamina reaches ${percentage}%.`;

                    if (existingReminder) {
                        await Reminder.deleteOne({ _id: existingReminder._id });
                        confirmationMessage = `Your previous stamina reminder was overwritten. You will now be reminded when when your stamina reaches ${percentage}%.`;
                    } else {
                        confirmationMessage = `You will be reminded when your stamina reaches ${percentage}%.`;
                    }

                    await Reminder.create({
                        userId: user.id,
                        channelId: channel.id,
                        remindAt,
                        type: 'stamina',
                        reminderMessage: `<@${user.id}>, your stamina has regenerated to ${percentage}%!\n-# you can configure your notifications via /notifications set/view`
                    });

                    await interaction.editReply({ content: confirmationMessage });

                    const originalMessage = interaction.message;
                    const disabledRow = new ActionRowBuilder()
                        .addComponents(
                            new ButtonBuilder().setCustomId('stamina_25').setLabel('Remind at 25% Stamina').setStyle(ButtonStyle.Primary).setDisabled(true),
                            new ButtonBuilder().setCustomId('stamina_50').setLabel('Remind at 50% Stamina').setStyle(ButtonStyle.Primary).setDisabled(true),
                            new ButtonBuilder().setCustomId('stamina_100').setLabel('Remind at 100% Stamina').setStyle(ButtonStyle.Primary).setDisabled(true),
                        );
                    await originalMessage.edit({ components: [disabledRow] });
                } catch (error) {
                    sendError(`[ERROR] Failed to create stamina reminder: ${error.message}`, error);
                    await sendError(`[ERROR] Failed to create stamina reminder: ${error.message}`);
                    await interaction.editReply({ content: 'Sorry, there was an error setting your reminder.' });
                }
            }
        }
    }
};
