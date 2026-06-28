const giveawaySystem = require('../systems/giveaway.system');
const { sendLog, sendError } = require('../utils/logger');
const { LUVI_BOT_ID } = require('../config/constants');

async function processGiveawayTracking(message) {
  if (message.author.id !== LUVI_BOT_ID) return;

  try {
    const guildId = message.guild.id;
    
    // Check if there is a giveaway config enabled in this guild
    const serverConfig = await giveawaySystem.getServerConfig(guildId);
    const hasEnabledTasks = Object.values(serverConfig?.tasks || {}).some(
      (task) => task && task.enabled
    );
    if (!hasEnabledTasks) return;

    // Detect task type and extract user info
    const taskInfo = await detectTaskType(message);
    if (!taskInfo) return;

    const { taskType, userId, username } = taskInfo;

    // Track the task
    const result = await giveawaySystem.trackTask(guildId, userId, username, taskType, message.client);
    
    if (result && result.completed) {
      sendLog(`User ${username} (${userId}) completed ${taskType} giveaway task in guild ${guildId}`);
    }
  } catch (error) {
    sendError('Error processing giveaway tracking:', error);
  }
}

async function detectTaskType(message) {
  // Check for Card Drop (embed)
  if (message.embeds.length > 0) {
    const embed = message.embeds[0];
    
    // Drop detection
    if (embed.title && embed.title.includes('Card Dropped')) {
      const footer = embed.footer || embed.data?.footer;
      if (footer && footer.text) {
        const claimedMatch = footer.text.match(/Claimed by (.+)/);
        if (claimedMatch) {
          const username = claimedMatch[1];
          const avatarUrl = footer.iconURL || footer.icon_url;
          const footerUserId = avatarUrl?.match(/avatars\/(\d+)\//)?.[1];
          const userId = message.interaction?.user?.id || message.mentions.users.first()?.id || footerUserId;
          if (userId) {
            return { taskType: 'drop', userId, username };
          }
        }
      }
    }
    
    // Daily Quests detection
    if (embed.title && embed.title.includes('Daily Quests')) {
      const description = embed.description;
      if (description) {
        const userMatch = description.match(/\*\*(.+?)'s\*\* daily quest progress/);
        if (userMatch) {
          const username = userMatch[1];
          let userId = message.interaction?.user?.id || message.mentions.users.first()?.id;
          if (!userId) {
            userId = await findGuildUserIdByUsername(message.guild, username);
          }
          if (userId) {
            const fieldsCompleted = embed.fields?.filter(f => f.value && f.value.includes('COMPLETED')).length || 0;
            if (fieldsCompleted >= 3) {
              return { taskType: 'daily_quests', userId, username };
            }
          }
        }
      }
    }
  }
  
  // Check for Clash Battle (text message)
  if (message.content) {
    const clashMatch = message.content.match(/<@(\d+)>, your clash battle has ended! You defeated \*\*(.+?)\*\*/);
    if (clashMatch) {
      const userId = clashMatch[1];
      const defeatedName = clashMatch[2];
      let username = 'User';
      try {
        const user = await message.client.users.fetch(userId);
        if (user) username = user.username;
      } catch {
        username = 'Unknown';
      }
      return { taskType: 'clash', userId, username };
    }
  }
  
  return null;
}

async function findGuildUserIdByUsername(guild, username) {
  if (!guild || !username) return null;
  const normalized = username.toLowerCase();

  const exactMember = guild.members.cache.find((member) => {
    const userName = member.user.username?.toLowerCase();
    const displayName = member.displayName?.toLowerCase();
    return userName === normalized || displayName === normalized;
  });

  if (exactMember) {
    return exactMember.id;
  }

  try {
    const fetched = await guild.members.fetch({ query: username, limit: 15 });
    const exactFetched = fetched.find((member) => {
      const userName = member.user.username?.toLowerCase();
      const displayName = member.displayName?.toLowerCase();
      return userName === normalized || displayName === normalized;
    });
    if (exactFetched) return exactFetched.id;

    const partialFetched = fetched.find((member) => {
      const userName = member.user.username?.toLowerCase();
      const displayName = member.displayName?.toLowerCase();
      return userName?.includes(normalized) || displayName?.includes(normalized);
    });
    return partialFetched?.id || null;
  } catch (error) {
    sendError('Error resolving daily quest username to user ID:', error);
    return null;
  }
}

module.exports = { processGiveawayTracking };
