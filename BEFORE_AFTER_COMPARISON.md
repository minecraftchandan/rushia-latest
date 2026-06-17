# Before vs After Comparison

## Architecture Comparison

### BEFORE: In-Memory Storage
```javascript
// channel-override.system.js
const channelOverrides = new Map();

channelOverrides.set(userId, {
  channelId,
  guildId,
  expiresAt: Date.now() + (2 * 60 * 60 * 1000)
});

function getOverrideChannel(userId) {
  const override = channelOverrides.get(userId);
  if (!override || Date.now() > override.expiresAt) {
    return null;
  }
  return override.channelId;
}
```

**Problems:**
- Lost on restart
- Not shared between bot instances
- No persistence
- Separate from reminder data

### AFTER: MongoDB Integration
```javascript
// reminder.model.js
reminderSchema.statics.setChannelOverride = async function(userId, overrideChannelId, expiresAt) {
  const remindersToUpdate = await this.find({
    userId,
    type: { $in: ['raid', 'raidSpawn'] },
    status: { $in: ['pending', 'claimed'] }
  }).exec();

  const updatePromises = remindersToUpdate.map(reminder => {
    const update = {
      overrideChannelId,
      overrideExpiresAt: expiresAt,
      updatedAt: new Date()
    };
    
    if (!reminder.originalChannelId) {
      update.originalChannelId = reminder.channelId;
    }
    
    return this.updateOne({ _id: reminder._id }, { $set: update });
  });

  await Promise.all(updatePromises);
  return { modifiedCount: remindersToUpdate.length };
};

reminderSchema.methods.getEffectiveChannel = function() {
  if (this.overrideChannelId && this.overrideExpiresAt && this.overrideExpiresAt > new Date()) {
    return this.overrideChannelId;
  }
  return this.channelId;
};
```

**Benefits:**
- Persists across restarts
- Shared between all bot instances
- Integrated with reminder data
- Single source of truth

## Code Changes

### 1. reminder.scheduler.js

#### BEFORE
```javascript
const { getOverrideChannel } = require('../systems/channel-override.system');

// In checkReminders():
const hasChannelOverride = reminderData.type === 'raid' && getOverrideChannel(reminderData.userId);

if (reminderData.type === 'raid') {
  sendInDm = !hasChannelOverride;
}

// Later...
let effectiveChannelId = reminderData.channelId;
if (reminderData.type === 'raid' && !sendInDm) {
  const overrideChannelId = getOverrideChannel(reminderData.userId);
  if (overrideChannelId) {
    effectiveChannelId = overrideChannelId;
  }
}

const channel = await client.channels.fetch(effectiveChannelId);
```

#### AFTER
```javascript
// No import needed!

// In checkReminders():
const reminderDoc = new Reminder(reminder);
acc[key] = {
  // ...
  effectiveChannelId: reminderDoc.getEffectiveChannel(),
  hasOverride: reminderDoc.hasActiveOverride(),
  originalChannelId: reminder.channelId
};

// Later...
if (reminderData.type === 'raid') {
  sendInDm = !reminderData.hasOverride;
}

const channel = await client.channels.fetch(reminderData.effectiveChannelId);
```

**Improvement:**
- Removed duplicate lookups
- Cleaner code
- All logic in model layer
- Calculated once per reminder batch

### 2. channel-override.system.js

#### BEFORE
```javascript
const channelOverrides = new Map();

async function handleHereCommand(message) {
  const expiresAt = Date.now() + (2 * 60 * 60 * 1000);
  
  channelOverrides.set(userId, {
    channelId,
    guildId,
    expiresAt
  });
  
  // Send confirmation...
}

function getOverrideChannel(userId) {
  const override = channelOverrides.get(userId);
  if (!override) return null;
  if (Date.now() > override.expiresAt) {
    channelOverrides.delete(userId);
    return null;
  }
  return override.channelId;
}

module.exports = {
  handleHereCommand,
  getOverrideChannel,
  hasActiveOverride,
  clearOverride
};
```

#### AFTER
```javascript
const Reminder = require('../database/reminder.model');

async function handleHereCommand(message) {
  const expiresAt = new Date(Date.now() + (2 * 60 * 60 * 1000));
  
  const result = await Reminder.setChannelOverride(userId, channelId, expiresAt);
  
  // Send confirmation with result.modifiedCount...
}

// Cleanup interval uses:
const expiredUserIds = await Reminder.clearExpiredOverrides();

module.exports = {
  handleHereCommand  // Only export this!
};
```

**Improvement:**
- Removed 3 exported functions (getOverrideChannel, hasActiveOverride, clearOverride)
- Single responsibility: handle command and cleanup
- All data logic in model

### 3. reminder.model.js

#### BEFORE
```javascript
const reminderSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  channelId: { type: String, required: true },
  // ... other fields
});

// No override functionality
```

#### AFTER
```javascript
const reminderSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  channelId: { type: String, required: true },
  // ... other fields
  overrideChannelId: { type: String },
  overrideExpiresAt: { type: Date },
  originalChannelId: { type: String }
});

// Add index for cleanup
reminderSchema.index({ overrideExpiresAt: 1 }, {
  partialFilterExpression: { overrideExpiresAt: { $exists: true } },
  name: 'idx_override_expiration'
});

// Add methods
reminderSchema.statics.setChannelOverride = async function(...) { ... }
reminderSchema.statics.clearExpiredOverrides = async function() { ... }
reminderSchema.methods.getEffectiveChannel = function() { ... }
reminderSchema.methods.hasActiveOverride = function() { ... }
```

**Improvement:**
- All override logic in one place
- Reusable methods
- Indexed for performance
- Type-safe with Mongoose

## Performance Comparison

### In-Memory
```
Set override:     O(1) - Map.set()
Get override:     O(1) - Map.get()
Clear expired:    O(n) - Iterate all entries
Storage:          RAM only
Persistence:      None
Multi-instance:   Not supported
```

### MongoDB
```
Set override:     O(n) - Update matching reminders (typically 1-3)
Get override:     O(1) - Read from reminder (already fetched)
Clear expired:    O(n) - Indexed query on overrideExpiresAt
Storage:          Disk + RAM (cached)
Persistence:      Full
Multi-instance:   Fully supported
```

**Note:** MongoDB version is slightly slower for write, but:
- Much more reliable
- Scales horizontally
- No data loss
- The slight overhead (milliseconds) is negligible for reminder use case

## Testing Strategy

### Test Case 1: Basic Override
```bash
# User sets override
@bot here

# Expected DB state:
{
  overrideChannelId: "current-channel-id",
  overrideExpiresAt: Date (2 hours from now),
  originalChannelId: "original-channel-id"
}

# Expected behavior:
Reminder sent to current-channel-id
Log: method = "CHANNEL_OVERRIDE"
```

### Test Case 2: Bot Restart
```bash
# Before restart
User sets override → Saved to DB

# Restart bot
npm start

# After restart
Reminder still sent to override channel ✅
```

### Test Case 3: Multiple Instances
```bash
# Instance A: User sets override
DB updated with override fields

# Instance B: Scheduler runs
Reads override from DB → Sends to correct channel ✅
```

### Test Case 4: Expiration
```bash
# Wait 2 hours (or set expiresAt to past)

# Cleanup runs
Reminder.clearExpiredOverrides() called
Override fields removed from DB
User receives DM notification

# Next reminder
Sent to original channel ✅
Log: method = "CHANNEL"
```

## Migration Path

### Database Migration: NOT REQUIRED! ✅

**Reason:**
- New fields are optional
- Existing reminders work without changes
- Fields added automatically when user uses @bot here
- No breaking changes

**If you want to clean up old reminders:**
```javascript
// Optional: Remove override fields from all reminders (not recommended)
await Reminder.updateMany(
  {},
  { $unset: { overrideChannelId: '', overrideExpiresAt: '', originalChannelId: '' } }
);
```

**Recommended approach:**
- Deploy code as-is
- Fields added organically as users interact
- No downtime needed
- No data migration scripts needed
