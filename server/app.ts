import express from 'express';
import { DatabaseSync } from 'node:sqlite';
import { z } from 'zod';
import { demoProvider, type SeoProvider } from './provider.js';
import { auditHtml } from './audit.js';
import { auditSocial } from './social.js';
import { socialAuditInput, campaignInput, buildCampaignLink, captionInput, reviewCaption, metadataInput, buildSocialMetadata } from '../shared/social.js';
import { createClaudeService, claudeInput, ClaudeError, type ClaudeService } from './claude.js';
import { initPerformance, getPerformance, parseImport, saveImport, validateImport, importInput, ingestInput, similarContent, PerformanceError } from './performance.js';
import { performanceFilters } from '../shared/performance.js';
import { createYouTubeProvider, youtubeInput, YouTubeError, type YouTubeProvider } from './youtube.js';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { createSocialConnectors, initSnapshots, readSnapshots, savePull, ConnectorError, type SocialConnectors } from './connectors.js';
import { nativePlatform, pullInput, snapshotFilters } from '../shared/connectors.js';
import { initWebData, importWebData, previewWebImport, webReport, webDomains, WebDataError, saveSiteScan, saveGoogleData, saveTrafficEstimate, savePageSpeed } from './web-data.js';
import { webDomain, trackInput } from '../shared/web-data.js';
import { createClaudeCodeStatus } from './claude-code.js';
import { createSiteScanner, SiteScanError } from './site-scan.js';
import { createGoogleSeoProvider, GoogleSeoError, type GoogleSeoProvider } from './google-data.js';
import { createGoogleOAuth, loopbackRedirect, ga4Choice, setGa4Choice, type GoogleOAuth } from './google-oauth.js';
import { googleSeoInput } from '../shared/google-data.js';
import { createTrafficEstimateProvider, TrafficEstimateError, type TrafficEstimateProvider } from './traffic-estimates.js';
import { trafficEstimateInput } from '../shared/traffic-estimates.js';
import { createPageSpeedProvider, createKeywordIdeas, ResearchError, type PageSpeedProvider, type KeywordIdeasProvider } from './research.js';
import { pageSpeedInput, keywordIdeasInput } from '../shared/research.js';
export function normalizeDomain(value: string): string {
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !url.hostname.includes('.') || !/^[a-z0-9.-]+$/i.test(url.hostname)) throw new Error('Enter a valid domain, such as example.com.');
  return url.hostname.toLowerCase().replace(/^www\./, '');
}
const domainSchema = z.string().trim().max(253).transform((value, ctx) => {
  try { return normalizeDomain(value); } catch { ctx.addIssue({ code: 'custom', message: 'Enter a valid HTTP(S) domain.' }); return z.NEVER; }
});
export type AppOptions = { privateOrigin?: string; scanner?: ReturnType<typeof createSiteScanner>; google?: Pick<GoogleSeoProvider, 'status' | 'pull'> & Partial<Pick<GoogleSeoProvider, 'properties'>>; googleOAuth?: GoogleOAuth; trafficEstimates?: TrafficEstimateProvider; pageSpeed?: PageSpeedProvider; keywordIdeas?: KeywordIdeasProvider };
export function createApp(db: DatabaseSync, provider: SeoProvider = demoProvider, claude: ClaudeService = createClaudeService(), youtube: YouTubeProvider = createYouTubeProvider(), connectors: SocialConnectors = createSocialConnectors(), options: AppOptions = {}) {
  let privateOrigin = '';
  if (options.privateOrigin) { const origin = new URL(options.privateOrigin); if (origin.protocol !== 'https:' || !origin.hostname.endsWith('.ts.net') || origin.username || origin.password || origin.port || origin.pathname !== '/' || origin.search || origin.hash) throw new Error('Private origin must be an HTTPS Tailscale .ts.net origin.'); privateOrigin = origin.origin; }
  db.exec('PRAGMA busy_timeout=5000');
  initPerformance(db);
  initSnapshots(db);
  initWebData(db);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY, domain TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS ranks(id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), keyword TEXT NOT NULL, country TEXT NOT NULL, device TEXT NOT NULL, position INTEGER NOT NULL, previous INTEGER NOT NULL, checked_at TEXT NOT NULL, provenance TEXT NOT NULL DEFAULT 'demo', UNIQUE(project_id,keyword,country,device));`);
  const app = express(); app.disable('x-powered-by');
  const claudeCodeStatus = createClaudeCodeStatus();
  const scanner = options.scanner || createSiteScanner();
  const google = options.google || createGoogleSeoProvider();
  const googleOAuth = options.googleOAuth || createGoogleOAuth(db);
  const trafficEstimates = options.trafficEstimates || createTrafficEstimateProvider();
  const pageSpeed = options.pageSpeed || createPageSpeedProvider();
  const keywordIdeas = options.keywordIdeas || createKeywordIdeas();
  app.use((req, res, next) => {
    if (!['127.0.0.1', 'localhost', '[::1]', '::1', ...(privateOrigin ? [new URL(privateOrigin).hostname] : [])].includes(req.hostname)) { res.status(403).json({ error: 'Only loopback or the configured private Tailscale host is accepted.' }); return; }
    next();
  });
  app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  // Loopback desktop application. Reject cross-origin browser writes even without CORS.
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin) {
      const allowed = [...(privateOrigin && req.hostname === new URL(privateOrigin).hostname ? [] : [`http://${req.get('host')}`]), 'http://127.0.0.1:5173', 'http://localhost:5173', ...(privateOrigin ? [privateOrigin] : [])];
      if (!allowed.includes(origin)) { res.status(403).json({ error: 'Cross-origin write rejected.' }); return; }
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', mode: 'public-scan-and-source-data', legacyProvider: provider.mode }));
  app.get('/api/web/domains', (_req, res) => res.json(webDomains(db)));
  app.get('/api/web/report', (req, res) => res.json(webReport(db, webDomain.parse(req.query.domain), req.query.datasetId ? z.coerce.number().int().positive().parse(req.query.datasetId) : undefined)));
  // Google sign-in runs only on the host computer: a Desktop OAuth client redirects to loopback.
  app.get('/api/google/oauth/status', (req, res) => res.json({ ...googleOAuth.status(), canSignInHere: Boolean(loopbackRedirect(req.get('host'))) }));
  app.get('/api/google/oauth/start', (req, res) => {
    const redirectUri = loopbackRedirect(req.get('host'));
    if (!redirectUri) { res.status(400).json({ error: 'Sign in with Google on the host computer (http://127.0.0.1), not over the private network.' }); return; }
    res.redirect(302, googleOAuth.start(redirectUri));
  });
  app.get('/api/google/oauth/callback', async (req, res) => {
    try { await googleOAuth.callback(req.query); res.redirect(302, '/#domain-overview'); }
    catch (error) {
      const message = (error instanceof GoogleSeoError ? error.message : 'Google sign-in failed.').replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
      res.status(error instanceof GoogleSeoError ? error.status : 500).type('html').send(`<!doctype html><meta charset="utf-8"><title>Google sign-in</title><body style="font-family:system-ui;max-width:520px;margin:80px auto;color:#203b32"><h1>Google sign-in did not finish</h1><p>${message}</p><p><a href="/#domain-overview">Back to Waypoint</a></p>`);
    }
  });
  app.post('/api/google/oauth/disconnect', async (_req, res) => res.json(await googleOAuth.disconnect()));
  app.get('/api/google/properties', async (req, res) => {
    if (!google.properties) { res.status(503).json({ error: 'Google properties are unavailable.' }); return; }
    const domain = req.query.domain ? webDomain.parse(req.query.domain) : null;
    res.json({ ...(await google.properties()), ga4: domain ? ga4Choice(db, domain) : null });
  });
  app.put('/api/google/ga4', (req, res) => {
    const input = z.object({ domain: webDomain, propertyId: z.string().regex(/^[1-9]\d{0,24}$/).nullable() }).parse(req.body);
    res.json({ domain: input.domain, propertyId: setGa4Choice(db, input.domain, input.propertyId) });
  });
  app.get('/api/web/connections', (_req, res) => res.json({ google: google.status(), trafficEstimates: trafficEstimates.status(), pageSpeed: pageSpeed.status() }));
  app.post('/api/web/scan', async (req, res) => { const { domain } = z.object({ domain: webDomain }).parse(req.body); res.json(saveSiteScan(db, await scanner.scan(domain), domain)); });
  app.post('/api/web/google', async (req, res) => { const input = googleSeoInput.parse(req.body); res.json(saveGoogleData(db, await google.pull(input.domain, input.from, input.to), input)); });
  // Optional metered providers run only on this explicit POST, never when a
  // website is selected, a report is read, or connection status is inspected.
  app.post('/api/web/traffic-estimates', async (req, res) => { const input = trafficEstimateInput.parse(req.body); res.json(saveTrafficEstimate(db, await trafficEstimates.pull(input), input)); });
  // Explicit research actions only: a speed test of the saved scan's final URL, and
  // Autocomplete ideas for a typed seed. Neither runs when a report is read.
  app.post('/api/web/pagespeed', async (req, res) => {
    const input = pageSpeedInput.parse(req.body);
    const site = webReport(db, input.domain).site;
    res.json(savePageSpeed(db, await pageSpeed.run(input, site?.finalUrl || `https://${input.domain}/`)));
  });
  app.post('/api/web/keyword-ideas', async (req, res) => res.json(await keywordIdeas.ideas(keywordIdeasInput.parse(req.body))));
  app.post('/api/web/import/preview', (req, res) => { const result = previewWebImport(req.body); res.json({ valid: result.valid, count: result.count, sample: result.sample, errors: result.errors }); });
  app.post('/api/web/import', (req, res) => res.json(importWebData(db, req.body)));
  app.post('/api/web/track', (req, res) => { const r = trackInput.parse(req.body); db.prepare('INSERT OR IGNORE INTO web_tracks VALUES(?,?,?,?)').run(r.domain, r.keyword, r.country, r.device); res.json({ ...r, message: 'Keyword saved. Positions appear only after you import actual observations.' }); });
  app.delete('/api/web/track', (req, res) => { const r = trackInput.parse(req.body); db.prepare('DELETE FROM web_tracks WHERE domain=? AND keyword=? AND country=? AND device=?').run(r.domain, r.keyword, r.country, r.device); res.status(204).end(); });
  app.delete('/api/web/datasets/:id', (req, res) => { const domain = webDomain.parse(req.body.domain); const id = z.coerce.number().int().positive().parse(req.params.id); const result = db.prepare('DELETE FROM web_datasets WHERE id=? AND domain=?').run(id, domain); res.status(result.changes ? 204 : 404).end(); });
  app.post('/api/web/audit', (req, res) => { const data = z.object({ domain: webDomain, html: z.string().min(10).max(900000) }).parse(req.body); const result = auditHtml(data.html); db.prepare('INSERT INTO web_audits VALUES(?,?) ON CONFLICT(domain) DO UPDATE SET payload=excluded.payload').run(data.domain, JSON.stringify(result)); res.json(result); });
  app.get('/api/projects', (_req, res) => res.json(db.prepare('SELECT * FROM projects ORDER BY id DESC').all()));
  app.post('/api/projects', (req, res) => {
    const { domain } = z.object({ domain: domainSchema }).parse(req.body);
    db.prepare('INSERT OR IGNORE INTO projects(domain) VALUES(?)').run(domain);
    res.status(201).json(db.prepare('SELECT * FROM projects WHERE domain=?').get(domain));
  });
  app.get('/api/analysis', (req, res) => res.json(provider.overview(domainSchema.parse(req.query.domain))));
  app.get('/api/keywords', (req, res) => res.json({ provenance: provider.mode, rows: provider.keywords(z.string().trim().min(2).max(120).parse(req.query.query)) }));
  app.get('/api/ranks', (req, res) => {
    const id = z.coerce.number().int().positive().parse(req.query.projectId);
    res.json(db.prepare('SELECT * FROM ranks WHERE project_id=? ORDER BY id DESC').all(id));
  });
  app.post('/api/ranks', (req, res) => {
    const data = z.object({ projectId: z.number().int().positive(), keyword: z.string().trim().min(2).max(120), country: z.enum(['NZ', 'US', 'GB', 'AU']), device: z.enum(['desktop', 'mobile']) }).parse(req.body);
    const project = db.prepare('SELECT domain FROM projects WHERE id=?').get(data.projectId) as { domain: string } | undefined;
    if (!project) { res.status(404).json({ error: 'Project not found.' }); return; }
    const position = provider.rank(project.domain, data.keyword, data.country, data.device);
    db.prepare('INSERT OR IGNORE INTO ranks(project_id,keyword,country,device,position,previous,checked_at) VALUES(?,?,?,?,?,?,?)').run(data.projectId, data.keyword, data.country, data.device, position, position, new Date().toISOString());
    res.status(201).json({ success: true });
  });
  app.delete('/api/ranks/:id', (req, res) => {
    db.prepare('DELETE FROM ranks WHERE id=?').run(z.coerce.number().int().positive().parse(req.params.id));
    res.status(204).end();
  });
  app.post('/api/audit', (req, res) => res.json(auditHtml(z.object({ html: z.string().min(10).max(900000) }).parse(req.body).html)));
  app.post('/api/social/audit', (req, res) => res.json(auditSocial(socialAuditInput.parse(req.body))));
  app.post('/api/social/metadata', (req, res) => res.json({ html: buildSocialMetadata(metadataInput.parse(req.body)) }));
  app.post('/api/social/caption', (req, res) => res.json(reviewCaption(captionInput.parse(req.body))));
  app.post('/api/social/campaign', (req, res) => res.json(buildCampaignLink(campaignInput.parse(req.body))));
  app.get('/api/claude/status', (_req, res) => res.json(claude.status()));
  app.get('/api/integrations/claude-code', async (_req, res) => res.json(await claudeCodeStatus()));
  app.post('/api/claude/recommend', async (req, res) => {
    if ((db.prepare('SELECT value FROM settings WHERE key=?').get('claude_enabled') as { value: string } | undefined)?.value !== 'true') { res.status(403).json({ error: 'Enable the optional Claude advisor in Integrations first.' }); return; }
    res.json(await claude.recommend(claudeInput.parse(req.body)));
  });
  app.get('/api/social/performance', (req, res) => res.json(getPerformance(db, performanceFilters.parse(req.query))));
  app.get('/api/social/similar', (req, res) => {
    const input = z.object({ ...performanceFilters.shape, referenceId: z.string().min(1).max(500), scope: z.enum(['platform', 'all']).default('platform') }).parse(req.query);
    res.json(similarContent(getPerformance(db, performanceFilters.parse(input)), input.referenceId, input.scope));
  });
  app.post('/api/social/import/preview', (req, res) => { const input = importInput.parse(req.body); res.json(parseImport(input.kind, input.csv).preview); });
  app.post('/api/social/import', (req, res) => { const input = importInput.parse(req.body); res.json(saveImport(db, input.kind, parseImport(input.kind, input.csv))); });
  app.post('/api/social/ingest', (req, res) => { const input = ingestInput.parse(req.body); res.json(saveImport(db, input.kind, validateImport(input.kind, input.rows))); });
  app.post('/api/social/research/youtube', async (req, res) => res.json(await youtube.research(youtubeInput.parse(req.body))));
  app.get('/api/social/snapshots', (req, res) => res.json(readSnapshots(db, snapshotFilters.parse(req.query))));
  app.post('/api/social/pull/:platform', async (req, res) => { const platform = nativePlatform.parse(req.params.platform); const input = pullInput.parse(req.body); res.json(savePull(db, await connectors.pull(platform, input.maxPosts))); });
  app.get('/api/integrations', (_req, res) => res.json({
    claude: { ...claude.status(), enabled: (db.prepare('SELECT value FROM settings WHERE key=?').get('claude_enabled') as { value: string } | undefined)?.value === 'true' },
    youtube: youtube.status(), connections: connectors.status(), platforms: ['youtube', 'instagram', 'tiktok', 'linkedin', 'facebook', 'x', 'pinterest', 'threads'].map(platform => ({ platform, import: true, ingestionApi: true, nativeApi: true })),
    plugin: { available: true, name: 'waypoint-seo', mode: 'optional-local-plugin', autoInstalled: false },
  }));
  app.put('/api/integrations/claude', (req, res) => { const { enabled } = z.object({ enabled: z.boolean() }).parse(req.body); db.prepare('INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('claude_enabled', String(enabled)); res.json({ enabled }); });
  app.get('/api/integrations/plugin', (_req, res) => { const path = resolve('artifacts/waypoint-seo.plugin'); if (!existsSync(path)) { res.status(404).json({ error: 'Prepare the source bundle with npm run plugin:package first.' }); return; } res.download(path, 'waypoint-seo.plugin'); });
  app.get('/api/reports', (req, res) => {
    const domain = domainSchema.parse(req.query.domain);
    const project = db.prepare('SELECT id FROM projects WHERE domain=?').get(domain) as { id: number } | undefined;
    res.json({ title: 'Waypoint search report', generatedAt: new Date().toISOString(), disclosure: 'Synthetic demo search metrics. No live rankings, traffic, or backlink index.', analysis: provider.overview(domain), ranks: project ? db.prepare('SELECT * FROM ranks WHERE project_id=?').all(project.id) : [] });
  });
  app.use('/api', (_req, res) => { res.status(404).json({ error: 'API route not found.' }); });
  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof PerformanceError || error instanceof YouTubeError || error instanceof ConnectorError || error instanceof WebDataError || error instanceof SiteScanError || error instanceof GoogleSeoError || error instanceof TrafficEstimateError || error instanceof ResearchError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof ClaudeError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof z.ZodError) { res.status(400).json({ error: error.issues[0]?.message || 'Invalid request.' }); return; }
    const status = (error as { status?: number }).status;
    res.status(status === 413 ? 413 : status === 400 ? 400 : 500).json({ error: status === 413 ? 'HTML exceeds the 1 MB request limit.' : status === 400 ? 'Invalid JSON body.' : 'The request could not be completed.' });
  });
  return app;
}
