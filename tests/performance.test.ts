import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { initPerformance, parseImport, validateImport, saveImport, getPerformance, similarContent, contentKey } from '../server/performance.js';
import { createYouTubeProvider, YouTubeError } from '../server/youtube.js';
const base = { platform: 'youtube', account: '@garden', content_id: 'a', date: '2026-10-15', published_at: '2026-10-01', title: 'Balcony garden tutorial', caption: '', keywords: 'balcony garden', format: 'video', ownership: 'owned', url: '', views: 100, impressions: 500, clicks: 20, likes: 5, comments: 1, shares: 2, saves: 2 };

test('empty measured workspace does not silently use fictional metrics; example is explicit', () => {
  const db = new DatabaseSync(':memory:'); initPerformance(db);
  try { const real = getPerformance(db); assert.equal(real.dataset, 'imported'); assert.equal(real.totals.views, null); assert.deepEqual(real.posts, []); const example = getPerformance(db, { dataset: 'example' }); assert.ok(example.posts.length); assert.equal(getPerformance(db).posts.length, 0); }
  finally { db.close(); }
});
test('CSV quoting/newlines, unknown metrics, duplicate rows and invalid numbers are validated before writes', () => {
  const csv = 'platform,account,content_id,date,published_at,title,format,ownership,views\nyoutube,@garden,a,2026-10-15,2026-10-01,"A garden,\nmade simple",video,owned,100';
  const result = parseImport('content', csv); assert.equal(result.preview.valid, true); assert.equal(result.data[0].views, 100); assert.equal(result.data[0].impressions, null);
  assert.equal(parseImport('content', csv.replace(/,100$/, ',-5')).preview.valid, false);
  assert.equal(parseImport('content', 'platform,platform\nyoutube,youtube').preview.valid, false);
  assert.equal(validateImport('content', [base, base]).preview.valid, false);
  assert.equal(validateImport('content', [{ ...base, date: '2026-02-30' }]).preview.valid, false);
});
test('imports replace duplicate days, survive reopen, preserve nulls and do not partially save invalid batches', () => {
  const folder = mkdtempSync(join(tmpdir(), 'waypoint-')); const file = join(folder, 'test.sqlite'); let db = new DatabaseSync(file); initPerformance(db);
  try {
    saveImport(db, 'content', validateImport('content', [base])); saveImport(db, 'content', validateImport('content', [{ ...base, views: 150, saves: null }]));
    assert.equal(getPerformance(db).totals.views, 150); assert.equal(getPerformance(db).posts.length, 1); assert.equal(getPerformance(db).posts[0].engagementRate, null);
    assert.throws(() => saveImport(db, 'content', validateImport('content', [base, { ...base, content_id: 'bad', views: -1 }])));
    assert.equal(getPerformance(db).totals.views, 150);
    db.close(); db = new DatabaseSync(file, { readOnly: true }); assert.equal(getPerformance(db).totals.views, 150);
  } finally { db.close(); rmSync(file, { force: true }); rmdirSync(folder); }
});
test('query CTR uses paired denominators; content topic views stay separate; zero denominators remain unknown', () => {
  const db = new DatabaseSync(':memory:'); initPerformance(db);
  try {
    saveImport(db, 'content', validateImport('content', [base]));
    saveImport(db, 'queries', validateImport('queries', [{ platform: 'youtube', account: '@garden', date: '2026-10-15', keyword: 'balcony garden', impressions: 100, clicks: 10 }, { platform: 'youtube', account: '@garden', date: '2026-10-14', keyword: 'balcony garden', impressions: 900, clicks: null }]));
    const data = getPerformance(db); assert.equal(data.queries[0].ctr, 10); assert.equal(data.queries[0].views, null); assert.equal(data.topics[0].views, 100); assert.equal(data.totals.views, 100); assert.equal(data.queries[0].history.length, 2);
    saveImport(db, 'content', validateImport('content', [{ ...base, views: 0 }])); assert.equal(getPerformance(db).posts[0].engagementRate, null);
  } finally { db.close(); }
});
test('similar content honors platform scope and excludes the reference; dates and keyword filters apply', () => {
  const db = new DatabaseSync(':memory:'); initPerformance(db);
  try {
    saveImport(db, 'content', validateImport('content', [base, { ...base, content_id: 'b', title: 'Balcony garden ideas', ownership: 'competitor', views: 200 }, { ...base, platform: 'instagram', content_id: 'c', title: 'Balcony garden ideas', views: 500 }]));
    const data = getPerformance(db); const first = data.posts.find(row => row.content_id === 'a')!;
    assert.equal(similarContent(data, contentKey(first)).matches.length, 1); assert.equal(similarContent(data, contentKey(first), 'all').matches.length, 2);
    assert.equal(similarContent(data, contentKey(first)).matches[0].viewsDifference, 100);
    assert.equal(getPerformance(db, { keyword: 'not present' }).posts.length, 0);
    assert.throws(() => getPerformance(db, { from: '2020-01-01', to: '2026-10-15' }));
    assert.equal(getPerformance(db, { from: '2026-10-16', to: '2026-10-17' }).totals.views, null);
  } finally { db.close(); }
});
test('API handles preview, ingestion, measured reporting and optional Claude settings without credentials', async () => {
  const db = new DatabaseSync(':memory:'); const app = createApp(db);
  try {
    const connections = await request(app).get('/api/integrations').expect(200); assert.equal(connections.body.claude.enabled, false); assert.equal(connections.body.platforms.length, 8);
    await request(app).post('/api/social/ingest').send({ kind: 'content', metricBasis: 'lifetime', rows: [base] }).expect(400);
    await request(app).post('/api/social/ingest').send({ kind: 'content', metricBasis: 'daily', rows: [base] }).expect(200);
    await request(app).post('/api/social/ingest').send({ kind: 'content', metricBasis: 'daily', rows: [base] }).expect(200);
    const data = await request(app).get('/api/social/performance').expect(200); assert.equal(data.body.coverage.contentRows, 1);
    await request(app).get('/api/social/performance?from=2026-10-20&to=2026-10-01').expect(400);
    await request(app).get('/api/social/similar?referenceId=missing').expect(404);
    await request(app).post('/api/social/research/youtube').send({ keyword: 'garden' }).expect(503);
    await request(app).put('/api/integrations/claude').send({ enabled: true }).expect(200);
    const enabled = await request(app).get('/api/integrations'); assert.equal(enabled.body.claude.enabled, true);
  } finally { db.close(); }
});
test('native YouTube adapter uses fixed official endpoints and keeps lifetime counts separate', async () => {
  const urls: URL[] = [];
  const fakeFetch: typeof fetch = async input => { const url = new URL(String(input)); urls.push(url); return new Response(JSON.stringify(url.pathname.endsWith('/search') ? { items: [{ id: { videoId: 'abc' } }] } : { items: [{ id: 'abc', snippet: { title: 'A garden guide', channelTitle: 'Garden', publishedAt: '2026-01-01T00:00:00Z' }, statistics: { viewCount: '1000', likeCount: '20' } }] }), { headers: { 'content-type': 'application/json' } }); };
  const provider = createYouTubeProvider({ apiKey: 'test-key', fetch: fakeFetch }); const result = await provider.research({ keyword: 'garden' });
  assert.equal(urls.length, 2); assert.ok(urls.every(url => url.origin === 'https://www.googleapis.com')); assert.equal(urls[0].searchParams.get('q'), 'garden'); assert.equal(result.results[0].views, 1000); assert.equal(result.results[0].comments, null); assert.match(result.disclosure, /lifetime/); assert.equal(JSON.stringify(result).includes('test-key'), false);
  await assert.rejects(createYouTubeProvider().research({ keyword: 'garden' }), error => error instanceof YouTubeError && error.status === 503);
});
test('previous-period comparison requires complete metric/day coverage and start-only future filters stay empty', () => {
  const db = new DatabaseSync(':memory:'); initPerformance(db);
  try {
    saveImport(db, 'content', validateImport('content', [base, { ...base, date: '2026-10-14', views: 50 }]));
    const complete = getPerformance(db, { from: '2026-10-15', to: '2026-10-15' }); assert.equal(complete.comparison.metricComparable.views, true);
    const partial = getPerformance(db, { from: '2026-10-15', to: '2026-10-16' }); assert.equal(partial.comparison.metricComparable.views, false);
    const future = getPerformance(db, { from: '2026-12-01' }); assert.equal(future.totals.views, null); assert.equal(future.series.length, 1);
  } finally { db.close(); }
});
