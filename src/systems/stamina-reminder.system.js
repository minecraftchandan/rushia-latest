const Reminder = require('../database/reminder.model');
const { sendLog, sendError } = require('../utils/logger');
const { STAMINA } = require('../config/constants');

async function processStaminaMessage(message) {
  if (!message.guild || !message.content.includes("you don't have enough stamina!")) return;

  let userId;

  if (message.interaction?.user?.id) {
    userId = message.interaction.user.id;
  } else if (message.mentions.users.size > 0) {
    userId = message.mentions.users.first().id;
  } else if (message.reference) {
    try {
      const referencedMessage = await message.channel.messages.fetch(message.reference.messageId);
      userId = referencedMessage.author.id;
    } catch (error) {
      // Silent fail
    }
  }

  if (userId) {
    const minutesToRegen = STAMINA.MAX * STAMINA.REGEN_RATE;
    const remindAt = new Date(Date.now() + minutesToRegen * 60 * 1000);

    try {
      await Reminder.upsertReminder({
        userId,
        guildId: message.guild.id,
        channelId: message.channel.id,
        remindAt,
        type: 'stamina',
        reminderMessage: `<@${userId}>, your stamina has reached 10/10 \n use </clash:1472170030228570113>`
      });

      await message.channel.send({
        content: `<@${userId}>, I'll remind you when your stamina is 10/10.`,
      });
      await sendLog('REMINDER_CREATED', { 
        category: 'REMINDER',
        action: 'CREATED',
        type: 'stamina',
        userId, 
        guildId: message.guild.id,
        channelId: message.channel.id,
        remindAt: remindAt.toISOString()
      });
    } catch (error) {
      await sendError('REMINDER_CREATE_FAILED', { 
        category: 'REMINDER',
        action: 'CREATE_FAILED',
        type: 'stamina',
        userId,
        error: error.message
      });
    }
  }
}

module.exports = { processStaminaMessage };
