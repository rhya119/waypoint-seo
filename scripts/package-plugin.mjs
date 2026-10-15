import { readFileSync, writeFileSync, mkdirSync, readdirSync, existsSync } from 'node:fs';
import { resolve, basename } from 'node:path';
import { zipSync, strToU8 } from 'fflate';
// Work from a checkout or an extracted source bundle; never traverse dependency/data roots or symlinks.
const paths = [];
function walk(directory) { for (const entry of readdirSync(directory, { withFileTypes: true })) { if (entry.isSymbolicLink()) continue; const path = `${directory}/${entry.name}`; if (entry.isDirectory()) { if (!['node_modules', 'data', 'artifacts', '.git'].includes(entry.name)) walk(path); } else paths.push(path); } }
for (const directory of ['.claude-plugin', '.github', 'skills', 'mcp', 'server', 'shared', 'src', 'scripts', 'docs', 'tests']) if (existsSync(directory)) walk(directory);
for (const path of ['.gitignore', '.gitattributes', 'package.json', 'package-lock.json', 'README.md', '.env.example', 'tsconfig.json', 'vite.config.ts', 'index.html', 'Start-Claude-SEO.cmd']) if (existsSync(path)) paths.push(path);
const files = {};
const allowed = /^(\.claude-plugin\/|\.github\/|\.gitignore$|\.gitattributes$|skills\/|mcp\/|server\/|shared\/|src\/|scripts\/|docs\/|tests\/|package(-lock)?\.json$|README\.md$|\.env\.example$|tsconfig\.json$|vite\.config\.ts$|index\.html$|Start-Claude-SEO\.cmd$)/;
for (const path of new Set(paths)) if (allowed.test(path) && !path.includes('..') && !path.startsWith('artifacts/') && (basename(path) === '.env.example' || !/\.env(?:\.|$)|\.(?:sqlite\w*|db|pem|key|log)$/i.test(basename(path)))) files[path] = new Uint8Array(readFileSync(path));
files['INSTALL.txt'] = strToU8('Waypoint SEO optional local Claude Code plugin. Extract this bundle, run npm ci, then claude --plugin-dir . from that directory. To share an existing workspace, set DATABASE_PATH to its absolute SQLite path in your environment. Credentials and databases are not bundled. See docs/PLUGIN.md.');
mkdirSync('artifacts', { recursive: true });
const output = resolve('artifacts/waypoint-seo.plugin'); writeFileSync(output, zipSync(files, { level: 6 }));
console.log(`Prepared ${output} (${Object.keys(files).length} source files; no credentials, databases, dependencies or generated research captures).`);
