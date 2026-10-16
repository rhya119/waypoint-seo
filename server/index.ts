import 'dotenv/config';
import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import express from 'express';
import { createApp } from './app.js';
import { createClaudeService } from './claude.js';
import { createYouTubeProvider } from './youtube.js';
import { createSocialConnectors } from './connectors.js';
import { createGoogleSeoProvider } from './google-data.js';
import { createGoogleOAuth, ga4Choice } from './google-oauth.js';
import { createTrafficEstimateProvider } from './traffic-estimates.js';
import { createPageSpeedProvider } from './research.js';
import { createSiteScanner } from './site-scan.js';
import { createAutoScan } from './auto-scan.js';
if (process.env.SEO_PROVIDER && process.env.SEO_PROVIDER !== 'demo') throw new Error('Only SEO_PROVIDER=demo is implemented.');
const host = process.env.HOST || '127.0.0.1';
if (!['127.0.0.1', 'localhost', '::1'].includes(host)) throw new Error('This scaffold has no authentication and must bind to loopback.');
const file = resolve(process.env.DATABASE_PATH || './data/waypoint.sqlite'); mkdirSync(dirname(file), { recursive: true });
const db = new DatabaseSync(file);
const googleOAuth = createGoogleOAuth(db, { clientId: process.env.GOOGLE_CLIENT_ID, clientSecret: process.env.GOOGLE_CLIENT_SECRET });
const scanner = createSiteScanner();
const pageSpeed = createPageSpeedProvider({ apiKey: process.env.PAGESPEED_API_KEY });
// Scheduled rescans share the interactive scanner, so a manual scan and a scheduled one never overlap.
const autoScan = createAutoScan(db, { scan: (domain) => scanner.scan(domain), speed: { keyed: () => pageSpeed.status().keyed, run: (domain, url) => pageSpeed.run({ domain, strategy: 'mobile' }, url) }, log: (message) => console.warn(message) });
const app = createApp(db, undefined, createClaudeService({ apiKey: process.env.ANTHROPIC_API_KEY, model: process.env.ANTHROPIC_MODEL }), createYouTubeProvider({ apiKey: process.env.YOUTUBE_API_KEY }), createSocialConnectors({ env: process.env }), {
  privateOrigin: process.env.WAYPOINT_PRIVATE_ORIGIN,
  google: createGoogleSeoProvider({ accessToken: process.env.GOOGLE_SEO_ACCESS_TOKEN, ga4PropertyId: process.env.GA4_PROPERTY_ID, ga4Domain: process.env.GA4_SITE_DOMAIN, signIn: { connected: () => googleOAuth.status().connected, accessToken: () => googleOAuth.accessToken(), ga4For: (domain) => ga4Choice(db, domain) } }),
  googleOAuth,
  trafficEstimates: createTrafficEstimateProvider({ apiKey: process.env.SIMILARWEB_API_KEY }),
  pageSpeed, scanner, autoScan,
});
app.use(express.static(resolve('dist')));
app.get('/{*path}', (_req, res) => res.sendFile(resolve('dist/index.html')));
const server = app.listen(Number(process.env.PORT || 4318), host, () => console.log(`Waypoint API: http://${host}:${process.env.PORT || 4318} (public scans and source data)`));
const tick = () => { autoScan.runDue().then((done) => { if (done.length) console.log(`Automatic rescans finished: ${done.join(', ')}`); }).catch((error) => console.warn('Automatic rescan check failed:', (error as Error).message)); };
setTimeout(tick, 120_000).unref();
setInterval(tick, 3_600_000).unref();
for (const signal of ['SIGTERM', 'SIGINT'] as const) process.on(signal, () => server.close(() => { db.close(); process.exit(0); }));
