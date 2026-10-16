import test from 'node:test';
import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

test('real stdio connector discovers tools and runs an audit with no API key or HTTP server', { timeout: 20000 }, async () => {
  const transport = new StdioClientTransport({ command: process.execPath, args: ['--import', pathToFileURL(resolve('node_modules/tsx/dist/loader.mjs')).href, resolve('mcp/index.ts')], cwd: process.cwd(), env: { PATH: process.env.PATH || '', DATABASE_PATH: resolve('artifacts/nonexistent-test-workspace.sqlite') }, stderr: 'pipe' });
  const client = new Client({ name: 'waypoint-test', version: '1.0.0' });
  try {
    await client.connect(transport);
    const tools = await client.listTools(); assert.equal(tools.tools.length, 24);
    assert.ok(tools.tools.every(tool => tool.name === 'seo_import' ? tool.annotations?.readOnlyHint === false : tool.annotations?.readOnlyHint === true));
    for (const name of ['website_scan', 'keyword_ideas', 'page_speed']) assert.equal(tools.tools.find(t => t.name === name)?.annotations?.openWorldHint, true);
    const blocked = await client.callTool({name:'website_scan',arguments:{domain:'localhost.local'}});
    assert.equal(blocked.isError, true);
    const snapshots = await client.callTool({ name: 'social_api_snapshots', arguments: { platform: 'all' } });
    const snapshotData = JSON.parse((snapshots.content as { text: string }[])[0].text);
    assert.equal(snapshotData.metricBasis, 'lifetime'); assert.deepEqual(snapshotData.posts, []);
    const response = await client.callTool({ name: 'social_audit', arguments: { html: '<html><head><meta property="og:title" content="Garden guide"></head></html>', pageUrl: 'https://one.example/' } });
    assert.equal(response.isError, undefined);
    const block = (response.content as { type: string; text: string }[])[0]; assert.equal(JSON.parse(block.text).openGraph.title, 'Garden guide');
    const workspace = await client.callTool({ name: 'read_workspace', arguments: {} });
    assert.deepEqual(JSON.parse((workspace.content as { text: string }[])[0].text).projects, []);
    const invalid = await client.callTool({ name: 'campaign_link', arguments: { url: 'javascript:alert(1)', source: 'x', medium: 'social', campaign: 'bad' } });
    assert.equal(invalid.isError, true);
    const performance = await client.callTool({ name: 'social_performance', arguments: { dataset: 'example', platform: 'youtube' } });
    const data = JSON.parse((performance.content as { text: string }[])[0].text);
    assert.equal(data.dataset, 'example'); assert.ok(data.posts.length > 0);
    const similar = await client.callTool({ name: 'similar_content', arguments: { dataset: 'example', platform: 'youtube', referenceId: JSON.stringify([data.posts[0].platform, data.posts[0].account, data.posts[0].content_id]) } });
    assert.ok(JSON.parse((similar.content as { text: string }[])[0].text).matches.length > 0);
  } finally { await client.close(); }
});
