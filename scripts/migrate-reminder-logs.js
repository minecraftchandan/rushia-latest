require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

// Schema matches logger.js
const logSchema = new mongoose.Schema({
  level: { type: String },
  message: { type: String },
  timestamp: { type: Date },
  guildId: { type: String },
  userId: { type: String },
  channelId: { type: String },
  metadata: { type: Object },
}, { strict: false, collection: 'logs' });

async function migrate() {
  const conn = await mongoose.createConnection(process.env.LOGS_URI).asPromise();
  const Log = conn.model('Log', logSchema);

  // Old format: message was a plain string like "[REMINDER] Failed to send stamina reminder:"
  // metadata had no structured fields
  const oldLogs = await Log.find({
    level: 'ERROR',
    message: { $regex: /^\[REMINDER\] Failed to send/ }
  }).lean();

  console.log(`Found ${oldLogs.length} old REMINDER_SEND_FAILED logs to migrate`);
  if (oldLogs.length === 0) {
    await conn.close();
    return;
  }

  let migrated = 0;
  for (const log of oldLogs) {
    // Parse type from old message string e.g. "[REMINDER] Failed to send stamina reminder:"
    const typeMatch = log.message?.match(/Failed to send (\w+) reminder/);
    const type = typeMatch?.[1] || 'unknown';

    await Log.updateOne(
      { _id: log._id },
      {
        $set: {
          message: 'REMINDER_SEND_FAILED',
          metadata: {
            category: 'REMINDER',
            action: 'SEND_FAILED',
            type,
            userId: log.userId || log.metadata?.userId || null,
            guildId: log.guildId || log.metadata?.guildId || null,
            channelId: log.channelId || log.metadata?.channelId || null,
            method: log.metadata?.method || null,
            error: log.metadata?.error || log.message || null,
          }
        }
      }
    );
    migrated++;
  }

  console.log(`Migrated ${migrated} logs to new format`);
  await conn.close();
}

migrate().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
