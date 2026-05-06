import 'dotenv/config';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { saveToken, insertTweets, getToken } from './db.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const existing = getToken();
if (!existing) {
  if (!process.env.X_ACCESS_TOKEN || !process.env.X_REFRESH_TOKEN) {
    console.error('No token in DB and X_ACCESS_TOKEN / X_REFRESH_TOKEN env vars not set.');
    process.exit(1);
  }
  saveToken({
    access_token: process.env.X_ACCESS_TOKEN,
    refresh_token: process.env.X_REFRESH_TOKEN,
    expires_in: 7200,
    scope: process.env.X_TOKEN_SCOPE || 'tweet.read tweet.write users.read offline.access',
  });
  console.log('Seeded token from env vars.');
} else {
  console.log('Token already present, skipping token seed.');
}

const idsPath = join(__dirname, 'tweet-ids.json');
if (fs.existsSync(idsPath)) {
  const ids = JSON.parse(fs.readFileSync(idsPath, 'utf8'));
  const rows = ids.map((id) => ({ id, created_at: null, text: null }));
  const inserted = insertTweets(rows);
  console.log(`Seed: ${ids.length} IDs in file, ${inserted} new rows inserted (rest were duplicates).`);
} else {
  console.log('No tweet-ids.json found; skipping queue seed.');
}
