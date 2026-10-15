import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const loader = resolve(root, 'node_modules/tsx/dist/loader.mjs');
if (!existsSync(loader)) { console.error('Waypoint dependencies are missing. Run npm ci in the plugin source folder, then reload the plugin.'); process.exit(1); }
const { tsImport } = await import('tsx/esm/api');
await tsImport('./index.ts', import.meta.url);
