# Channel Override Flow Diagram

## User Interaction Flow

```
User types "@bot here" in #my-channel
           |
           v
[message-create.event.js]
   Detects "here" command
           |
           v
[channel-override.system.js]
   handleHereCommand()
           |
           v
[reminder.model.js]
   setChannelOverride(userId, channelId, expiresAt)
           |
           v
[MongoDB Database]
   Updates ALL user's raid reminders:
   - overrideChannelId = #my-channel
   - overrideExpiresAt = now + 2 hours
   - originalChannelId = #original-raid-channel (if not set)
           |
           v
User receives confirmation:
"✅ Raid reminders will be sent to this channel for 2 hours!"
```

## Reminder Sending Flow

```
[reminder.scheduler.js] (every 2 seconds)
   getDueReminders()
           |
           v
[MongoDB Database]
   Returns reminders with override fields:
   {
     channelId: "#original-raid-channel",
     overrideChannelId: "#my-channel",
     overrideExpiresAt: Date(2024-01-01 14:00)
   }
           |
           v
[reminder.scheduler.js]
   Creates Mongoose document instance
   Calls: reminderDoc.getEffectiveChannel()
           |
           v
[reminder.model.js] getEffectiveChannel()
   Is overrideExpiresAt > now?
           |
           ├─ YES: return overrideChannelId (#my-channel)
           |
           └─ NO:  return channelId (#original-raid-channel)
           |
           v
[Discord API]
   Sends message to effective channel
           |
           v
[Logging]
   method: "CHANNEL_OVERRIDE" or "CHANNEL"
```

## Cleanup Flow (Every 5 Minutes)

```
[channel-override.system.js] setInterval()
           |
           v
[reminder.model.js]
   clearExpiredOverrides()
           |
           v
[MongoDB Database]
   Finds: overrideExpiresAt <= now
   Affected reminders: [{userId: "123"}, {userId: "456"}]
           |
           v
[MongoDB Database]
   Updates reminders:
   $unset: {
     overrideChannelId,
     overrideExpiresAt,
     originalChannelId
   }
           |
           v
[channel-override.system.js]
   Returns unique userIds: ["123", "456"]
           |
           v
For each userId:
   notifyExpiration(userId)
           |
           v
[Discord API]
   Sends DM: "⏰ Your @bot here session has expired"
```

## Data Structure

### Before Override
```javascript
{
  _id: ObjectId("..."),
  userId: "123456789",
  guildId: "987654321",
  channelId: "111111111",  // Original raid channel
  type: "raid",
  remindAt: ISODate("2024-01-01T12:00:00Z"),
  status: "pending"
  // No override fields
}
```

### After User Types "@bot here"
```javascript
{
  _id: ObjectId("..."),
  userId: "123456789",
  guildId: "987654321",
  channelId: "111111111",              // Original raid channel
  type: "raid",
  remindAt: ISODate("2024-01-01T12:00:00Z"),
  status: "pending",
  overrideChannelId: "222222222",      // User's chosen channel
  overrideExpiresAt: ISODate("2024-01-01T14:00:00Z"),  // 2 hours later
  originalChannelId: "111111111"       // Saved for restoration
}
```

### After Expiration (Cleanup)
```javascript
{
  _id: ObjectId("..."),
  userId: "123456789",
  guildId: "987654321",
  channelId: "111111111",  // Back to original
  type: "raid",
  remindAt: ISODate("2024-01-01T16:00:00Z"),  // Next reminder
  status: "pending"
  // Override fields removed
}
```

## Key Methods

### Database Methods (reminder.model.js)

```javascript
// Set override on all user's raid reminders
Reminder.setChannelOverride(userId, channelId, expiresAt)
  → Updates: overrideChannelId, overrideExpiresAt, originalChannelId

// Clean up expired overrides
Reminder.clearExpiredOverrides()
  → Returns: [userId1, userId2, ...] for notification

// Get the channel to actually send to
reminder.getEffectiveChannel()
  → Returns: overrideChannelId (if valid) OR channelId

// Check if override is active
reminder.hasActiveOverride()
  → Returns: true/false
```

## Scalability Advantages

### In-Memory (Old) ❌
```
Bot Instance A: Map { "user1" → {channel: "#abc"} }
Bot Instance B: Map { } (empty - doesn't know about user1)
```
**Problem:** Instance B sends to wrong channel!

### MongoDB (New) ✅
```
Bot Instance A: Reads from DB → user1 has override #abc
Bot Instance B: Reads from DB → user1 has override #abc
```
**Solution:** Both instances see same data!

### Restart Scenario

**In-Memory (Old) ❌**
```
1. User sets override
2. Bot crashes
3. Bot restarts
4. Override lost (Map cleared)
5. Reminder goes to wrong channel
```

**MongoDB (New) ✅**
```
1. User sets override → saved to DB
2. Bot crashes
3. Bot restarts
4. Scheduler reads from DB → override still there
5. Reminder goes to correct channel
```
