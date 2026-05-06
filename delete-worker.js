import 'dotenv/config';
import {
  getPendingBatch, markDeleted, markFailed,
  getToken, saveToken,
  getMonthlyCount, incrementMonthlyCount,
} from './db.js';

const { X_CLIENT_ID, X_CLIENT_SECRET } = process.env;
const MONTHLY_LIMIT = +process.env.MONTHLY_LIMIT || 1500;
const BATCH_SIZE = +process.env.BATCH_SIZE || 50;
const BATCH_DELAY_MS = +process.env.BATCH_DELAY_MS || 15 * 60 * 1000;
const DELETE_DELAY_MS = +process.env.DELETE_DELAY_MS || 2000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function ensureValidToken() {
  let tok = getToken();
  if (!tok) throw new Error('No token. Run `npm run auth` first.');
  if (Date.now() < tok.expires_at) return tok.access_token;

  console.log('Access token expired, refreshing...');
  const body = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: tok.refresh_token,
    client_id: X_CLIENT_ID,
  });
  const basic = Buffer.from(`${X_CLIENT_ID}:${X_CLIENT_SECRET}`).toString('base64');
  const r = await fetch('https://api.twitter.com/2/oauth2/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Authorization': `Basic ${basic}`,
    },
    body,
  });
  const json = await r.json();
  if (!r.ok) throw new Error(`Refresh failed: ${JSON.stringify(json)}`);
  saveToken(json);
  return json.access_token;
}

async function deleteTweet(id, accessToken) {
  const r = await fetch(`https://api.twitter.com/2/tweets/${id}`, {
    method: 'DELETE',
    headers: { 'Authorization': `Bearer ${accessToken}` },
  });
  if (r.status === 200) return { ok: true };
  if (r.status === 404) return { ok: true, gone: true };
  if (r.status === 429) {
    const reset = +r.headers.get('x-rate-limit-reset') || 0;
    return { ok: false, rateLimited: true, resetEpoch: reset };
  }
  if (r.status === 401) return { ok: false, unauthorized: true };
  if (r.status === 402) return { ok: false, creditsDepleted: true };
  let detail = '';
  try { detail = JSON.stringify(await r.json()); } catch {}
  return { ok: false, error: `${r.status} ${detail}` };
}

async function main() {
  let accessToken = await ensureValidToken();

  const startMonthCount = getMonthlyCount();
  let remainingMonth = MONTHLY_LIMIT - startMonthCount;
  console.log(`Monthly used: ${startMonthCount}/${MONTHLY_LIMIT}, remaining: ${remainingMonth}`);
  if (remainingMonth <= 0) {
    console.log('Monthly cap reached. Wait until next month.');
    return;
  }

  let deletedThisRun = 0;

  while (remainingMonth > 0) {
    const want = Math.min(BATCH_SIZE, remainingMonth);
    const batch = getPendingBatch(want);
    if (batch.length === 0) {
      console.log('Queue empty.');
      break;
    }

    console.log(`\nBatch of ${batch.length}...`);
    for (const { id } of batch) {
      const res = await deleteTweet(id, accessToken);
      if (res.ok) {
        markDeleted(id);
        incrementMonthlyCount();
        deletedThisRun++;
        remainingMonth--;
        process.stdout.write(res.gone ? 'g' : '.');
      } else if (res.unauthorized) {
        console.log('\n401 — refreshing token and retrying once.');
        accessToken = await ensureValidToken();
        const retry = await deleteTweet(id, accessToken);
        if (retry.ok) {
          markDeleted(id);
          incrementMonthlyCount();
          deletedThisRun++;
          remainingMonth--;
          process.stdout.write('.');
        } else {
          markFailed(id, retry.error || 'unauthorized');
          process.stdout.write('!');
        }
      } else if (res.creditsDepleted) {
        console.log('\n402 — credits depleted. Stopping cleanly. Top up to continue.');
        return;
      } else if (res.rateLimited) {
        const waitMs = Math.max(BATCH_DELAY_MS, res.resetEpoch * 1000 - Date.now() + 5000);
        console.log(`\nRate-limited. Sleeping ${Math.round(waitMs / 60000)} min until reset.`);
        await sleep(waitMs);
        break;
      } else {
        markFailed(id, res.error);
        process.stdout.write('!');
      }
      if (remainingMonth <= 0) break;
      await sleep(DELETE_DELAY_MS);
    }

    console.log(`\nRun total: ${deletedThisRun}, monthly remaining: ${remainingMonth}`);
    if (remainingMonth > 0 && getPendingBatch(1).length > 0) {
      console.log(`Sleeping ${Math.round(BATCH_DELAY_MS / 60000)} min before next batch.`);
      await sleep(BATCH_DELAY_MS);
    }
  }

  console.log(`\nDone. Deleted ${deletedThisRun} this run.`);
}

main().catch((e) => {
  console.error('Worker crashed:', e);
  process.exit(1);
});
