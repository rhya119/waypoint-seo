import { z } from 'zod';
import { googleSeoInput, type GoogleSeoResult, type GoogleSeoStatus } from '../shared/google-data.js';
import { normalizeWebDomain } from '../shared/web-data.js';

/** Fixed Google endpoints only; credentials are never included in URLs or errors. */
export class GoogleSeoError extends Error {
  constructor(public status: number, message: string) { super(message); this.name = 'GoogleSeoError'; }
}
const MAX_BYTES = 2_000_000;
const PAGE_SIZE = 1000;
const MAX_PAGES = 5;
const SCOPES = ['https://www.googleapis.com/auth/webmasters.readonly', 'https://www.googleapis.com/auth/analytics.readonly'];
const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const count = (value: unknown) => (typeof value === 'number' || typeof value === 'string' && /^\d+$/.test(value)) && Number.isSafeInteger(Number(value)) && Number(value) >= 0 ? Number(value) : null;
function configDomain(value: string | undefined) {
  if (!value?.trim()) return null;
  try { return normalizeWebDomain(value.trim()); } catch { return null; }
}

// Prefer the exact Domain property; root URL-prefix properties retain their original scope.
function matchingProperty(value: unknown, domain: string): string | null {
  const entry = record(value);
  if (!['siteOwner', 'siteFullUser', 'siteRestrictedUser'].includes(String(entry.permissionLevel))) return null;
  if (typeof entry.siteUrl !== 'string' || entry.siteUrl.length > 2048) return null;
  const property = entry.siteUrl;
  try {
    if (property.startsWith('sc-domain:')) {
      const hostname = property.slice(10);
      if (!/^[a-z0-9.-]+$/i.test(hostname)) return null;
      return normalizeWebDomain(hostname) === domain ? property : null;
    }
    const url = new URL(property);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || url.pathname !== '/' || url.search || url.hash) return null;
    return normalizeWebDomain(property) === domain ? property : null;
  } catch { return null; }
}

async function boundedJson(response: Response): Promise<Record<string, unknown>> {
  const length = response.headers.get('content-length');
  if (length && /^\d+$/.test(length) && Number(length) > MAX_BYTES) {
    await response.body?.cancel().catch(() => {});
    throw new GoogleSeoError(502, 'Google returned a response above the local size limit.');
  }
  if (!response.body) throw new GoogleSeoError(502, 'Google returned an empty response.');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > MAX_BYTES) { await reader.cancel(); throw new GoogleSeoError(502, 'Google returned a response above the local size limit.'); }
      chunks.push(part.value);
    }
  } finally { reader.releaseLock(); }
  const buffer = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  let parsed: unknown;
  try { parsed = JSON.parse(new TextDecoder().decode(buffer)); }
  catch { throw new GoogleSeoError(502, 'Google returned an invalid JSON response.'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new GoogleSeoError(502, 'Google returned an invalid report.');
  return parsed as Record<string, unknown>;
}

type SignIn = { connected: () => boolean; accessToken: () => Promise<string | null>; ga4For?: (domain: string) => string | null };
export function createGoogleSeoProvider(options: { accessToken?: string; ga4PropertyId?: string; ga4Domain?: string; fetch?: typeof fetch; signIn?: SignIn } = {}) {
  const rawToken = options.accessToken?.trim();
  const token = rawToken && rawToken.length <= 16000 && !/[\r\n]/.test(rawToken) ? rawToken : undefined;
  const rawProperty = options.ga4PropertyId?.trim();
  const propertyId = rawProperty && /^[1-9]\d{0,24}$/.test(rawProperty) ? rawProperty : null;
  const ga4Domain = configDomain(options.ga4Domain);
  const fetcher = options.fetch || fetch;
  let active = false;
  let lastRequest: number | null = null;
  let bearer = token || '';
  const signedIn = () => !token && Boolean(options.signIn?.connected());

  async function request(url: string, deadline: number, provider: 'Search Console' | 'GA4', body?: unknown) {
    const parsed = new URL(url);
    if (!['https://www.googleapis.com', 'https://analyticsdata.googleapis.com', 'https://analyticsadmin.googleapis.com'].includes(parsed.origin) || parsed.search || parsed.username || parsed.password) throw new GoogleSeoError(500, 'Unsupported Google API endpoint.');
    const duration = Math.min(12000, deadline - Date.now());
    if (duration <= 0) throw new GoogleSeoError(504, 'Google connector reached its overall time limit.');
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => { controller.abort(); reject(new GoogleSeoError(504, `${provider} request timed out.`)); }, duration);
    });
    try {
      return await Promise.race([(async () => {
        const response = await fetcher(url, {
          method: body === undefined ? 'GET' : 'POST',
          headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
          ...(body === undefined ? {} : { body: JSON.stringify(body) }),
          signal: controller.signal,
          redirect: 'error',
        });
        if (!response.ok) {
          await response.body?.cancel().catch(() => {});
          if (response.status === 401) throw new GoogleSeoError(401, signedIn() ? `${provider} rejected the Google sign-in. Disconnect and sign in with Google again.` : `${provider} rejected the Google access token. Renew GOOGLE_SEO_ACCESS_TOKEN and restart the server.`);
          if (response.status === 403) throw new GoogleSeoError(403, `${provider} denied access. Check the account's property permissions, enabled API and read-only OAuth scope.`);
          if (response.status === 429) throw new GoogleSeoError(429, `${provider} quota or rate limit reached. No automatic retry was attempted.`);
          throw new GoogleSeoError(502, `${provider} could not return this report. Check API configuration and availability.`);
        }
        const data = await boundedJson(response);
        if (data.error) throw new GoogleSeoError(502, `${provider} returned an error instead of a report.`);
        return data;
      })(), timeout]);
    } catch (error) {
      if (error instanceof GoogleSeoError) throw error;
      throw new GoogleSeoError(502, `${provider} request failed. Check connectivity and API configuration.`);
    } finally { if (timer) clearTimeout(timer); }
  }

  async function search(domain: string, from: string, to: string, deadline: number, warnings: string[]): Promise<GoogleSeoResult['search']> {
    const sites = await request('https://www.googleapis.com/webmasters/v3/sites', deadline, 'Search Console');
    if (sites.siteEntry !== undefined && !Array.isArray(sites.siteEntry)) throw new GoogleSeoError(502, 'Search Console returned an invalid property list.');
    const matches = (sites.siteEntry as unknown[] | undefined || []).map(entry => matchingProperty(entry, domain)).filter((entry): entry is string => entry !== null);
    matches.sort((a, b) => Number(!a.startsWith('sc-domain:')) - Number(!b.startsWith('sc-domain:')) || Number(!a.startsWith('https:')) - Number(!b.startsWith('https:')) || a.localeCompare(b));
    const property = matches[0];
    if (!property) { warnings.push('Search Console has no authorized matching Domain property or root URL-prefix property for this domain. No query data was invented.'); return null; }
    const rows: NonNullable<GoogleSeoResult['search']>['rows'] = [];
    const keys = new Set<string>();
    let truncated = false;
    let duplicate = false;
    let invalidPosition = false;
    for (let page = 0; page < MAX_PAGES; page++) {
      const data = await request(`https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(property)}/searchAnalytics/query`, deadline, 'Search Console', {
        startDate: from, endDate: to, dimensions: ['query'], type: 'web', aggregationType: 'byProperty', dataState: 'final', rowLimit: PAGE_SIZE, startRow: page * PAGE_SIZE,
      });
      if (data.rows !== undefined && !Array.isArray(data.rows)) throw new GoogleSeoError(502, 'Search Console returned invalid query rows.');
      const pageRows = data.rows as unknown[] | undefined || [];
      if (pageRows.length > PAGE_SIZE) throw new GoogleSeoError(502, 'Search Console exceeded the requested row limit.');
      for (const raw of pageRows) {
        const row = record(raw);
        const query = Array.isArray(row.keys) && row.keys.length === 1 && typeof row.keys[0] === 'string' ? row.keys[0].trim() : '';
        const clicks = count(row.clicks);
        const impressions = count(row.impressions);
        if (!query || query.length > 500 || clicks === null || impressions === null || clicks > impressions) throw new GoogleSeoError(502, 'Search Console returned an invalid query or count.');
        const position = typeof row.position === 'number' && Number.isFinite(row.position) && row.position >= 1 && row.position <= 1000 ? row.position : null;
        if (row.position !== undefined && row.position !== null && position === null) invalidPosition = true;
        if (keys.has(query)) { duplicate = true; continue; }
        keys.add(query);
        rows.push({ query, clicks, impressions, position });
      }
      if (pageRows.length < PAGE_SIZE) break;
      if (page === MAX_PAGES - 1) truncated = true;
    }
    warnings.push('Search Console returns a property-scoped query subset, not global keyword demand or whole-site visitors; anonymized queries and internal row limits can omit data. Dates use Search Console Pacific time.');
    if (truncated) warnings.push('Search Console reached the local 5,000-row cap; more rows may exist.');
    if (duplicate) warnings.push('Repeated query identities across Search Console pages were kept once, not added.');
    if (invalidPosition) warnings.push('Unsupported average positions were retained as unknown.');
    return { property, rows, truncated, source: 'google-search-console-api' };
  }

  function metricValues(data: Record<string, unknown>, metrics: string[], warnings: string[]): Record<string, number | null> {
    const output = Object.fromEntries(metrics.map(name => [name, null])) as Record<string, number | null>;
    if (!Array.isArray(data.metricHeaders) || data.metricHeaders.length > 20 || data.rows !== undefined && !Array.isArray(data.rows)) throw new GoogleSeoError(502, 'GA4 returned an invalid aggregate report.');
    const headers = data.metricHeaders.map(header => record(header).name);
    if (new Set(headers).size !== headers.length) throw new GoogleSeoError(502, 'GA4 returned duplicate metric headers.');
    const rows = data.rows as unknown[] | undefined || [];
    if (rows.length > 1 || typeof data.rowCount === 'number' && data.rowCount > 1) throw new GoogleSeoError(502, 'GA4 returned unexpected grouped rows instead of a domain aggregate.');
    if (!rows.length) { warnings.push('GA4 returned no aggregate row; missing totals remain unknown.'); return output; }
    const row = record(rows[0]);
    if (!Array.isArray(row.metricValues)) throw new GoogleSeoError(502, 'GA4 returned missing metric values.');
    for (const name of metrics) {
      const index = headers.indexOf(name);
      output[name] = index < 0 ? null : count(record(row.metricValues[index]).value);
      if (output[name] === null) warnings.push(`GA4 did not provide a valid ${name} count; it remains unknown.`);
    }
    const metadata = record(data.metadata);
    if (metadata.subjectToThresholding === true || metadata.dataLossFromOtherRow === true || Array.isArray(metadata.samplingMetadatas) && metadata.samplingMetadatas.length) warnings.push('GA4 reported thresholding, sampling or other-row data loss; totals may be incomplete.');
    return output;
  }

  async function analytics(domain: string, from: string, to: string, deadline: number, warnings: string[]): Promise<GoogleSeoResult['analytics']> {
    const chosen = options.signIn?.ga4For?.(domain);
    const selected = chosen && /^[1-9]\d{0,24}$/.test(chosen) ? chosen : propertyId && ga4Domain === domain ? propertyId : null;
    if (!selected) { warnings.push(propertyId && ga4Domain && ga4Domain !== domain ? 'GA4_SITE_DOMAIN does not match the requested domain; no analytics request was sent.' : 'No Google Analytics property is chosen for this domain. Pick one under Add traffic data to include visits.'); return null; }
    const endpoint = `https://analyticsdata.googleapis.com/v1beta/properties/${selected}:runReport`;
    const hostname = { filter: { fieldName: 'hostName', inListFilter: { values: [domain, `www.${domain}`], caseSensitive: false } } };
    const common = { dateRanges: [{ startDate: from, endDate: to }], keepEmptyRows: true, limit: '1' };
    const totals = metricValues(await request(endpoint, deadline, 'GA4', {
      ...common, metrics: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }], dimensionFilter: hostname,
    }), ['sessions', 'activeUsers', 'screenPageViews'], warnings);
    let organicSessions: number | null = null;
    try {
      const organic = await request(endpoint, deadline, 'GA4', {
        ...common, metrics: [{ name: 'sessions' }], dimensionFilter: { andGroup: { expressions: [hostname, { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { matchType: 'EXACT', value: 'Organic Search', caseSensitive: true } } }] } },
      });
      organicSessions = metricValues(organic, ['sessions'], warnings).sessions;
    } catch (error) {
      if (error instanceof GoogleSeoError && [401, 403].includes(error.status)) throw error;
      warnings.push(error instanceof GoogleSeoError ? `Organic sessions unavailable: ${error.message}` : 'Organic sessions unavailable.');
    }
    warnings.push('GA4 uses the configured property and its reporting timezone, filtered to the requested host and www equivalent. GA4_SITE_DOMAIN is a local mapping, not proof that every property stream belongs to that host.');
    return { propertyId: selected, sessions: totals.sessions, activeUsers: totals.activeUsers, screenPageViews: totals.screenPageViews, organicSessions };
  }

  return {
    /** Search Console sites and GA4 properties the signed-in account can read, for pickers. */
    async properties() {
      bearer = token || await options.signIn?.accessToken() || '';
      if (!bearer) throw new GoogleSeoError(503, 'Sign in with Google first.');
      const deadline = Date.now() + 25000;
      const sites = await request('https://www.googleapis.com/webmasters/v3/sites', deadline, 'Search Console');
      const searchConsole = (Array.isArray(sites.siteEntry) ? sites.siteEntry : []).map(record).filter((entry) => typeof entry.siteUrl === 'string').map((entry) => ({ property: String(entry.siteUrl).slice(0, 300), permission: String(entry.permissionLevel || '') })).slice(0, 500);
      let analytics: { propertyId: string; name: string; account: string }[] = [];
      try {
        const summaries = await request('https://analyticsadmin.googleapis.com/v1beta/accountSummaries', deadline, 'GA4');
        analytics = (Array.isArray(summaries.accountSummaries) ? summaries.accountSummaries : []).map(record).flatMap((account) => (Array.isArray(account.propertySummaries) ? account.propertySummaries : []).map(record).map((property) => ({ propertyId: String(property.property || '').replace(/^properties\//, ''), name: String(property.displayName || '').slice(0, 200), account: String(account.displayName || '').slice(0, 200) }))).filter((property) => /^[1-9]\d{0,24}$/.test(property.propertyId)).slice(0, 500);
      } catch (error) { if (!(error instanceof GoogleSeoError) || ![403, 429, 502, 504].includes(error.status)) throw error; }
      return { searchConsole, analytics };
    },
    status(): GoogleSeoStatus {
      const viaSignIn = signedIn();
      const missingEnv = token || viaSignIn ? [] : ['GOOGLE_SEO_ACCESS_TOKEN'];
      const analyticsMissing = [...missingEnv, ...(!propertyId ? ['GA4_PROPERTY_ID'] : []), ...(!ga4Domain ? ['GA4_SITE_DOMAIN'] : [])];
      return {
        provider: 'google-first-party', configured: Boolean(token) || viaSignIn, requiredEnv: ['GOOGLE_SEO_ACCESS_TOKEN'], missingEnv,
        searchConsole: { configured: Boolean(token) || viaSignIn, requiredEnv: ['GOOGLE_SEO_ACCESS_TOKEN'] },
        analytics: { configured: Boolean(token && propertyId && ga4Domain) || viaSignIn, requiredEnv: ['GOOGLE_SEO_ACCESS_TOKEN', 'GA4_PROPERTY_ID', 'GA4_SITE_DOMAIN'], missingEnv: analyticsMissing },
        scopes: [...SCOPES],
        notes: ['Configuration flags indicate valid local settings, not successful authorization. Use your own OAuth access token with read-only scopes and authorized properties.', 'Tokens can expire. This connector performs explicit reads only, without OAuth login, token refresh or automatic retries.'],
      };
    },
    async pull(domain: string, from: string, to: string): Promise<GoogleSeoResult> {
      let input: z.infer<typeof googleSeoInput>;
      try { input = googleSeoInput.parse({ domain, from, to }); }
      catch { throw new GoogleSeoError(400, 'Supply a valid domain and YYYY-MM-DD date range with start before end.'); }
      bearer = token || await options.signIn?.accessToken() || '';
      if (!bearer) throw new GoogleSeoError(503, 'Sign in with Google under Add traffic data (or set GOOGLE_SEO_ACCESS_TOKEN) first.');
      if (active || lastRequest !== null && Date.now() - lastRequest < 10000) throw new GoogleSeoError(429, 'Wait ten seconds before another Google SEO pull.');
      active = true;
      lastRequest = Date.now();
      const deadline = Date.now() + 45000;
      const result: GoogleSeoResult = { ...input, collectedAt: new Date().toISOString(), search: null, analytics: null, warnings: [] };
      try {
        try { result.search = await search(input.domain, from, to, deadline, result.warnings); }
        catch (error) {
          if (error instanceof GoogleSeoError && [401, 403].includes(error.status)) throw error;
          result.warnings.push(error instanceof GoogleSeoError ? error.message : 'Search Console report unavailable.');
        }
        try { result.analytics = await analytics(input.domain, from, to, deadline, result.warnings); }
        catch (error) {
          if (error instanceof GoogleSeoError && [401, 403].includes(error.status)) throw error;
          result.warnings.push(error instanceof GoogleSeoError ? error.message : 'GA4 report unavailable.');
        }
        result.collectedAt = new Date().toISOString();
        return result;
      } finally { active = false; }
    },
  };
}
export type GoogleSeoProvider = ReturnType<typeof createGoogleSeoProvider>;
