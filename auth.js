import 'dotenv/config';
import http from 'node:http';
import crypto from 'node:crypto';
import { saveToken } from './db.js';

const { X_CLIENT_ID, X_CLIENT_SECRET, X_REDIRECT_URI } = process.env;

if (!X_CLIENT_ID || !X_CLIENT_SECRET) {
  console.error('Missing X_CLIENT_ID or X_CLIENT_SECRET in .env');
  process.exit(1);
}

const SCOPES = ['tweet.read', 'tweet.write', 'users.read', 'offline.access'];

const codeVerifier = base64url(crypto.randomBytes(48));
const codeChallenge = base64url(crypto.createHash('sha256').update(codeVerifier).digest());
const state = crypto.randomBytes(16).toString('hex');

const authUrl = new URL('https://twitter.com/i/oauth2/authorize');
authUrl.searchParams.set('response_type', 'code');
authUrl.searchParams.set('client_id', X_CLIENT_ID);
authUrl.searchParams.set('redirect_uri', X_REDIRECT_URI);
authUrl.searchParams.set('scope', SCOPES.join(' '));
authUrl.searchParams.set('state', state);
authUrl.searchParams.set('code_challenge', codeChallenge);
authUrl.searchParams.set('code_challenge_method', 'S256');

console.log('\nOpen this URL in your browser and approve:\n');
console.log(authUrl.toString());
console.log('\nWaiting for redirect on', X_REDIRECT_URI, '...\n');

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, X_REDIRECT_URI);
  if (url.pathname !== new URL(X_REDIRECT_URI).pathname) {
    res.writeHead(404).end();
    return;
  }
  const code = url.searchParams.get('code');
  const returnedState = url.searchParams.get('state');
  if (!code || returnedState !== state) {
    res.writeHead(400).end('Bad state or missing code');
    return;
  }
  try {
    const tokens = await exchangeCode(code);
    saveToken(tokens);
    res.writeHead(200, { 'content-type': 'text/html' })
      .end('<h1>Authorized.</h1><p>You can close this tab.</p>');
    console.log('Tokens saved. Scopes:', tokens.scope);
    server.close();
    process.exit(0);
  } catch (e) {
    console.error('Token exchange failed:', e.message);
    res.writeHead(500).end(e.message);
    process.exit(1);
  }
});

server.listen(new URL(X_REDIRECT_URI).port || 80);

async function exchangeCode(code) {
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: X_REDIRECT_URI,
    code_verifier: codeVerifier,
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
  if (!r.ok) throw new Error(JSON.stringify(json));
  return json;
}

function base64url(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
