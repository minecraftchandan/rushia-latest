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

  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent
    ]
  });

  client.once('ready', async () => {
    console.log('Logged in as', client.user.tag);

    const outName =
      `iconic-raids-${channelId}-${start.toISOString().slice(0, 10)}.txt`;

    const outPath = path.resolve(process.cwd(), outName);

    let channel;

    try {
      channel = await client.channels.fetch(channelId);
    } catch (err) {
      console.error('Failed to fetch channel:', err);
      process.exit(1);
    }

    if (!channel || !('messages' in channel)) {
      console.error(
        'Channel does not support message fetching. ' +
        'Is this a valid text channel or thread and is the bot in the guild?'
      );
      process.exit(1);
    }

    let lastId = null;
    let totalFound = 0;
    let done = false;

    /*
     * Map of:
     *
     * UID -> {
     *   username: string,
     *   points: number
     * }
     */
    const userPoints = new Map();

    while (!done) {
      const options = { limit: 100 };

      if (lastId) {
        options.before = lastId;
      }

      let fetched;

      try {
        fetched = await channel.messages.fetch(options);
      } catch (err) {
        console.error('Error fetching messages:', err);
        break;
      }

      if (!fetched || fetched.size === 0) {
        break;
      }

      // Messages are returned newest -> oldest
      const messages = Array.from(fetched.values());

      for (const msg of messages) {
        lastId = msg.id;

        const created = msg.createdAt;

        // Stop once we reach messages older than the requested date
        if (created < start) {
          done = true;
          break;
        }

        // Only process messages sent by LUVI
        if (msg.author?.id !== LUVI_BOT_ID) {
          continue;
        }

        /*
         * Check for ICONIC marker across:
         * - message content
         * - embed title
         * - embed description
         * - embed footer
         * - embed author
         * - embed fields
         */
        const parts = [];

        if (msg.content) {
          parts.push(msg.content);
        }

        const embed = msg.embeds?.[0];

        if (embed) {
          if (embed.title) {
            parts.push(embed.title);
          }

          if (embed.description) {
            parts.push(embed.description);
          }

          if (embed.footer?.text) {
            parts.push(embed.footer.text);
          }

          if (embed.author?.name) {
            parts.push(embed.author.name);
          }

          if (embed.fields?.length) {
            parts.push(
              embed.fields
                .map(f => `${f.name} ${f.value}`)
                .join(' ')
            );
          }
        }

        const combined = parts.join(' ');

        if (!ICONIC_RE.test(combined)) {
          continue;
        }

        /*
         * Extract raid ID if available.
         */
        let raidId =
          (msg.detectedRaid && msg.detectedRaid.raidId) || null;

        if (!raidId && embed && embed.footer?.text) {
          const m = embed.footer.text.match(/Raid ID:\s*(\S+)/i);

          if (m) {
            raidId = m[1];
          }
        }

        /*
         * Resolve the user who triggered the raid.
         */
        let triggerUserId = null;
        let triggerMethod = null;

        // First try interaction metadata
        if (msg.interactionMetadata?.user?.id) {
          triggerUserId = msg.interactionMetadata.user.id;
          triggerMethod = 'slash';
        } else if (msg.interaction?.user?.id) {
          triggerUserId = msg.interaction.user.id;
          triggerMethod = 'slash';
        }

        /*
         * If there is no interaction user, look backwards
         * for a normal user message that triggered the raid.
         */
        if (!triggerUserId) {
          try {
            const before = await channel.messages.fetch({
              limit: 50,
              before: msg.id
            });

            const beforeArr = Array.from(before.values());

            const candidate = beforeArr.find(m => {
              if (!m || !m.author) {
                return false;
              }

              // Ignore bots
              if (m.author.bot) {
                return false;
              }

              const ageMs =
                msg.createdTimestamp - m.createdTimestamp;

              // Only consider messages within 5 minutes
              if (ageMs > 5 * 60 * 1000) {
                return false;
              }

              // User mentioned LUVI
              if (m.mentions?.users?.has(LUVI_BOT_ID)) {
                return true;
              }

              // User said something like "raid spawn"
              if (/\braid\b\s*spawn/i.test(m.content)) {
                return true;
              }

              return false;
            });

            if (candidate) {
              triggerUserId = candidate.author.id;
              triggerMethod = 'text';
            }
          } catch (err) {
            // Ignore lookup errors
          }
        }

        /*
         * Final fallback.
         */
        if (
          !triggerUserId &&
          msg.author &&
          !msg.author.bot &&
          msg.author.id
        ) {
          triggerUserId = msg.author.id;
          triggerMethod = 'luvi-author-fallback';
        }

        /*
         * If we cannot determine the user, don't award a point.
         */
        if (!triggerUserId) {
          console.log(
            `Could not determine trigger user for raid message ${msg.id}`
          );

          continue;
        }

        /*
         * Get username.
         */
        const triggerUsername =
          await safeFetchUserTag(client, triggerUserId);

        /*
         * ==========================================
         * ADD POINT TO USER
         * ==========================================
         *
         * If the UID already exists:
         *
         *     points++
         *
         * Otherwise create the user with 1 point.
         */
        if (userPoints.has(triggerUserId)) {
          const userData = userPoints.get(triggerUserId);

          userData.points++;

          // Update username in case it changed
          if (
            triggerUsername &&
            triggerUsername !== 'unknown'
          ) {
            userData.username = triggerUsername;
          }
        } else {
          userPoints.set(triggerUserId, {
            username: triggerUsername,
            points: 1
          });
        }

        totalFound++;

        console.log(
          `Iconic raid found | UID: ${triggerUserId} | ` +
          `User: ${triggerUsername} | ` +
          `Points: ${userPoints.get(triggerUserId).points}`
        );
      }

      /*
       * If fewer than 100 messages were returned,
       * we have probably reached the beginning of history.
       */
      if (fetched.size < 100) {
        break;
      }

      /*
       * Respect Discord rate limits.
       */
      await sleep(250);
    }

    /*
     * ==========================================
     * CREATE LEADERBOARD
     * ==========================================
     */

    const leaderboard = Array.from(userPoints.entries())
      .sort((a, b) => {
        // Highest points first
        if (b[1].points !== a[1].points) {
          return b[1].points - a[1].points;
        }

        // If points are equal, sort by username
        return a[1].username.localeCompare(b[1].username);
      });

    /*
     * Build the output file.
     */
    let output = '';

    output += '============================================================\n';
    output += '                 ICONIC RAID LEADERBOARD\n';
    output += '============================================================\n\n';

    output += `Channel ID       : ${channelId}\n`;
    output += `Start Date       : ${start.toISOString()}\n`;
    output += `Total Iconic Raids: ${totalFound}\n`;
    output += `Unique Users     : ${leaderboard.length}\n\n`;

    output += '------------------------------------------------------------\n';
    output += 'Rank | User ID              | Username                 | Points\n';
    output += '------------------------------------------------------------\n';

    /*
     * Add each user to the table.
     */
    leaderboard.forEach(([userId, data], index) => {
      const rank = String(index + 1).padEnd(4);

      const uid = userId.padEnd(20);

      const username = String(data.username || 'unknown')
        .slice(0, 24)
        .padEnd(24);

      const points = String(data.points);

      output +=
        `${rank} | ${uid} | ${username} | ${points}\n`;
    });

    output += '------------------------------------------------------------\n';

    /*
     * Also include a simple points summary.
     */
    output += '\n';
    output += 'Points Summary\n';
    output += '==============\n\n';

    leaderboard.forEach(([userId, data], index) => {
      output +=
        `${index + 1}. ${data.username} ` +
        `(${userId}) - ${data.points} point` +
        `${data.points === 1 ? '' : 's'}\n`;
    });

    /*
     * Write the final file.
     */
    fs.writeFileSync(outPath, output);

    console.log('');
    console.log('================================================');
    console.log('Done!');
    console.log('================================================');
    console.log(`Total iconic raids : ${totalFound}`);
    console.log(`Unique users       : ${leaderboard.length}`);
    console.log(`Output             : ${outPath}`);
    console.log('================================================');

    await client.destroy();
    process.exit(0);
  });

  client.login(BOT_TOKEN).catch(err => {
    console.error('Failed to login:', err);
    process.exit(1);
  });
}

/*
 * Fetch a Discord user's username/tag safely.
 */
async function safeFetchUserTag(client, id) {
  try {
    const u = await client.users.fetch(id);
    return `${u.tag}`;
  } catch (err) {
    return 'unknown';
  }
}

/*
 * Simple delay helper.
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

main().catch(err => {
  console.error('Script error:', err);
  process.exit(1);
});
