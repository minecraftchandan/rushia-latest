# Channel Override - User Guide

## What is @bot here?

A command that lets you temporarily redirect YOUR raid reminders to any channel for 2 hours.

## How to Use (Step-by-Step)

### ✅ CORRECT Usage:

1. **Attack a raid in-game**
   - This creates a raid reminder in the database
   - Wait for confirmation from Luvi

2. **Type `@bot here` in your preferred channel**
   - Example: Type it in your farming channel, DM, or any channel
   - Bot will reply confirming the redirect

3. **Wait for reminder**
   - Reminder will now go to the channel you chose
   - Works for 2 hours on ALL your raid reminders

### ❌ WRONG Usage:

```
❌ Type @bot here FIRST
❌ Then attack raid
❌ Reminder goes to DM (no redirect was set!)
```

**Why?** The command updates EXISTING reminders, not future ones!

## Example Flow

```
12:00 PM - You attack a raid
          → Bot detects it and creates reminder

12:01 PM - You type @bot here in #farming
          → Bot: "✅ Updated 1 reminder(s)"

12:30 PM - Reminder fires
          → Sent to #farming ✅

12:35 PM - You attack another raid
          → Reminder created with override still active

1:05 PM  - Reminder fires
          → Sent to #farming ✅ (still within 2 hours)

2:01 PM  - 2 hours expired
          → You get DM: "⏰ Your @bot here session expired"

2:30 PM  - Next reminder fires
          → Sent to DM (back to normal)
```

## FAQ

### Q: Can I use it in DMs?
**A:** No, it must be used in a server channel. The bot needs a channel ID to redirect to.

### Q: Does it affect other users?
**A:** No! Only YOUR reminders are redirected. Other users are unaffected.

### Q: What if I have multiple raid reminders?
**A:** ALL your pending raid reminders get redirected to the chosen channel.

### Q: Can I cancel it early?
**A:** Currently no, but the override expires automatically after 2 hours.

### Q: What if the bot restarts?
**A:** Your override is saved in the database and persists across restarts! ✅

### Q: Can I change the channel?
**A:** Yes! Just type `@bot here` in a different channel. It updates the override.

### Q: Does it work for other reminder types?
**A:** Currently only for raid reminders (raid fatigue and raid spawn reminders).

### Q: I got "Updated 0 reminders" - what's wrong?
**A:** You don't have any active raid reminders! Attack a raid first, then use the command.

## Tips

💡 **Best Practice:** After attacking a raid, immediately type `@bot here` if you want it redirected

💡 **Farming Sessions:** Use this when doing long farming sessions in a specific channel

💡 **Privacy:** If you're in a public raid channel but want reminders elsewhere, use this!

💡 **Temporary:** Perfect for temporary situations - automatically expires after 2 hours

## Commands Summary

```
@bot here    - Set channel override for 2 hours
rhere        - Shortcut for @bot here
```

## Response Messages

### Success (with reminders):
```
✅ Raid reminders will now be sent to this channel for the next 2 hours!

⏰ Expires: in 2 hours (Jan 1, 2024 2:00 PM)

💡 Note: This only affects YOUR raid reminders. Other users' reminders work normally.

📊 Updated 1 reminder(s)

⚠️ Use this command AFTER creating a raid reminder (after attacking a raid).
```

### No Reminders Found:
```
⚠️ No active raid reminders found to redirect!

You need to attack a raid FIRST to create a reminder, then use @bot here to redirect it.
The command updates existing reminders, not future ones.
```

### Expiration DM (after 2 hours):
```
⏰ Your @bot here session has expired. Raid reminders will now be sent to the normal raid channel.

Use @bot here again in your preferred channel to set a new 2-hour session.
```

## Support

If you encounter issues:
1. Check that you attacked a raid first
2. Verify the bot has permissions to send messages in the target channel
3. Check bot logs for errors
4. Contact bot developer if problem persists
