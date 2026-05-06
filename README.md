# tweetdelete

Personal tool to bulk-delete your own X tweets via the v2 API on the free tier.

## Setup

```bash
cd /home/green_gloo/tweetdelete
npm install
```

`.env` already has your X OAuth 2.0 client credentials.

## One-time auth

```bash
npm run auth
```

Opens a URL in your terminal — paste it into your browser, approve, and the local
server captures the redirect at `http://127.0.0.1:3000/callback`. Tokens are saved
to `data/tweets.db`. Refresh tokens auto-rotate on expiry.

## Import your archive

1. Request your archive at x.com → Settings → Your account → Download archive (24h email)
2. Unzip it
3. Import:

```bash
npm run import -- /path/to/extracted-archive
# or point directly at the file:
npm run import -- /path/to/extracted-archive/data/tweets.js
```

## Run the worker

```bash
npm run delete
```

Burst behavior: deletes 50, sleeps 15 min, repeats until the monthly cap (1,500)
or queue is empty. Total run time ≈ 7.5 hours per month.

Re-run next calendar month to drain another 1,500. ~2 months for 2,800 tweets.

## Check progress

```bash
npm run status
```

## Notes

- Manual deletes in the X UI count separately and are fine on top of this.
- If a tweet is already gone (404) when the worker tries it, that's marked deleted too.
- `failed` rows can be re-queued by running a SQL update on `data/tweets.db`.
- Monthly counter is local (resets when the calendar month changes), not from X.
