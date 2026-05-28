const Reminder = require('../database/reminder.model');

async function createReminderSafe(reminderData) {
  try {
    const result = await Reminder.upsertReminder(reminderData);
    return { success: true, reminder: result };
  } catch (error) {
    if (error.code === 11000) {
      return { success: false, reason: 'duplicate' };
    }
    return { success: false, reason: 'error', error };
  }
}

async function checkExistingReminder(userId, type, cardId = null) {
  const query = { userId, type, status: 'pending' };
  if (cardId) query.cardId = cardId;
  
  return await Reminder.findOne(query).lean().exec();
}

module.exports = { createReminderSafe, checkExistingReminder };
