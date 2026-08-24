const Reminder = require('../../database/reminder.model');
const { logInfo, logError } = require('../../utils/logger');
const { checkExistingReminder, createReminderSafe } = require('../../utils/reminder-duplicate.checker');

const LUVI_ID = '1269481871021047891';

// Track pending spawn attempts: channelId -> { userId, expiresAt }
const pendingSpawns = new Map();
const PENDING_TTL = 15000; // 15 seconds for Luvi to respond

function trackSpawnAttempt(channelId, userId) {
  pendingSpawns.set(channelId, { userId, expiresAt: Date.now() + PENDING_TTL });
  setTimeout(() => {
    const entry = pendingSpawns.get(channelId);
    if (entry && entry.userId === userId) pendingSpawns.delete(channelId);
  }, PENDING_TTL);
}

async function processUserSpawnCommand(message) {
  if (!message?.author || message.author.bot) return;
  // Match: @Luvi raid spawn [1-4]
  if (!message.mentions?.users?.has(LUVI_ID)) return;
  if (!/raid\s+spawn\s+[1-4]/i.test(message.content)) return;
  trackSpawnAttempt(message.channel.id, message.author.id);
}

async function detectAndSetRaidSpawnReminder(message) {
  const guildId = message?.guild?.id ?? message?.guildId;
  if (!guildId || !message?.author || message.author.id !== LUVI_ID) return;
  const messageAgeMs = message.createdTimestamp ? Date.now() - message.createdTimestamp : 0;
  if (messageAgeMs > 30 * 24 * 60 * 60 * 1000) return;
  if (!message.embeds?.length) return;

  const embed = message.embeds[0];
  if (!embed.title?.includes('Raid Spawned')) return;

  // Try interaction metadata first (slash command)
  let userId = message.interactionMetadata?.user?.id || message.interaction?.user?.id;

  // Fallback: check pending text command in this channel
  if (!userId) {
    const pending = pendingSpawns.get(message.channel.id);
    if (pending && Date.now() < pending.expiresAt) {
      userId = pending.userId;
    }
  }

  if (!userId) return;
  pendingSpawns.delete(message.channel.id);

  const existingReminder = await checkExistingReminder(userId, 'raidSpawn');
  if (existingReminder) return;

  const remindAt = new Date(Date.now() + 30 * 60 * 1000);

  const result = await createReminderSafe({
    userId,
    guildId,
    channelId: message.channel.id,
    remindAt,
    type: 'raidSpawn',
    reminderMessage: `<@${userId}>, You can now use </raid spawn:1472170030723764364> to spawn a new raid boss!`
  });

  if (result.success) {
    await logInfo('REMINDER_CREATED', {
      category: 'REMINDER',
      action: 'CREATED',
      type: 'raidSpawn',
      userId,
      guildId,
      channelId: message.channel.id,
      remindAt: remindAt.toISOString()
    });
  } else if (result.reason !== 'duplicate') {
    await logError('REMINDER_CREATE_FAILED', {
      category: 'REMINDER',
      action: 'CREATE_FAILED',
      type: 'raidSpawn',
      userId,
      guildId,
      guildName: message.guild?.name,
      error: result.error.message
    });
  }
}

async function resolveRaidSpawnUserId(message) {
  if (!message) return null;
  // Prefer interaction metadata (slash command) when available
  let userId = message.interactionMetadata?.user?.id || message.interaction?.user?.id;

  // Fallback: check pending manual spawn recorded for this channel
  if (!userId && message.channel?.id) {
    const pending = pendingSpawns.get(message.channel.id);
    if (pending && Date.now() < pending.expiresAt) {
      userId = pending.userId;
    }
  }

  // Final fallback: some exported Discord payloads preserve the user in message.author
  // when the guild object is stripped during debugging or JSON export.
  if (!userId && message.author?.id) {
    userId = message.author.id;
  }

  return userId || null;
}

module.exports = { processRaidSpawnMessage: detectAndSetRaidSpawnReminder, processUserSpawnCommand, resolveRaidSpawnUserId };
