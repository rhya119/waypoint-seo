import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createApp, type AppOptions } from '../server/app.js';
import { auditHtml } from '../server/audit.js';
import { SiteScanError } from '../server/site-scan.js';
import { createGoogleSeoProvider, GoogleSeoError } from '../server/google-data.js';
import { createTrafficEstimateProvider, TrafficEstimateError } from '../server/traffic-estimates.js';
import { webReport, webDomains } from '../server/web-data.js';
import type { SiteScan } from '../shared/site-scan.js';
import type { GoogleSeoResult } from '../shared/google-data.js';
import type { TrafficEstimateReport } from '../shared/traffic-estimates.js';

const domain = 'public-website.com';
const period = { from: '2026-09-01', to: '2026-09-30' };
function siteScan(site: string): SiteScan {
  return {
    domain: site, requestedUrl: `https://${site}/`, finalUrl: `https://${site}/`,
    scannedAt: '2026-10-16T00:00:00.000Z', status: 200, responseMs: 125, bytes: 500,
    title: 'Measured public page title', description: 'Public page description', canonical: `https://${site}/`, language: 'en', robotsMeta: '',
    headings: [{ level: 1, text: 'Public page' }], images: { total: 2, missingAlt: 1 }, wordCount: 150,
    topics: [{ term: 'garden', count: 5 }], internalLinks: [], externalLinks: [], structuredDataTypes: ['WebSite'],
    openGraph: { title: '', description: '', image: '' }, audit: auditHtml('<html lang="en"><title>Measured public page title</title><h1>Public page</h1></html>'),
    warnings: [], disclosure: 'Synthetic scanner fixture; no network request.', robots: { url: `https://${site}/robots.txt`, status: 200, allowed: true, sitemaps: [] },
  };
}
function googleReport(site: string, from: string, to: string): GoogleSeoResult {
  return {
    domain: site, from, to, collectedAt: '2026-10-16T00:00:00.000Z',
    search: { property: `sc-domain:${site}`, rows: [{ query: 'garden ideas', clicks: 10, impressions: 100, position: 5.25 }, { query: 'balcony plants', clicks: 20, impressions: 200, position: null }], truncated: false, source: 'google-search-console-api' },
    analytics: { propertyId: '123', sessions: 500, activeUsers: 300, screenPageViews: 750, organicSessions: 120 }, warnings: ['Synthetic provider fixture.'],
  };
}
function trafficReport(site: string, from: string, to: string): TrafficEstimateReport {
  return { provider: 'similarweb', basis: 'third-party-estimate', domain: site, from, to, granularity: 'monthly', country: 'WW', collectedAt: '2026-10-16T00:00:00.000Z', updatedAt: '2026-10-15', series: [{ date: from, visits: 1234, bounceRate: 0.45, pagesPerVisit: 2.7 }], disclosure: 'Synthetic third-party estimate fixture, not first-party traffic.' };
}
function providers() {
  const calls = { scan: 0, google: 0, traffic: 0 };
  const options: AppOptions = {
    scanner: { scan: async (site) => { calls.scan++; return siteScan(site); } },
    google: { status: () => createGoogleSeoProvider({ accessToken: 'secret-google-fixture-token', ga4Domain: domain, ga4PropertyId: '123' }).status(), pull: async (site, from, to) => { calls.google++; return googleReport(site, from, to); } },
    trafficEstimates: { status: () => createTrafficEstimateProvider({ apiKey: 'secret-similarweb-fixture-key' }).status(), pull: async ({ domain: site, from, to }) => { calls.traffic++; return trafficReport(site, from, to); } },
  };
  return { calls, options };
}
function appWith(db: DatabaseSync, options: AppOptions) { return createApp(db, undefined, undefined, undefined, undefined, options); }

test('connection/report reads and public scans never trigger optional Google or metered traffic providers', async () => {
  const db = new DatabaseSync(':memory:');
  const { calls, options } = providers();
  const app = appWith(db, options);
  try {
    const status = await request(app).get('/api/web/connections').expect(200);
    assert.equal(status.body.google.configured, true);
    assert.equal(status.body.trafficEstimates.configured, true);
    assert.equal(JSON.stringify(status.body).includes('secret-'), false);
    const health = await request(app).get('/api/health').expect(200);
    assert.equal(health.body.mode, 'public-scan-and-source-data');
    assert.equal(health.body.legacyProvider, 'demo');
    await request(app).get(`/api/web/report?domain=${domain}`).expect(200);
    const scanned = await request(app).post('/api/web/scan').send({ domain: `https://www.${domain}/some/path` }).expect(200);
    assert.equal(scanned.body.domain, domain);
    assert.equal(scanned.body.title, 'Measured public page title');
    const report = await request(app).get(`/api/web/report?domain=${domain}`).expect(200);
    assert.equal(report.body.site.wordCount, 150);
    assert.equal(report.body.audit.score, scanned.body.audit.score);
    assert.equal(report.body.totals.clicks, null);
    assert.equal(report.body.google, null);
    assert.equal(report.body.trafficEstimate, null);
    assert.deepEqual(calls, { scan: 1, google: 0, traffic: 0 });
    await request(app).post('/api/web/scan').send({ domain: 'second-website.com' }).expect(200);
    const comparison = (await request(app).get(`/api/web/report?domain=${domain}`)).body.publicComparisons;
    assert.equal(comparison.length, 1);
    assert.equal(comparison[0].domain, 'second-website.com');
    assert.equal(comparison[0].wordCount, 150);
    assert.deepEqual((await request(app).get('/api/web/domains')).body, [domain, 'second-website.com']);
  } finally { db.close(); }
});

test('Google API pulls persist first-party reports and validated non-overlapping query snapshots atomically', async () => {
  const db = new DatabaseSync(':memory:');
  const { options } = providers();
  const app = appWith(db, options);
  try {
    const result = await request(app).post('/api/web/google').send({ domain, ...period }).expect(200);
    assert.equal(result.body.analytics.sessions, 500);
    let report = (await request(app).get(`/api/web/report?domain=${domain}`)).body;
    const firstId = report.search.id;
    assert.equal(report.totals.clicks, 30);
    assert.equal(report.totals.impressions, 300);
    assert.equal(report.totals.ctr, 10);
    assert.equal(report.google.analytics.sessions, 500);
    assert.equal(report.trafficEstimate, null);
    assert.match(report.search.source, /sc-domain:public-website.com/);
    assert.match(report.search.scope, /Domain property/);
    assert.equal(report.queries.find((row: { query: string }) => row.query === 'garden ideas').position, 5.25);
    await request(app).post('/api/web/google').send({ domain, ...period }).expect(200);
    report = (await request(app).get(`/api/web/report?domain=${domain}`)).body;
    assert.equal(report.datasets.length, 1);
    await request(app).post('/api/web/google').send({ domain, ...period, from: '2026-09-10' }).expect(200);
    report = (await request(app).get(`/api/web/report?domain=${domain}`)).body;
    assert.equal(report.datasets.length, 2);
    assert.equal(report.totals.clicks, 30);
    assert.equal((await request(app).get(`/api/web/report?domain=${domain}&datasetId=${firstId}`)).body.search.from, period.from);
    options.google!.pull = async (site, from, to) => ({ ...googleReport(site, from, to), search: { ...googleReport(site, from, to).search!, rows: [{ query: 'bad', clicks: 11, impressions: 1, position: 1 }] } });
    await request(app).post('/api/web/google').send({ domain, ...period }).expect(502);
    report = (await request(app).get(`/api/web/report?domain=${domain}`)).body;
    assert.equal(report.datasets.length, 2);
    assert.equal(report.google.from, '2026-09-10');
    assert.equal(report.totals.clicks, 30);
  } finally { db.close(); }
});

test('empty authorized query subsets are saved as empty datasets and failed/mismatched providers do not overwrite them', async () => {
  const db = new DatabaseSync(':memory:');
  const { options } = providers();
  options.google!.pull = async (site, from, to) => ({ ...googleReport(site, from, to), search: { ...googleReport(site, from, to).search!, rows: [] } });
  const app = appWith(db, options);
  try {
    await request(app).post('/api/web/google').send({ domain, ...period }).expect(200);
    const report = (await request(app).get(`/api/web/report?domain=${domain}`)).body;
    assert.equal(report.google.search.rows.length, 0);
    assert.equal(report.google.analytics.sessions, 500);
    assert.equal(report.datasets.length, 1);
    assert.equal(report.datasets[0].count, 0);
    assert.equal(report.totals.clicks, 0);
    options.google!.pull = async (_site, from, to) => googleReport('wrong-domain.com', from, to);
    await request(app).post('/api/web/google').send({ domain, ...period }).expect(502);
    assert.equal((await request(app).get(`/api/web/report?domain=${domain}`)).body.google.domain, domain);
    assert.deepEqual((await request(app).get('/api/web/domains')).body, [domain]);
    options.scanner!.scan = async () => siteScan('wrong-domain.com');
    await request(app).post('/api/web/scan').send({ domain }).expect(502);
    assert.equal((await request(app).get(`/api/web/report?domain=${domain}`)).body.site, null);
  } finally { db.close(); }
});

test('a successful empty Google subset replaces previous same-window rows while an unavailable search preserves saved sources', async () => {
  const db = new DatabaseSync(':memory:');
  const { options } = providers();
  const app = appWith(db, options);
  try {
    await request(app).post('/api/web/google').send({ domain, ...period }).expect(200);
    let report = (await request(app).get(`/api/web/report?domain=${domain}`)).body;
    const id = report.search.id;
    assert.equal(report.totals.clicks, 30);
    options.google!.pull = async (site, from, to) => ({ ...googleReport(site, from, to), search: null, warnings: ['Search Console is unavailable; previously saved query sources remain separate.'] });
    await request(app).post('/api/web/google').send({ domain, ...period }).expect(200);
    report = (await request(app).get(`/api/web/report?domain=${domain}`)).body;
    assert.equal(report.google.search, null);
    assert.equal(report.search.id, id);
    assert.equal(report.totals.clicks, 30);
    options.google!.pull = async (site, from, to) => ({ ...googleReport(site, from, to), search: { ...googleReport(site, from, to).search!, rows: [] } });
    await request(app).post('/api/web/google').send({ domain, ...period }).expect(200);
    report = (await request(app).get(`/api/web/report?domain=${domain}`)).body;
    assert.equal(report.google.search.rows.length, 0);
    assert.equal(report.datasets.length, 1);
    assert.equal(report.search.id, id);
    assert.equal(report.search.count, 0);
    assert.deepEqual(report.queries, []);
    assert.equal(report.totals.clicks, 0);
    assert.equal(report.totals.impressions, 0);
    assert.equal(report.totals.queries, 0);
    assert.equal(report.totals.ctr, null);
    assert.equal(report.google.analytics.sessions, 500);
  } finally { db.close(); }
});

test('URL-prefix query snapshots keep HTTP/HTTPS and apex/www coverage distinct without domain-specific comparison scopes', async () => {
  const db = new DatabaseSync(':memory:');
  const { options } = providers();
  let property = `https://${domain}/`;
  let clicks = 10;
  options.google!.pull = async (site, from, to) => ({ ...googleReport(site, from, to), search: { property: property.replace(domain, site), rows: [{ query: 'garden ideas', clicks, impressions: 100, position: 5 }], truncated: false, source: 'google-search-console-api' } });
  const app = appWith(db, options);
  try {
    await request(app).post('/api/web/google').send({ domain, ...period }).expect(200);
    let report = (await request(app).get(`/api/web/report?domain=${domain}`)).body;
    const httpsId = report.search.id;
    const httpsScope = report.search.scope;
    property = `http://${domain}/`; clicks = 5;
    await request(app).post('/api/web/google').send({ domain, ...period }).expect(200);
    report = (await request(app).get(`/api/web/report?domain=${domain}`)).body;
    assert.equal(report.datasets.length, 2);
    assert.equal(report.totals.clicks, 5);
    assert.notEqual(report.search.scope, httpsScope);
    assert.equal((await request(app).get(`/api/web/report?domain=${domain}&datasetId=${httpsId}`)).body.totals.clicks, 10);
    property = `https://www.${domain}/`; clicks = 2;
    await request(app).post('/api/web/google').send({ domain, ...period }).expect(200);
    report = (await request(app).get(`/api/web/report?domain=${domain}`)).body;
    assert.equal(report.datasets.length, 3);
    assert.equal(report.totals.clicks, 2);
    assert.equal(new Set(report.datasets.map((dataset: { scope: string }) => dataset.scope)).size, 3);
    assert.ok(report.datasets.every((dataset: { scope: string }) => !dataset.scope.includes(domain)));
    property = `https://${domain}/`;
    await request(app).post('/api/web/google').send({ domain: 'another-website.com', ...period }).expect(200);
    const other = (await request(app).get('/api/web/report?domain=another-website.com')).body;
    assert.equal(other.search.scope, httpsScope);
    assert.equal(other.competitors.find((comparison: { domain: string }) => comparison.domain === domain).comparable, true);
  } finally { db.close(); }
});

test('traffic estimates require explicit valid monthly requests and stay separate from first-party query totals', async () => {
  const db = new DatabaseSync(':memory:');
  const { options, calls } = providers();
  const app = appWith(db, options);
  try {
    await request(app).post('/api/web/traffic-estimates').send({ domain, from: '2026-09-02', to: period.to }).expect(400);
    assert.equal(calls.traffic, 0);
    await request(app).post('/api/web/traffic-estimates').send({ domain, ...period }).expect(200);
    assert.equal(calls.traffic, 1);
    const report = (await request(app).get(`/api/web/report?domain=${domain}`)).body;
    assert.equal(report.trafficEstimate.basis, 'third-party-estimate');
    assert.equal(report.trafficEstimate.series[0].visits, 1234);
    assert.equal(report.totals.clicks, null);
    assert.equal(report.google, null);
    assert.equal(report.datasets.length, 0);
    options.trafficEstimates!.pull = async (input) => ({ ...trafficReport(input.domain, input.from, input.to), from: '2026-08-01' });
    await request(app).post('/api/web/traffic-estimates').send({ domain, ...period }).expect(502);
    assert.equal((await request(app).get(`/api/web/report?domain=${domain}`)).body.trafficEstimate.from, period.from);
  } finally { db.close(); }
});

test('connector API input, configured-provider errors and unknown upstream failures return bounded safe errors', async () => {
  const db = new DatabaseSync(':memory:');
  const { options, calls } = providers();
  const app = appWith(db, options);
  try {
    await request(app).post('/api/web/google').send({ domain, from: '2026-02-30', to: period.to }).expect(400);
    await request(app).post('/api/web/scan').send({ domain: 'javascript:alert(1)' }).expect(400);
    assert.deepEqual(calls, { scan: 0, google: 0, traffic: 0 });
    options.scanner!.scan = async () => { throw new SiteScanError(403, 'robots.txt disallows the selected page.'); };
    assert.match((await request(app).post('/api/web/scan').send({ domain }).expect(403)).body.error, /robots/);
    options.google!.pull = async () => { throw new GoogleSeoError(401, 'Renew the authorized read-only token.'); };
    await request(app).post('/api/web/google').send({ domain, ...period }).expect(401);
    options.trafficEstimates!.pull = async () => { throw new TrafficEstimateError(429, 'Provider usage limit reached.'); };
    await request(app).post('/api/web/traffic-estimates').send({ domain, ...period }).expect(429);
    options.scanner!.scan = async () => { throw new Error('secret-token backend diagnostics'); };
    const failed = await request(app).post('/api/web/scan').send({ domain }).expect(500);
    assert.equal(JSON.stringify(failed.body).includes('secret-token'), false);
    assert.deepEqual((await request(app).get('/api/web/domains')).body, []);
    const disabled = appWith(db, {});
    await request(disabled).post('/api/web/google').send({ domain, ...period }).expect(503);
    await request(disabled).post('/api/web/traffic-estimates').send({ domain, ...period }).expect(503);
  } finally { db.close(); }
});

test('scan/Google/estimate reports survive a read-only reopen and old databases without new tables remain readable', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'waypoint-connectors-'));
  const file = join(directory, 'reports.sqlite');
  const db = new DatabaseSync(file);
  const { options } = providers();
  try {
    const app = appWith(db, options);
    await request(app).post('/api/web/scan').send({ domain }).expect(200);
    await request(app).post('/api/web/google').send({ domain, ...period }).expect(200);
    await request(app).post('/api/web/traffic-estimates').send({ domain, ...period }).expect(200);
  } finally { db.close(); }
  const reopened = new DatabaseSync(file, { readOnly: true });
  try {
    const report = webReport(reopened, domain);
    assert.equal(report.site?.title, 'Measured public page title');
    assert.equal(report.google?.analytics?.sessions, 500);
    assert.equal(report.trafficEstimate?.series[0].visits, 1234);
    assert.equal(report.totals.clicks, 30);
    assert.deepEqual(webDomains(reopened), [domain]);
  } finally { reopened.close(); rmSync(file); rmdirSync(directory); }
  const old = new DatabaseSync(':memory:');
  try {
    assert.equal(webReport(old, domain).site, null);
    assert.equal(webReport(old, domain).google, null);
    assert.equal(webReport(old, domain).trafficEstimate, null);
    assert.deepEqual(webDomains(old), []);
    old.exec('CREATE TABLE web_site_scans(domain TEXT PRIMARY KEY,payload TEXT NOT NULL)');
    old.prepare('INSERT INTO web_site_scans VALUES(?,?)').run(domain, JSON.stringify(siteScan(domain)));
    assert.equal(webReport(old, domain).site?.wordCount, 150);
    assert.deepEqual(webDomains(old), [domain]);
  } finally { old.close(); }
});
