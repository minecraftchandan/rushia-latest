const Reminder = require('../database/reminder.model');
const { getUserSettings } = require('../utils/user-settings.manager');
const { sendLog, sendError } = require('../utils/logger');
const { SCHEDULER } = require('../config/constants');

async function checkReminders(client) {
  try {
    const dueReminders = await Reminder.getDueReminders(2000, SCHEDULER.BATCH_SIZE);
    if (dueReminders.length === 0) return;

    // Reminders are already atomically claimed inside getDueReminders

    const remindersToProcess = dueReminders.reduce((acc, reminder) => {
      const key = `${reminder.userId}-${reminder.type}`;
      if (!acc[key]) {
        acc[key] = {
          userId: reminder.userId,
          guildId: reminder.guildId,
          channelId: reminder.channelId,
          reminderMessage: reminder.reminderMessage,
          type: reminder.type,
          remindAt: reminder.remindAt,
          reminderIds: [],
        };
      }
      acc[key].reminderIds.push(reminder._id);
      return acc;
    }, {});

    const sendPromises = [];
    const failedReminderIds = []; // Track reminders that fail to send

    for (const key in remindersToProcess) {
      const reminderData = remindersToProcess[key];

      sendPromises.push((async () => {
        try {
          let userSettings = await getUserSettings(reminderData.userId);
          if (!userSettings) {
            const { updateUserSettings } = require('../utils/user-settings.manager');
            userSettings = await updateUserSettings(reminderData.userId, {
              expedition: true,
              stamina: true,
              raid: true,
              drop: true,
              staminaDM: false,
              expeditionDM: false,
              dropDM: false,
              raidSpawnDM: false,
              raidSpawnReminder: true
            });
          }

          const sendReminder = userSettings[reminderData.type] !== false;
          let sendInDm = false;

          if (reminderData.type === 'raid') {
            sendInDm = true;
          } else if (reminderData.type === 'stamina') {
            sendInDm = userSettings?.staminaDM;
          } else if (reminderData.type === 'expedition') {
            sendInDm = userSettings?.expeditionDM;
          } else if (reminderData.type === 'raidSpawn') {
            sendInDm = userSettings?.raidSpawnDM;
          } else if (reminderData.type === 'drop') {
            sendInDm = userSettings?.dropDM;
          }

          if (sendReminder) {
            let sendSuccess = false;
            
            try {
              if (sendInDm) {
                const user = await client.users.fetch(reminderData.userId);
                if (user) {
                  await user.send(reminderData.reminderMessage);
                  sendSuccess = true;
                  await sendLog('REMINDER_SENT', { 
                    category: 'REMINDER',
                    action: 'SENT',
                    type: reminderData.type,
                    userId: reminderData.userId,
                    guildId: reminderData.guildId,
                    method: 'DM'
                  });
                }
              } else {
                const channel = await client.channels.fetch(reminderData.channelId);
                if (channel) {
                  await channel.send(reminderData.reminderMessage);
                  sendSuccess = true;
                  await sendLog('REMINDER_SENT', { 
                    category: 'REMINDER',
                    action: 'SENT',
                    type: reminderData.type,
                    userId: reminderData.userId,
                    guildId: reminderData.guildId,
                    channelId: reminderData.channelId,
                    method: 'CHANNEL'
                  });
                }
              }
            } catch (innerError) {
              sendError(`[REMINDER] Failed to send ${reminderData.type} reminder:`, innerError.message);
              sendSuccess = false;
            }
            
            // Delete immediately after successful send to prevent duplicates
            if (sendSuccess) {
              await Reminder.deleteMany({ _id: { $in: reminderData.reminderIds } });
              sendLog(`[REMINDER] Deleted ${reminderData.reminderIds.length} reminders after successful send`);
            } else {
              // Send failed, revert sent flag for retry on next cycle
              failedReminderIds.push(...reminderData.reminderIds);
              sendLog(`[REMINDER] Marked ${reminderData.reminderIds.length} ${reminderData.type} reminders for retry`);
            }
          } else {
            // User disabled this reminder type, delete it
            await Reminder.deleteMany({ _id: { $in: reminderData.reminderIds } });
            sendLog(`[REMINDER] Deleted ${reminderData.reminderIds.length} disabled ${reminderData.type} reminders`);
          }
        } catch (error) {
          await sendError('REMINDER_SEND_FAILED', { 
            category: 'REMINDER',
            action: 'SEND_FAILED',
            type: reminderData.type,
            userId: reminderData.userId,
            error: error.message
          });
        }
      })());
    }

    await Promise.all(sendPromises);

    // Revert sent flag for failed reminders so they can be retried
    if (failedReminderIds.length > 0) {
      await Reminder.updateMany(
        { _id: { $in: failedReminderIds }, sent: true },
        { $set: { sent: false, sentAt: null } }
      );
      sendLog(`[REMINDER] Reverted ${failedReminderIds.length} failed reminders for retry`);
    }

  } catch (error) {
    await sendError('SCHEDULER_ERROR', { 
      category: 'SYSTEM',
      action: 'SCHEDULER_ERROR',
      error: error.message
    });
  }
}

function startScheduler(client) {
  (function schedule() {
    checkReminders(client).finally(() => setTimeout(schedule, SCHEDULER.CHECK_INTERVAL));
  })();
  sendLog('[SCHEDULER] Reminder scheduler started.', { category: 'SYSTEM' });
}

module.exports = { startScheduler };
