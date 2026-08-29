/*
Script: compute-iconic-points-deduped.js
Usage:
  node scripts\compute-iconic-points-deduped.js [inputFile] [pointsPerIconic]

Defaults:
  inputFile: iconic-raids-1459524406832529584-2026-08-23.txt
  pointsPerIconic: 1

Behavior:
- Parses exported iconic raids file lines of the form:
  ISOtimestamp | messageId | raidId=... | method=... | user=USERID | username=tag | link=...
- Deduplicates by raidId (skips lines where raidId is empty).
- If multiple lines share the same raidId, chooses the earliest timestamp occurrence and attributes the raid to that user.
- Counts unique raids per username and writes CSV and console output.
*/

const fs = require('fs');
const path = require('path');

const inputArg = process.argv[2] || `iconic-raids-1459524406832529584-2026-08-23.txt`;
const pointsPerIconic = Number(process.argv[3] || 1);

const inputPath = path.resolve(process.cwd(), inputArg);
if (!fs.existsSync(inputPath)) {
  console.error('Input file not found:', inputPath);
  process.exit(1);
}

const text = fs.readFileSync(inputPath, 'utf8');
const lines = text.split(/\r?\n/).map(l => l.trim()).filter(l => l.length > 0 && !l.startsWith('Iconic raids report'));

// Map raidId -> { timestamp, userId, username, line }
const raids = new Map();
let totalLines = 0;
let skippedBlankRaidId = 0;

for (const line of lines) {
  totalLines++;
  const parts = line.split('|').map(p => p.trim());
  const timestamp = parts[0];
  let raidId = '';
  let userId = '';
  let username = '';

  for (const p of parts) {
    if (p.startsWith('raidId=')) raidId = p.slice('raidId='.length).trim();
    if (p.startsWith('user=')) userId = p.slice('user='.length).trim();
    if (p.startsWith('username=')) username = p.slice('username='.length).trim();
  }

  if (!raidId) {
    skippedBlankRaidId++;
    continue; // per instruction, only consider entries with a raidId
  }

  // Use ISO timestamp to compare
  let t = new Date(timestamp);
  if (isNaN(t.getTime())) t = new Date(0);

  if (!raids.has(raidId)) {
    raids.set(raidId, { timestamp: t, userId, username, line });
  } else {
    const existing = raids.get(raidId);
    if (t < existing.timestamp) {
      raids.set(raidId, { timestamp: t, userId, username, line });
    }
  }
}

// Aggregate counts per username (prefer username, fallback to userId)
const counts = new Map(); // username -> count
for (const [raidId, info] of raids.entries()) {
  const name = info.username || info.userId || 'unknown';
  counts.set(name, (counts.get(name) || 0) + 1);
}

// Prepare rows
const rows = [];
for (const [username, occ] of counts.entries()) {
  rows.push({ username, occurrences: occ, points: occ * pointsPerIconic });
}
rows.sort((a,b) => b.points - a.points || b.occurrences - a.occurrences || a.username.localeCompare(b.username));

const outBase = path.basename(inputPath, path.extname(inputPath));
const outName = `iconic-points-deduped-${outBase}.csv`;
const outPath = path.resolve(process.cwd(), outName);

const header = 'rank,username,occurrences,points\n';
let rank = 1;
let csv = header;
for (const r of rows) {
  csv += `${rank},"${r.username.replace(/"/g,'""')}",${r.occurrences},${r.points}\n`;
  rank++;
}
fs.writeFileSync(outPath, csv);

// Print summary
console.log(`Parsed lines: ${totalLines}`);
console.log(`Total unique raidIds considered: ${raids.size}`);
console.log(`Skipped lines with blank raidId: ${skippedBlankRaidId}`);
console.log('\nRank | Username | Occurrences | Points');
rank = 1;
for (const r of rows) {
  console.log(`${rank} | ${r.username} | ${r.occurrences} | ${r.points}`);
  rank++;
}

console.log(`\nWrote deduped CSV: ${outPath}`);


// Also write a debug file listing raidId -> assigned user
const debugPath = path.resolve(process.cwd(), `${outBase}-assigned.txt`);
let dbg = '';
for (const [raidId, info] of raids.entries()) {
  dbg += `${raidId} | ${info.timestamp.toISOString()} | ${info.userId} | ${info.username}\n`;
}
fs.writeFileSync(debugPath, dbg);
console.log(`Wrote assignment debug: ${debugPath}`);
