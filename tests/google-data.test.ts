import test from 'node:test';
import assert from 'node:assert/strict';
import { createGoogleSeoProvider, GoogleSeoError } from '../server/google-data.js';

const from = '2026-09-01';
const to = '2026-09-30';
const secret = 'private-google-oauth-token';
const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'content-type': 'application/json' } });
const sites = (...siteUrl: string[]) => ({ siteEntry: siteUrl.map(siteUrl => ({ siteUrl, permissionLevel: 'siteOwner' })) });
type Call = { url: URL; init: RequestInit; body: Record<string, unknown> | null };
function transport(handler: (call: Call, index: number) => Response | Promise<Response>) {
  const calls: Call[] = [];
  const fetcher: typeof fetch = async (input, init = {}) => {
    const call = { url: new URL(String(input)), init, body: typeof init.body === 'string' ? JSON.parse(init.body) as Record<string, unknown> : null };
    calls.push(call);
    return handler(call, calls.length - 1);
  };
  return { calls, fetcher };
}
const errorStatus = (status: number) => (error: unknown) => error instanceof GoogleSeoError && error.status === status && !String(error).includes(secret);
const searchRow = (query: string, overrides: Record<string, unknown> = {}) => ({ keys: [query], clicks: 2, impressions: 20, position: 4.5, ...overrides });

test('Google setup flags are sanitized and missing or invalid settings do not claim access', async () => {
  const missing = createGoogleSeoProvider();
  assert.equal(missing.status().configured, false);
  assert.deepEqual(missing.status().missingEnv, ['GOOGLE_SEO_ACCESS_TOKEN']);
  await assert.rejects(missing.pull('garden.com', from, to), errorStatus(503));
  const configured = createGoogleSeoProvider({ accessToken: secret, ga4PropertyId: '12345', ga4Domain: 'garden.com' }).status();
  assert.equal(configured.configured, true);
  assert.equal(configured.analytics.configured, true);
  assert.equal(JSON.stringify(configured).includes(secret), false);
  assert.ok(configured.scopes.includes('https://www.googleapis.com/auth/webmasters.readonly'));
  assert.ok(configured.scopes.includes('https://www.googleapis.com/auth/analytics.readonly'));
  const invalid = createGoogleSeoProvider({ accessToken: secret, ga4PropertyId: '123/../../456', ga4Domain: 'invalid' }).status();
  assert.equal(invalid.analytics.configured, false);
  assert.deepEqual(invalid.analytics.missingEnv, ['GA4_PROPERTY_ID', 'GA4_SITE_DOMAIN']);
  assert.equal(createGoogleSeoProvider({ accessToken: 'bad\r\ntoken' }).status().configured, false);
});

test('authorized GSC Domain property is preferred, query contract is explicit, and empty metrics stay unknown', async () => {
  const mock = transport((_call, index) => index === 0
    ? json(sites('https://www.garden.com/', 'http://garden.com/', 'sc-domain:garden.com', 'https://other.com/'))
    : json({ rows: [searchRow('balcony garden'), searchRow('planter tips', { position: undefined }), searchRow('zero query', { clicks: 0, impressions: 0, position: 0 })] }));
  const result = await createGoogleSeoProvider({ accessToken: secret, fetch: mock.fetcher }).pull('https://www.garden.com/page', from, to);
  assert.equal(result.domain, 'garden.com');
  assert.equal(result.search?.property, 'sc-domain:garden.com');
  assert.equal(result.search?.source, 'google-search-console-api');
  assert.equal(result.search?.rows[0].position, 4.5);
  assert.equal(result.search?.rows[1].position, null);
  assert.equal(result.search?.rows[2].position, null);
  assert.equal(result.search?.truncated, false);
  assert.equal(result.analytics, null);
  assert.equal(mock.calls.length, 2);
  assert.equal(mock.calls[0].url.href, 'https://www.googleapis.com/webmasters/v3/sites');
  assert.equal(mock.calls[0].init.method, 'GET');
  assert.equal(mock.calls[1].url.pathname, '/webmasters/v3/sites/sc-domain%3Agarden.com/searchAnalytics/query');
  assert.deepEqual(mock.calls[1].body, { startDate: from, endDate: to, dimensions: ['query'], type: 'web', aggregationType: 'byProperty', dataState: 'final', rowLimit: 1000, startRow: 0 });
  for (const call of mock.calls) {
    assert.equal(new Headers(call.init.headers).get('authorization'), `Bearer ${secret}`);
    assert.equal(call.init.redirect, 'error');
    assert.ok(call.init.signal instanceof AbortSignal);
    assert.equal(call.url.search, '');
  }
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.match(result.warnings.join(' '), /query subset.*not global/);
});

test('GSC access requires exact normalized domains and authorized root properties', async () => {
  const denied = transport(() => json({ siteEntry: [
    ...sites('https://garden.com/blog/', 'https://garden.com.evil.com/', 'sc-domain:other.com', 'https://name:password@garden.com/', 'https://garden.com/?token=bad').siteEntry,
    { siteUrl: 'sc-domain:garden.com', permissionLevel: 'siteUnverifiedUser' },
  ] }));
  const empty = await createGoogleSeoProvider({ accessToken: secret, fetch: denied.fetcher }).pull('garden.com', from, to);
  assert.equal(empty.search, null);
  assert.equal(denied.calls.length, 1);
  assert.match(empty.warnings.join(' '), /no authorized matching/);
  const prefix = transport((_call, index) => index === 0 ? json(sites('https://www.garden.com/')) : json({ rows: [] }));
  const result = await createGoogleSeoProvider({ accessToken: secret, fetch: prefix.fetcher }).pull('garden.com', from, to);
  assert.equal(result.search?.property, 'https://www.garden.com/');
  assert.deepEqual(result.search?.rows, []);
  assert.match(prefix.calls[1].url.pathname, /https%3A%2F%2Fwww\.garden\.com%2F/);
});

test('GSC pagination uses bounded offsets, does not sum repeated queries and reports the cap', async () => {
  const mock = transport((call, index) => {
    if (index === 0) return json(sites('sc-domain:garden.com'));
    const offset = Number(call.body?.startRow);
    return json({ rows: Array.from({ length: 1000 }, (_, i) => searchRow(`query ${offset + i}`)) });
  });
  const capped = await createGoogleSeoProvider({ accessToken: secret, fetch: mock.fetcher }).pull('garden.com', from, to);
  assert.equal(capped.search?.rows.length, 5000);
  assert.equal(capped.search?.truncated, true);
  assert.equal(mock.calls.length, 6);
  assert.deepEqual(mock.calls.slice(1).map(call => call.body?.startRow), [0, 1000, 2000, 3000, 4000]);
  assert.match(capped.warnings.join(' '), /5,000-row cap/);
  const duplicateMock = transport((_call, index) => index === 0 ? json(sites('sc-domain:garden.com')) : json({ rows: index === 1 ? Array.from({ length: 1000 }, (_, i) => searchRow(`query ${i}`)) : [searchRow('query 0'), searchRow('final query')] }));
  const deduped = await createGoogleSeoProvider({ accessToken: secret, fetch: duplicateMock.fetcher }).pull('garden.com', from, to);
  assert.equal(deduped.search?.rows.length, 1001);
  assert.equal(deduped.search?.rows[0].clicks, 2);
  assert.equal(deduped.search?.truncated, false);
  assert.match(deduped.warnings.join(' '), /kept once, not added/);
});

test('GA4 requests domain-filtered totals and a separate Organic Search session report', async () => {
  const mock = transport((_call, index) => {
    if (index === 0) return json(sites());
    if (index === 1) return json({ metricHeaders: [{ name: 'activeUsers' }, { name: 'screenPageViews' }, { name: 'sessions' }], rows: [{ metricValues: [{ value: '100' }, { value: '350' }, { value: '150' }] }], rowCount: 1 });
    return json({ metricHeaders: [{ name: 'sessions' }], rows: [{ metricValues: [{ value: '80' }] }], rowCount: 1, metadata: { subjectToThresholding: true } });
  });
  const result = await createGoogleSeoProvider({ accessToken: secret, ga4PropertyId: '12345', ga4Domain: 'garden.com', fetch: mock.fetcher }).pull('garden.com', from, to);
  assert.deepEqual(result.analytics, { propertyId: '12345', sessions: 150, activeUsers: 100, screenPageViews: 350, organicSessions: 80 });
  assert.equal(mock.calls.length, 3);
  assert.ok(mock.calls.slice(1).every(call => call.url.href === 'https://analyticsdata.googleapis.com/v1beta/properties/12345:runReport'));
  assert.deepEqual(mock.calls[1].body?.dateRanges, [{ startDate: from, endDate: to }]);
  assert.deepEqual(mock.calls[1].body?.metrics, [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }]);
  const hostFilter = { filter: { fieldName: 'hostName', inListFilter: { values: ['garden.com', 'www.garden.com'], caseSensitive: false } } };
  assert.deepEqual(mock.calls[1].body?.dimensionFilter, hostFilter);
  assert.deepEqual(mock.calls[2].body?.dimensionFilter, { andGroup: { expressions: [hostFilter, { filter: { fieldName: 'sessionDefaultChannelGroup', stringFilter: { matchType: 'EXACT', value: 'Organic Search', caseSensitive: true } } }] } });
  assert.deepEqual(mock.calls[2].body?.metrics, [{ name: 'sessions' }]);
  assert.match(result.warnings.join(' '), /thresholding/);
});

test('GA4 is never queried for another domain, and unknown counts are not manufactured as zero', async () => {
  const mismatch = transport(() => json(sites()));
  const result = await createGoogleSeoProvider({ accessToken: secret, ga4PropertyId: '12345', ga4Domain: 'other.com', fetch: mismatch.fetcher }).pull('garden.com', from, to);
  assert.equal(result.analytics, null);
  assert.equal(mismatch.calls.length, 1);
  assert.match(result.warnings.join(' '), /does not match/);
  const unknown = transport((_call, index) => index === 0 ? json(sites()) : index === 1
    ? json({ metricHeaders: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }], rows: [{ metricValues: [{ value: '0' }, { value: '-1' }, { value: '9007199254740992' }] }] })
    : json({ metricHeaders: [{ name: 'sessions' }], rows: [] }));
  const totals = await createGoogleSeoProvider({ accessToken: secret, ga4PropertyId: '12345', ga4Domain: 'garden.com', fetch: unknown.fetcher }).pull('garden.com', from, to);
  assert.deepEqual(totals.analytics, { propertyId: '12345', sessions: 0, activeUsers: null, screenPageViews: null, organicSessions: null });
});

test('Google authorization errors have clear status, redact bodies, and do not retry', async () => {
  for (const status of [401, 403]) {
    const mock = transport(() => json({ error: { message: `token=${secret}`, stack: secret } }, status));
    await assert.rejects(createGoogleSeoProvider({ accessToken: secret, fetch: mock.fetcher }).pull('garden.com', from, to), errorStatus(status));
    assert.equal(mock.calls.length, 1);
  }
  const deniedGa4 = transport((_call, index) => index === 0 ? json(sites()) : json({ error: secret }, 403));
  await assert.rejects(createGoogleSeoProvider({ accessToken: secret, ga4PropertyId: '123', ga4Domain: 'garden.com', fetch: deniedGa4.fetcher }).pull('garden.com', from, to), errorStatus(403));
  assert.equal(deniedGa4.calls.length, 2);
});

test('provider failures are isolated, oversized and invalid responses stay sanitized, no retries occur', async () => {
  const partial = transport((_call, index) => index === 0 ? json({ error: secret }, 429) : json({ metricHeaders: [{ name: 'sessions' }, { name: 'activeUsers' }, { name: 'screenPageViews' }], rows: [{ metricValues: [{ value: '3' }, { value: '2' }, { value: '8' }] }] }));
  const result = await createGoogleSeoProvider({ accessToken: secret, ga4PropertyId: '123', ga4Domain: 'garden.com', fetch: partial.fetcher }).pull('garden.com', from, to);
  assert.equal(result.search, null);
  assert.equal(result.analytics?.sessions, 3);
  assert.match(result.warnings.join(' '), /quota or rate limit/);
  assert.equal(JSON.stringify(result).includes(secret), false);
  assert.equal(partial.calls.length, 3);
  for (const response of [new Response(secret, { headers: { 'content-length': '2000001' } }), new Response('x'.repeat(2_000_001)), new Response(`invalid JSON ${secret}`)]) {
    const mock = transport(() => response);
    const failed = await createGoogleSeoProvider({ accessToken: secret, fetch: mock.fetcher }).pull('garden.com', from, to);
    assert.equal(failed.search, null);
    assert.equal(JSON.stringify(failed).includes(secret), false);
    assert.equal(mock.calls.length, 1);
  }
  const badCounts = transport((_call, index) => index === 0 ? json(sites('sc-domain:garden.com')) : json({ rows: [searchRow('bad', { clicks: 21, impressions: 20 })] }));
  assert.equal((await createGoogleSeoProvider({ accessToken: secret, fetch: badCounts.fetcher }).pull('garden.com', from, to)).search, null);
});

test('Google pulls validate input before network and enforce one active pull plus ten-second cooldown', async () => {
  let finish: ((value: Response) => void) | undefined;
  const mock = transport(() => new Promise<Response>(resolve => { finish = resolve; }));
  const provider = createGoogleSeoProvider({ accessToken: secret, fetch: mock.fetcher });
  await assert.rejects(provider.pull('garden.com', '2026-02-30', to), errorStatus(400));
  await assert.rejects(provider.pull('garden.com', to, from), errorStatus(400));
  assert.equal(mock.calls.length, 0);
  const first = provider.pull('garden.com', from, to);
  await assert.rejects(provider.pull('garden.com', from, to), errorStatus(429));
  finish!(json(sites()));
  await first;
  await assert.rejects(provider.pull('garden.com', from, to), errorStatus(429));
  assert.equal(mock.calls.length, 1);
});

test('a stalled Google request is aborted at twelve seconds without exposing transport details', async context => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  let signal: AbortSignal | null | undefined;
  const mock = transport(call => { signal = call.init.signal; return new Promise<Response>(() => {}); });
  const pulling = createGoogleSeoProvider({ accessToken: secret, fetch: mock.fetcher }).pull('garden.com', from, to);
  context.mock.timers.tick(12000);
  const result = await pulling;
  assert.equal(signal?.aborted, true);
  assert.equal(result.search, null);
  assert.match(result.warnings.join(' '), /timed out/);
  assert.equal(mock.calls.length, 1);
});

test('the shared forty-five-second budget stops pagination and cannot start later provider requests', async context => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: 0 });
  const mock = transport((call, index) => new Promise<Response>(resolve => {
    setTimeout(() => resolve(index === 0 ? json(sites('sc-domain:garden.com')) : json({ rows: Array.from({ length: 1000 }, (_, i) => searchRow(`query ${Number(call.body?.startRow) + i}`)) })), 11000);
  }));
  const pulling = createGoogleSeoProvider({ accessToken: secret, ga4PropertyId: '123', ga4Domain: 'garden.com', fetch: mock.fetcher }).pull('garden.com', from, to);
  for (let i = 0; i < 4; i++) {
    context.mock.timers.tick(11000);
    await new Promise<void>(resolve => setImmediate(resolve));
  }
  assert.equal(mock.calls.length, 5);
  context.mock.timers.tick(1000);
  const result = await pulling;
  assert.equal(Date.now(), 45000);
  assert.equal(result.search, null);
  assert.equal(result.analytics, null);
  assert.equal(mock.calls[4].init.signal?.aborted, true);
  assert.equal(mock.calls.length, 5);
  assert.match(result.warnings.join(' '), /overall time limit/);
});
