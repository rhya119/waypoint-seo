import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { createGoogleOAuth, loopbackRedirect, ga4Choice } from '../server/google-oauth.js';
import { createGoogleSeoProvider, GoogleSeoError } from '../server/google-data.js';
import { createApp } from '../server/app.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const idToken = `x.${Buffer.from(JSON.stringify({ email: 'owner@shop.com' })).toString('base64url')}.y`;
function settingsDb() { const db = new DatabaseSync(':memory:'); db.exec('CREATE TABLE settings(key TEXT PRIMARY KEY,value TEXT NOT NULL)'); return db; }

test('sign-in uses PKCE, stores only the refresh token server-side, and renews access tokens', async () => {
  const db = settingsDb();
  let clock = 1_000_000;
  const bodies: URLSearchParams[] = [];
  let challenge = '';
  const oauth = createGoogleOAuth(db, { clientId: 'id', clientSecret: 'secret', now: () => clock, fetch: (async (url: string, init: RequestInit) => {
    if (url.includes('/revoke')) { bodies.push(init.body as URLSearchParams); return new Response('', { status: 200 }); }
    const body = init.body as URLSearchParams; bodies.push(body);
    if (body.get('grant_type') === 'authorization_code') {
      assert.equal(createHash('sha256').update(body.get('code_verifier')!).digest('base64url'), challenge);
      return json({ access_token: 'access-1', expires_in: 3600, refresh_token: 'refresh-1', scope: 'openid email https://www.googleapis.com/auth/webmasters.readonly', id_token: idToken });
    }
    return json({ access_token: `access-${bodies.length}`, expires_in: 3600 });
  }) as typeof fetch });
  assert.deepEqual({ configured: oauth.status().configured, connected: oauth.status().connected }, { configured: true, connected: false });
  const url = new URL(oauth.start('http://127.0.0.1:5173/api/google/oauth/callback'));
  assert.equal(url.origin, 'https://accounts.google.com');
  assert.equal(url.searchParams.get('code_challenge_method'), 'S256');
  assert.equal(url.searchParams.get('access_type'), 'offline');
  assert.match(url.searchParams.get('scope')!, /webmasters\.readonly/);
  challenge = url.searchParams.get('code_challenge')!;
  await assert.rejects(oauth.callback({ code: 'c', state: 'forged' }), /expired/);
  const status = await oauth.callback({ code: 'c', state: url.searchParams.get('state')! });
  assert.equal(status.connected, true); assert.equal(status.email, 'owner@shop.com'); assert.equal(status.analytics, false);
  assert.ok(!JSON.stringify(status).includes('refresh-1'), 'status never exposes tokens');
  await assert.rejects(oauth.callback({ code: 'c', state: url.searchParams.get('state')! }), /expired/, 'state is single use');
  assert.equal(await oauth.accessToken(), 'access-1');
  clock += 3_600_000;
  const renewed = await oauth.accessToken();
  assert.notEqual(renewed, 'access-1');
  assert.equal(bodies.at(-1)!.get('refresh_token'), 'refresh-1');
  await oauth.disconnect();
  assert.equal(bodies.at(-1)!.get('token'), 'refresh-1');
  assert.equal(oauth.status().connected, false);
  assert.equal(await oauth.accessToken(), null);
});

test('a revoked sign-in is cleared with a clear message; missing scopes and cancelled sign-ins are rejected', async () => {
  const db = settingsDb();
  db.prepare('INSERT INTO settings VALUES(?,?)').run('google_oauth', JSON.stringify({ refreshToken: 'old', email: null, scopes: [], connectedAt: '' }));
  const oauth = createGoogleOAuth(db, { clientId: 'id', clientSecret: 'secret', fetch: (async (_url: string, init: RequestInit) => (init.body as URLSearchParams).get('grant_type') === 'refresh_token' ? json({ error: 'invalid_grant' }, 400) : json({ access_token: 'a', refresh_token: 'r', scope: 'openid email' })) as typeof fetch });
  await assert.rejects(oauth.accessToken(), (error: unknown) => error instanceof GoogleSeoError && error.status === 401 && /Sign in with Google again/.test(error.message));
  assert.equal(oauth.status().connected, false);
  const state = new URL(oauth.start('http://127.0.0.1:4318/api/google/oauth/callback')).searchParams.get('state')!;
  await assert.rejects(oauth.callback({ code: 'c', state }), /Search Console access was not granted/);
  const cancelled = new URL(oauth.start('http://127.0.0.1:4318/api/google/oauth/callback')).searchParams.get('state')!;
  await assert.rejects(oauth.callback({ error: 'access_denied', state: cancelled }), /cancelled/);
  assert.throws(() => createGoogleOAuth(db).start('http://127.0.0.1:1/x'), /GOOGLE_CLIENT_ID/);
});

test('only loopback hosts can start sign-in; the provider uses the signed-in token and per-domain GA4 choice', async () => {
  assert.equal(loopbackRedirect('127.0.0.1:5173'), 'http://127.0.0.1:5173/api/google/oauth/callback');
  assert.equal(loopbackRedirect('localhost:4318'), 'http://localhost:4318/api/google/oauth/callback');
  for (const host of ['box.tail1234.ts.net', 'evil.com:4318', '127.0.0.1.evil.com:80', undefined]) assert.equal(loopbackRedirect(host), null);
  const db = new DatabaseSync(':memory:');
  const oauth = createGoogleOAuth(db, { clientId: 'id', clientSecret: 'secret' });
  const app = createApp(db, undefined, undefined, undefined, undefined, { googleOAuth: oauth });
  const start = await request(app).get('/api/google/oauth/start').set('Host', '127.0.0.1:4318').expect(302);
  assert.match(start.headers.location, /^https:\/\/accounts\.google\.com\//);
  assert.match(start.headers.location, /redirect_uri=http%3A%2F%2F127\.0\.0\.1%3A4318%2Fapi%2Fgoogle%2Foauth%2Fcallback/);
  const bad = await request(app).get('/api/google/oauth/callback?state=x&code=<script>').set('Host', '127.0.0.1:4318');
  assert.equal(bad.status, 400); assert.doesNotMatch(bad.text, /<script>/);
  await request(app).put('/api/google/ga4').set('Host', '127.0.0.1:4318').send({ domain: 'www.Shop.com', propertyId: '123456' }).expect(200);
  assert.equal(ga4Choice(db, 'shop.com'), '123456');
  await request(app).put('/api/google/ga4').set('Host', '127.0.0.1:4318').send({ domain: 'shop.com', propertyId: '../1' }).expect(400);

  const seen: string[] = [];
  const provider = createGoogleSeoProvider({ signIn: { connected: () => true, accessToken: async () => 'signed-in-token', ga4For: (domain) => domain === 'shop.com' ? '123456' : null }, fetch: (async (url: string, init: RequestInit) => {
    seen.push(`${new URL(url).pathname} ${(init.headers as Record<string, string>).Authorization}`);
    if (url.endsWith('/sites')) return json({ siteEntry: [{ siteUrl: 'sc-domain:shop.com', permissionLevel: 'siteOwner' }] });
    if (url.includes('searchAnalytics')) return json({ rows: [{ keys: ['batik dress'], clicks: 3, impressions: 90, position: 6.2 }] });
    return json({ metricHeaders: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }], rows: [{ metricValues: [{ value: '10' }, { value: '8' }, { value: '30' }] }] });
  }) as typeof fetch });
  assert.equal(provider.status().configured, true);
  const result = await provider.pull('shop.com', '2026-09-01', '2026-09-30');
  assert.equal(result.search?.rows[0].query, 'batik dress');
  assert.equal(result.analytics?.propertyId, '123456');
  assert.ok(seen.every((line) => line.endsWith('Bearer signed-in-token')));
  assert.ok(seen.some((line) => line.startsWith('/v1beta/properties/123456:runReport')));
});
