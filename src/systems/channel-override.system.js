const ChannelOverride = require('../database/channel-override.model');

// Cleanup expired overrides every 5 minutes
setInterval(async () => {
  try {
    const expiredUserIds = await ChannelOverride.cleanupExpired();
    
    for (const userId of expiredUserIds) {
      await notifyExpiration(userId).catch(err => 
        console.error('Failed to notify expiration:', err)
      );
    }
  } catch (error) {
    console.error('Failed to clear expired overrides:', error);
  }
}, 5 * 60 * 1000);

async function notifyExpiration(userId) {
  try {
    const { client } = require('../../index');
    if (!client) return;
    
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) return;

    await user.send({
      content: `⏰ Your **@bot here** session has expired. Raid reminders will now be sent to the normal raid channel.\n\nUse \`@bot here\` again in your preferred channel to set a new 2-hour session.`
    }).catch(() => {});
  } catch (error) {
    // Silent
  }
}

async function handleHereCommand(message) {
  const userId = message.author.id;
  const channelId = message.channel.id;
  const guildId = message.guild.id;
  const expiresAt = new Date(Date.now() + (2 * 60 * 60 * 1000)); // 2 hours

  try {
    // Check if user already has an active override
    const existingOverride = await ChannelOverride.getActiveOverride(userId);

    if (existingOverride) {
      // User already has active override
      const currentExpiresAt = new Date(existingOverride.expiresAt);
      const minutesLeft = Math.floor((currentExpiresAt - new Date()) / 1000 / 60);
      const expiryTime = Math.floor(currentExpiresAt.getTime() / 1000);
      
      const reply = await message.reply({
        content: `⚠️ You already have an active channel override!\n\n📍 Current override channel: <#${existingOverride.channelId}>\n⏰ Expires: <t:${expiryTime}:R> (${minutesLeft} minutes left)\n\n💡 **Tip:** Wait for it to expire or attack a raid - new reminders will use this override automatically.`
      });

      // Delete after 10 seconds
      setTimeout(() => {
        reply.delete().catch(() => {});
        message.delete().catch(() => {});
      }, 10000);
      
      return;
    }

    // Set the override at user level
    await ChannelOverride.setOverride(userId, channelId, guildId, expiresAt);
    
    const expiryTime = Math.floor(expiresAt.getTime() / 1000);

    const reply = await message.reply({
      content: `✅ Raid reminders will now be sent to this channel for the next 2 hours!\n\n⏰ Expires: <t:${expiryTime}:R> (<t:${expiryTime}:f>)\n\n💡 **Note:** This only affects YOUR raid reminders. Other users' reminders work normally.\n\n-# ⚠️ All new raid reminders in the next 2 hours will automatically use this channel.`
    });

    // Delete after 10 seconds
    setTimeout(() => {
      reply.delete().catch(() => {});
      message.delete().catch(() => {});
    }, 10000);
  } catch (error) {
    const reply = await message.reply('❌ Failed to set channel override. Please try again.');
    
    // Delete after 10 seconds
    setTimeout(() => {
      reply.delete().catch(() => {});
      message.delete().catch(() => {});
    }, 10000);
  }
}

module.exports = {
  handleHereCommand
};
