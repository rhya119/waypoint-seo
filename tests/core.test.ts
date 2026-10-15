import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import request from 'supertest';
import { createApp, normalizeDomain } from '../server/app.js';
import { demoProvider } from '../server/provider.js';
import { auditHtml } from '../server/audit.js';
import { csv } from '../src/lib.js';

test('domain normalization strips URL paths and rejects credentials and non-web schemes', () => {
  assert.equal(normalizeDomain('https://www.Example.com/path'), 'example.com');
  assert.throws(() => normalizeDomain('file:///etc/passwd'));
  assert.throws(() => normalizeDomain('https://user:pass@example.com'));
  assert.throws(() => normalizeDomain('not-a-domain'));
});
test('provider is deterministic for the same query and varies by domain', () => {
  assert.deepEqual(demoProvider.keywords('garden'), demoProvider.keywords('garden'));
  assert.notEqual(demoProvider.overview('one.example').traffic, demoProvider.overview('two.example').traffic);
  assert.equal(demoProvider.overview('one.example').provenance, 'demo');
});
test('HTML audit distinguishes a complete page from missing critical markup without executing scripts', () => {
  const complete = '<html lang="en"><head><title>A clear and descriptive page title</title><meta name="description" content="This is a descriptive summary with useful information about the topic that the visitor will find on this page."><meta name="viewport" content="width=device-width"><link rel="canonical" href="https://example.com/"></head><body><h1>Welcome</h1><img alt=""><script>throw new Error("never execute")</script></body></html>';
  assert.equal(auditHtml(complete).score, 100);
  const broken = auditHtml('<html><head><meta name="robots" content="noindex"></head><body><img src="x"></body></html>');
  assert.equal(broken.score, 0);
  assert.equal(broken.source, 'submitted-html');
});
test('API project, tracking, reports, validation, deletion and origin protection', async () => {
  const db = new DatabaseSync(':memory:'); const app = createApp(db);
  try {
    await request(app).get('/api/health').set('Host', 'untrusted.example').expect(403);
    await request(app).post('/api/projects').send({ domain: 'bad' }).expect(400);
    await request(app).post('/api/projects').set('Origin', 'https://untrusted.example').send({ domain: 'one.example' }).expect(403);
    const result = await request(app).post('/api/projects').send({ domain: 'https://www.one.example/' }).expect(201);
    const id = result.body.id;
    await request(app).post('/api/projects').send({ domain: 'one.example' }).expect(201);
    const projects = await request(app).get('/api/projects').expect(200); assert.equal(projects.body.length, 1);
    const rank = { projectId: id, keyword: 'small gardens', country: 'NZ', device: 'mobile' };
    await request(app).post('/api/ranks').send(rank).expect(201);
    await request(app).post('/api/ranks').send(rank).expect(201);
    await request(app).post('/api/ranks').send({ ...rank, projectId: 999 }).expect(404);
    const ranks = await request(app).get(`/api/ranks?projectId=${id}`).expect(200);
    assert.equal(ranks.body.length, 1); assert.equal(ranks.body[0].provenance, 'demo');
    const report = await request(app).get('/api/reports?domain=one.example').expect(200);
    assert.equal(report.body.ranks.length, 1); assert.match(report.body.disclosure, /Synthetic/);
    await request(app).delete(`/api/ranks/${ranks.body[0].id}`).expect(204);
    const empty = await request(app).get(`/api/ranks?projectId=${id}`); assert.equal(empty.body.length, 0);
    await request(app).post('/api/audit').send({ html: '<h1>Hello</h1>' }).expect(200);
    await request(app).get('/api/not-found').expect(404);
    await request(app).post('/api/audit').set('Content-Type', 'application/json').send('{broken').expect(400);
  } finally { db.close(); }
});
test('CSV export escapes quotes and protects formula-like user input', () => {
  assert.equal(csv([['=1+1', 'a"b', 12]]), '"\'=1+1","a""b","12"');
});
