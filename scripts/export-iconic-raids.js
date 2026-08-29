/*
Script: export-iconic-raids.js
Usage:
  node scripts\export-iconic-raids.js <channelId> [startDate]

Example:
  node scripts\export-iconic-raids.js 1459524406832529584 2026-08-23

Notes:
- Uses BOT_TOKEN from .env (dotenv).
- Scans messages in the channel/thread and finds Luvi spawn messages that contain ICONIC markers.
- Heuristic to attribute who triggered the spawn:
  1) interaction.user or interactionMetadata.user (slash command)
  2) a nearby preceding non-bot message in the same channel that mentions Luvi or matches "raid spawn" within 5 minutes
  3) unknown
- Writes results to a text file in the repo root: iconic-raids-<channel>-<start>.txt
*/

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits } = require('discord.js');
const { LUVI_BOT_ID } = require('../src/config/constants');

const ICONIC_RE = /(\[ICONIC\]|<:LU_Iconic:\d+>|Iconic)/i;

async function main() {
  const channelId = process.argv[2] || '1459524406832529584';
  const startDateArg = process.argv[3] || '2026-08-23';
  const start = new Date(startDateArg);
  if (isNaN(start.getTime())) {
    console.error('Invalid start date:', startDateArg);
    process.exit(1);
  }

  const BOT_TOKEN = process.env.BOT_TOKEN;
  if (!BOT_TOKEN) {
    console.error('BOT_TOKEN not set in environment (.env expected).');
    process.exit(1);
  }

  const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

  client.once('ready', async () => {
    console.log('Logged in as', client.user.tag);

    const outName = `iconic-raids-${channelId}-${start.toISOString().slice(0,10)}.txt`;
    const outPath = path.resolve(process.cwd(), outName);
    fs.writeFileSync(outPath, `Iconic raids report for channel ${channelId} since ${start.toISOString()}\n\n`);

    let channel;
    try {
      channel = await client.channels.fetch(channelId);
    } catch (err) {
      console.error('Failed to fetch channel:', err);
      process.exit(1);
    }

    if (!channel || !('messages' in channel)) {
      console.error('Channel does not support message fetching. Is this a valid text channel or thread and is the bot in the guild?');
      process.exit(1);
    }

    let lastId = null;
    let totalFound = 0;
    let done = false;

    while (!done) {
      const options = { limit: 100 };
      if (lastId) options.before = lastId;
      let fetched;
      try {
        fetched = await channel.messages.fetch(options);
      } catch (err) {
        console.error('Error fetching messages:', err);
        break;
      }
      if (!fetched || fetched.size === 0) break;

      // Messages are returned newest->oldest in the Collection
      const messages = Array.from(fetched.values());

      for (const msg of messages) {
        lastId = msg.id;
        const created = msg.createdAt;
        if (created < start) {
          done = true;
          break;
        }

        if (msg.author?.id !== LUVI_BOT_ID) continue;

        // Check for iconic marker across embed and content
        const parts = [];
        if (msg.content) parts.push(msg.content);
        const embed = msg.embeds?.[0];
        if (embed) {
          if (embed.title) parts.push(embed.title);
          if (embed.description) parts.push(embed.description);
          if (embed.footer?.text) parts.push(embed.footer.text);
          if (embed.author?.name) parts.push(embed.author.name);
          if (embed.fields?.length) parts.push(embed.fields.map(f => `${f.name} ${f.value}`).join(' '));
        }
        const combined = parts.join(' ');
        if (!ICONIC_RE.test(combined)) continue;

        // Extract raid id if available
        let raidId = (msg.detectedRaid && msg.detectedRaid.raidId) || null;
        if (!raidId && embed && embed.footer?.text) {
          const m = embed.footer.text.match(/Raid ID:\s*(\S+)/i);
          if (m) raidId = m[1];
        }

        // Resolve trigger user: try interaction metadata, then look back for preceding user message
        let triggerUserId = null;
        let triggerMethod = null;

        if (msg.interactionMetadata?.user?.id) {
          triggerUserId = msg.interactionMetadata.user.id;
          triggerMethod = 'slash';
        } else if (msg.interaction?.user?.id) {
          triggerUserId = msg.interaction.user.id;
          triggerMethod = 'slash';
        }

        if (!triggerUserId) {
          // Look back up to 50 messages before this message for a candidate
          try {
            const before = await channel.messages.fetch({ limit: 50, before: msg.id });
            const beforeArr = Array.from(before.values());
            const candidate = beforeArr.find(m => {
              if (!m || !m.author) return false;
              if (m.author.bot) return false;
              const ageMs = msg.createdTimestamp - m.createdTimestamp;
              if (ageMs > 5 * 60 * 1000) return false; // more than 5 minutes earlier
              if (m.mentions?.users?.has(LUVI_BOT_ID)) return true;
              if (/\braid\b\s*spawn/i.test(m.content)) return true;
              return false;
            });
            if (candidate) {
              triggerUserId = candidate.author.id;
              triggerMethod = 'text';
            }
          } catch (err) {
            // ignore lookup errors
          }
        }

        // As final fallback, if the embed author or message has a non-bot author preserved, use that
        if (!triggerUserId && msg.author && !msg.author.bot && msg.author.id) {
          triggerUserId = msg.author.id;
          triggerMethod = 'luvi-author-fallback';
        }

        let triggerUsername = triggerUserId ? (await safeFetchUserTag(client, triggerUserId)) : 'unknown';

        const line = `${msg.createdAt.toISOString()} | ${msg.id} | raidId=${raidId || ''} | method=${triggerMethod || 'unknown'} | user=${triggerUserId || ''} | username=${triggerUsername} | link=https://discord.com/channels/${msg.guildId}/${msg.channelId}/${msg.id}\n`;
        fs.appendFileSync(outPath, line);
        totalFound++;
      }

      // If we fetched less than limit, likely reached the start of history
      if (fetched.size < 100) break;

      // Respect rate limits politely by waiting a short time
      await sleep(250);
    }

    console.log(`Done. Found ${totalFound} iconic raids. Output: ${outPath}`);
    await client.destroy();
    process.exit(0);
  });

  client.login(BOT_TOKEN).catch(err => {
    console.error('Failed to login:', err);
    process.exit(1);
  });
}

async function safeFetchUserTag(client, id) {
  try {
    const u = await client.users.fetch(id);
    return `${u.tag}`;
  } catch (err) {
    return 'unknown';
  }
}

function sleep(ms) { return new Promise(res => setTimeout(res, ms)); }

main().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
