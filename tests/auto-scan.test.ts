import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { createAutoScan } from '../server/auto-scan.js';
import type { SiteScan } from '../shared/site-scan.js';

const scan = (domain: string, scannedAt: string): SiteScan => ({
  domain, requestedUrl: `https://${domain}/`, finalUrl: `https://${domain}/`, scannedAt, status: 200, responseMs: 1, bytes: 1, title: 't', description: 'd', canonical: '', language: 'en', robotsMeta: '',
  headings: [], images: { total: 0, missingAlt: 0 }, wordCount: 1, topics: [], internalLinks: [], externalLinks: [], structuredDataTypes: [], openGraph: { title: '', description: '', image: '' },
  audit: { score: 100, checks: [], source: 'submitted-html', checkedAt: '' }, warnings: [], disclosure: '', robots: { url: '', status: 200, allowed: true, sitemaps: [] },
});

test('scheduled rescans run only when due, record automatic history, run speed tests when keyed and back off on failure', async () => {
  const db = new DatabaseSync(':memory:');
  let clock = Date.parse('2026-10-16T00:00:00Z');
  const scanned: string[] = [];
  let fail = false;
  let speedRuns = 0;
  const auto = createAutoScan(db, {
    now: () => clock,
    scan: async (domain) => { scanned.push(domain); if (fail) throw new Error('site down'); return scan(domain, new Date(clock).toISOString()); },
    speed: { keyed: () => true, run: async (domain, url) => { speedRuns++; return { domain, url, strategy: 'mobile', fetchedAt: '', score: 90, lab: { lcpMs: 1, cls: 0, tbtMs: 0, fcpMs: 0, speedIndexMs: 0, ttfbMs: 0 }, field: null, opportunities: [], source: '' }; } },
  });
  const app = createApp(db, undefined, undefined, undefined, undefined, { autoScan: auto, scanner: { scan: async (domain: string) => scan(domain, new Date(clock).toISOString()) } });
  await request(app).post('/api/web/scan').send({ domain: 'shop.com' }).expect(200);
  const set = await request(app).put('/api/web/auto-scan').send({ domain: 'www.shop.com', enabled: true, intervalDays: 7 }).expect(200);
  assert.equal(set.body.nextRun, '2026-10-23T00:00:00.000Z', 'next run is one interval after the last manual scan');
  await request(app).put('/api/web/auto-scan').send({ domain: 'shop.com', enabled: true, intervalDays: 3 }).expect(400);
  assert.deepEqual(await auto.runDue(), []);
  clock += 7 * 86_400_000;
  assert.deepEqual(await auto.runDue(), ['shop.com']);
  assert.equal(speedRuns, 1);
  const report = (await request(app).get('/api/web/report?domain=shop.com').expect(200)).body;
  assert.equal(report.scanHistory[0].auto, true);
  assert.equal(report.scanHistory[1].auto, false);
  assert.equal(report.pageSpeed.mobile.score, 90);
  assert.deepEqual(await auto.runDue(), [], 'not due again straight away');
  clock += 7 * 86_400_000; fail = true;
  assert.deepEqual(await auto.runDue(), []);
  assert.equal(auto.status('shop.com').lastError, 'site down');
  assert.deepEqual(await auto.runDue(), [], 'a failed site waits a full interval');
  await request(app).put('/api/web/auto-scan').send({ domain: 'shop.com', enabled: false }).expect(200);
  clock += 30 * 86_400_000; fail = false;
  const before = scanned.length;
  await auto.runDue();
  assert.equal(scanned.length, before, 'disabled sites are never scanned');
  assert.equal((await request(app).get('/api/web/auto-scan?domain=shop.com').expect(200)).body.nextRun, null);
});
