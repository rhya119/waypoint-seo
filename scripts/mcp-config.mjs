import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve } from 'node:path';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = ['--import', pathToFileURL(resolve(root, 'node_modules/tsx/dist/loader.mjs')).href, resolve(root, 'mcp/index.ts')];
console.log('Merge this entry into Claude Desktop’s existing mcpServers object, then restart Claude Desktop:');
console.log(JSON.stringify({ mcpServers: { waypoint: { command: process.execPath, args } } }, null, 2));
console.log('\nClaude Code (run from this project folder; private project-scoped configuration):');
console.log(`claude mcp add --transport stdio --scope local waypoint -- "${process.execPath}" ${args.map(arg => `"${arg}"`).join(' ')}`);
console.log('\nNo Anthropic API key is required for this local MCP connector. Website AI advice uses the separate server-side API key.');
