#!/usr/bin/env node

require('dotenv').config();

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, Partials } = require('discord.js');

const LUVI_BOT_ID = '1269481871021047891';
const TARGET_THREAD_ID = process.env.THREAD_ID || '1459524406832529584';
const TOKEN = process.env.DISCORD_TOKEN || process.env.BOT_TOKEN;
const DEFAULT_OUTPUT = path.join(process.cwd(), `iconic-thread-report-${TARGET_THREAD_ID}.txt`);

function safeText(message) {
  if (!message) return '';
  const parts = [];
  if (message.title) parts.push(message.title);
  if (message.description) parts.push(message.description);
  if (message.footer?.text) parts.push(message.footer.text);
  if (message.author?.name) parts.push(message.author.name);
  if (Array.isArray(message.fields)) {
    for (const field of message.fields) {
      if (field.name) parts.push(field.name);
      if (field.value) parts.push(field.value);
    }
  }
  return parts.join(' ');
}

function hasRaidSpawnMarker(message) {
  const text = safeText(message);
  return /raid spawned!/i.test(text);
}

function hasIconicMarker(message) {
  const text = safeText(message);
  return /(\[ICONIC\]|<:LU_Iconic:\d+>|Iconic)/i.test(text);
}

function parseRaidIdFromMessage(message) {
  const embed = message?.embeds?.[0];
  const footerText = embed?.footer?.text || '';
  const match = footerText.match(/Raid ID:\s*(\d+)/i) || (message?.content || '').match(/raidId\s*=\s*(\d+)/i);
  return match ? match[1] : null;
}

function getInteractionUserId(message) {
  return message?.interactionMetadata?.user?.id || message?.interaction?.user?.id || null;
}

function resolveMessageUser(message, index, messages) {
  const directUserId = getInteractionUserId(message);
  if (directUserId) return { userId: directUserId, method: 'slash' };

  for (let i = index - 1; i >= 0; i -= 1) {
    const previous = messages[i];
    if (!previous || !previous.author) continue;
    const previousText = safeText(previous.embeds?.[0]) || previous.content || '';
    const isLuviRaidSpawn = previous.author.bot && previous.author.id === LUVI_BOT_ID && /raid spawned!/i.test(previousText);
    if (!isLuviRaidSpawn) continue;

    const previousUserId = getInteractionUserId(previous) || previous.interactionMetadata?.userId || previous.interaction?.userId || null;
    if (previousUserId) return { userId: previousUserId, method: 'fallback-preceding-raid' };
  }

  return { userId: null, method: 'unresolved' };
}

function extractDetailFromMessage(message, index, messages) {
  const isRaidSpawnIconic = message?.embeds?.some(embed => hasRaidSpawnMarker(embed) && hasIconicMarker(embed));
  if (!isRaidSpawnIconic) return null;

  const resolved = resolveMessageUser(message, index, messages);
  const raidId = parseRaidIdFromMessage(message);
  const userId = resolved.userId;
  const username = userId ? (message?.interactionMetadata?.user?.username || message?.interaction?.user?.username || null) : null;
  const createdAt = new Date(message.createdTimestamp || Date.now()).toISOString();
  const link = message?.guildId && message?.channelId && message?.id
    ? `https://discord.com/channels/${message.guildId}/${message.channelId}/${message.id}`
    : null;

  return {
    timestamp: createdAt,
    messageId: message.id,
    raidId,
    method: resolved.method,
    userId,
    username,
    link
  };
}

async function fetchAllThreadMessages(client, threadId) {
  const thread = await client.channels.fetch(threadId);
  if (!thread || !thread.isThread?.()) {
    throw new Error(`Thread ${threadId} was not found or is not a thread.`);
  }

  const messages = [];
  let before = undefined;

  while (true) {
    const batch = await thread.messages.fetch({ limit: 100, before });
    if (!batch.size) break;
    messages.push(...batch.values());
    const last = [...batch.values()].at(-1);
    if (!last) break;
    before = last.id;
    if (batch.size < 100) break;
  }

  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function parseLegacyReport(filePath) {
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/).filter(Boolean);
  const entries = [];

  for (const line of lines) {
    if (!line.includes('|') || line.startsWith('Iconic raids report')) continue;
    const match = line.match(/^(.+?)\s*\|\s*(\d+)\s*\|\s*raidId=(\d+)\s*\|\s*method=(\w+)\s*\|\s*user=(\d+)\s*\|\s*username=(.+?)\s*\|\s*link=(.+)$/i);
    if (!match) continue;

    const [, timestamp, messageId, raidId, method, userId, username, link] = match;
    entries.push({
      timestamp: new Date(timestamp).toISOString(),
      messageId,
      raidId,
      method: method.toLowerCase(),
      userId,
      username: username.trim(),
      link: link.trim()
    });
  }

  return entries;
}

function summaryRows(entries) {
  const map = new Map();

  for (const entry of entries) {
    const key = entry.userId || 'unknown';
    const current = map.get(key) || { username: entry.username || 'unknown', userId: key, occurrences: 0, points: 0 };
    current.occurrences += 1;
    current.points += 1;
    map.set(key, current);
  }

  return [...map.values()].sort((a, b) => b.points - a.points || b.occurrences - a.occurrences || a.username.localeCompare(b.username));
}

function formatTextTable(rows, threadId, sourceLabel) {
  const header = ['rank', 'username', 'userId', 'occurrences', 'points'];
  const data = rows.map((row, index) => [String(index + 1), row.username, String(row.userId), String(row.occurrences), String(row.points)]);

  const widths = header.map((cell, columnIndex) => {
    const maxValue = Math.max(cell.length, ...data.map(row => (row[columnIndex] || '').length));
    return maxValue;
  });

  const formatRow = (cells) => cells.map((cell, index) => String(cell).padEnd(widths[index], ' ')).join(' | ');
  const lines = [
    `Iconic points report for thread ${threadId} (${sourceLabel})`,
    '',
    formatRow(header),
    widths.map(width => '-'.repeat(width)).join('-+-'),
    ...data.map(row => formatRow(row)),
    ''
  ];

  return lines.join('\n');
}

function writeAuditFiles(entries, threadId, outputBaseName) {
  const detailedPath = path.join(process.cwd(), `${outputBaseName}.txt`);
  const summaryPath = path.join(process.cwd(), `${outputBaseName}-points.txt`);

  const detailLines = [
    `Iconic raids report for channel ${threadId} since 2026-08-23T00:00:00.000Z`,
    '',
    ...entries.map(entry => {
      return [
        entry.timestamp,
        '|',
        entry.messageId,
        '|',
        `raidId=${entry.raidId || 'unknown'}`,
        '|',
        `method=${entry.method || 'unknown'}`,
        '|',
        `user=${entry.userId || 'unknown'}`,
        '|',
        `username=${entry.username || 'unknown'}`,
        '|',
        `link=${entry.link || 'n/a'}`
      ].join(' ');
    })
  ];

  fs.writeFileSync(detailedPath, `${detailLines.join('\n')}\n`, 'utf8');

  const summary = summaryRows(entries);
  const summaryText = formatTextTable(summary, threadId, 'aggregated');
  fs.writeFileSync(summaryPath, `${summaryText}\n`, 'utf8');

  return { detailedPath, summaryPath };
}

async function runLiveAudit() {
  if (!TOKEN) {
    throw new Error('Missing DISCORD_TOKEN. Set DISCORD_TOKEN before running live mode.');
  }

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
    partials: [Partials.Channel, Partials.Message]
  });

  client.once('ready', async () => {
    try {
      const messages = await fetchAllThreadMessages(client, TARGET_THREAD_ID);
      const entries = [];
      for (let index = 0; index < messages.length; index += 1) {
        const message = messages[index];
        const detail = extractDetailFromMessage(message, index, messages);
        if (!detail) continue;
        const userId = detail.userId;
        const username = userId ? message.interactionMetadata?.user?.username || message.interaction?.user?.username || 'unknown' : 'unknown';
        entries.push({ ...detail, username });
      }

      const outputName = `iconic-raids-${TARGET_THREAD_ID}`;
      const outputPaths = writeAuditFiles(entries, TARGET_THREAD_ID, outputName);
      console.log(`Saved detailed log: ${outputPaths.detailedPath}`);
      console.log(`Saved points table: ${outputPaths.summaryPath}`);
      console.log(`Total iconic entries: ${entries.length}`);
      process.exit(0);
    } catch (error) {
      console.error('Live audit failed:', error);
      process.exit(1);
    }
  });

  client.login(TOKEN);
}

async function runFromLegacyReport(filePath) {
  const entries = parseLegacyReport(filePath);
  const baseName = path.basename(filePath, path.extname(filePath));
  const threadMatch = baseName.match(/(\d{18,})/);
  const threadId = threadMatch ? threadMatch[1] : TARGET_THREAD_ID;
  const outputBaseName = `iconic-raids-${threadId}`;
  const outputPaths = writeAuditFiles(entries, threadId, outputBaseName);
  console.log(`Parsed ${entries.length} entries from ${filePath}`);
  console.log(`Saved detailed log: ${outputPaths.detailedPath}`);
  console.log(`Saved points table: ${outputPaths.summaryPath}`);
}

async function main() {
  const args = process.argv.slice(2);
  const inputIndex = args.indexOf('--input');
  const threadIdArg = args.find(arg => arg.startsWith('--thread-id='));
  const tokenArg = args.find(arg => arg.startsWith('--token='));
  const outputArg = args.find(arg => arg.startsWith('--output='));

  if (threadIdArg) {
    process.env.THREAD_ID = threadIdArg.split('=')[1];
  }

  if (tokenArg) {
    process.env.DISCORD_TOKEN = tokenArg.split('=')[1];
  }

  if (outputArg) {
    const outputPath = outputArg.split('=')[1];
    if (outputPath) {
      process.env.REPORT_PATH = outputPath;
    }
  }

  if (inputIndex !== -1) {
    const inputPath = path.resolve(args[inputIndex + 1]);
    await runFromLegacyReport(inputPath);
    return;
  }

  if (TOKEN) {
    await runLiveAudit();
    return;
  }

  console.log('Usage:');
  console.log('  DISCORD_TOKEN=... THREAD_ID=1459524406832529584 node tools/iconic-thread-audit-bot.js');
  console.log('  node tools/iconic-thread-audit-bot.js --thread-id=1459524406832529584 --token=YOUR_TOKEN');
  console.log('  node tools/iconic-thread-audit-bot.js --input iconic-raids-1459524406832529584-2026-08-23.txt');
  process.exit(1);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
