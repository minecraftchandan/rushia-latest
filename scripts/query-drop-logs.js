require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

async function queryDropLogs() {
  const conn = await mongoose.createConnection(process.env.LOGS_URI).asPromise();
  const Log = conn.model('Log', new mongoose.Schema({
    level: String,
    message: String,
    timestamp: Date,
    userId: String,
    guildId: String,
    channelId: String,
    metadata: Object,
  }, { strict: false, collection: 'logs' }));

  const since = new Date(Date.now() - 24 * 60 * 60 * 1000); // last 24 hours

  const logs = await Log.find({
    timestamp: { $gte: since },
    $or: [
      { message: 'REMINDER_SEND_FAILED', 'metadata.type': 'drop' },
      { message: 'REMINDER_CREATED', 'metadata.type': 'drop' },
      { message: 'REMINDER_SENT', 'metadata.type': 'drop' },
      { message: 'REMINDER_CREATE_FAILED', 'metadata.type': 'drop' },
    ]
  }).sort({ timestamp: -1 }).limit(50);

  if (logs.length === 0) {
    console.log('No drop reminder logs in the last 24 hours.');
  } else {
    logs.forEach(l => {
      console.log(`[${l.timestamp.toISOString()}] [${l.level}] ${l.message} | userId:${l.metadata?.userId || l.userId} | error:${l.metadata?.error || 'none'}`);
    });
  }

  await conn.close();
}

queryDropLogs().catch(err => {
  console.error(err);
  process.exit(1);
});
