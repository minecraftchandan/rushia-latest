# Complete Logging Schema Documentation

## Database Schema

```javascript
{
  correlationId: String,        // Unique ID to trace entire operation across logs
  level: String,               // CRITICAL | ERROR | WARN | INFO | DEBUG
  message: String,             // Main log message
  stackTrace: String,          // Error stack trace (ERROR/CRITICAL only)
  timestamp: Date,             // When the log occurred
  executionTimeMs: Number,     // How long the operation took
  guildId: String,             // Discord guild ID
  userId: String,              // Discord user ID
  channelId: String,           // Discord channel ID
  operation: String,           // Type of operation (e.g., REMINDER_SEND)
  action: String,              // What happened (e.g., SENT, FAILED, CREATED)
  beforeState: Object,         // Previous value (for updates)
  afterState: Object,          // New value (for updates)
  reminderId: String,          // Reminder document ID
  commandName: String,         // Command name
  eventName: String,           // Event name
  metadata: Object,            // Additional context
  errorCode: String,           // Error code from exception
  errorMessage: String,        // Error message from exception
  tags: [String],              // Tags for filtering (e.g., ['reminder', 'retry'])
}
```

---

## All Log Types with Examples

### 1. REMINDER_CREATED

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440000",
  level: "INFO",
  message: "REMINDER_CREATED",
  timestamp: "2024-01-15T10:30:00.000Z",
  operation: "REMINDER_CREATE",
  action: "CREATED",
  userId: "123456789",
  guildId: "987654321",
  channelId: "555555555",
  reminderId: "65a3f2b1c9d8e7f6a5b4c3d2",
  metadata: {
    category: "REMINDER",
    type: "stamina",
    remindAt: "2024-01-15T11:30:00.000Z"
  },
  tags: ["reminder", "created"]
}
```

### 2. REMINDER_SENT (Channel)

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440001",
  level: "INFO",
  message: "REMINDER_SENT",
  timestamp: "2024-01-15T11:30:15.000Z",
  executionTimeMs: 245,
  operation: "REMINDER_SEND",
  action: "SENT",
  userId: "123456789",
  guildId: "987654321",
  channelId: "555555555",
  reminderId: "65a3f2b1c9d8e7f6a5b4c3d2",
  metadata: {
    category: "REMINDER",
    action: "SENT",
    type: "raid",
    method: "CHANNEL"
  },
  tags: ["reminder", "sent", "channel"]
}
```

### 3. REMINDER_SENT (DM)

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440002",
  level: "INFO",
  message: "REMINDER_SENT",
  timestamp: "2024-01-15T11:31:00.000Z",
  executionTimeMs: 180,
  operation: "REMINDER_SEND",
  action: "SENT",
  userId: "123456789",
  reminderId: "65a3f2b1c9d8e7f6a5b4c3d2",
  metadata: {
    category: "REMINDER",
    action: "SENT",
    type: "stamina",
    method: "DM"
  },
  tags: ["reminder", "sent", "dm"]
}
```

### 4. REMINDER_SEND_FAILED

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440003",
  level: "ERROR",
  message: "REMINDER_SEND_FAILED",
  timestamp: "2024-01-15T11:35:00.000Z",
  executionTimeMs: 5000,
  operation: "REMINDER_SEND",
  action: "SEND_FAILED",
  userId: "123456789",
  guildId: "987654321",
  channelId: "555555555",
  reminderId: "65a3f2b1c9d8e7f6a5b4c3d2",
  errorCode: "UNKNOWN_USER",
  errorMessage: "User not found",
  stackTrace: "Error: User not found\n    at client.users.fetch...",
  metadata: {
    category: "REMINDER",
    action: "SEND_FAILED",
    type: "drop",
    method: "DM"
  },
  tags: ["reminder", "failed", "retry"]
}
```

### 5. REMINDER_CREATE_FAILED (Duplicate)

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440004",
  level: "WARN",
  message: "REMINDER_CREATE_FAILED",
  timestamp: "2024-01-15T12:00:00.000Z",
  operation: "REMINDER_CREATE",
  action: "CREATE_FAILED",
  userId: "123456789",
  guildId: "987654321",
  errorCode: "DUPLICATE_REMINDER",
  errorMessage: "Duplicate key error: reminder already exists for user",
  metadata: {
    category: "REMINDER",
    action: "CREATE_FAILED",
    type: "expedition",
    reason: "duplicate"
  },
  tags: ["reminder", "failed", "duplicate"]
}
```

### 6. SCHEDULER_ERROR

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440005",
  level: "CRITICAL",
  message: "SCHEDULER_ERROR",
  timestamp: "2024-01-15T13:00:00.000Z",
  operation: "SCHEDULER_EVENT",
  action: "SCHEDULER_ERROR",
  errorCode: "DB_CONNECTION_LOST",
  errorMessage: "Database connection timeout",
  stackTrace: "Error: Connection timeout...",
  metadata: {
    category: "SYSTEM",
    action: "SCHEDULER_ERROR"
  },
  tags: ["scheduler", "critical", "error"]
}
```

### 7. REMINDER_MARKED_SENT (Bulk)

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440006",
  level: "INFO",
  message: "[REMINDER] Marked 3 reminders as sent",
  timestamp: "2024-01-15T13:05:00.000Z",
  operation: "REMINDER_SEND",
  action: "MARKED_SENT",
  metadata: {
    reminderCount: 3
  },
  tags: ["reminder", "batch"]
}
```

### 8. REMINDER_MARKED_FOR_RETRY

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440007",
  level: "WARN",
  message: "[REMINDER] Marked 2 stamina reminders for retry",
  timestamp: "2024-01-15T13:10:00.000Z",
  operation: "REMINDER_SEND",
  action: "MARKED_RETRY",
  metadata: {
    reminderCount: 2,
    reminderType: "stamina"
  },
  tags: ["reminder", "retry", "batch"]
}
```

### 9. REMINDER_DELETED_DISABLED

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440008",
  level: "INFO",
  message: "[REMINDER] Deleted 1 disabled raid reminders",
  timestamp: "2024-01-15T13:15:00.000Z",
  operation: "REMINDER_DELETE",
  action: "DELETED",
  userId: "123456789",
  metadata: {
    reminderCount: 1,
    reminderType: "raid",
    reason: "user_disabled"
  },
  tags: ["reminder", "deleted"]
}
```

### 10. REMINDER_REVERTED_FOR_RETRY

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440009",
  level: "INFO",
  message: "[REMINDER] Reverted 2 failed reminders for retry",
  timestamp: "2024-01-15T13:20:00.000Z",
  operation: "REMINDER_SEND",
  action: "REVERTED",
  metadata: {
    reminderCount: 2
  },
  tags: ["reminder", "retry", "reverted"]
}
```

### 11. SCHEDULER_STARTED

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440010",
  level: "INFO",
  message: "[SCHEDULER] Reminder scheduler started.",
  timestamp: "2024-01-15T13:25:00.000Z",
  operation: "SCHEDULER_EVENT",
  action: "STARTED",
  metadata: {
    category: "SYSTEM"
  },
  tags: ["scheduler", "started"]
}
```

### 12. SCHEDULER_STOPPED (Disconnect)

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440011",
  level: "INFO",
  message: "SCHEDULER_STOPPED",
  timestamp: "2024-01-15T13:30:00.000Z",
  operation: "SCHEDULER_EVENT",
  action: "STOPPED",
  metadata: {
    category: "SYSTEM",
    reason: "SHARD_DISCONNECT"
  },
  tags: ["scheduler", "stopped"]
}
```

### 13. BOT_READY

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440012",
  level: "INFO",
  message: "BOT_READY",
  timestamp: "2024-01-15T13:35:00.000Z",
  operation: "BOT_LIFECYCLE",
  action: "READY",
  metadata: {
    category: "SYSTEM",
    action: "BOT_READY",
    botTag: "Rushia#1234",
    botId: "999888777"
  },
  tags: ["bot", "lifecycle"]
}
```

### 14. CACHE_REFRESHED (Guild)

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440013",
  level: "INFO",
  message: "GUILD_CACHE_REFRESHED",
  timestamp: "2024-01-15T13:40:00.000Z",
  operation: "CACHE_REFRESH",
  action: "REFRESHED",
  guildId: "987654321",
  metadata: {
    cacheType: "guild_settings"
  },
  tags: ["cache", "guild"]
}
```

### 15. SETTINGS_UPDATED

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440014",
  level: "INFO",
  message: "Settings updated for guild 987654321",
  timestamp: "2024-01-15T13:45:00.000Z",
  operation: "SETTINGS_UPDATE",
  action: "UPDATED",
  guildId: "987654321",
  beforeState: {
    bossRoleId: "111111111",
    multiRoleEnabled: false
  },
  afterState: {
    bossRoleId: "222222222",
    multiRoleEnabled: true,
    tier1RoleId: "333333333"
  },
  tags: ["settings", "guild", "updated"]
}
```

### 16. COMMAND_EXECUTED

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440015",
  level: "INFO",
  message: "[COMMAND] set-boss-role used by User#1234 (123456789)",
  timestamp: "2024-01-15T13:50:00.000Z",
  executionTimeMs: 200,
  operation: "COMMAND_EXECUTE",
  action: "EXECUTED",
  commandName: "set-boss-role",
  userId: "123456789",
  guildId: "987654321",
  channelId: "555555555",
  metadata: {
    category: "COMMAND",
    username: "User#1234",
    guildName: "MyGuild"
  },
  tags: ["command"]
}
```

### 17. COMMAND_ERROR

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440016",
  level: "ERROR",
  message: "[COMMAND ERROR] set-boss-role failed for user 123456789",
  timestamp: "2024-01-15T13:55:00.000Z",
  operation: "COMMAND_EXECUTE",
  action: "FAILED",
  commandName: "set-boss-role",
  userId: "123456789",
  guildId: "987654321",
  errorCode: "PERMISSION_DENIED",
  errorMessage: "You do not have permission to use this command",
  stackTrace: "Error: Permission denied...",
  metadata: {
    category: "COMMAND"
  },
  tags: ["command", "error"]
}
```

### 18. GUILD_SETTINGS_INITIALIZED

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440017",
  level: "INFO",
  message: "SETTINGS_INITIALIZED",
  timestamp: "2024-01-15T14:00:00.000Z",
  operation: "SETTINGS_INIT",
  action: "INITIALIZED",
  metadata: {
    category: "SYSTEM",
    action: "SETTINGS_INITIALIZED",
    guildCount: 42
  },
  tags: ["system", "startup"]
}
```

### 19. DATABASE_CONNECTED

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440018",
  level: "INFO",
  message: "MongoDB connected",
  timestamp: "2024-01-15T14:05:00.000Z",
  operation: "DATABASE_CONNECT",
  action: "CONNECTED",
  metadata: {
    category: "SYSTEM",
    database: "main"
  },
  tags: ["database", "connection"]
}
```

### 20. DATABASE_ERROR

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440019",
  level: "CRITICAL",
  message: "MongoDB connection failed: connection timeout",
  timestamp: "2024-01-15T14:10:00.000Z",
  operation: "DATABASE_ERROR",
  action: "FAILED",
  errorCode: "ECONNREFUSED",
  errorMessage: "connection refused",
  stackTrace: "Error: connection refused...",
  metadata: {
    category: "SYSTEM",
    database: "main"
  },
  tags: ["database", "critical"]
}
```

### 21. UNHANDLED_REJECTION

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440020",
  level: "CRITICAL",
  message: "[UNHANDLED REJECTION] Cannot read property 'send' of undefined",
  timestamp: "2024-01-15T14:15:00.000Z",
  operation: "UNHANDLED_REJECTION",
  action: "CRASHED",
  errorCode: "TYPE_ERROR",
  errorMessage: "Cannot read property 'send' of undefined",
  stackTrace: "TypeError: Cannot read property 'send' of undefined\n    at async...",
  metadata: {
    category: "SYSTEM"
  },
  tags: ["critical", "unhandled"]
}
```

### 22. UNCAUGHT_EXCEPTION

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440021",
  level: "CRITICAL",
  message: "[UNCAUGHT EXCEPTION] ReferenceError: variable not defined",
  timestamp: "2024-01-15T14:20:00.000Z",
  operation: "UNCAUGHT_EXCEPTION",
  action: "CRASHED",
  errorCode: "REFERENCE_ERROR",
  errorMessage: "variable not defined",
  stackTrace: "ReferenceError: variable not defined\n    at...",
  metadata: {
    category: "SYSTEM"
  },
  tags: ["critical", "uncaught"]
}
```

### 23. CLIENT_ERROR (Discord.js)

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440022",
  level: "ERROR",
  message: "[CLIENT ERROR] WebSocket error: connect ECONNREFUSED",
  timestamp: "2024-01-15T14:25:00.000Z",
  operation: "CLIENT_ERROR",
  action: "ERROR",
  errorCode: "ECONNREFUSED",
  errorMessage: "connect ECONNREFUSED",
  stackTrace: "Error: WebSocket error...",
  metadata: {
    category: "SYSTEM",
    component: "discord.js"
  },
  tags: ["discord", "connection"]
}
```

### 24. COMMANDS_DEPLOYED

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440023",
  level: "INFO",
  message: "COMMANDS_DEPLOYED",
  timestamp: "2024-01-15T14:30:00.000Z",
  operation: "BOT_DEPLOYMENT",
  action: "DEPLOYED",
  metadata: {
    category: "SYSTEM",
    action: "COMMANDS_DEPLOYED",
    count: 15
  },
  tags: ["system", "deployment"]
}
```

### 25. LOGS_DB_CONNECTED

```javascript
{
  correlationId: "550e8400-e29b-41d4-a716-446655440024",
  level: "INFO",
  message: "Logs database connected",
  timestamp: "2024-01-15T14:35:00.000Z",
  operation: "LOGS_DATABASE_INIT",
  action: "CONNECTED",
  metadata: {
    category: "SYSTEM",
    database: "logs"
  },
  tags: ["system", "logs"]
}
```

---

## Query Examples

**Find all reminders for a user:**
```javascript
db.logs.find({ userId: "123456789", operation: { $regex: "REMINDER" } })
```

**Find all failed operations:**
```javascript
db.logs.find({ level: "ERROR", action: { $regex: "FAILED" } })
```

**Trace entire operation by correlation ID:**
```javascript
db.logs.find({ correlationId: "550e8400-e29b-41d4-a716-446655440000" })
```

**Find guild config changes:**
```javascript
db.logs.find({ guildId: "987654321", operation: "SETTINGS_UPDATE" })
```

**Find critical system errors:**
```javascript
db.logs.find({ level: "CRITICAL", tags: "error" })
```

**Find all scheduler events:**
```javascript
db.logs.find({ operation: "SCHEDULER_EVENT" })
```

**Find command execution by user:**
```javascript
db.logs.find({ userId: "123456789", operation: "COMMAND_EXECUTE" })
```

**Find logs from last hour:**
```javascript
db.logs.find({ timestamp: { $gte: new Date(Date.now() - 3600000) } })
```
