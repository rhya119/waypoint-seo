import { config } from 'dotenv';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { createWaypointMcp } from './server.js';
import { getPerformance } from '../server/performance.js';
import { createYouTubeProvider } from '../server/youtube.js';
const root = fileURLToPath(new URL('../', import.meta.url));
config({ path: resolve(root, '.env'), quiet: true });
const server = createWaypointMcp(() => {
  const path = resolve(root, process.env.DATABASE_PATH || './data/waypoint.sqlite');
  if (!existsSync(path)) return { projects: [], ranks: [], disclosure: 'No local database exists yet.' };
  const db = new DatabaseSync(path, { readOnly: true });
  try { return { projects: db.prepare('SELECT * FROM projects ORDER BY id DESC').all(), ranks: db.prepare('SELECT * FROM ranks ORDER BY id DESC').all(), disclosure: 'Saved positions are synthetic demo baselines.' }; }
  finally { db.close(); }
}, { performance: filters => {
  const path = resolve(root, process.env.DATABASE_PATH || './data/waypoint.sqlite');
  const db = new DatabaseSync(existsSync(path) ? path : ':memory:', existsSync(path) ? { readOnly: true } : {});
  try { return getPerformance(db, filters); } finally { db.close(); }
}, research: createYouTubeProvider({ apiKey: process.env.YOUTUBE_API_KEY }).research });
await server.connect(new StdioServerTransport());
// stdout is reserved exclusively for MCP protocol messages.
