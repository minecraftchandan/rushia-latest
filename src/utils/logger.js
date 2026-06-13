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
  } catch (error) {
    console.error('❌ Error flushing pending logs:', error.message);
    // Re-add failed docs back to pending (only first 100 to prevent overflow)
    pendingLogs.unshift(...docs.slice(0, 100));
  }
}

function createLogDocument(logEntry) {
  return {
    correlationId: logEntry.correlationId || uuidv4(),
    level: logEntry.level || 'INFO',
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
  // Database logging only - webhooks disabled
  
  // Only save CRITICAL operations to database to save storage
  const saveToDbOperations = [
    'SETTINGS_UPDATE',
    'COMMAND_EXECUTE',
    'SCHEDULER_EVENT',
    'BOT_LIFECYCLE',
    'CACHE_REFRESH'
  ];
  
  const saveToDbLevels = ['CRITICAL', 'ERROR'];
  
  // Skip database if not in critical operations list and not error/critical level
  if (!saveToDbOperations.includes(logEntry.operation) && !saveToDbLevels.includes(logEntry.level)) {
    return;
  }

  // Save to database
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

// OLD LOGGING FUNCTIONS (for backward compatibility with existing code)
async function sendLog(message, metadata = {}) {
  const entry = {
    level: 'INFO',
    message: typeof message === 'string' ? message : JSON.stringify(message),
    metadata: metadata || {},
    operation: metadata.category || 'LOG',
    action: metadata.action || 'INFO',
    guildId: metadata.guildId,
    userId: metadata.userId,
    channelId: metadata.channelId,
  };
  await saveLogToDB(entry);
  console.log(message);
}

async function sendError(message, metadata = {}) {
  const entry = {
    level: 'ERROR',
    message: typeof message === 'string' ? message : JSON.stringify(message),
    errorMessage: metadata.error || (metadata instanceof Error ? metadata.message : null),
    stackTrace: metadata instanceof Error ? metadata.stack : null,
    metadata: metadata || {},
    operation: metadata.category || 'ERROR',
    action: metadata.action || 'ERROR',
    guildId: metadata.guildId,
    userId: metadata.userId,
    channelId: metadata.channelId,
  };
  await saveLogToDB(entry);
  console.error(message);
}

async function sendWarn(message, metadata = {}) {
  const entry = {
    level: 'WARN',
    message: typeof message === 'string' ? message : JSON.stringify(message),
    metadata: metadata || {},
    operation: metadata.category || 'WARN',
    action: metadata.action || 'WARN',
    guildId: metadata.guildId,
    userId: metadata.userId,
    channelId: metadata.channelId,
  };
  await saveLogToDB(entry);
  console.warn(message);
}

async function sendDebug(message, metadata = {}) {
  if (process.env.DEBUG !== 'true') return;
  
  const entry = {
    level: 'DEBUG',
    message: typeof message === 'string' ? message : JSON.stringify(message),
    metadata: metadata || {},
    operation: metadata.category || 'DEBUG',
    action: metadata.action || 'DEBUG',
    guildId: metadata.guildId,
    userId: metadata.userId,
    channelId: metadata.channelId,
  };
  await saveLogToDB(entry);
  console.log(message);
}

// NEW LOGGING FUNCTIONS (comprehensive)
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

function silenceConsole() {
  const noop = () => {};
  return { log: console.log, error: console.error, warn: console.warn, info: console.info, debug: console.debug };
}

module.exports = {
  initializeLogsDB,
  sendLog,
  sendError,
  sendWarn,
  sendDebug,
  logInfo,
  logWarn,
  logError,
  logCritical,
  logDebug,
  silenceConsole,
};
