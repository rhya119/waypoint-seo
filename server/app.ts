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
export function normalizeDomain(value: string): string {
  const url = new URL(value.includes('://') ? value : `https://${value}`);
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.port || !url.hostname.includes('.') || !/^[a-z0-9.-]+$/i.test(url.hostname)) throw new Error('Enter a valid domain, such as example.com.');
  return url.hostname.toLowerCase().replace(/^www\./, '');
}
const domainSchema = z.string().trim().max(253).transform((value, ctx) => {
  try { return normalizeDomain(value); } catch { ctx.addIssue({ code: 'custom', message: 'Enter a valid HTTP(S) domain.' }); return z.NEVER; }
});
export function createApp(db: DatabaseSync, provider: SeoProvider = demoProvider, claude: ClaudeService = createClaudeService(), youtube: YouTubeProvider = createYouTubeProvider(), connectors: SocialConnectors = createSocialConnectors()) {
  initPerformance(db);
  initSnapshots(db);
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS projects(id INTEGER PRIMARY KEY, domain TEXT NOT NULL UNIQUE, created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS ranks(id INTEGER PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), keyword TEXT NOT NULL, country TEXT NOT NULL, device TEXT NOT NULL, position INTEGER NOT NULL, previous INTEGER NOT NULL, checked_at TEXT NOT NULL, provenance TEXT NOT NULL DEFAULT 'demo', UNIQUE(project_id,keyword,country,device));`);
  const app = express(); app.disable('x-powered-by');
  app.use((req, res, next) => {
    if (!['127.0.0.1', 'localhost', '[::1]', '::1'].includes(req.hostname)) { res.status(403).json({ error: 'Only loopback hosts are accepted.' }); return; }
    next();
  });
  app.use((_req, res, next) => { res.setHeader('X-Content-Type-Options', 'nosniff'); next(); });
  // Loopback desktop application. Reject cross-origin browser writes even without CORS.
  app.use((req, res, next) => {
    const origin = req.get('origin');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && origin) {
      const allowed = [`http://${req.get('host')}`, 'http://127.0.0.1:5173', 'http://localhost:5173'];
      if (!allowed.includes(origin)) { res.status(403).json({ error: 'Cross-origin write rejected.' }); return; }
    }
    next();
  });
  app.use(express.json({ limit: '1mb' }));
  app.get('/api/health', (_req, res) => res.json({ status: 'ok', provider: provider.mode }));
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
    if (error instanceof PerformanceError || error instanceof YouTubeError || error instanceof ConnectorError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof ClaudeError) { res.status(error.status).json({ error: error.message }); return; }
    if (error instanceof z.ZodError) { res.status(400).json({ error: error.issues[0]?.message || 'Invalid request.' }); return; }
    const status = (error as { status?: number }).status;
    res.status(status === 413 ? 413 : status === 400 ? 400 : 500).json({ error: status === 413 ? 'HTML exceeds the 1 MB request limit.' : status === 400 ? 'Invalid JSON body.' : 'The request could not be completed.' });
  });
  return app;
}
