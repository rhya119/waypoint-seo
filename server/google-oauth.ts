import { createHash, randomBytes } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';
import { GoogleSeoError } from './google-data.js';

/** Read-only Google sign-in for a "Desktop app" OAuth client: PKCE + loopback redirect,
 * refresh token kept in local SQLite (never sent to the browser), access tokens cached in memory. */
export const GOOGLE_SCOPES = ['openid', 'email', 'https://www.googleapis.com/auth/webmasters.readonly', 'https://www.googleapis.com/auth/analytics.readonly'];
const SETTING = 'google_oauth';
const AUTH = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN = 'https://oauth2.googleapis.com/token';
const REVOKE = 'https://oauth2.googleapis.com/revoke';
type Stored = { refreshToken: string; email: string | null; scopes: string[]; connectedAt: string };
export type GoogleOAuthStatus = { configured: boolean; connected: boolean; email: string | null; connectedAt: string | null; scopes: string[]; analytics: boolean; requiredEnv: string[] };

const base64url = (buffer: Buffer) => buffer.toString('base64url');
/** Only local loopback callbacks: a Desktop client accepts any 127.0.0.1/localhost port. */
export function loopbackRedirect(host: string | undefined) {
  if (!host || !/^(?:127\.0\.0\.1|localhost|\[::1\]):\d{2,5}$/.test(host)) return null;
  return `http://${host}/api/google/oauth/callback`;
}

/** Per-domain GA4 property choices made in the app (local settings, not secrets). */
export function ga4Choice(db: DatabaseSync, domain: string): string | null {
  try { const row = db.prepare('SELECT value FROM settings WHERE key=?').get('ga4_map') as { value: string } | undefined; return row ? (JSON.parse(row.value) as Record<string, string>)[domain] ?? null : null; } catch { return null; }
}
export function setGa4Choice(db: DatabaseSync, domain: string, propertyId: string | null) {
  let map: Record<string, string> = {};
  try { const row = db.prepare('SELECT value FROM settings WHERE key=?').get('ga4_map') as { value: string } | undefined; map = row ? JSON.parse(row.value) : {}; } catch { map = {}; }
  if (propertyId) map[domain] = propertyId; else delete map[domain];
  db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('ga4_map', JSON.stringify(map));
  return map[domain] ?? null;
}

export function createGoogleOAuth(db: DatabaseSync, options: { clientId?: string; clientSecret?: string; fetch?: typeof fetch; now?: () => number } = {}) {
  const clientId = options.clientId?.trim() || '';
  const clientSecret = options.clientSecret?.trim() || '';
  const fetcher = options.fetch || fetch;
  const now = options.now || Date.now;
  const pending = new Map<string, { verifier: string; redirectUri: string; created: number }>();
  let cached: { token: string; expires: number } | null = null;
  let refreshing: Promise<string> | null = null;

  const read = (): Stored | null => {
    const row = db.prepare('SELECT value FROM settings WHERE key=?').get(SETTING) as { value: string } | undefined;
    try { return row ? JSON.parse(row.value) as Stored : null; } catch { return null; }
  };
  const write = (value: Stored | null) => {
    if (value) db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(SETTING, JSON.stringify(value));
    else db.prepare('DELETE FROM settings WHERE key=?').run(SETTING);
  };
  async function tokenRequest(body: Record<string, string>) {
    let response: Response;
    try { response = await fetcher(TOKEN, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' }, body: new URLSearchParams(body), redirect: 'error', signal: AbortSignal.timeout(15000) }); }
    catch { throw new GoogleSeoError(502, 'Could not reach Google sign-in. Check your internet connection.'); }
    let data: Record<string, unknown> = {};
    try { data = await response.json() as Record<string, unknown>; } catch { /* handled below */ }
    if (!response.ok) {
      if (data.error === 'invalid_grant') throw new GoogleSeoError(401, 'Your Google sign-in has expired or was revoked. Sign in with Google again.');
      if (data.error === 'invalid_client' || data.error === 'unauthorized_client') throw new GoogleSeoError(503, 'Google rejected GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET. Check they belong to a “Desktop app” OAuth client.');
      throw new GoogleSeoError(502, 'Google sign-in failed. Try again.');
    }
    return data;
  }
  function emailFrom(idToken: unknown) {
    if (typeof idToken !== 'string') return null;
    try { const payload = JSON.parse(Buffer.from(idToken.split('.')[1], 'base64url').toString('utf8')) as { email?: unknown }; return typeof payload.email === 'string' ? payload.email.slice(0, 254) : null; } catch { return null; }
  }

  return {
    status(): GoogleOAuthStatus {
      const stored = read();
      return { configured: Boolean(clientId && clientSecret), connected: Boolean(stored), email: stored?.email ?? null, connectedAt: stored?.connectedAt ?? null, scopes: stored?.scopes ?? [], analytics: Boolean(stored?.scopes.includes(GOOGLE_SCOPES[3])), requiredEnv: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'] };
    },
    start(redirectUri: string) {
      if (!clientId || !clientSecret) throw new GoogleSeoError(503, 'Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET to .env and restart Waypoint first.');
      for (const [key, value] of pending) if (now() - value.created > 600_000) pending.delete(key);
      if (pending.size > 20) throw new GoogleSeoError(429, 'Too many sign-in attempts are open. Wait a few minutes.');
      const state = base64url(randomBytes(24));
      const verifier = base64url(randomBytes(48));
      pending.set(state, { verifier, redirectUri, created: now() });
      const params = new URLSearchParams({
        client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: GOOGLE_SCOPES.join(' '), state,
        code_challenge: base64url(createHash('sha256').update(verifier).digest()), code_challenge_method: 'S256',
        access_type: 'offline', prompt: 'consent', include_granted_scopes: 'true',
      });
      return `${AUTH}?${params}`;
    },
    async callback(query: { code?: unknown; state?: unknown; error?: unknown }) {
      const state = typeof query.state === 'string' ? query.state : '';
      const entry = pending.get(state);
      pending.delete(state);
      if (!entry || now() - entry.created > 600_000) throw new GoogleSeoError(400, 'This sign-in link expired. Start again from Waypoint.');
      if (query.error) throw new GoogleSeoError(403, query.error === 'access_denied' ? 'Google sign-in was cancelled.' : 'Google sign-in did not complete.');
      if (typeof query.code !== 'string' || !query.code || query.code.length > 2048) throw new GoogleSeoError(400, 'Google did not return a sign-in code.');
      const data = await tokenRequest({ code: query.code, client_id: clientId, client_secret: clientSecret, redirect_uri: entry.redirectUri, grant_type: 'authorization_code', code_verifier: entry.verifier });
      const scopes = typeof data.scope === 'string' ? data.scope.split(' ') : [];
      if (!scopes.includes(GOOGLE_SCOPES[2])) throw new GoogleSeoError(403, 'Search Console access was not granted. Sign in again and tick the Search Console permission.');
      const refreshToken = typeof data.refresh_token === 'string' ? data.refresh_token : read()?.refreshToken;
      if (!refreshToken) throw new GoogleSeoError(502, 'Google did not return a long-lived sign-in. Remove Waypoint at myaccount.google.com/permissions and sign in again.');
      write({ refreshToken, email: emailFrom(data.id_token), scopes, connectedAt: new Date(now()).toISOString() });
      if (typeof data.access_token === 'string') cached = { token: data.access_token, expires: now() + Math.max(60, Number(data.expires_in) || 3600) * 1000 - 60_000 };
      return this.status();
    },
    /** A valid access token, refreshed when it is within a minute of expiry; null when not signed in. */
    async accessToken(): Promise<string | null> {
      const stored = read();
      if (!stored) { cached = null; return null; }
      if (cached && cached.expires > now()) return cached.token;
      if (!clientId || !clientSecret) throw new GoogleSeoError(503, 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are missing, so the saved Google sign-in cannot be renewed.');
      refreshing ??= (async () => {
        try {
          const data = await tokenRequest({ refresh_token: stored.refreshToken, client_id: clientId, client_secret: clientSecret, grant_type: 'refresh_token' });
          if (typeof data.access_token !== 'string') throw new GoogleSeoError(502, 'Google did not return an access token.');
          cached = { token: data.access_token, expires: now() + Math.max(60, Number(data.expires_in) || 3600) * 1000 - 60_000 };
          return cached.token;
        } catch (error) {
          if (error instanceof GoogleSeoError && error.status === 401) { write(null); cached = null; }
          throw error;
        } finally { refreshing = null; }
      })();
      return refreshing;
    },
    async disconnect() {
      const stored = read();
      write(null); cached = null;
      if (stored) await fetcher(REVOKE, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ token: stored.refreshToken }), redirect: 'error', signal: AbortSignal.timeout(10000) }).catch(() => undefined);
      return this.status();
    },
  };
}
export type GoogleOAuth = ReturnType<typeof createGoogleOAuth>;
