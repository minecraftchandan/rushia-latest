const mongoose = require('mongoose');
const { v4: uuidv4 } = require('uuid');

let Log = null;
let logsConnection = null;

const pendingLogs = [];
const MAX_PENDING_LOGS = 1000;

// Log Schema with comprehensive fields
const logSchema = new mongoose.Schema({
  // Unique identifier for tracing
  correlationId: { type: String, required: true, index: true },
  
  // Log level
  level: { 
    type: String, 
    required: true, 
    enum: ['CRITICAL', 'ERROR', 'WARN', 'INFO', 'DEBUG'],
    index: true
  },
  
  // Main message
  message: { type: String, required: true },
  
  // Error stack trace (for ERROR and CRITICAL logs)
  stackTrace: { type: String },
  
  // Timing
  timestamp: { type: Date, default: Date.now, index: true },
  executionTimeMs: { type: Number }, // milliseconds taken to complete operation
  
  // Context identifiers
  guildId: { type: String, index: true },
  userId: { type: String, index: true },
  channelId: { type: String },
  
  // Operation details
  operation: { type: String }, // e.g., 'REMINDER_SEND', 'SETTINGS_UPDATE', 'COMMAND_EXECUTE'
  action: { type: String }, // e.g., 'CREATED', 'FAILED', 'SENT', 'UPDATED'
  
  // State tracking for data operations
  beforeState: { type: Object }, // previous value
  afterState: { type: Object },  // new value
  
  // Related IDs for tracing
  reminderId: { type: String },
  commandName: { type: String },
  eventName: { type: String },
  
  // Additional metadata
  metadata: { type: Object },
  
  // Error information (for failures)
  errorCode: { type: String },
  errorMessage: { type: String },
  
  // Tags for filtering
  tags: [{ type: String }], // e.g., ['reminder', 'scheduled', 'retry']
});

// Indexes for common queries
logSchema.index({ timestamp: 1, level: 1 });
logSchema.index({ guildId: 1, timestamp: -1 });
logSchema.index({ userId: 1, timestamp: -1 });
logSchema.index({ operation: 1, action: 1, timestamp: -1 });
logSchema.index({ correlationId: 1 }); // trace entire operation flow

// TTL index to expire logs after 30 days
logSchema.index({ timestamp: 1 }, { expireAfterSeconds: 2592000 });

// Initialize logs database connection
async function initializeLogsDB() {
  if (!process.env.LOGS_URI) {
    console.log('⚠️ LOGS_URI not configured, logging to memory only');
    return;
  }

  try {
    logsConnection = mongoose.createConnection();
    await logsConnection.openUri(process.env.LOGS_URI, {
      maxPoolSize: 10,
      serverSelectionTimeoutMS: 5000,
      socketTimeoutMS: 45000,
      bufferCommands: false,
    });

    Log = logsConnection.model('Log', logSchema);

    logsConnection.on('connected', () => {
      console.log('✅ Logs database connected');
      flushPendingLogs().catch(err => console.error('Failed to flush pending logs:', err));
    });

    logsConnection.on('error', (err) => {
      console.error('❌ Logs DB connection error:', err.message);
    });

    if (logsConnection.readyState === 1) {
      await flushPendingLogs();
    }
  } catch (error) {
    console.error('❌ Failed to initialize logs DB:', error.message);
  }
}

async function flushPendingLogs() {
  if (!Log || !logsConnection) return;
  if (logsConnection.readyState !== 1) return;

  if (pendingLogs.length === 0) return;

  const docs = pendingLogs.splice(0, pendingLogs.length);
  try {
    await Log.insertMany(docs, { ordered: false });
    console.log(`✅ Flushed ${docs.length} pending logs to database`);
  } catch (error) {
    console.error('❌ Error flushing pending logs:', error.message);
    // Re-add failed docs back to pending (only first 100 to prevent overflow)
    pendingLogs.unshift(...docs.slice(0, 100));
  }
}

function createLogDocument(logEntry) {
  return {
    correlationId: logEntry.correlationId || uuidv4(),
    level: logEntry.level,
    message: logEntry.message,
    stackTrace: logEntry.stackTrace,
    timestamp: new Date(),
    executionTimeMs: logEntry.executionTimeMs,
    guildId: logEntry.guildId,
    userId: logEntry.userId,
    channelId: logEntry.channelId,
    operation: logEntry.operation,
    action: logEntry.action,
    beforeState: logEntry.beforeState,
    afterState: logEntry.afterState,
    reminderId: logEntry.reminderId,
    commandName: logEntry.commandName,
    eventName: logEntry.eventName,
    metadata: logEntry.metadata,
    errorCode: logEntry.errorCode,
    errorMessage: logEntry.errorMessage,
    tags: logEntry.tags || [],
  };
}

async function saveLogToDB(logEntry) {
  if (!Log) return;

  if (!logsConnection || logsConnection.readyState !== 1) {
    if (pendingLogs.length < MAX_PENDING_LOGS) {
      pendingLogs.push(createLogDocument(logEntry));
    } else {
      console.warn('⚠️ Pending logs buffer full, dropping logs');
    }
    return;
  }

  try {
    await Log.create(createLogDocument(logEntry));
  } catch (error) {
    console.error('❌ Failed to save log to DB:', error.message);
    if (pendingLogs.length < MAX_PENDING_LOGS) {
      pendingLogs.push(createLogDocument(logEntry));
    }
  }
}

// Main logging functions
async function logInfo(message, options = {}) {
  const entry = {
    level: 'INFO',
    message,
    ...options,
  };
  await saveLogToDB(entry);
}

async function logWarn(message, options = {}) {
  const entry = {
    level: 'WARN',
    message,
    ...options,
  };
  await saveLogToDB(entry);
}

async function logError(message, error, options = {}) {
  const entry = {
    level: 'ERROR',
    message,
    stackTrace: error?.stack,
    errorCode: error?.code,
    errorMessage: error?.message,
    tags: ['error', ...(options.tags || [])],
    ...options,
  };
  await saveLogToDB(entry);
}

async function logCritical(message, error, options = {}) {
  const entry = {
    level: 'CRITICAL',
    message,
    stackTrace: error?.stack,
    errorCode: error?.code,
    errorMessage: error?.message,
    tags: ['critical', ...(options.tags || [])],
    ...options,
  };
  await saveLogToDB(entry);
}

async function logDebug(message, options = {}) {
  if (process.env.DEBUG !== 'true') return;
  
  const entry = {
    level: 'DEBUG',
    message,
    ...options,
  };
  await saveLogToDB(entry);
}

// Convenience functions for common operations
async function logReminderCreated(userId, type, remindAt, options = {}) {
  await logInfo('Reminder created', {
    operation: 'REMINDER_CREATE',
    action: 'CREATED',
    userId,
    metadata: { type, remindAt: remindAt.toISOString() },
    tags: ['reminder', 'scheduled'],
    ...options,
  });
}

async function logReminderSent(userId, type, method, options = {}) {
  await logInfo('Reminder sent', {
    operation: 'REMINDER_SEND',
    action: 'SENT',
    userId,
    metadata: { type, method },
    tags: ['reminder', 'sent'],
    ...options,
  });
}

async function logReminderFailed(userId, type, error, options = {}) {
  await logError('Reminder send failed', error, {
    operation: 'REMINDER_SEND',
    action: 'FAILED',
    userId,
    metadata: { type },
    tags: ['reminder', 'failed', 'retry'],
    ...options,
  });
}

async function logCommandExecuted(commandName, userId, guildId, executionTimeMs, options = {}) {
  await logInfo(`Command executed: ${commandName}`, {
    operation: 'COMMAND_EXECUTE',
    action: 'EXECUTED',
    commandName,
    userId,
    guildId,
    executionTimeMs,
    tags: ['command'],
    ...options,
  });
}

async function logSettingsUpdated(guildId, beforeState, afterState, options = {}) {
  await logInfo('Settings updated', {
    operation: 'SETTINGS_UPDATE',
    action: 'UPDATED',
    guildId,
    beforeState,
    afterState,
    tags: ['settings', 'config'],
    ...options,
  });
}

async function logSchedulerEvent(schedulerName, action, details, error = null, options = {}) {
  const logFn = error ? logError : logInfo;
  await logFn(`Scheduler: ${schedulerName} - ${action}`, error, {
    operation: 'SCHEDULER_EVENT',
    action,
    metadata: details,
    tags: ['scheduler', schedulerName.toLowerCase()],
    ...options,
  });
}

module.exports = {
  initializeLogsDB,
  logInfo,
  logWarn,
  logError,
  logCritical,
  logDebug,
  logReminderCreated,
  logReminderSent,
  logReminderFailed,
  logCommandExecuted,
  logSettingsUpdated,
  logSchedulerEvent,
};
