import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createWaypointMcp } from './server.js';
import { getPerformance } from '../server/performance.js';
import { createYouTubeProvider } from '../server/youtube.js';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { initWebData, importWebData, webReport, webDomains } from '../server/web-data.js';
import { readSnapshots } from '../server/connectors.js';
const root = fileURLToPath(new URL('../', import.meta.url));
config({ path: resolve(root, '.env'), quiet: true });
const server = createWaypointMcp(() => {
  const path = resolve(root, process.env.DATABASE_PATH || './data/waypoint.sqlite');
  if (!existsSync(path)) return { projects: [], ranks: [], disclosure: 'No local database exists yet.' };
  const db = new DatabaseSync(path, { readOnly: true });
  try { return { projects: webDomains(db).map(domain => ({ domain })), disclosure: 'Domains with actual imported data, saved watchlists or HTML audits. Use the per-domain report tools to inspect the observations.' }; }
  finally { db.close(); }
}, { web: domain => {
  const path = resolve(root, process.env.DATABASE_PATH || './data/waypoint.sqlite');
  const db = new DatabaseSync(existsSync(path) ? path : ':memory:', existsSync(path) ? { readOnly: true } : {});
  try { return webReport(db, domain); } finally { db.close(); }
}, importWeb: input => {
  const path = resolve(root, process.env.DATABASE_PATH || './data/waypoint.sqlite'); mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path); try { db.exec('PRAGMA busy_timeout=5000'); initWebData(db); return importWebData(db, input); } finally { db.close(); }
}, performance: filters => {
  const path = resolve(root, process.env.DATABASE_PATH || './data/waypoint.sqlite');
  const db = new DatabaseSync(existsSync(path) ? path : ':memory:', existsSync(path) ? { readOnly: true } : {});
  try { return getPerformance(db, filters); } finally { db.close(); }
}, snapshots: filters => {
  const path = resolve(root, process.env.DATABASE_PATH || './data/waypoint.sqlite');
  const db = new DatabaseSync(existsSync(path) ? path : ':memory:', existsSync(path) ? { readOnly: true } : {});
  try { return readSnapshots(db, filters); } finally { db.close(); }
}, research: createYouTubeProvider({ apiKey: process.env.YOUTUBE_API_KEY }).research });
await server.connect(new StdioServerTransport());
// stdout is reserved exclusively for MCP protocol messages.
