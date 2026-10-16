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

test('public scan pins each request to vetted DNS, extracts actual HTML and crawls eligible linked pages breadth-first', async () => {
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
  assert.deepEqual(calls.map((input) => input.url.pathname), ['/robots.txt', '/', '/sitemap.xml', '/about', '/gone', '/third', '/llms.txt']);
  assert.equal(result.pageChecks?.length, 4);
  assert.equal(result.llms?.found, false);
  assert.ok(result.pageIssues?.some((issue) => issue.type === 'Broken page' && issue.url.endsWith('/gone')));
  assert.ok(result.pageIssues?.some((issue) => issue.type === 'Duplicate title'));
  assert.equal(result.pageChecks?.[1].inlinks, 3);
  assert.ok(result.ai && result.ai.score > 0 && result.ai.bots.every((bot) => bot.allowed));
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
  assert.deepEqual(calls, [`https://${site}/robots.txt`, `https://${site}/`, `https://www.${site}/robots.txt`, `https://www.${site}/`, `https://www.${site}/sitemap.xml`, `https://www.${site}/llms.txt`]);
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
  assert.deepEqual(calls, ['/robots.txt', '/', '/sitemap.xml', '/llms.txt']);
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

test('crawl honours the page limit, follows links found on linked pages and reports AI crawler rules and llms.txt', async () => {
  const calls: string[] = [];
  const pageFor = (path: string) => html.replace('<title>A practical garden website</title>', `<title>Garden page ${path}</title>`).replace('</body>', `<a href="${path}a">Next</a><a href="${path}b">Other</a></body>`);
  const scanner = createSiteScanner({ resolve: resolvePublic, maxPages: 5, request: async (input) => {
    calls.push(input.url.pathname);
    if (input.url.pathname === '/robots.txt') return response('User-agent: GPTBot\nDisallow: /\n\nUser-agent: PerplexityBot\nDisallow: /\n\nUser-agent: *\nAllow: /', 200, 'text/plain');
    if (input.url.pathname === '/llms.txt') return response('# Garden\n\n- [Guides](https://public-website.com/guides)\n- [About](https://public-website.com/about)\n- [Shop](https://public-website.com/shop)', 200, 'text/plain');
    return response(pageFor(input.url.pathname === '/' ? '/p' : input.url.pathname));
  } });
  const result = await scanner.scan(site);
  assert.equal(result.pageChecks?.length, 5);
  assert.deepEqual(result.pageChecks?.map((page) => page.depth), [0, 1, 1, 2, 2]);
  assert.ok(result.warnings.some((warning) => warning.includes('5-page limit')));
  assert.equal(calls.at(-1), '/llms.txt');
  assert.deepEqual(result.llms, { url: `https://${site}/llms.txt`, status: 200, found: true, lines: 4, links: 3 });
  const bots = Object.fromEntries(result.ai!.bots.map((bot) => [bot.agent, bot.allowed]));
  assert.equal(bots.GPTBot, false);
  assert.equal(bots.PerplexityBot, false);
  assert.equal(bots['OAI-SearchBot'], true);
  assert.equal(bots.Googlebot, true);
  const access = result.ai!.checks.find((check) => check.id === 'ai-search-bots')!;
  assert.equal(access.passed, false);
  assert.match(access.fix, /PerplexityBot/);
  assert.equal(result.ai!.checks.find((check) => check.id === 'llms-txt')?.passed, true);
  assert.equal(result.ai!.checks.reduce((sum, check) => sum + check.max, 0), 100);
});

test('compressed responses are decoded with a size cap; budget exhaustion stops the crawl without false issues', async () => {
  const { gzipSync } = await import('node:zlib');
  const linked = html.replace('</body>', '<a href="/one">One</a><a href="/two">Two</a><a href="/three">Three</a></body>');
  const scanner = createSiteScanner({ resolve: resolvePublic, request: async (input) => {
    if (input.url.pathname === '/robots.txt') return response('', 404, 'text/plain');
    if (input.url.pathname === '/') return { status: 200, headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' }, body: gzipSync(linked) };
    if (input.url.pathname === '/one') return response(html.replace('A practical garden website', 'Page one of the garden'));
    throw new SiteScanError(413, 'Website responses exceed the scan byte limit.');
  } });
  const result = await scanner.scan(site);
  assert.equal(result.title, 'A practical garden website');
  assert.deepEqual(result.pageChecks?.map((page) => new URL(page.url).pathname), ['/', '/one']);
  assert.ok(!result.pageIssues?.some((issue) => issue.type === 'Unreachable page'));
  assert.ok(result.warnings.some((warning) => /download size limit/.test(warning)));
  const bomb = createSiteScanner({ resolve: resolvePublic, request: async (input) => input.url.pathname === '/robots.txt' ? response('', 404, 'text/plain') : { status: 200, headers: { 'content-type': 'text/html', 'content-encoding': 'gzip' }, body: gzipSync(Buffer.alloc(5_000_000, 32)) } });
  await assert.rejects(bomb.scan(site), (error: unknown) => error instanceof SiteScanError && error.status === 502 && /oversized/.test(error.message));
});

test('the three-redirect limit applies per page, not across the whole crawl', async () => {
  const links = ['/a', '/b', '/c', '/d'].map((path) => `<a href="${path}">${path}</a>`).join('');
  const scanner = createSiteScanner({ resolve: resolvePublic, request: async (input) => {
    const path = input.url.pathname;
    if (path === '/robots.txt') return response('', 404, 'text/plain');
    if (path === '/') return response(html.replace('</body>', `${links}</body>`));
    if (path.length === 2) return response('', 301, 'text/html', { location: `${path}/` });
    return response(html.replace('A practical garden website', `Garden ${path}`));
  } });
  const result = await scanner.scan(site);
  assert.deepEqual(result.pageChecks?.map((page) => page.error ?? new URL(page.url).pathname), ['/', '/a/', '/b/', '/c/', '/d/']);
});

test('sitemaps (index and gzip) add unlinked pages to the crawl and flag orphans and pages missing from the sitemap', async () => {
  const { gzipSync } = await import('node:zlib');
  const index = '<?xml version="1.0"?><sitemapindex><sitemap><loc>https://public-website.com/pages.xml.gz</loc></sitemap><sitemap><loc>https://elsewhere.com/evil.xml</loc></sitemap></sitemapindex>';
  const pages = '<urlset><url><loc>https://public-website.com/</loc></url><url><loc>https://public-website.com/about</loc></url><url><loc><![CDATA[https://public-website.com/hidden-offer]]></loc></url><url><loc>https://public-website.com/old-page</loc></url><url><loc>https://elsewhere.com/x</loc></url></urlset>';
  const calls: string[] = [];
  const scanner = createSiteScanner({ resolve: resolvePublic, request: async (input) => {
    calls.push(input.url.href);
    const path = input.url.pathname;
    if (path === '/robots.txt') return response('User-agent: *\nAllow: /\nSitemap: https://public-website.com/sitemap_index.xml', 200, 'text/plain');
    if (path === '/sitemap_index.xml') return response(index, 200, 'application/xml');
    if (path === '/pages.xml.gz') return { status: 200, headers: { 'content-type': 'application/x-gzip' }, body: gzipSync(pages) };
    if (path === '/old-page') return response('Gone', 404);
    if (path === '/') return response(html.replace('</body>', '<a href="/about">About</a><a href="/blog">Blog</a></body>'));
    return response(html.replace('A practical garden website', `Garden ${path}`));
  } });
  const result = await scanner.scan(site);
  assert.ok(!calls.some((url) => url.includes('elsewhere.com')), 'other hosts in a sitemap are never fetched');
  assert.equal(result.sitemap?.urls, 4);
  assert.deepEqual(result.sitemap?.sources, ['https://public-website.com/sitemap_index.xml', 'https://public-website.com/pages.xml.gz']);
  const byPath = Object.fromEntries((result.pageChecks || []).map((page) => [new URL(page.url).pathname, page]));
  assert.equal(byPath['/hidden-offer']?.source, 'sitemap');
  assert.equal(byPath['/blog']?.inSitemap, false);
  const types = (path: string) => (result.pageIssues || []).filter((issue) => new URL(issue.url).pathname === path).map((issue) => issue.type);
  assert.ok(types('/hidden-offer').includes('Orphan page'));
  assert.ok(types('/blog').includes('Missing from sitemap'));
  assert.ok(!types('/about').includes('Missing from sitemap'));
  assert.match((result.pageIssues || []).find((issue) => issue.url.endsWith('/old-page'))?.detail || '', /listed in your sitemap/);
});

test('a page reachable at two addresses is reported once, not as a duplicate, orphan or missing from the sitemap', async () => {
  const pageHtml = (path: string) => html.replace('A practical garden website', `Garden ${path}`).replace('Practical garden ideas', `Practical ${path} ideas`).replace('<link rel="canonical" href="https://public-website.com/">', `<link rel="canonical" href="https://public-website.com${path}">`);
  const scanner = createSiteScanner({ resolve: resolvePublic, request: async (input) => {
    const path = input.url.pathname;
    if (path === '/robots.txt') return response('', 404, 'text/plain');
    if (path === '/sitemap.xml') return response('<urlset><url><loc>https://public-website.com/</loc></url><url><loc>https://public-website.com/services</loc></url><url><loc>https://public-website.com/team</loc></url></urlset>', 200, 'application/xml');
    if (path === '/') return response(html.replace('</body>', '<a href="/services.html">Services</a><a href="/team.html">Team</a></body>'));
    const clean = path.replace(/\.html$/, '');
    return response(pageHtml(clean));
  } });
  const result = await scanner.scan(site);
  const paths = (result.pageChecks || []).map((page) => new URL(page.url).pathname);
  assert.deepEqual(paths.sort(), ['/', '/services.html', '/team.html']);
  const types = [...new Set((result.pageIssues || []).map((issue) => issue.type))];
  for (const type of ['Duplicate title', 'Duplicate description', 'Orphan page', 'Missing from sitemap']) assert.ok(!types.includes(type), type);
  assert.ok(types.includes('Links to non-canonical URL'));
  assert.ok(!result.warnings.some((warning) => warning.startsWith('Duplicate')));
});
