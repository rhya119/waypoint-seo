import test from 'node:test';
import assert from 'node:assert/strict';
import { trafficEstimateInput } from '../shared/traffic-estimates.js';
import { createTrafficEstimateProvider, TrafficEstimateError } from '../server/traffic-estimates.js';

const input = { domain: 'https://www.iperly.lk/products', from: '2026-07-01', to: '2026-09-30' };
const response = (data: unknown[], extra: Record<string, unknown> = {}) => new Response(JSON.stringify({ meta: { status: 'Success', last_updated: '2026-10-10' }, data, ...extra }), { headers: { 'content-type': 'application/json' } });
const isStatus = (status: number) => (error: unknown) => error instanceof TrafficEstimateError && error.status === status;

test('monthly estimate input normalizes domains and rejects invalid periods before an external request', async () => {
  assert.equal(trafficEstimateInput.parse(input).domain, 'iperly.lk');
  for (const changes of [
    { domain: 'https://user:secret@iperly.lk' }, { domain: 'file:///private' },
    { from: '2026-07-02' }, { to: '2026-09-29' }, { to: '2026-02-30' },
    { from: 'not-a-date' }, { from: '2025-09-01' }, { from: '2026-10-01' },
  ]) assert.equal(trafficEstimateInput.safeParse({ ...input, ...changes }).success, false);
  assert.equal(trafficEstimateInput.safeParse({ ...input, from: '2025-10-01' }).success, true);
  let calls = 0;
  const provider = createTrafficEstimateProvider({ apiKey: 'fixture-secret', fetch: async () => { calls++; return response([]); } });
  await assert.rejects(provider.pull({ ...input, from: '2026-07-02' }));
  assert.equal(calls, 0);
});

test('Similarweb pull uses fixed official v5 endpoint, header auth and monthly estimated provenance', async () => {
  let calls = 0;
  const provider = createTrafficEstimateProvider({ apiKey: 'fixture-secret', fetch: async (target, options) => {
    calls++;
    const url = new URL(String(target));
    assert.equal(url.origin, 'https://api.similarweb.com');
    assert.equal(url.pathname, '/v5/website-analysis/websites/traffic-and-engagement');
    assert.equal(url.searchParams.get('domain'), 'iperly.lk');
    assert.equal(url.searchParams.get('start_date'), input.from);
    assert.equal(url.searchParams.get('end_date'), input.to);
    assert.equal(url.searchParams.get('metrics'), 'visits,bounce_rate,pages_per_visit');
    assert.equal(url.searchParams.get('granularity'), 'monthly');
    assert.equal(url.searchParams.get('country'), 'WW');
    assert.equal(url.toString().includes('fixture-secret'), false);
    assert.equal(new Headers(options?.headers).get('api-key'), 'fixture-secret');
    assert.equal(options?.redirect, 'error');
    assert.ok(options?.signal instanceof AbortSignal);
    return response([
      { date: '2026-09-01', visits: 1000.25, bounce_rate: 0.4, pages_per_visit: 2.3 },
      { date: '2026-07-01', visits: 0, bounce_rate: 0, pages_per_visit: null },
    ]);
  } });
  const report = await provider.pull(input);
  assert.equal(calls, 1);
  assert.equal(report.provider, 'similarweb');
  assert.equal(report.basis, 'third-party-estimate');
  assert.equal(report.domain, 'iperly.lk');
  assert.equal(report.granularity, 'monthly');
  assert.equal(report.country, 'WW');
  assert.equal(report.updatedAt, '2026-10-10');
  assert.deepEqual(report.series, [
    { date: '2026-07-01', visits: 0, bounceRate: 0, pagesPerVisit: null },
    { date: '2026-09-01', visits: 1000.25, bounceRate: 0.4, pagesPerVisit: 2.3 },
  ]);
  assert.match(report.disclosure, /not exact first-party visits or organic-search traffic/);
  assert.equal(JSON.stringify(report).includes('fixture-secret'), false);
  assert.equal(JSON.stringify(provider.status()).includes('fixture-secret'), false);
  assert.match(provider.status().notes.join(' '), /charges may apply/);
});

test('missing estimate coverage stays empty and unknown metrics are null rather than invented visits', async () => {
  const empty = await createTrafficEstimateProvider({ apiKey: 'key', fetch: async () => response([]) }).pull(input);
  assert.deepEqual(empty.series, []);
  assert.match(empty.disclosure, /No estimate coverage/);
  const unknown = await createTrafficEstimateProvider({ apiKey: 'key', fetch: async () => response([
    { date: '2026-07-01', visits: Number.MAX_SAFE_INTEGER + 1, bounce_rate: 1.1, pages_per_visit: -1 },
    { date: '2026-08-01', visits: '400', bounce_rate: null },
    { date: '2026-09-01', visits: -1.5, pages_per_visit: '2.5' },
  ]) }).pull(input);
  assert.ok(unknown.series.every(row => row.visits === null && row.bounceRate === null && row.pagesPerVisit === null));
  assert.match(unknown.disclosure, /no usable traffic metrics/);
});

test('unconfigured, unauthorized and provider-limit errors stay sanitized without retrying', async () => {
  const missing = createTrafficEstimateProvider();
  assert.equal(missing.status().configured, false);
  assert.deepEqual(missing.status().requiredEnv, ['SIMILARWEB_API_KEY']);
  await assert.rejects(missing.pull(input), isStatus(503));
  for (const status of [401, 403, 429, 500]) {
    let calls = 0;
    let cancelled = false;
    const provider = createTrafficEstimateProvider({ apiKey: 'fixture-secret', fetch: async () => {
      calls++;
      const body = new ReadableStream<Uint8Array>({
        start(controller) { controller.enqueue(new TextEncoder().encode('upstream echoed fixture-secret')); },
        cancel() { cancelled = true; },
      });
      return new Response(body, { status });
    } });
    await assert.rejects(provider.pull(input), error => isStatus(status === 500 ? 502 : status)(error) && !String(error).includes('fixture-secret'));
    assert.equal(calls, 1);
    assert.equal(cancelled, true);
  }
  const network = createTrafficEstimateProvider({ apiKey: 'fixture-secret', fetch: async () => { throw new Error('https://provider/fixture-secret'); } });
  await assert.rejects(network.pull(input), error => isStatus(502)(error) && !String(error).includes('fixture-secret'));
});

test('provider rejects malformed, duplicate and outside-period month buckets', async () => {
  for (const rows of [
    [{ date: '2026-07-02', visits: 4 }], [{ date: '2026-06-01', visits: 4 }],
    [{ date: '2026-07-01' }, { date: '2026-07-01' }], [{ visits: 4 }],
  ]) await assert.rejects(createTrafficEstimateProvider({ apiKey: 'key', fetch: async () => response(rows) }).pull(input), isStatus(502));
  await assert.rejects(createTrafficEstimateProvider({ apiKey: 'key', fetch: async () => response([], { meta: { status: 'Error', message: 'secret' } }) }).pull(input), isStatus(502));
  await assert.rejects(createTrafficEstimateProvider({ apiKey: 'key', fetch: async () => new Response('not json') }).pull(input), isStatus(502));
});

test('response bytes are capped even when Content-Length is absent', async () => {
  const oversized = 'x'.repeat(1024 * 1024 + 1);
  const streamed = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new TextEncoder().encode(oversized)); controller.close(); } });
  await assert.rejects(createTrafficEstimateProvider({ apiKey: 'key', fetch: async () => new Response(streamed) }).pull(input), isStatus(502));
  let cancelled = false;
  const rejectedBody = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new TextEncoder().encode('{}')); },
    cancel() { cancelled = true; },
  });
  await assert.rejects(createTrafficEstimateProvider({ apiKey: 'key', fetch: async () => new Response(rejectedBody, { headers: { 'content-length': String(1024 * 1024 + 1) } }) }).pull(input), isStatus(502));
  assert.equal(cancelled, true);
});

test('one active pull and a 10 second cooldown prevent repeated provider usage', async () => {
  let complete!: (value: Response) => void;
  let calls = 0;
  const provider = createTrafficEstimateProvider({ apiKey: 'key', fetch: async () => {
    calls++;
    return new Promise<Response>(resolve => { complete = resolve; });
  } });
  const first = provider.pull(input);
  await assert.rejects(provider.pull(input), isStatus(429));
  complete(response([]));
  await first;
  await assert.rejects(provider.pull(input), isStatus(429));
  assert.equal(calls, 1);
});
