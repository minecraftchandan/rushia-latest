/**
 * test-iconic.js
 *
 * Standalone test for the iconic-count pipeline.
 * Builds a mock Discord message (using the exact shape you get from real
 * Luvi raid-spawn embeds) and runs it directly through processIconicMessage,
 * bypassing Discord entirely. Use this to test without waiting for a rare
 * iconic spawn.
 *
 * USAGE:
 *   1. Place this file at your PROJECT ROOT (same level as your main entry
 *      file / package.json). If your folder structure is different, adjust
 *      the require paths below to match.
 *   2. Make sure your MongoDB connection is set up the same way your bot
 *      normally connects (see the mongoose.connect line below - update the
 *      URI/env var to match your actual bot's config).
 *   3. Run: node test-iconic.js
 *   4. Check the console output AND query your iconic_counts collection
 *      afterward to confirm the point was written.
 */

const mongoose = require('mongoose');
require('dotenv').config();

const MONGO_URI = process.env.MONGODB_URI;
if (!MONGO_URI) {
  console.error('[TEST] MONGODB_URI is not set in .env');
  process.exit(1);
}

async function main() {
  console.log('[TEST] Connecting to MongoDB...');
  await mongoose.connect(MONGO_URI);
  console.log('[TEST] Connected.');

  // ---- 2. Import the real handler you want to test ----
  // Adjust this path to match where iconic-count.system.js actually lives
  // relative to this test file.
  const { processIconicMessage } = require('./src/systems/leaderboard/iconic-count.system');
  const IconicCount = require('./src/database/iconic-count.model');

  // ---- 3. Build a mock message using your real JSON shape ----
  // This mirrors the slash-command spawn case (message 2 from your examples),
  // since that's the primary path (interaction.user.id resolves directly).
  const TEST_USER_ID = '290370358400385024'; // change to whichever user you want to test
  const TEST_GUILD_ID = '597328712257503233';

  const mockMessage = {
    id: 'TEST_' + Date.now(),
    channelId: '1459524406832529584',
    guildId: TEST_GUILD_ID,
    guild: { id: TEST_GUILD_ID },
    channel: { id: '1459524406832529584' },
    author: {
      id: '1269481871021047891', // LUVI_BOT_ID
      bot: true,
      username: 'Luvi'
    },
    content: '',
    embeds: [
      {
        type: 'rich',
        title: 'Raid Spawned!',
        description:
          'You spawned <:LU_Tier4:1489503868810166302> **Maomao <:LU_Iconic:1390507592370880572> & Rapi <:LU_Iconic:1390507592370880572> [Elite T4]** **[ICONIC]** <:LU_GrassElement:1402803663113814037><:LU_FireElement:1368398034697977896>\n\nUse `@Luvi raid view` to view the raid.',
        color: 16766720,
        footer: { text: 'Raid ID: TEST999999' }
      }
    ],
    interactionMetadata: null,
    interaction: {
      id: 'TEST_INTERACTION',
      type: 2,
      commandName: 'raid spawn',
      user: { id: TEST_USER_ID }
    },
    detectedRaid: { raidId: 'TEST999999' },
    createdTimestamp: Date.now()
  };

  // ---- 4. Snapshot the count BEFORE ----
  const before = await IconicCount.findOne({ userId: TEST_USER_ID, guildId: TEST_GUILD_ID });
  console.log('[TEST] Count BEFORE:', before ? before.iconic_count : '(no doc yet)');

  // ---- 5. Run the real handler ----
  console.log('[TEST] Running processIconicMessage on mock message...');
  await processIconicMessage(mockMessage);

  // ---- 6. Snapshot the count AFTER ----
  const after = await IconicCount.findOne({ userId: TEST_USER_ID, guildId: TEST_GUILD_ID });
  console.log('[TEST] Count AFTER:', after ? after.iconic_count : '(still no doc - THIS IS A BUG)');

  if (before && after && after.iconic_count === before.iconic_count + 1) {
    console.log('[TEST] ✅ SUCCESS: count incremented by 1 as expected.');
  } else if (!before && after && after.iconic_count === 1) {
    console.log('[TEST] ✅ SUCCESS: new doc created with count = 1.');
  } else {
    console.log('[TEST] ❌ FAILURE: count did not increment as expected. Check logs above / add more debug logging inside processIconicMessage.');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(err => {
  console.error('[TEST] Script crashed:', err);
  process.exit(1);
});