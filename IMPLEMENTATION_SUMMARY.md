# Channel Override Feature - MongoDB Implementation

## Overview
Refactored the channel override feature from in-memory storage to MongoDB-integrated solution for better scalability and persistence.

## Key Changes

### 1. Database Schema (`src/database/reminder.model.js`)
**Added Fields:**
- `overrideChannelId: String` - The temporary channel for reminders
- `overrideExpiresAt: Date` - When the override expires
- `originalChannelId: String` - Preserves original channel for restoration

**Added Index:**
- `idx_override_expiration` - Fast lookup for expired overrides cleanup

**New Static Methods:**
- `setChannelOverride(userId, channelId, expiresAt)` - Sets override on all user's raid reminders
- `clearExpiredOverrides()` - Removes expired overrides and returns affected userIds

**New Instance Methods:**
- `getEffectiveChannel()` - Returns override channel if active, otherwise original
- `hasActiveOverride()` - Checks if reminder has valid override

### 2. Channel Override System (`src/systems/channel-override.system.js`)
**Changed from:**
- In-memory Map storage
- Manual expiration tracking

**Changed to:**
- MongoDB persistence via Reminder model
- Database-driven expiration with cleanup interval
- Uses `Reminder.setChannelOverride()` and `Reminder.clearExpiredOverrides()`

**Kept:**
- 5-minute cleanup interval
- DM notifications on expiration
- Same user experience

### 3. Reminder Scheduler (`src/tasks/reminder.scheduler.js`)
**Removed:**
- `getOverrideChannel()` import from channel-override.system
- Manual override checking logic

**Added:**
- Use `reminderDoc.getEffectiveChannel()` to get correct channel
- Use `reminderDoc.hasActiveOverride()` to check override status
- Store `effectiveChannelId` and `hasOverride` in remindersToProcess

**Simplified:**
- No more dual checking (in-memory + logic)
- Single source of truth from database

### 4. Message Handler (`src/events/message-create.event.js`)
**No changes needed** - Still routes `here` command to `handleHereCommand()`

### 5. Entry Point (`index.js`)
**No changes needed** - Still exports client for DM notifications

## Architecture Benefits

### Before (In-Memory)
❌ Lost on bot restart
❌ Single instance only
❌ No persistence
❌ Memory leak risk
❌ No audit trail

### After (MongoDB)
✅ Survives bot restarts
✅ Scales with multiple bot instances
✅ Persistent across crashes
✅ Database-managed cleanup
✅ Can query historical usage
✅ Integrated with existing reminder system

## How It Works

### When User Types `@bot here`:
1. `handleHereCommand()` called in channel-override.system
2. Calls `Reminder.setChannelOverride(userId, channelId, expiresAt)`
3. Updates ALL user's pending/claimed raid reminders:
   - Sets `overrideChannelId` to current channel
   - Sets `overrideExpiresAt` to 2 hours from now
   - Saves `originalChannelId` if not already set
4. User receives confirmation message

### When Scheduler Processes Reminder:
1. Reminder fetched from database with override fields
2. Creates Mongoose document instance
3. Calls `reminderDoc.getEffectiveChannel()`:
   - If override exists and not expired → returns `overrideChannelId`
   - Otherwise → returns `channelId`
4. Sends reminder to effective channel
5. Logs with method: 'CHANNEL_OVERRIDE' or 'CHANNEL'

### Cleanup (Every 5 Minutes):
1. `Reminder.clearExpiredOverrides()` finds expired overrides
2. Clears override fields from database
3. Returns list of affected userIds
4. Sends DM notification to each user

## Migration Notes

No database migration needed! The new fields:
- Are optional (not required)
- Won't break existing reminders
- Will be added automatically when users use `@bot here`

## Testing Checklist

- [ ] User uses `@bot here` → confirmation message
- [ ] Raid reminder sent to override channel
- [ ] Log shows method: 'CHANNEL_OVERRIDE'
- [ ] After 2 hours → user gets expiration DM
- [ ] After expiration → reminder goes to original channel
- [ ] Bot restart → overrides persist
- [ ] Multiple users → isolated overrides
- [ ] User changes channel → updates correctly

## Files Changed
1. `src/database/reminder.model.js` - Schema + methods
2. `src/systems/channel-override.system.js` - DB integration
3. `src/tasks/reminder.scheduler.js` - Use DB fields
4. `docs/CHANNEL_OVERRIDE_FEATURE.md` - Updated docs
