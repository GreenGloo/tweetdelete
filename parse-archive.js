import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { insertTweets } from './db.js';

const input = process.argv[2];

if (!input) {
  console.error('Usage: node parse-archive.js <path-to-tweets.js | path-to-extracted-archive>');
  console.error('Find tweets.js inside your archive at: data/tweets.js (or data/tweets-part0.js etc.)');
  process.exit(1);
}

const files = resolveTweetFiles(input);
if (files.length === 0) {
  console.error('No tweets*.js files found at', input);
  process.exit(1);
}

let total = 0;
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8');
  const json = raw.replace(/^window\.YTD\.tweets\.part\d+\s*=\s*/, '');
  const arr = JSON.parse(json);
  const rows = arr.map(({ tweet }) => ({
    id: tweet.id_str,
    created_at: tweet.created_at,
    text: tweet.full_text ?? tweet.text ?? '',
  }));
  const inserted = insertTweets(rows);
  console.log(`${path.basename(file)}: parsed ${rows.length}, inserted ${inserted} (skipped ${rows.length - inserted} duplicates)`);
  total += inserted;
}
console.log(`\nTotal new tweets queued: ${total}`);

function resolveTweetFiles(p) {
  const stat = fs.statSync(p);
  if (stat.isFile()) return [p];
  const candidates = [];
  for (const dir of [p, path.join(p, 'data')]) {
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir)) {
      if (/^tweets(-part\d+)?\.js$/.test(f)) candidates.push(path.join(dir, f));
    }
  }
  return candidates;
}
