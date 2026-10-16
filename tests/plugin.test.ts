import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { unzipSync } from 'fflate';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
test('optional plugin launcher runs the actual MCP server in one stdio process', { timeout: 20000 }, async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: [resolve('mcp/launch.mjs')], env: { PATH: process.env.PATH || '', DATABASE_PATH: resolve('artifacts/missing-plugin-test.sqlite') }, stderr: 'pipe' });
  const client = new Client({ name: 'plugin-test', version: '1.0.0' });
  try { await client.connect(transport); const tools = await client.listTools(); assert.equal(tools.tools.length, 24); assert.ok(tools.tools.some(tool => tool.name === 'rank_tracking')); const result = await client.callTool({ name: 'social_keywords', arguments: { dataset: 'example', platform: 'youtube' } }); assert.equal(JSON.parse((result.content as { text: string }[])[0].text).dataset, 'example'); }
  finally { await client.close(); }
});
test('plugin source bundle contains the full toolkit and excludes credentials, data, captures and dependencies', () => {
  execFileSync(process.execPath, ['scripts/package-plugin.mjs']); const files = Object.keys(unzipSync(new Uint8Array(readFileSync('artifacts/waypoint-seo.plugin'))));
  assert.ok(files.includes('.claude-plugin/plugin.json')); assert.ok(files.includes('mcp/launch.mjs')); assert.ok(files.includes('src/App.tsx')); assert.ok(files.includes('.gitignore')); assert.ok(files.includes('skills/social-performance/SKILL.md'));
  assert.ok(files.every(path => path !== '.env' && !path.startsWith('data/') && !path.startsWith('node_modules/') && !path.startsWith('artifacts/') && !path.includes('.sqlite')));
});
