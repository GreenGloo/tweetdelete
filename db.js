import Database from 'better-sqlite3';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DB_PATH = join(__dirname, 'data', 'tweets.db');

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');

db.exec(`
  CREATE TABLE IF NOT EXISTS tweets (
    id TEXT PRIMARY KEY,
    created_at TEXT,
    text TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    deleted_at TEXT,
    error TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_tweets_status ON tweets(status);

  CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY CHECK (id = 1),
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    expires_at INTEGER NOT NULL,
    scope TEXT
  );

  CREATE TABLE IF NOT EXISTS monthly_usage (
    month TEXT PRIMARY KEY,
    delete_count INTEGER NOT NULL DEFAULT 0
  );
`);

export function getPendingBatch(limit) {
  return db.prepare(
    `SELECT id FROM tweets WHERE status = 'pending' ORDER BY created_at LIMIT ?`
  ).all(limit);
}

export function countByStatus() {
  return db.prepare(
    `SELECT status, COUNT(*) AS n FROM tweets GROUP BY status`
  ).all();
}

export function markDeleted(id) {
  db.prepare(
    `UPDATE tweets SET status = 'deleted', deleted_at = datetime('now'), error = NULL WHERE id = ?`
  ).run(id);
}

export function markFailed(id, error) {
  db.prepare(
    `UPDATE tweets SET status = 'failed', error = ? WHERE id = ?`
  ).run(error, id);
}

export function resetFailed() {
  return db.prepare(
    `UPDATE tweets SET status = 'pending', error = NULL WHERE status = 'failed'`
  ).run().changes;
}

export function insertTweets(rows) {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO tweets (id, created_at, text) VALUES (?, ?, ?)`
  );
  const tx = db.transaction((items) => {
    let inserted = 0;
    for (const r of items) {
      const res = stmt.run(r.id, r.created_at, r.text);
      inserted += res.changes;
    }
    return inserted;
  });
  return tx(rows);
}

export function getToken() {
  return db.prepare(`SELECT * FROM tokens WHERE id = 1`).get();
}

export function saveToken({ access_token, refresh_token, expires_in, scope }) {
  const expires_at = Date.now() + (expires_in - 60) * 1000;
  db.prepare(`
    INSERT INTO tokens (id, access_token, refresh_token, expires_at, scope)
    VALUES (1, @access_token, @refresh_token, @expires_at, @scope)
    ON CONFLICT(id) DO UPDATE SET
      access_token = excluded.access_token,
      refresh_token = excluded.refresh_token,
      expires_at = excluded.expires_at,
      scope = excluded.scope
  `).run({ access_token, refresh_token, expires_at, scope: scope ?? null });
}

function currentMonth() {
  return new Date().toISOString().slice(0, 7);
}

export function getMonthlyCount() {
  const row = db.prepare(
    `SELECT delete_count FROM monthly_usage WHERE month = ?`
  ).get(currentMonth());
  return row?.delete_count ?? 0;
}

export function incrementMonthlyCount() {
  db.prepare(`
    INSERT INTO monthly_usage (month, delete_count) VALUES (?, 1)
    ON CONFLICT(month) DO UPDATE SET delete_count = delete_count + 1
  `).run(currentMonth());
}

export default db;
