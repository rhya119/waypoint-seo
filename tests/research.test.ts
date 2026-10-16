import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { createApp } from '../server/app.js';
import { createKeywordIdeas, createPageSpeedProvider, groupIdea, ResearchError } from '../server/research.js';
import { relevantIdea } from '../shared/research.js';
import { findOpportunities, potentialClicks } from '../shared/opportunities.js';
import { assessAiReadiness, type PageSignals } from '../server/ai-readiness.js';
import { findPageIssues } from '../server/site-scan.js';
import { buildGrowthPlan } from '../src/GrowthPlan.js';
import { buildLlmsTxt, buildSchema } from '../src/Generators.js';
import type { SiteScan } from '../shared/site-scan.js';
import type { WebReport } from '../shared/web-data.js';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

test('PageSpeed parses lab, field and savings data and explains quota errors', async () => {
  let called = '';
  const provider = createPageSpeedProvider({ apiKey: 'k', fetch: (async (url: string) => {
    called = url;
    return json({
      lighthouseResult: { finalDisplayedUrl: 'https://shop.com/', categories: { performance: { score: 0.42 } }, audits: {
        'largest-contentful-paint': { numericValue: 5200 }, 'cumulative-layout-shift': { numericValue: 0.03 }, 'total-blocking-time': { numericValue: 700 },
        'first-contentful-paint': { numericValue: 2100 }, 'speed-index': { numericValue: 4000 }, 'server-response-time': { numericValue: 300 },
        'uses-webp': { title: 'Serve images in modern formats', score: 0.2, details: { type: 'opportunity', overallSavingsMs: 1800 } },
        'unused-js': { title: 'Reduce unused JavaScript', score: 0.5, details: { type: 'opportunity', overallSavingsMs: 900 } },
        'passed': { title: 'Already fine', score: 1, details: { type: 'opportunity', overallSavingsMs: 50 } },
      } },
      loadingExperience: { overall_category: 'SLOW', metrics: { LARGEST_CONTENTFUL_PAINT_MS: { percentile: 4100 }, INTERACTION_TO_NEXT_PAINT: { percentile: 250 }, CUMULATIVE_LAYOUT_SHIFT_SCORE: { percentile: 12 } } },
    });
  }) as typeof fetch });
  const result = await provider.run({ domain: 'shop.com', strategy: 'mobile' }, 'https://shop.com/');
  assert.match(called, /strategy=mobile/); assert.match(called, /key=k/);
  assert.equal(result.score, 42);
  assert.equal(result.lab.lcpMs, 5200);
  assert.deepEqual(result.field, { lcpMs: 4100, inpMs: 250, cls: 0.12, overall: 'SLOW', origin: false });
  assert.deepEqual(result.opportunities.map((item) => item.title), ['Serve images in modern formats', 'Reduce unused JavaScript']);
  const busy = createPageSpeedProvider({ fetch: (async () => json({ error: { message: 'Quota exceeded' } }, 429)) as typeof fetch });
  await assert.rejects(busy.run({ domain: 'shop.com', strategy: 'mobile' }, 'https://shop.com/'), (error: unknown) => error instanceof ResearchError && error.status === 429 && /PAGESPEED_API_KEY/.test(error.message));
});

test('keyword ideas expand modifiers, dedupe, group, cache and fail clearly', async () => {
  let calls = 0;
  const ideas = createKeywordIdeas({ delayMs: 0, fetch: (async (url: string) => {
    calls++;
    const q = new URL(url).searchParams.get('q')!;
    return json([q, [q, `${q} for women`, 'batik dress', 'how to wash batik dress', 'batik dress vs sarong', 'Batik Dress For Women']]);
  }) as typeof fetch });
  const result = await ideas.ideas({ seed: 'Batik  Dress', country: 'nz', language: 'en' });
  assert.equal(result.seed, 'batik dress');
  assert.equal(new Set(result.ideas.map((idea) => idea.phrase)).size, result.ideas.length);
  assert.ok(!result.ideas.some((idea) => idea.phrase === 'batik dress'));
  assert.equal(result.ideas.find((idea) => idea.phrase === 'how to wash batik dress')?.group, 'Questions');
  assert.equal(result.ideas.find((idea) => idea.phrase === 'batik dress vs sarong')?.group, 'Comparisons');
  const before = calls;
  await ideas.ideas({ seed: 'batik dress', country: 'nz', language: 'en' });
  assert.equal(calls, before, 'second identical request is cached');
  const failing = createKeywordIdeas({ delayMs: 0, fetch: (async () => new Response('', { status: 503 })) as typeof fetch });
  await assert.rejects(failing.ideas({ seed: 'anything', country: 'us', language: 'en' }), (error: unknown) => error instanceof ResearchError && error.status === 502);
  assert.equal(groupIdea('batik dress near me'), 'Local');
  assert.equal(groupIdea('best batik dress'), 'Buying');
  assert.equal(relevantIdea('batik dresses for women', 'batik dress'), true);
  assert.equal(relevantIdea('custom software engineer salary', 'custom software'), false);
  assert.equal(relevantIdea('how to custom program lg washer', 'custom software'), false);
});

test('Search Console opportunities find page-two, low-CTR, gap and question queries', () => {
  const rows = [
    { query: 'batik dress', clicks: 2, impressions: 400, position: 4, ctr: 0.5 },
    { query: 'batik shirt', clicks: 1, impressions: 300, position: 12, ctr: 0.3 },
    { query: 'how to wash batik', clicks: 0, impressions: 90, position: 25, ctr: 0 },
    { query: 'freesia batik', clicks: 80, impressions: 100, position: 1, ctr: 80 },
  ];
  const found = findOpportunities(rows);
  assert.deepEqual(found.lowCtr.map((row) => row.query), ['batik dress']);
  assert.deepEqual(found.striking.map((row) => row.query), ['batik shirt']);
  assert.deepEqual(found.gaps.map((row) => row.query), ['how to wash batik']);
  assert.deepEqual(found.questions.map((row) => row.query), ['how to wash batik']);
  assert.equal(found.top[0].query, 'freesia batik');
  assert.equal(potentialClicks(rows[1]), 32);
});

const signals: PageSignals = { questionHeadings: 0, subheadings: 4, listItems: 8, tables: 0, author: false, dated: false, statistics: 0, leadWords: 20, aboutLink: true, contactLink: true, feed: false, scripts: 2, emptyAppRoot: false, hiddenInstructions: false };
test('AI readiness scores to 100, penalises hidden prompts and flags JavaScript-only pages', () => {
  const base = { robotsFound: true, isAllowed: () => true, signals, structuredDataTypes: ['Organization', 'WebSite', 'FAQPage'], wordCount: 900, description: 'A shop.', openGraph: { title: 'Shop', description: 'd', image: 'https://s.com/i.jpg' }, canonical: 'https://s.com/', language: 'en', noindex: false, sitemaps: ['https://s.com/sitemap.xml'], llms: { found: true, lines: 10, links: 5 }, h1Count: 1 };
  const good = assessAiReadiness({ ...base, signals: { ...signals, questionHeadings: 4, tables: 1, statistics: 5, author: true, dated: true, feed: true } });
  assert.equal(good.score, 100); assert.equal(good.grade, 'A');
  const tricked = assessAiReadiness({ ...base, signals: { ...signals, hiddenInstructions: true } });
  assert.ok(tricked.checks.some((check) => check.id === 'manipulation' && !check.passed));
  const shell = assessAiReadiness({ ...base, wordCount: 20, signals: { ...signals, emptyAppRoot: true } });
  assert.equal(shell.checks.find((check) => check.id === 'rendered-text')?.points, 0);
});

test('page issue finder groups duplicate, missing, thin, noindex, canonical and broken pages', () => {
  const page = { url: 'https://s.com/a', status: 200, title: 'Same title for both pages', description: '', h1Count: 0, responseMs: 1, score: 50, wordCount: 100, canonical: 'https://s.com/b', noindex: true, missingAlt: 2, depth: 4 };
  const issues = findPageIssues([page, { ...page, url: 'https://s.com/c', canonical: '' , noindex: false, depth: 1, wordCount: 600, h1Count: 1, missingAlt: 0 }, { url: 'https://s.com/gone', status: 404, title: '', description: '', h1Count: 0, responseMs: 1, score: null, error: 'HTTP 404' }]);
  const types = (url: string) => issues.filter((issue) => issue.url === url).map((issue) => issue.type).sort();
  assert.deepEqual(types('https://s.com/a'), ['Deep page', 'Duplicate title', 'Images without alt', 'Links to non-canonical URL', 'Missing H1', 'Missing description', 'Noindex page', 'Thin content']);
  assert.deepEqual(types('https://s.com/c'), ['Duplicate title', 'Missing description']);
  assert.deepEqual(types('https://s.com/gone'), ['Broken page']);
});

const scan = (extra: Partial<SiteScan> = {}): SiteScan => ({
  domain: 's.com', requestedUrl: 'https://s.com/', finalUrl: 'https://s.com/', scannedAt: '2026-10-16T00:00:00Z', status: 200, responseMs: 1, bytes: 1,
  title: 'A good shop title here', description: 'A description long enough to pass the checklist for this page.', canonical: 'https://s.com/', language: 'en', robotsMeta: '',
  headings: [], images: { total: 0, missingAlt: 0 }, wordCount: 800, topics: [], internalLinks: [], externalLinks: [], structuredDataTypes: [], openGraph: { title: '', description: '', image: '' },
  audit: { score: 100, checks: [], source: 'submitted-html', checkedAt: '' }, warnings: [], disclosure: '', robots: { url: '', status: 200, allowed: true, sitemaps: [] }, ...extra,
});
const report = (extra: Partial<WebReport> = {}): WebReport => ({ site: scan(), publicComparisons: [], google: null, trafficEstimate: null, domain: 's.com', provenance: 'imported', datasets: [], search: null, backlinks: null, queries: [], links: [], totals: { clicks: null, impressions: null, ctr: null, queries: null, backlinks: null, referringHosts: null }, ranks: [], tracks: [], competitors: [], audit: null, pageSpeed: null, scanHistory: [], disclosure: '', ...extra });

test('growth plan always has ten ranked actions and promotes real blockers', () => {
  const blocked = assessAiReadiness({ robotsFound: true, isAllowed: (agent) => agent !== 'PerplexityBot', signals, structuredDataTypes: [], wordCount: 800, description: 'd', openGraph: { title: '', description: '', image: '' }, canonical: '', language: 'en', noindex: false, sitemaps: [], llms: { found: false, lines: 0, links: 0 }, h1Count: 1 });
  const plan = buildGrowthPlan(report({
    site: scan({ ai: blocked, llms: { url: '', status: 404, found: false, lines: 0, links: 0 }, pageIssues: [{ type: 'Noindex page', severity: 'error', url: 'https://s.com/shop', detail: '' }] }),
    pageSpeed: { mobile: { domain: 's.com', url: 'https://s.com/', strategy: 'mobile', fetchedAt: '', score: 31, lab: { lcpMs: 6000, cls: 0, tbtMs: 0, fcpMs: 0, speedIndexMs: 0, ttfbMs: 0 }, field: null, opportunities: [{ title: 'Serve images in modern formats', savingsMs: 2000 }], source: '' } },
  }));
  assert.equal(plan.length, 10);
  assert.deepEqual(plan.slice(0, 3).map((action) => action.id), ['noindex-pages', 'ai-bots', 'speed-real']);
  assert.match(plan[1].why, /PerplexityBot/);
  assert.ok(plan.some((action) => action.id === 'llms'));
  assert.equal(new Set(plan.map((action) => action.id)).size, 10);
  assert.equal(buildGrowthPlan(report()).length, 10);
});

test('generators build llms.txt from crawled pages and script-safe JSON-LD', () => {
  const site = scan({ pageChecks: [
    { url: 'https://s.com/', status: 200, title: 'Home [shop]', description: 'Welcome', h1Count: 1, responseMs: 1, score: 100, depth: 0 },
    { url: 'https://s.com/deep', status: 200, title: 'Deep', description: '', h1Count: 1, responseMs: 1, score: 100, depth: 2 },
    { url: 'https://s.com/gone', status: 404, title: '', description: '', h1Count: 0, responseMs: 1, score: null, error: 'x', depth: 1 },
  ] });
  const llms = buildLlmsTxt(site, 'Shop', 'We sell things.');
  assert.match(llms, /^# Shop\n\n> We sell things\.\n\n## Main pages\n\n- \[Home shop\]\(https:\/\/s\.com\/\): Welcome/);
  assert.match(llms, /## Optional\n\n- \[Deep\]\(https:\/\/s\.com\/deep\)/);
  assert.doesNotMatch(llms, /gone/);
  const schema = buildSchema({ type: 'LocalBusiness', name: '</script><b>', url: 'https://s.com/', logo: '', description: '', phone: '', email: '', street: '', city: 'Kandy', country: 'LK', sameAs: 'https://facebook.com/s javascript:alert(1)', faqs: [{ q: 'Open?', a: 'Yes.' }, { q: '', a: '' }] });
  assert.doesNotMatch(schema.slice(30, -10), /<\/script>/);
  const data = JSON.parse(schema.replace(/^<script[^>]*>\n/, '').replace(/\n<\/script>$/, ''));
  assert.equal(data['@graph'][0].address.addressLocality, 'Kandy');
  assert.deepEqual(data['@graph'][0].sameAs, ['https://facebook.com/s']);
  assert.equal(data['@graph'][2].mainEntity.length, 1);
});

test('speed tests save per strategy, and every scan adds bounded history to the report', async () => {
  const db = new DatabaseSync(':memory:');
  let n = 0;
  const app = createApp(db, undefined, undefined, undefined, undefined, {
    scanner: { scan: async (domain: string) => scan({ domain, scannedAt: new Date(Date.UTC(2026, 9, 16, 0, n)).toISOString(), pageIssues: n++ === 0 ? [{ type: 'Missing H1', severity: 'error', url: 'https://s.com/a', detail: '' }] : [] }) },
    pageSpeed: { status: () => ({ provider: 'test', configured: true, keyed: false, notes: [] }), run: async (input, url) => ({ domain: input.domain, url, strategy: input.strategy, fetchedAt: '', score: 77, lab: { lcpMs: 1, cls: 0, tbtMs: 0, fcpMs: 0, speedIndexMs: 0, ttfbMs: 0 }, field: null, opportunities: [], source: 'test' }) },
  });
  for (let i = 0; i < 2; i++) await request(app).post('/api/web/scan').send({ domain: 's.com' }).expect(200);
  await request(app).post('/api/web/pagespeed').send({ domain: 's.com', strategy: 'desktop' }).expect(200);
  const { body } = await request(app).get('/api/web/report?domain=s.com').expect(200);
  assert.equal(body.pageSpeed.desktop.score, 77);
  assert.equal(body.pageSpeed.mobile, undefined);
  assert.equal(body.scanHistory.length, 2);
  assert.deepEqual(body.scanHistory[1].issues, ['Missing H1|https://s.com/a']);
  assert.deepEqual(body.scanHistory[0].issues, []);
  await request(app).post('/api/web/keyword-ideas').send({ seed: 'x' }).expect(400);
  db.close();
});
