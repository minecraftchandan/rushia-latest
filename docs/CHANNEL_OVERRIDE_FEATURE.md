# Channel Override Feature (@bot here)

## Overview
Allows users to temporarily redirect their raid reminders to a specific channel for 2 hours.

## Usage

### Command
```
@bot here
```
or
```
rhere
```

### ⚠️ Important: Use AFTER Creating Reminder
This command updates EXISTING raid reminders. You must:
1. Attack a raid first (to create the reminder)
2. THEN type `@bot here` to redirect it
3. Future reminders in the next 2 hours will also be redirected

### What it does
- Sets the current channel as the reminder destination for YOUR raid reminders only
- Lasts for 2 hours from the time you use the command
- Other users' reminders are not affected
- When the session expires, you receive a DM notification

### Example Flow

1. **User uses command in #my-channel:**
   ```
   @bot here
   ```

2. **Bot confirms:**
   ```
   ✅ Raid reminders will now be sent to this channel for the next 2 hours!
   
   ⏰ Expires: in 2 hours (Jun 13, 2024 2:16 PM)
   
   💡 Note: This only affects YOUR raid reminders. Other users' reminders work normally.
   ```

3. **During the 2-hour window:**
   - User's raid reminders are sent to #my-channel instead of the original raid channel
   - Raid reminder system checks if user has an active override
   - If yes, uses override channel
   - If no, uses normal channel

4. **After 2 hours (session expires):**
   - User receives a DM:
   ```
   ⏰ Your **@bot here** session has expired. Raid reminders will now be sent to the normal raid channel.
   
   Use `@bot here` again in your preferred channel to set a new 2-hour session.
   ```
   - Raid reminders return to normal behavior

## Technical Details

### Files Modified
- `src/database/reminder.model.js` - Added override fields to schema and helper methods
- `src/systems/channel-override.system.js` - Handles @bot here command and cleanup
- `src/events/message-create.event.js` - Added command handling
- `src/tasks/reminder.scheduler.js` - Uses database override fields when sending reminders
- `index.js` - Export client for DM notifications

### Database Schema
Added to `reminders` collection:
```javascript
{
  // ... existing fields ...
  overrideChannelId: String,      // The channel to send to (if set)
  overrideExpiresAt: Date,        // When override expires
  originalChannelId: String       // Store original for restoration
}
```

### Database Methods
- `setChannelOverride(userId, channelId, expiresAt)` - Updates all user's raid reminders with override
- `clearExpiredOverrides()` - Cleans up expired overrides, returns affected userIds
- `getEffectiveChannel()` (instance method) - Returns override channel if active, else original
- `hasActiveOverride()` (instance method) - Checks if reminder has valid override

### Features
- ✅ Database persistence (survives restarts)
- ✅ Scales with multiple bot instances
- ✅ Auto-expiration after 2 hours
- ✅ DM notification on expiration
- ✅ Automatic cleanup every 5 minutes
- ✅ Per-user isolation
- ✅ Handles DM disabled gracefully
- ✅ Logs all actions (set, expired)
- ✅ Integrated with existing reminder system
- ✅ Auto-deletes messages after 10 seconds
- ✅ Anti-spam protection (prevents duplicate overrides)

### Logs
All channel override actions are logged:
- Operation: `CHANNEL_OVERRIDE`
- Actions: `SET`, `EXPIRED`
- Tags: `['here', 'channel-override']`, `['here', 'expired']`

### Edge Cases Handled
- User has DMs disabled → Logs the failure, doesn't crash
- Override expires during scheduler run → Reverts to normal channel
- User sets override in different channel → Updates to new channel
- Bot restart → Overrides are lost (in-memory), user can set again
