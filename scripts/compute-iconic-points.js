/*
Script: compute-iconic-points.js
Usage:
  node scripts\compute-iconic-points.js [inputFile] [pointsPerIconic]

Defaults:
  inputFile: iconic-raids-1459524406832529584-2026-08-23.txt (in repo root)
  pointsPerIconic: 1

Output:
  Writes a CSV file iconic-points-<inputbasename>.csv in the repo root and prints a table to console.

The input file is expected to have lines like:
ISOtimestamp | messageId | raidId=... | method=... | user=USERID | username=tag | link=...
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

const counts = new Map(); // key: username (tag) or userId if no username
const byUserId = new Map(); // userId -> { username, count }

for (const line of lines) {
  // try to extract username=... and user=...
  const parts = line.split('|').map(p => p.trim());
  let userId = '';
  let username = '';
  for (const p of parts) {
    if (p.startsWith('user=')) {
      userId = p.slice('user='.length).trim();
    }
    if (p.startsWith('username=')) {
      username = p.slice('username='.length).trim();
    }
  }
  if (!username && userId) username = userId; // fallback to id
  if (!userId && username && username !== 'unknown') {
    // attempt to parse username that contains id inside <@...> or similar - skip
  }

  const key = username || 'unknown';
  const c = counts.get(key) || 0;
  counts.set(key, c + 1);

  if (userId) {
    const entry = byUserId.get(userId) || { username: username || '', count: 0 };
    entry.username = username || entry.username;
    entry.count += 1;
    byUserId.set(userId, entry);
  }
}

// Prepare output rows
const rows = [];
if (byUserId.size > 0) {
  for (const [userId, info] of byUserId.entries()) {
    rows.push({ userId, username: info.username || '', occurrences: info.count, points: info.count * pointsPerIconic });
  }
} else {
  // fallback: use counts map (username-only)
  for (const [username, occ] of counts.entries()) {
    rows.push({ userId: '', username, occurrences: occ, points: occ * pointsPerIconic });
  }
}

// Sort by points desc then occurrences
rows.sort((a,b) => b.points - a.points || b.occurrences - a.occurrences || a.username.localeCompare(b.username));

const outBase = path.basename(inputPath, path.extname(inputPath));
const outName = `iconic-points-${outBase}.csv`;
const outPath = path.resolve(process.cwd(), outName);

const header = 'rank,username,userId,occurrences,points\n';
const linesOut = [header];
let rank = 1;
for (const r of rows) {
  linesOut.push(`${rank},"${r.username.replace(/"/g,'""')}",${r.userId || ''},${r.occurrences},${r.points}\n`);
  rank++;
}

fs.writeFileSync(outPath, linesOut.join(''));

// Also print a simple table to console
console.log(`Iconic points summary (points per iconic = ${pointsPerIconic})\n`);
console.log(`Rank | Username | UserID | Occurrences | Points`);
console.log('-----|----------|--------|-------------|-------');
rank = 1;
for (const r of rows) {
  console.log(`${rank} | ${r.username} | ${r.userId || '-'} | ${r.occurrences} | ${r.points}`);
  rank++;
}

console.log(`\nWrote CSV: ${outPath}`);
