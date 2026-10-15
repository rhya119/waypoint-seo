import test from 'node:test';
import assert from 'node:assert/strict';
import { createSiteScanner, SiteScanError, type SiteRequest, type SiteResponse, type SiteScannerOptions } from '../server/site-scan.js';

const site = 'public-website.com';
const html = '<!doctype html><html lang="en"><head><title>A practical garden website</title><meta name="description" content="Practical garden ideas and useful plant guides for your own outdoor space, written clearly for everyday gardeners."><link rel="canonical" href="https://public-website.com/"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><h1>Garden ideas</h1><p>Garden plants garden ideas.</p></body></html>';
const response = (body = '', status = 200, contentType = 'text/html', headers: SiteResponse['headers'] = {}): SiteResponse => ({ status, headers: { 'content-type': contentType, ...headers }, body: Buffer.from(body) });
const resolvePublic: NonNullable<SiteScannerOptions['resolve']> = async () => [{ address: '93.184.216.34', family: 4 }];
function fixture(options: SiteScannerOptions = {}) {
  const calls: SiteRequest[] = [];
  const scanner = createSiteScanner({
    resolve: resolvePublic,
    request: async (request) => {
      calls.push(request);
      return request.url.pathname === '/robots.txt' ? response('', 404, 'text/plain') : response(html);
    },
    ...options,
  });
  return { scanner, calls };
}

test('public scan pins each request to vetted DNS, extracts actual HTML and checks only two eligible linked pages', async () => {
  const calls: SiteRequest[] = [];
  const page = html.replace('</head>', '<meta property="og:title" content="Garden preview"><meta property="og:image" content="/garden.jpg"><script type="application/ld+json">{"@graph":[{"@type":"Organization"},{"@type":["WebSite","WebPage"]}]}</script></head>')
    .replace('</body>', '<img src="garden.jpg"><img src="decorative.jpg" alt=""><a href="/about">About us</a><a href="/gone">Old guide</a><a href="/third">Third</a><a href="/login">Login</a><a href="/delete/account">Delete</a><a href="/image.jpg">Image</a><a href="/?search=garden">Search</a><a href="https://elsewhere.com/">Source</a><a href="javascript:alert(1)">Unsafe</a><script>secretHiddenWord()</script></body>');
  const scanner = createSiteScanner({
    resolve: resolvePublic,
    request: async (input) => {
      calls.push(input);
      assert.equal(input.address, '93.184.216.34');
      assert.equal(input.family, 4);
      assert.equal(input.url.protocol, 'https:');
      if (input.url.pathname === '/robots.txt') return response('User-agent: *\nAllow: /\nSitemap: https://public-website.com/sitemap.xml', 200, 'text/plain');
      if (input.url.pathname === '/gone') return response('Missing', 404);
      return response(page, 200, 'text/html; charset=utf-8', { 'x-robots-tag': 'noindex' });
    },
  });
  const result = await scanner.scan(`https://${site}/ignored?secret=not-fetched`);
  assert.equal(result.requestedUrl, `https://${site}/`);
  assert.equal(result.title, 'A practical garden website');
  assert.equal(result.description.startsWith('Practical garden'), true);
  assert.equal(result.canonical, `https://${site}/`);
  assert.equal(result.language, 'en');
  assert.deepEqual(result.images, { total: 2, missingAlt: 1 });
  assert.equal(result.topics.find((topic) => topic.term === 'garden')?.count, 3);
  assert.equal(result.topics.some((topic) => /secrethiddenword/.test(topic.term)), false);
  assert.deepEqual([...result.structuredDataTypes].sort(), ['Organization', 'WebPage', 'WebSite']);
  assert.equal(result.openGraph.image, `https://${site}/garden.jpg`);
  assert.deepEqual(result.robots.sitemaps, [`https://${site}/sitemap.xml`]);
  assert.equal(result.robots.allowed, true);
  assert.equal(result.audit.checks.find((check) => check.name === 'Indexability declaration')?.passed, false);
  assert.equal(result.externalLinks.length, 1);
  assert.deepEqual(calls.map((input) => input.url.pathname), ['/robots.txt', '/', '/about', '/gone']);
  assert.equal(result.pageChecks?.length, 3);
  assert.equal(result.pageChecks?.[2].status, 404);
  assert.ok(result.warnings.some((warning) => warning.includes('Broken internal link')));
  assert.ok(result.warnings.some((warning) => warning.includes('Duplicate title')));
  assert.ok(result.warnings.some((warning) => warning.includes('Duplicate meta description')));
  assert.match(result.disclosure, /not search demand/);
  assert.equal(result.bytes, calls.reduce((sum, input) => sum + (input.url.pathname === '/robots.txt' ? Buffer.byteLength('User-agent: *\nAllow: /\nSitemap: https://public-website.com/sitemap.xml') : input.url.pathname === '/gone' ? 7 : Buffer.byteLength(page)), 0));
});

test('private hosts, credentials, HTTP, custom ports and IP literal disguises are rejected before DNS or HTTP', async () => {
  for (const domain of ['http://public-website.com', 'https://user:pass@public-website.com/', 'public-website.com:444', 'localhost', 'host.local', 'host.internal', 'machine.tail123.ts.net', '127.0.0.1', '2130706433', '0x7f000001', '[::1]', '[::ffff:127.0.0.1]', 'northstar.example', 'host.invalid']) {
    let resolved = false;
    const { scanner, calls } = fixture({ resolve: async () => { resolved = true; return resolvePublic(site); } });
    await assert.rejects(scanner.scan(domain), (error: unknown) => error instanceof SiteScanError && error.status === 400, domain);
    assert.equal(resolved, false, domain);
    assert.equal(calls.length, 0, domain);
  }
});

test('DNS rejects any unsafe answer including mixed results, CGNAT, reserved, transition and mapped IPv6', async () => {
  for (const address of ['0.0.0.0', '10.1.2.3', '127.0.0.1', '169.254.169.254', '172.16.1.1', '192.168.1.1', '100.64.0.1', '192.0.0.1', '192.0.2.1', '198.18.0.1', '198.51.100.2', '203.0.113.1', '224.0.0.1', '240.0.0.1', '255.255.255.255', '::1', '::', 'fe80::1', 'fc00::1', 'fd7a:115c:a1e0::1', 'fec0::1', 'ff02::1', '::ffff:127.0.0.1', '::ffff:8.8.8.8', '64:ff9b::a00:1', '2002:a00:1::1', '2001:db8::1', '3fff::1', '4000::1']) {
    const { scanner, calls } = fixture({ resolve: async () => [{ address: '8.8.8.8', family: 4 }, { address, family: address.includes(':') ? 6 : 4 }] });
    await assert.rejects(scanner.scan(site), /private, reserved or unsupported/, address);
    assert.equal(calls.length, 0, address);
  }
  const v6 = fixture({ resolve: async () => [{ address: '2606:4700:4700::1111', family: 6 }] });
  assert.equal((await v6.scanner.scan(site)).status, 200);
  assert.equal(v6.calls[0].family, 6);
});

test('DNS is rechecked on each request and cannot rebind a public robots request to private homepage access', async () => {
  let lookups = 0;
  const { scanner, calls } = fixture({ resolve: async () => [{ address: ++lookups === 1 ? '8.8.8.8' : '127.0.0.1', family: 4 }] });
  await assert.rejects(scanner.scan(site), /private, reserved or unsupported/);
  assert.deepEqual(calls.map((call) => call.url.pathname), ['/robots.txt']);
});

test('homepage redirects are validated, use target robots and public DNS, and stop before private or downgraded targets', async () => {
  const calls: string[] = [];
  const scanner = createSiteScanner({ resolve: resolvePublic, request: async (input) => {
    calls.push(input.url.href);
    if (input.url.pathname === '/robots.txt') return response('', 404, 'text/plain');
    if (input.url.hostname === site) return response('', 301, 'text/html', { location: `https://www.${site}/` });
    return response(html);
  } });
  const result = await scanner.scan(site);
  assert.equal(result.finalUrl, `https://www.${site}/`);
  assert.deepEqual(calls, [`https://${site}/robots.txt`, `https://${site}/`, `https://www.${site}/robots.txt`, `https://www.${site}/`]);
  for (const location of ['https://127.0.0.1/', 'http://public-website.com/', 'https://machine.tail.ts.net/', 'https://user:pass@public-website.com/']) {
    const called: string[] = [];
    const unsafe = createSiteScanner({ resolve: resolvePublic, request: async (input) => {
      called.push(input.url.href);
      return input.url.pathname === '/robots.txt' ? response('', 404, 'text/plain') : response('', 302, 'text/html', { location });
    } });
    await assert.rejects(unsafe.scan(site), (error: unknown) => error instanceof SiteScanError && error.status === 400);
    assert.equal(called.length, 2);
  }
  const loginRedirect = createSiteScanner({ resolve: resolvePublic, request: async (input) => input.url.pathname === '/robots.txt' ? response('', 404, 'text/plain') : response('', 302, 'text/html', { location: '/login' }) });
  await assert.rejects(loginRedirect.scan(site), /sign-in, account or action/);
  let pageRequests = 0;
  const looping = createSiteScanner({ resolve: resolvePublic, request: async (input) => input.url.pathname === '/robots.txt' ? response('', 404, 'text/plain') : response('', 302, 'text/html', { location: `/next-${++pageRequests}` }) });
  await assert.rejects(looping.scan(site), /three-redirect/);
  assert.equal(pageRequests, 4);
});

test('robots disallow, unreachable policy, non-plain policy and linked-page disallow are respected before page requests', async () => {
  for (const robots of [response('User-agent: *\nDisallow: /', 200, 'text/plain'), response('Unavailable', 503, 'text/plain'), response('<html>Not robots</html>', 200, 'text/html')]) {
    const calls: string[] = [];
    const scanner = createSiteScanner({ resolve: resolvePublic, request: async (input) => { calls.push(input.url.pathname); return robots; } });
    await assert.rejects(scanner.scan(site), (error: unknown) => error instanceof SiteScanError && [403, 502].includes(error.status));
    assert.deepEqual(calls, ['/robots.txt']);
  }
  const calls: string[] = [];
  const scanner = createSiteScanner({ resolve: resolvePublic, request: async (input) => {
    calls.push(input.url.pathname);
    return input.url.pathname === '/robots.txt' ? response('User-agent: WaypointSEO\nDisallow: /private', 200, 'text/plain') : response(html.replace('</body>', '<a href="/private">Private page</a></body>'));
  } });
  const result = await scanner.scan(site);
  assert.deepEqual(calls, ['/robots.txt', '/']);
  assert.match(result.pageChecks?.[1].error || '', /disallows/);
});

test('body budgets include robots and homepage; malformed content/status and private upstream errors do not become reports', async () => {
  const overLimit = fixture({ maxBytes: 100, request: async (input) => input.url.pathname === '/robots.txt' ? response('a'.repeat(60), 200, 'text/plain') : response('b'.repeat(60)) });
  await assert.rejects(overLimit.scanner.scan(site), (error: unknown) => error instanceof SiteScanError && error.status === 413);
  for (const value of [response('Forbidden', 403), response('{}', 200, 'application/json'), response(html, 200, 'text/html', { 'content-encoding': 'gzip' })]) {
    const scanner = createSiteScanner({ resolve: resolvePublic, request: async (input) => input.url.pathname === '/robots.txt' ? response('', 404, 'text/plain') : value });
    await assert.rejects(scanner.scan(site), (error: unknown) => error instanceof SiteScanError && [502, 415].includes(error.status));
  }
  const failing = fixture({ request: async () => { throw new Error('secret proxy credential at 127.0.0.1'); } });
  await assert.rejects(failing.scanner.scan(site), (error: unknown) => error instanceof SiteScanError && error.status === 502 && !/secret|127\.0\.0\.1/.test(error.message));
});

test('DNS/request/total deadlines stop work and a completed or failed scan releases concurrency protection', async () => {
  let requestCount = 0;
  const slowDns = createSiteScanner({ requestTimeoutMs: 5, resolve: async () => { await new Promise((resolve) => setTimeout(resolve, 30)); return resolvePublic(site); }, request: async () => { requestCount++; return response(html); } });
  await assert.rejects(slowDns.scan(site), (error: unknown) => error instanceof SiteScanError && error.status === 504);
  await new Promise((resolve) => setTimeout(resolve, 40));
  assert.equal(requestCount, 0);
  let release: (response: SiteResponse) => void = () => {};
  const scanner = createSiteScanner({ resolve: resolvePublic, totalTimeoutMs: 20, request: () => new Promise<SiteResponse>((resolve) => { release = resolve; }) });
  const pending = scanner.scan(site);
  await assert.rejects(scanner.scan(site), (error: unknown) => error instanceof SiteScanError && error.status === 429);
  await assert.rejects(pending, (error: unknown) => error instanceof SiteScanError && error.status === 504);
  release(response('', 404, 'text/plain'));
  await assert.rejects(scanner.scan(site), (error: unknown) => error instanceof SiteScanError && error.status === 504);
});
