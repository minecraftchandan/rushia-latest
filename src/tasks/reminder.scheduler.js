const Reminder = require('../database/reminder.model');
const ChannelOverride = require('../database/channel-override.model');
const { getUserSettings } = require('../utils/user-settings.manager');
const { SCHEDULER } = require('../config/constants');

let schedulerTimeout = null;

function stopScheduler() {
  if (schedulerTimeout) {
    clearTimeout(schedulerTimeout);
    schedulerTimeout = null;
  }
}

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
          originalChannelId: reminder.channelId
        };
      }
      acc[key].reminderIds.push(reminder._id);
      return acc;
    }, {});

    // Check for user-level overrides for raid reminders
    const userIds = [...new Set(Object.values(remindersToProcess).map(r => r.userId))];
    const overridePromises = userIds.map(userId => ChannelOverride.getActiveOverride(userId));
    const overrides = await Promise.all(overridePromises);
    const overrideMap = new Map();
    
    overrides.forEach((override, index) => {
      if (override) {
        overrideMap.set(userIds[index], override);
      }
    });

    // Apply overrides to raid reminders
    for (const key in remindersToProcess) {
      const reminderData = remindersToProcess[key];
      if (reminderData.type === 'raid' || reminderData.type === 'raidSpawn') {
        const override = overrideMap.get(reminderData.userId);
        if (override) {
          reminderData.effectiveChannelId = override.channelId;
          reminderData.hasOverride = true;
        } else {
          reminderData.effectiveChannelId = reminderData.channelId;
          reminderData.hasOverride = false;
        }
      } else {
        reminderData.effectiveChannelId = reminderData.channelId;
        reminderData.hasOverride = false;
      }
    }

    const sendPromises = [];
    const failedReminderIds = [];
    const sentReminderIds = [];

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

          // If settings still null (DB failure), default to sending so reminders aren't lost
          if (!userSettings) {
            userSettings = {
              expedition: true, stamina: true, raid: true, drop: true,
              raidSpawnReminder: true, staminaDM: false, expeditionDM: false,
              dropDM: false, raidSpawnDM: false
            };
          }

          const sendReminder = userSettings[reminderData.type] !== false;
          let sendInDm = false;
          // raidSpawnReminder is the settings key for raidSpawn type
          const effectiveSendReminder = reminderData.type === 'raidSpawn'
            ? userSettings.raidSpawnReminder !== false
            : sendReminder;

          if (reminderData.type === 'raid') {
            // If user has active channel override, don't send to DM
            sendInDm = !reminderData.hasOverride;
          } else if (reminderData.type === 'stamina') {
            sendInDm = userSettings?.staminaDM;
          } else if (reminderData.type === 'expedition') {
            sendInDm = userSettings?.expeditionDM;
          } else if (reminderData.type === 'raidSpawn') {
            sendInDm = userSettings?.raidSpawnDM;
          } else if (reminderData.type === 'drop') {
            sendInDm = userSettings?.dropDM;
          }

          if (effectiveSendReminder) {
            let sendSuccess = false;
            
            try {
              if (sendInDm) {
                const user = await client.users.fetch(reminderData.userId);
                if (user) {
                  await user.send(reminderData.reminderMessage);
                  sendSuccess = true;
                }
              } else {
                const channel = await client.channels.fetch(reminderData.effectiveChannelId);
                if (channel) {
                  const guild = channel.guild;
                  await channel.send(reminderData.reminderMessage);
                  sendSuccess = true;
                }
              }
            } catch (innerError) {
              sendSuccess = false;
            }
            
            if (sendSuccess) {
              await Reminder.markAsSent(reminderData.reminderIds);
              sentReminderIds.push(...reminderData.reminderIds);
            } else {
              failedReminderIds.push(...reminderData.reminderIds);
            }
          } else {
            await Reminder.deleteMany({ _id: { $in: reminderData.reminderIds } });
          }
        } catch (error) {
          // Silent fail - don't spam logs
        }
      })());
    }

    await Promise.all(sendPromises);

    if (failedReminderIds.length > 0) {
      const safeToRevert = failedReminderIds.filter(id => !sentReminderIds.some(s => s.equals(id)));
      if (safeToRevert.length > 0) {
        await Reminder.revertClaimed(safeToRevert);
      }
    }

  } catch (error) {
    // Silent - don't spam logs
  }
}

function startScheduler(client) {
  stopScheduler();
  
  (function schedule() {
    schedulerTimeout = setTimeout(() => {
      checkReminders(client).catch(() => {}); // Silent error handling
      schedule();
    }, SCHEDULER.CHECK_INTERVAL);
  })();
  // Silent start - no log
}

module.exports = { startScheduler, stopScheduler };
